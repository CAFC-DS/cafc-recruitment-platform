"""
Generate SQL to add stage history for players without position
"""

import pandas as pd
import sys

def normalize_reason(reason):
    """Normalize reason formatting"""
    reason = reason.replace(" By ", " by ")
    if reason == "Flagged by Recommendation":
        reason = "Flagged by External Recommendation"
    return reason

def main():
    if len(sys.argv) < 2:
        print("Usage: python generate_stage_history_sql.py <excel_file>")
        sys.exit(1)

    excel_file = sys.argv[1]

    print("-- SQL to add stage history for players without position")
    print("-- Generated from player lists migration")
    print()

    # Read Excel file
    df = pd.read_excel(excel_file, header=1)

    # Filter to players WITHOUT position
    df_to_fix = df[df['POSITION'].isna()].copy()

    print(f"-- Total players to fix: {len(df_to_fix)}")
    print()

    # Process each list
    for list_name in sorted(df_to_fix['LIST_NAME'].unique()):
        list_players = df_to_fix[df_to_fix['LIST_NAME'] == list_name]

        print(f"-- {list_name} list: {len(list_players)} players")
        print()

        for idx, row in list_players.iterrows():
            # Get player ID
            cafc_id = row['CAFC_PLAYER_ID']
            external_id = row['PLAYERID']

            if pd.notna(cafc_id):
                player_id = int(cafc_id)
                is_cafc = True
                id_column = "CAFC_PLAYER_ID"
            elif pd.notna(external_id):
                player_id = int(external_id)
                is_cafc = False
                id_column = "PLAYER_ID"
            else:
                continue

            player_name = row['PLAYERNAME']
            current_stage = row['CURRENT_STAGE']
            reason = normalize_reason(row['REASON'])

            # Skip "Moved Club"
            if reason == "Moved Club":
                continue

            # Determine initial stage based on reason
            stage_2_reasons = ["Flagged by Data", "Flagged by Live Scouting", "Flagged by Video Scouting"]

            if reason in stage_2_reasons:
                initial_stage = "Stage 2"
            else:
                initial_stage = "Stage 1"

            print(f"-- {player_name} ({player_id})")

            # First, we need to get the LIST_ITEM_ID from player_lists table
            # This SQL assumes you'll run it after finding the item IDs

            if initial_stage == current_stage:
                # Single insert - entered at this stage
                print(f"""INSERT INTO PLAYER_STAGE_HISTORY
    (LIST_ITEM_ID, LIST_ID, {id_column}, OLD_STAGE, NEW_STAGE, REASON, DESCRIPTION, CHANGED_BY, CHANGED_AT)
SELECT
    pli.ID as LIST_ITEM_ID,
    pli.LIST_ID,
    pli.{id_column},
    NULL as OLD_STAGE,
    '{current_stage}' as NEW_STAGE,
    '{reason}' as REASON,
    'Initial entry' as DESCRIPTION,
    pli.ADDED_BY as CHANGED_BY,
    pli.CREATED_AT as CHANGED_AT
FROM PLAYER_LIST_ITEMS pli
JOIN PLAYER_LISTS pl ON pli.LIST_ID = pl.ID
WHERE pli.{id_column} = {player_id}
  AND pl.LIST_NAME = '{list_name}'
  AND NOT EXISTS (
    SELECT 1 FROM PLAYER_STAGE_HISTORY psh
    WHERE psh.LIST_ITEM_ID = pli.ID
  );
""")
            else:
                # Two inserts - entered at initial stage, then updated to current
                print(f"""-- Initial entry at {initial_stage}
INSERT INTO PLAYER_STAGE_HISTORY
    (LIST_ITEM_ID, LIST_ID, {id_column}, OLD_STAGE, NEW_STAGE, REASON, DESCRIPTION, CHANGED_BY, CHANGED_AT)
SELECT
    pli.ID as LIST_ITEM_ID,
    pli.LIST_ID,
    pli.{id_column},
    NULL as OLD_STAGE,
    '{initial_stage}' as NEW_STAGE,
    '{reason}' as REASON,
    'Initial entry' as DESCRIPTION,
    pli.ADDED_BY as CHANGED_BY,
    pli.CREATED_AT as CHANGED_AT
FROM PLAYER_LIST_ITEMS pli
JOIN PLAYER_LISTS pl ON pli.LIST_ID = pl.ID
WHERE pli.{id_column} = {player_id}
  AND pl.LIST_NAME = '{list_name}'
  AND NOT EXISTS (
    SELECT 1 FROM PLAYER_STAGE_HISTORY psh
    WHERE psh.LIST_ITEM_ID = pli.ID
  );

-- Update to {current_stage}
INSERT INTO PLAYER_STAGE_HISTORY
    (LIST_ITEM_ID, LIST_ID, {id_column}, OLD_STAGE, NEW_STAGE, REASON, DESCRIPTION, CHANGED_BY, CHANGED_AT)
SELECT
    pli.ID as LIST_ITEM_ID,
    pli.LIST_ID,
    pli.{id_column},
    '{initial_stage}' as OLD_STAGE,
    '{current_stage}' as NEW_STAGE,
    '{reason}' as REASON,
    'Stage progression' as DESCRIPTION,
    pli.ADDED_BY as CHANGED_BY,
    pli.CREATED_AT + INTERVAL '1 second' as CHANGED_AT
FROM PLAYER_LIST_ITEMS pli
JOIN PLAYER_LISTS pl ON pli.LIST_ID = pl.ID
WHERE pli.{id_column} = {player_id}
  AND pl.LIST_NAME = '{list_name}'
  AND EXISTS (
    SELECT 1 FROM PLAYER_STAGE_HISTORY psh
    WHERE psh.LIST_ITEM_ID = pli.ID
    AND psh.NEW_STAGE = '{initial_stage}'
  )
  AND NOT EXISTS (
    SELECT 1 FROM PLAYER_STAGE_HISTORY psh
    WHERE psh.LIST_ITEM_ID = pli.ID
    AND psh.NEW_STAGE = '{current_stage}'
  );
""")

        print()

if __name__ == "__main__":
    main()
