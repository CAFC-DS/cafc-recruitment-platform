"""
Database Schema Understanding Module
Extracts and documents Snowflake table schemas for AI context
"""

import logging
from typing import Dict, List, Any, Optional
from functools import lru_cache
from datetime import datetime, date
import snowflake.connector
from snowflake.connector.connection import SnowflakeConnection

logger = logging.getLogger(__name__)

class SchemaService:
    def __init__(self, snowflake_connection: SnowflakeConnection):
        self.connection = snowflake_connection

    @lru_cache(maxsize=1)
    def get_database_schema(self) -> Dict[str, Any]:
        """
        Extract comprehensive database schema information for AI context
        Cached to avoid repeated database calls

        Returns:
            Dictionary containing schema information for all accessible tables
        """
        try:
            cursor = self.connection.cursor()
            schema_info = {
                "database": "recruitment_platform",
                "tables": {},
                "relationships": [],
                "sample_data": {}
            }

            # Define tables we want to expose to the AI (security-conscious selection)
            allowed_tables = [
                "SCOUT_REPORTS",
                "PLAYERS",
                "MATCHES",
                "USERS"  # Limited access
            ]

            for table_name in allowed_tables:
                try:
                    # Get column information
                    cursor.execute(f"DESCRIBE TABLE {table_name}")
                    columns = cursor.fetchall()

                    table_info = {
                        "columns": {},
                        "description": self._get_table_description(table_name),
                        "row_count_estimate": self._get_row_count(cursor, table_name),
                        "sample_values": {}
                    }

                    # Process column information
                    for col in columns:
                        col_name = col[0]
                        col_type = col[1]
                        nullable = col[2]
                        default = col[3] if len(col) > 3 else None

                        table_info["columns"][col_name] = {
                            "type": col_type,
                            "nullable": nullable == "Y",
                            "default": default,
                            "description": self._get_column_description(table_name, col_name)
                        }

                        # Get sample values for better AI understanding (limited for privacy)
                        if table_name != "users" or col_name in ["ROLE", "ID"]:  # Limit user data exposure
                            sample_values = self._get_sample_column_values(cursor, table_name, col_name)
                            if sample_values:
                                table_info["sample_values"][col_name] = sample_values

                    schema_info["tables"][table_name] = table_info

                except Exception as e:
                    logger.error(f"Error getting schema for table {table_name}: {e}")
                    continue

            # Add relationship information
            schema_info["relationships"] = self._get_table_relationships()

            # Add common query patterns for AI reference
            schema_info["common_patterns"] = self._get_common_query_patterns()

            return schema_info

        except Exception as e:
            logger.error(f"Error extracting database schema: {e}")
            return {"error": f"Schema extraction failed: {str(e)}"}

    def _get_table_description(self, table_name: str) -> str:
        """Get human-readable description of what each table contains"""
        descriptions = {
            "scout_reports": "Contains player scouting assessments including performance scores, attributes, strengths, weaknesses, and scout observations. Each report represents one scout's evaluation of a player during a specific match.",
            "players": "Contains player information including personal details, physical attributes (height, build), playing positions, and team affiliations. Links to external football data sources.",
            "matches": "Contains match/fixture information including teams, dates, competition details, and venue information. Used to associate scout reports with specific games.",
            "users": "Contains system user information including scouts, managers, and administrators. Limited access for privacy - only basic role and ID information exposed."
        }
        return descriptions.get(table_name, f"Table containing {table_name} data")

    def _get_column_description(self, table_name: str, column_name: str) -> str:
        """Get human-readable description of specific columns"""
        column_descriptions = {
            "scout_reports": {
                "PERFORMANCE_SCORE": "Overall performance rating from 1-10 (1=Step 2 & Below, 10=Mid Prem & Above)",
                "SCOUTING_TYPE": "Method of scouting: 'Live' (in-person) or 'Video' (video analysis)",
                "POSITION_PLAYED": "Position player was observed in during this specific match",
                "PLAYER_ID": "Links to player in players table",
                "MATCH_ID": "Links to match in matches table",
                "USER_ID": "ID of scout who created this report",
                "CREATED_AT": "Date and time when report was submitted",
                "REPORT_TYPE": "Type of assessment: 'Player Assessment', 'Flag', or 'Clips'",
                "FLAG_CATEGORY": "For flag reports: 'Positive', 'Negative', or 'Neutral'",
                "STRENGTHS": "JSON array of player's identified strengths",
                "WEAKNESSES": "JSON array of player's identified weaknesses"
            },
            "players": {
                "PLAYER_NAME": "Full name of the player",
                "POSITION": "Primary playing position",
                "HEIGHT": "Player height in feet and inches format",
                "BUILD": "Physical build: Slight, Lean, Medium, Strong, Heavy",
                "SQUAD_NAME": "Current team/club name",
                "DATE_OF_BIRTH": "Player's birth date",
                "AGE": "Current age calculated from birth date"
            },
            "matches": {
                "HOME_TEAM": "Name of home team",
                "AWAY_TEAM": "Name of away team",
                "FIXTURE_DATE": "Date when match was/will be played",
                "COMPETITION": "Competition/league name",
                "SCHEDULED_DATE": "Original scheduled date",
                "DATA_SOURCE": "Source of match data: 'internal' or 'external'"
            },
            "users": {
                "USERNAME": "Scout/user login name",
                "ROLE": "User role: 'scout', 'manager', or 'admin'",
                "EMAIL": "Contact email (limited access)"
            }
        }

        table_cols = column_descriptions.get(table_name, {})
        return table_cols.get(column_name, f"{column_name} data")

    def _get_row_count(self, cursor, table_name: str) -> Optional[int]:
        """Get approximate row count for table"""
        try:
            cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
            result = cursor.fetchone()
            return result[0] if result else None
        except Exception as e:
            logger.error(f"Error getting row count for {table_name}: {e}")
            return None

    def _get_sample_column_values(self, cursor, table_name: str, column_name: str, limit: int = 5) -> List[Any]:
        """Get sample values from a column for AI context (with privacy controls)"""
        try:
            # Skip sensitive columns
            sensitive_columns = ["EMAIL", "HASHED_PASSWORD", "PERSONAL_DATA"]
            if any(sensitive in column_name.upper() for sensitive in sensitive_columns):
                return []

            # For user table, only show roles and generic info
            if table_name == "users" and column_name not in ["ROLE", "ID"]:
                return []

            cursor.execute(f"""
                SELECT DISTINCT {column_name}
                FROM {table_name}
                WHERE {column_name} IS NOT NULL
                LIMIT {limit}
            """)
            results = cursor.fetchall()
            # Handle Decimal and other types for JSON serialization
            converted_results = []
            for row in results:
                value = row[0]
                if hasattr(value, '__class__') and 'Decimal' in str(type(value)):
                    converted_results.append(float(value))
                elif isinstance(value, datetime):
                    converted_results.append(value.isoformat())
                elif isinstance(value, date):
                    converted_results.append(value.isoformat())
                else:
                    converted_results.append(value)
            return converted_results
        except Exception as e:
            logger.error(f"Error getting sample values for {table_name}.{column_name}: {e}")
            return []

    def _get_table_relationships(self) -> List[Dict[str, str]]:
        """Define table relationships for AI understanding"""
        return [
            {
                "from_table": "scout_reports",
                "from_column": "PLAYER_ID",
                "to_table": "players",
                "to_column": "PLAYER_ID",
                "relationship": "many-to-one",
                "description": "Each scout report is about one player; players can have multiple reports"
            },
            {
                "from_table": "scout_reports",
                "from_column": "MATCH_ID",
                "to_table": "matches",
                "to_column": "MATCH_ID",
                "relationship": "many-to-one",
                "description": "Each scout report is associated with one match; matches can have multiple reports"
            },
            {
                "from_table": "scout_reports",
                "from_column": "USER_ID",
                "to_table": "users",
                "to_column": "ID",
                "relationship": "many-to-one",
                "description": "Each scout report is created by one user/scout; users can create multiple reports"
            }
        ]

    def _get_common_query_patterns(self) -> Dict[str, str]:
        """Provide common query patterns for AI reference"""
        return {
            "top_players_by_score": "SELECT player_name, AVG(performance_score) as avg_score FROM scout_reports sr JOIN players p ON sr.player_id = p.player_id GROUP BY player_name ORDER BY avg_score DESC",
            "scout_productivity": "SELECT u.username, COUNT(*) as report_count FROM scout_reports sr JOIN users u ON sr.user_id = u.id GROUP BY u.username ORDER BY report_count DESC",
            "recent_reports": "SELECT player_name, performance_score, created_at FROM scout_reports sr JOIN players p ON sr.player_id = p.player_id WHERE created_at >= CURRENT_DATE - INTERVAL '30 days' ORDER BY created_at DESC",
            "position_analysis": "SELECT position_played, AVG(performance_score) as avg_score, COUNT(*) as report_count FROM scout_reports GROUP BY position_played ORDER BY avg_score DESC",
            "match_coverage": "SELECT m.home_team, m.away_team, m.fixture_date, COUNT(sr.id) as reports_count FROM matches m LEFT JOIN scout_reports sr ON m.match_id = sr.match_id GROUP BY m.match_id ORDER BY reports_count DESC"
        }

    def get_table_summary(self) -> str:
        """Get a concise summary of available data for user display"""
        try:
            cursor = self.connection.cursor()

            # Get counts for each main table
            cursor.execute("SELECT COUNT(*) FROM scout_reports")
            report_count = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM players")
            player_count = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM matches")
            match_count = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM users WHERE role = 'scout'")
            scout_count = cursor.fetchone()[0]

            return f"""
📊 **Available Data Summary:**
• **{report_count:,}** scout reports across all assessments
• **{player_count:,}** players in the database
• **{match_count:,}** matches/fixtures tracked
• **{scout_count}** active scouts contributing data

🔍 **What you can ask about:**
• Player performance and rankings
• Scout productivity and activity
• Match coverage and analysis
• Position-based insights
• Timeline and trend analysis
• Comparative assessments
"""
        except Exception as e:
            logger.error(f"Error generating table summary: {e}")
            return "Data summary temporarily unavailable."

# Note: This will be instantiated in main.py with the actual Snowflake connection