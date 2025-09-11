#!/usr/bin/env python3
"""
Migration script to update PURPOSE values from "Assessment" to "Report" format
Changes:
- "Player Assessment" -> "Player Report"  
- "Loan Assessment" -> "Loan Report"
"""

import snowflake.connector
from dotenv import load_dotenv
import os

def main():
    # Load environment variables
    load_dotenv()
    
    # Create connection
    conn = snowflake.connector.connect(
        user=os.getenv('SNOWFLAKE_USER'),
        password=os.getenv('SNOWFLAKE_PASSWORD'),
        account=os.getenv('SNOWFLAKE_ACCOUNT'),
        warehouse=os.getenv('SNOWFLAKE_WAREHOUSE'),
        database=os.getenv('SNOWFLAKE_DATABASE'),
        schema=os.getenv('SNOWFLAKE_SCHEMA')
    )
    
    cursor = conn.cursor()
    
    try:
        print("=== Updating PURPOSE values in scout_reports table ===")
        
        # Check current values
        print("\n1. Current PURPOSE values:")
        cursor.execute("SELECT DISTINCT PURPOSE, COUNT(*) FROM scout_reports WHERE PURPOSE IS NOT NULL GROUP BY PURPOSE ORDER BY PURPOSE")
        current_values = cursor.fetchall()
        for value, count in current_values:
            print(f"   '{value}': {count} records")
        
        # Update Player Assessment -> Player Report
        print("\n2. Updating 'Player Assessment' -> 'Player Report'...")
        cursor.execute("UPDATE scout_reports SET PURPOSE = 'Player Report' WHERE PURPOSE = 'Player Assessment'")
        player_updates = cursor.rowcount
        print(f"   Updated {player_updates} records")
        
        # Update Loan Assessment -> Loan Report  
        print("\n3. Updating 'Loan Assessment' -> 'Loan Report'...")
        cursor.execute("UPDATE scout_reports SET PURPOSE = 'Loan Report' WHERE PURPOSE = 'Loan Assessment'")
        loan_updates = cursor.rowcount
        print(f"   Updated {loan_updates} records")
        
        # Commit changes
        conn.commit()
        print(f"\n4. Committed changes successfully!")
        
        # Verify updates
        print("\n5. Updated PURPOSE values:")
        cursor.execute("SELECT DISTINCT PURPOSE, COUNT(*) FROM scout_reports WHERE PURPOSE IS NOT NULL GROUP BY PURPOSE ORDER BY PURPOSE")
        updated_values = cursor.fetchall()
        for value, count in updated_values:
            print(f"   '{value}': {count} records")
        
        print(f"\nMigration completed successfully!")
        print(f"Total records updated: {player_updates + loan_updates}")
        
    except Exception as e:
        print(f"Error during migration: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    main()