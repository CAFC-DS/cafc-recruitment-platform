"""
SQL Generation Service with Security Controls
Orchestrates AI-powered SQL generation with comprehensive safety measures
"""

import logging
import json
import sqlparse
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime, date
import snowflake.connector
from snowflake.connector.connection import SnowflakeConnection

from .ollama_service import ollama_service
from .schema_service import SchemaService

logger = logging.getLogger(__name__)

class SQLGeneratorService:
    def __init__(self, snowflake_connection: SnowflakeConnection):
        self.connection = snowflake_connection
        self.schema_service = SchemaService(snowflake_connection)
        self.max_result_rows = 1000  # Safety limit
        self.query_timeout = 30  # seconds

    async def process_natural_language_query(
        self,
        user_query: str,
        conversation_history: List[Dict[str, str]] = None,
        user_role: str = "scout"
    ) -> Dict[str, Any]:
        """
        Process natural language query and return structured results

        Args:
            user_query: User's natural language question
            conversation_history: Previous conversation context
            user_role: User's role for access control

        Returns:
            Dictionary with query results, SQL, and metadata
        """
        try:
            # Step 1: Validate user permissions
            if not self._check_user_permissions(user_role):
                return {
                    "success": False,
                    "error": "Insufficient permissions for analytics queries",
                    "requires_permission": "manager or admin role"
                }

            # Step 2: Get database schema for AI context
            schema_info = self.schema_service.get_database_schema()
            if "error" in schema_info:
                return {
                    "success": False,
                    "error": "Unable to access database schema",
                    "details": schema_info["error"]
                }

            # Step 3: Generate system prompt with schema context
            system_prompt = ollama_service.get_system_prompt_for_sql(schema_info)

            # Step 4: Get AI-generated SQL
            ai_response = await ollama_service.generate_response(
                prompt=user_query,
                system_prompt=system_prompt,
                conversation_history=conversation_history or []
            )

            if not ai_response["success"]:
                return {
                    "success": False,
                    "error": "AI service unavailable",
                    "details": ai_response.get("error", "Unknown AI error"),
                    "suggestion": "Please try again later or rephrase your question"
                }

            generated_sql = ai_response["response"].strip()

            # Clean up AI response - extract SQL from markdown if present
            if "```sql" in generated_sql:
                # Extract SQL from markdown code block
                import re
                sql_match = re.search(r'```sql\s*(.*?)\s*```', generated_sql, re.DOTALL | re.IGNORECASE)
                if sql_match:
                    generated_sql = sql_match.group(1).strip()
            elif "```" in generated_sql:
                # Extract SQL from generic code block
                import re
                sql_match = re.search(r'```\s*(.*?)\s*```', generated_sql, re.DOTALL)
                if sql_match:
                    generated_sql = sql_match.group(1).strip()

            # Remove any remaining explanatory text before the SQL
            lines = generated_sql.split('\n')
            sql_lines = []
            for line in lines:
                line = line.strip()
                if line.upper().startswith('SELECT') or sql_lines:
                    sql_lines.append(line)
                elif line.upper().startswith('WITH') or line.upper().startswith('FROM') or line.upper().startswith('WHERE'):
                    sql_lines.append(line)

            if sql_lines:
                generated_sql = '\n'.join(sql_lines).strip()

            # Handle special responses
            if generated_sql == "INSUFFICIENT_DATA":
                return {
                    "success": False,
                    "error": "Insufficient data available",
                    "message": "The available database doesn't contain enough information to answer your question.",
                    "suggestion": "Try asking about scout reports, player performance, or match coverage."
                }

            # Step 5: Validate and secure the SQL
            validation_result = await ollama_service.validate_and_execute_sql(generated_sql)
            if not validation_result["valid"]:
                return {
                    "success": False,
                    "error": "Generated query failed security validation",
                    "details": validation_result["error"],
                    "sql_attempted": generated_sql
                }

            # Step 6: Additional security parsing
            security_check = self._advanced_sql_security_check(generated_sql)
            if not security_check["safe"]:
                return {
                    "success": False,
                    "error": "Query contains potentially unsafe elements",
                    "details": security_check["reason"],
                    "sql_attempted": generated_sql
                }

            # Step 7: Execute the query safely
            execution_result = await self._execute_sql_safely(generated_sql)

            # Step 8: Format and return results
            return {
                "success": True,
                "sql_query": generated_sql,
                "results": execution_result["data"],
                "row_count": execution_result["row_count"],
                "execution_time": execution_result["execution_time"],
                "columns": execution_result["columns"],
                "ai_model": ai_response.get("model", "unknown"),
                "query_summary": self._generate_query_summary(user_query, execution_result),
                "timestamp": datetime.now().isoformat()
            }

        except Exception as e:
            logger.error(f"Error processing natural language query: {e}")
            return {
                "success": False,
                "error": "Query processing failed",
                "details": str(e),
                "timestamp": datetime.now().isoformat()
            }

    def _check_user_permissions(self, user_role: str) -> bool:
        """Check if user has permission to use analytics chatbot"""
        allowed_roles = ["manager", "admin"]
        return user_role.lower() in allowed_roles

    def _advanced_sql_security_check(self, sql_query: str) -> Dict[str, Any]:
        """
        Advanced security checking using SQL parsing

        Args:
            sql_query: SQL query to analyze

        Returns:
            Security assessment result
        """
        try:
            # Parse SQL using sqlparse
            parsed = sqlparse.parse(sql_query)
            if not parsed:
                return {"safe": False, "reason": "Unable to parse SQL"}

            statement = parsed[0]

            # Check statement type
            if statement.get_type() != 'SELECT':
                return {"safe": False, "reason": "Only SELECT statements allowed"}

            # Convert to string for additional checks
            sql_normalized = str(statement).upper()

            # Additional forbidden patterns
            forbidden_patterns = [
                'INFORMATION_SCHEMA',
                'SYS.',
                'SYSTEM',
                'ADMIN',
                'PASSWORD',
                'CREDENTIAL',
                'GRANT',
                'REVOKE',
                'BACKUP',
                'RESTORE',
                'SHUTDOWN',
                'KILL'
            ]

            for pattern in forbidden_patterns:
                if pattern in sql_normalized:
                    return {"safe": False, "reason": f"Forbidden pattern detected: {pattern}"}

            # Check for allowed tables only (case-insensitive)
            allowed_tables = ['SCOUT_REPORTS', 'PLAYERS', 'MATCHES', 'USERS']
            tokens = sqlparse.parse(sql_query)[0].flatten()

            found_tables = []
            for token in tokens:
                if token.ttype is None and token.value.upper() in allowed_tables:
                    found_tables.append(token.value.upper())

            # Ensure only allowed tables are referenced
            all_table_references = self._extract_table_references(sql_query)
            for table_ref in all_table_references:
                if table_ref.upper() not in allowed_tables:
                    return {"safe": False, "reason": f"Unauthorized table access: {table_ref}"}

            # Check for LIMIT clause (enforce reasonable limits)
            if 'LIMIT' not in sql_normalized:
                # Auto-add limit for safety
                sql_query += f" LIMIT {self.max_result_rows}"

            return {
                "safe": True,
                "reason": "Query passed security validation",
                "tables_accessed": found_tables,
                "modified_query": sql_query
            }

        except Exception as e:
            logger.error(f"SQL security check error: {e}")
            return {"safe": False, "reason": f"Security check failed: {str(e)}"}

    def _extract_table_references(self, sql_query: str) -> List[str]:
        """Extract all table references from SQL query"""
        try:
            # Simple regex-based extraction for table names after FROM and JOIN
            import re

            # Pattern to match table names after FROM or JOIN keywords
            pattern = r'(?:FROM|JOIN)\s+([a-zA-Z_][a-zA-Z0-9_]*)'
            matches = re.findall(pattern, sql_query, re.IGNORECASE)
            return matches
        except Exception:
            return []

    async def _execute_sql_safely(self, sql_query: str) -> Dict[str, Any]:
        """
        Execute SQL with safety controls and monitoring

        Args:
            sql_query: Validated SQL query to execute

        Returns:
            Query execution results with metadata
        """
        try:
            cursor = self.connection.cursor()
            start_time = datetime.now()

            # Set query timeout
            cursor.execute(f"ALTER SESSION SET STATEMENT_TIMEOUT_IN_SECONDS = {self.query_timeout}")

            # Execute the query
            cursor.execute(sql_query)
            results = cursor.fetchall()
            column_names = [desc[0] for desc in cursor.description] if cursor.description else []

            end_time = datetime.now()
            execution_time = (end_time - start_time).total_seconds()

            # Convert results to JSON-serializable format
            formatted_results = []
            for row in results:
                formatted_row = {}
                for i, col_name in enumerate(column_names):
                    value = row[i]
                    # Handle various data types for JSON serialization
                    if isinstance(value, datetime):
                        formatted_row[col_name] = value.isoformat()
                    elif isinstance(value, date):
                        formatted_row[col_name] = value.isoformat()
                    elif hasattr(value, '__class__') and 'Decimal' in str(type(value)):
                        # Handle Decimal objects from Snowflake
                        formatted_row[col_name] = float(value)
                    elif value is None:
                        formatted_row[col_name] = None
                    else:
                        formatted_row[col_name] = value
                formatted_results.append(formatted_row)

            return {
                "data": formatted_results,
                "row_count": len(formatted_results),
                "columns": column_names,
                "execution_time": execution_time,
                "timestamp": start_time.isoformat()
            }

        except Exception as e:
            logger.error(f"SQL execution error: {e}")
            logger.error(f"Failed SQL query was: {sql_query}")
            raise Exception(f"Query execution failed: {str(e)}")

    def _generate_query_summary(self, user_query: str, execution_result: Dict[str, Any]) -> str:
        """Generate human-readable summary of query results"""
        row_count = execution_result["row_count"]
        execution_time = execution_result["execution_time"]

        if row_count == 0:
            return f"No results found for your query. The query executed successfully in {execution_time:.2f} seconds."
        elif row_count == 1:
            return f"Found 1 result in {execution_time:.2f} seconds."
        else:
            return f"Found {row_count} results in {execution_time:.2f} seconds."

    async def get_suggested_queries(self) -> List[Dict[str, str]]:
        """Get list of suggested queries for users to try"""
        return [
            {
                "category": "Player Performance",
                "question": "Who are the top 10 highest-rated players?",
                "description": "Shows players with the best average performance scores"
            },
            {
                "category": "Scout Activity",
                "question": "Which scouts have submitted the most reports this month?",
                "description": "Ranks scouts by their reporting activity"
            },
            {
                "category": "Match Coverage",
                "question": "Which matches had the most player coverage?",
                "description": "Shows games with the highest number of scouted players"
            },
            {
                "category": "Position Analysis",
                "question": "What's the average performance score by position?",
                "description": "Compares performance ratings across different playing positions"
            },
            {
                "category": "Timeline Analysis",
                "question": "How many reports were created each month this year?",
                "description": "Shows reporting trends over time"
            },
            {
                "category": "Data Overview",
                "question": "How many total players, matches, and reports are in the system?",
                "description": "Provides a high-level overview of database contents"
            }
        ]

    def get_schema_summary(self) -> str:
        """Get user-friendly summary of available data"""
        return self.schema_service.get_table_summary()

# Note: This will be instantiated in main.py with the actual Snowflake connection