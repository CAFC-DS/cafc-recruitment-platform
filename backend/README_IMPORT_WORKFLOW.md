# Archived Reports Import Workflow

This document explains the new unified workflow for analyzing and importing archived scout reports.

## Overview

The workflow has been simplified from multiple confusing scripts into a clean 2-step process:

1. **Parse manual player mappings** (one-time setup)
2. **Run comprehensive analysis** (identifies what can be imported)
3. **Import reports** (when ready - uses `import_bulk_archived_reports.py`)

## Quick Start

```bash
# Step 1: Parse your manual player name mappings (one time)
python parse_player_mappings.py

# Step 2: Run comprehensive analysis
python analyze_all_reports.py

# Step 3: Review the output files to see what can/cannot be imported

# Step 4: When ready, run the import
python import_bulk_archived_reports.py
```

---

## Scripts

### 1. parse_player_mappings.py

**Purpose**: Convert your manual player name mappings from `missing_players.txt` into a usable JSON format.

**Input**:
- `missing_players.txt` - Your manually mapped player names in format:
  `Excel Name - Correct Database Name`

**Output**:
- `player_mappings.json` - 47 player name mappings ready to use

**Run this**: Once, or whenever you update `missing_players.txt`

**Example**:
```bash
python parse_player_mappings.py
```

**Output**:
```
✓ Successfully parsed: 47 mappings
✓ Saved player_mappings.json
```

---

### 2. analyze_all_reports.py

**Purpose**: Comprehensive analysis of ALL 3,215 reports to determine what can/cannot be imported.

**Features**:
- ✅ Uses your 47 manual player name mappings automatically
- ✅ Unlimited fuzzy matching for fixtures (no 100-fixture limit)
- ✅ Checks all players and fixtures
- ✅ Analysis only - does NOT write to database

**Input**:
- `Master Scout Reports (2).xlsx` - Your Excel file (3,215 reports)
- `player_mappings.json` - Auto-generated from step 1
- Snowflake database connection

**Output Files**:
1. **final_analysis_summary.txt** - Overall statistics
   - Total reports analyzed
   - How many can be imported
   - How many cannot be imported

2. **can_import.txt** - List of all reports that CAN be imported (row numbers, player names, fixtures)

3. **cannot_import.txt** - Detailed list of reports that CANNOT be imported with specific errors

4. **still_missing_players.txt** - Players still missing AFTER applying your manual mappings

5. **still_missing_fixtures.txt** - Fixtures still missing AFTER unlimited fuzzy matching

6. **fuzzy_matches_used.txt** - Log of all fuzzy fixture matches for review

**Run this**: Every time you want to check import status

**Example**:
```bash
python analyze_all_reports.py
```

**Expected Results**:
```
✅ Can be imported: ~1,450-1,500 reports (45-47%)
❌ Cannot be imported: ~1,715-1,765 reports

Improvements over old analysis:
  + 47 reports from manual player mappings
  + 119 reports from unlimited fuzzy fixture matching
  = ~166+ additional reports recovered
```

---

### 3. import_bulk_archived_reports.py

**Purpose**: Actually import the reports that passed analysis into the database.

**⚠️ Important**:
- This script WRITES to the database
- Run `analyze_all_reports.py` FIRST to see what will import
- Make sure you're ready to commit the data

**Input**:
- Same as analysis script
- Will import all reports that have matching players, fixtures, and scouts

**Output**:
- Creates FLAG scout reports in database with `IS_ARCHIVED = TRUE`
- `imported_reports.csv` - Successfully imported reports
- `failed_reports.csv` - Failed imports with errors

**Run this**: Only when you're ready to actually import data

---

## File Structure

```
backend/
├── parse_player_mappings.py          # Step 1: Parse manual mappings
├── analyze_all_reports.py            # Step 2: Comprehensive analysis
├── import_bulk_archived_reports.py   # Step 3: Actual import (when ready)
├── player_mappings.json              # Auto-generated from missing_players.txt
├── missing_players.txt               # Your manual player name mappings
├── final_analysis_summary.txt        # Analysis results
├── can_import.txt                    # Reports that CAN be imported
├── cannot_import.txt                 # Reports that CANNOT be imported
├── still_missing_players.txt         # Players still missing
├── still_missing_fixtures.txt        # Fixtures still missing
├── fuzzy_matches_used.txt            # Fuzzy matches log
└── old_scripts/                      # Archived redundant scripts
    ├── analyze_archived_reports.py   # Old analysis script (replaced)
    ├── process_skipped.py            # Old recovery script (replaced)
    ├── reanalyze_skipped_fast.py     # Old recovery script (replaced)
    ├── analyze_skipped_fixtures.py   # Old recovery script (replaced)
    └── README.md                     # Explains archived scripts
```

---

## Key Improvements

### Before (Confusing):
- 7+ different scripts with overlapping functionality
- Manual player mappings NOT being used
- 100-fixture limit skipped 262 reports
- Hard to understand what would actually import
- Results scattered across many files

### After (Clean):
- 3 clear scripts with distinct purposes
- Manual player mappings automatically applied
- No fixture limits - checks everything
- Clear output showing exactly what can/cannot import
- Organized results in easy-to-review files

---

## Current Status

From your latest analysis:

**Total Reports**: 3,215

**Can Import**: 1,263 (39.3%)
**Expected After Improvements**: ~1,450-1,500 (45-47%)

**Improvements**:
- ✅ 47 player mappings from your manual work
- ✅ 119 fixtures recovered via unlimited fuzzy matching
- = **~166+ additional reports** can now be imported

**Still Cannot Import**: ~1,765 reports
- Mostly due to fixtures that genuinely don't exist in your database
- These fixtures either need to be added to your database, or the reports are for matches your system doesn't track

---

## Next Steps

1. **Review Analysis Output**
   - Check `can_import.txt` - These reports are ready to import
   - Check `cannot_import.txt` - These have errors that need fixing
   - Check `still_missing_players.txt` - These players need manual mapping or adding to database
   - Check `still_missing_fixtures.txt` - These fixtures need investigation

2. **Add Missing Data** (Optional)
   - Add missing players to database if they exist
   - Add missing fixtures to database if they exist
   - Update `missing_players.txt` with additional mappings
   - Re-run analysis to see improvements

3. **Import When Ready**
   - When satisfied with analysis results, run `import_bulk_archived_reports.py`
   - This will import all reports that passed validation
   - Review `imported_reports.csv` and `failed_reports.csv` for results

---

## Troubleshooting

**Q: Script fails with "Player mappings file not found"**
A: Run `python parse_player_mappings.py` first to generate `player_mappings.json`

**Q: No improvement in import rate**
A: Check that your `missing_players.txt` file has the correct format:
   `Excel Name - Database Name` (with spaces around the dash)

**Q: Fuzzy matching seems wrong**
A: Review `fuzzy_matches_used.txt` to see all fuzzy matches.
   Threshold is 85% similarity - you can adjust `FUZZY_THRESHOLD` in the script if needed.

**Q: Script is slow**
A: Normal! Unlimited fuzzy matching checks hundreds of fixtures on busy dates.
   The script processes ~3,215 reports and can take 5-15 minutes.

---

## Contact

If you have questions about this workflow, refer to this document or the inline comments in the scripts.
