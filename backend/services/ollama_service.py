"""
Ollama Service Layer for AI Communication
Handles communication with local Ollama instance for AI-powered database queries
"""

import httpx
import json
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime
import asyncio

logger = logging.getLogger(__name__)

class OllamaService:
    def __init__(self, base_url: str = "http://localhost:11434"):
        self.base_url = base_url
        self.model = "llama3:8b"  # Default model, can be configured
        self.timeout = 60.0  # Timeout for AI responses

    async def check_ollama_health(self) -> bool:
        """Check if Ollama service is running and accessible"""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                return response.status_code == 200
        except Exception as e:
            logger.error(f"Ollama health check failed: {e}")
            return False

    async def list_available_models(self) -> List[str]:
        """Get list of available models in Ollama"""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                if response.status_code == 200:
                    data = response.json()
                    return [model["name"] for model in data.get("models", [])]
                return []
        except Exception as e:
            logger.error(f"Failed to list models: {e}")
            return []

    async def generate_response(
        self,
        prompt: str,
        system_prompt: str = "",
        conversation_history: List[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """
        Generate AI response using Ollama

        Args:
            prompt: User's natural language query
            system_prompt: System instructions for the AI
            conversation_history: Previous messages in the conversation

        Returns:
            Dict containing response text, success status, and metadata
        """
        try:
            # Construct messages for conversation context
            messages = []

            if system_prompt:
                messages.append({
                    "role": "system",
                    "content": system_prompt
                })

            # Add conversation history
            if conversation_history:
                messages.extend(conversation_history)

            # Add current user message
            messages.append({
                "role": "user",
                "content": prompt
            })

            payload = {
                "model": self.model,
                "messages": messages,
                "stream": False,
                "options": {
                    "temperature": 0.1,  # Lower temperature for more consistent SQL generation
                    "top_p": 0.9,
                    "repeat_penalty": 1.1
                }
            }

            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/api/chat",
                    json=payload
                )

                if response.status_code == 200:
                    data = response.json()
                    return {
                        "success": True,
                        "response": data.get("message", {}).get("content", ""),
                        "model": data.get("model", self.model),
                        "created_at": data.get("created_at"),
                        "done": data.get("done", True)
                    }
                else:
                    logger.error(f"Ollama API error: {response.status_code} - {response.text}")
                    return {
                        "success": False,
                        "error": f"API error: {response.status_code}",
                        "response": ""
                    }

        except asyncio.TimeoutError:
            logger.error("Ollama request timed out")
            return {
                "success": False,
                "error": "Request timed out. The AI is taking too long to respond.",
                "response": ""
            }
        except Exception as e:
            logger.error(f"Ollama service error: {e}")
            return {
                "success": False,
                "error": f"Service error: {str(e)}",
                "response": ""
            }

    def get_system_prompt_for_sql(self, schema_info: Dict[str, Any]) -> str:
        """
        Generate system prompt for SQL generation based on database schema

        Args:
            schema_info: Database schema information

        Returns:
            Formatted system prompt for AI
        """
        # Extract just essential table info for simpler prompt
        tables_summary = {}
        if "tables" in schema_info:
            for table_name, table_info in schema_info["tables"].items():
                if table_name in ["SCOUT_REPORTS", "PLAYERS", "MATCHES", "USERS"]:
                    tables_summary[table_name] = {
                        "columns": list(table_info.get("columns", {}).keys()),
                        "description": table_info.get("description", "")
                    }

        return f"""You are a SQL generator for a SNOWFLAKE database with football recruitment data. Generate ONLY valid SELECT statements.

AVAILABLE TABLES:
{json.dumps(tables_summary, indent=2)}

CRITICAL RULES:
1. Return ONLY a SELECT statement - no explanations, no markdown, no code blocks
2. Use only tables: SCOUT_REPORTS, PLAYERS, MATCHES, USERS
3. Always include LIMIT clause (max 100 rows)
4. Use proper JOINs when referencing multiple tables
5. Use SNOWFLAKE syntax for dates: DATEADD(), CURRENT_DATE, etc.
6. If you cannot answer, return exactly: INSUFFICIENT_DATA

EXAMPLES:
User: "How many scout reports?"
Response: SELECT COUNT(*) FROM SCOUT_REPORTS LIMIT 1

User: "Top 5 players by performance"
Response: SELECT PLAYER_NAME, PERFORMANCE_SCORE FROM SCOUT_REPORTS ORDER BY PERFORMANCE_SCORE DESC LIMIT 5

User: "Reports from this month"
Response: SELECT * FROM SCOUT_REPORTS WHERE CREATED_AT >= DATEADD(MONTH, -1, CURRENT_DATE) LIMIT 100

GENERATE SQL ONLY - NO OTHER TEXT."""

    async def validate_and_execute_sql(self, sql_query: str) -> Dict[str, Any]:
        """
        Validate generated SQL for security before execution

        Args:
            sql_query: SQL query to validate

        Returns:
            Validation result with safety assessment
        """
        try:
            # Basic SQL injection and safety checks
            sql_upper = sql_query.upper().strip()

            # Forbidden operations (but exclude DESC when used with ORDER BY)
            forbidden_keywords = [
                'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER',
                'TRUNCATE', 'REPLACE', 'EXEC', 'EXECUTE', 'CALL',
                'DECLARE', 'SET', 'USE', 'SHOW', 'DESCRIBE'
            ]

            # Check for forbidden keywords as whole words, not substrings
            import re
            for keyword in forbidden_keywords:
                # Use word boundaries to avoid false positives like "CREATED_AT" containing "CREATE"
                pattern = r'\b' + re.escape(keyword) + r'\b'
                if re.search(pattern, sql_upper):
                    return {
                        "valid": False,
                        "error": f"Forbidden SQL operation detected: {keyword}",
                        "query": sql_query
                    }

            # Special check for DESC - only forbidden if not part of ORDER BY
            if ' DESC ' in sql_upper and 'ORDER BY' not in sql_upper:
                return {
                    "valid": False,
                    "error": "DESCRIBE operation not allowed",
                    "query": sql_query
                }

            # Must start with SELECT
            if not sql_upper.startswith('SELECT'):
                return {
                    "valid": False,
                    "error": "Query must be a SELECT statement",
                    "query": sql_query
                }

            # Check for potentially dangerous patterns
            dangerous_patterns = [';--', '/*', '*/', 'xp_', 'sp_']
            for pattern in dangerous_patterns:
                if pattern in sql_query.lower():
                    return {
                        "valid": False,
                        "error": "Potentially dangerous SQL pattern detected",
                        "query": sql_query
                    }

            return {
                "valid": True,
                "query": sql_query,
                "message": "Query passed security validation"
            }

        except Exception as e:
            logger.error(f"SQL validation error: {e}")
            return {
                "valid": False,
                "error": f"Validation error: {str(e)}",
                "query": sql_query
            }

# Global instance
ollama_service = OllamaService()