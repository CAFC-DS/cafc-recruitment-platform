# Team ID Backfill Instructions

## Overview
This document explains how to use the backfill script to correct team names and populate missing squad IDs for internal matches.

## Problem
- All 29 internal matches have NULL HOMESQUADID and AWAYSQUADID
- Some team names are inconsistent (e.g., "Celtic" vs "Celtic Glasgow", "Sydney" vs "Sydney FC")
- Users were entering team names manually, leading to typos and variations

## Solution
This feature adds:
1. New `/teams-with-ids` endpoint that returns validated teams from external matches
2. Updated fixture creation form with dropdown selects (no more free text!)
3. Backfill script to fix existing data

## Running the Backfill Script

### 1. Dry Run (Recommended First)
See what would be updated without making changes:
```bash
cd backend
python backfill_team_ids.py --dry-run
```

### 2. Auto-Approve High-Confidence Matches
Only update matches with >95% similarity (default):
```bash
python backfill_team_ids.py
```

### 3. Custom Threshold
Adjust the auto-approval threshold:
```bash
python backfill_team_ids.py --auto-approve-threshold 90
```

### 4. Update All Matches
Set threshold to 0 to update everything:
```bash
python backfill_team_ids.py --auto-approve-threshold 0
```

## Script Output

The script will:
1. Fetch all teams from external matches (with IDs)
2. Analyze internal matches and find best matches using fuzzy matching
3. Show proposed changes with similarity scores
4. Mark high-confidence matches as auto-approved
5. Flag lower-confidence matches for manual review

### Example Output:
```
[1] Match ID: 3301 | Date: 2025-10-21
    Home: 'Barnsley' (ID backfill only: None)
    Away: 'Manchester United U21 ' → 'Manchester United U21' (Score: 100.0%)
          ID: 1451
    ✓ AUTO-APPROVED (threshold: 95%)
```

## Teams Without Good Matches

Some teams (especially U17/U21 youth teams and lower league teams) may not exist in the external data. These will be listed separately and their IDs will remain NULL. This is expected behavior.

## After Running the Script

1. Verify the updates in the database
2. Clear the API cache: `POST /admin/clear-cache`
3. Test the updated fixture creation form
4. Future fixtures will automatically have the correct IDs when using the dropdown

## Notes

- The script uses rapidfuzz for fuzzy string matching
- Scores above 95% are typically very safe
- Scores 85-95% might need review (like "Carshalton" vs "Charlton")
- The script is idempotent - safe to run multiple times
- All changes are committed in a single transaction
