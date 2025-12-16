# Old Scripts - Archived

This folder contains the old archived report import scripts that have been replaced by the unified workflow.

## Why these were archived

These scripts had overlapping functionality and made the workflow confusing:

- **analyze_archived_reports.py** - Old analysis script with 100-fixture limit, didn't use manual player mappings
- **analyze_skipped_fixtures.py** - Processed skipped fixtures separately
- **process_skipped.py** - Another script to recover skipped fixtures
- **reanalyze_skipped_fast.py** - Yet another skipped fixture processor
- **check_man_city_u21_fixtures.py** - One-off debug script for specific fixture
- **import_single_old_report.py** - Test script for single report import
- **import_multiple_archived_reports.py** - Test script for multiple report import

## New Unified Workflow

Use these scripts instead:

1. **parse_player_mappings.py** - Parse manual player name mappings once
2. **analyze_all_reports.py** - One comprehensive analysis script that:
   - Uses manual player name mappings
   - Uses unlimited fuzzy matching for fixtures
   - Provides clear output on what can/cannot be imported

3. **import_bulk_archived_reports.py** - For actual import (when ready)

## Can I Delete These?

Yes, these old scripts can be safely deleted after you've verified the new workflow works correctly.
They are kept here temporarily for reference only.
