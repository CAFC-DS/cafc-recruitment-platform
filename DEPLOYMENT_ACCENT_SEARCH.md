# Deployment Guide: Accent-Insensitive Search

## Overview
This guide explains how to deploy the accent-insensitive player search feature.

## ⚠️ IMPORTANT: Approach Changed
The initial COLLATE approach didn't work because:
- **Snowflake's ILIKE doesn't support collations**
- Error: `Function ILIKE does not support collation: en-ci-ai`
- COLLATE only works with `=`, `<`, `>` operators, not LIKE/ILIKE

**Final Solution:** JavaScript UDF (User-Defined Function) for text normalization

## Deployment Steps

### Step 1: Create the UDF in Snowflake (REQUIRED)

Run the SQL script in your Snowflake console:

```bash
# From project root:
cat create_normalize_udf.sql
```

Or copy-paste this into Snowflake:

```sql
CREATE OR REPLACE FUNCTION NORMALIZE_TEXT_UDF(text VARCHAR)
RETURNS VARCHAR
LANGUAGE JAVASCRIPT
AS $$
  if (!TEXT) return '';
  var normalized = TEXT.normalize('NFD');
  var result = normalized.replace(/[\u0300-\u036f]/g, '');
  return result.toLowerCase();
$$;
```

**Verify it works:**
```sql
SELECT NORMALIZE_TEXT_UDF('Róbert Boženík');
-- Expected output: "robert bozenik"
```

### Step 2: Restart the Backend

```bash
cd backend
python main.py
```

### Step 3: Test the Feature

#### Test 1: API Test
```bash
curl -X GET "http://localhost:8000/players/search?query=Robert%20Bozenik" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** Should return "Róbert Boženík" in results

#### Test 2: Frontend Test
1. Start frontend: `cd frontend && npm start`
2. Navigate to player search
3. Search for "Robert Bozenik"
4. Should find "Róbert Boženík"

#### Test 3: Run all Snowflake tests
```bash
# In Snowflake console, run queries from:
cat test_collation.sql
```

## How It Works

### Before (Hardcoded Approach)
```python
if word_lower == "robert":
    search_patterns.extend(["%Róbert%", "%róbert%", "%Robert%"])
elif word_lower == "bozenik":
    search_patterns.extend(["%Boženík%", "%boženík%", "%Bozenik%"])
# ... manual mapping for every accented name
```

**Problems:**
- Requires manually adding every accented name
- Doesn't scale
- High maintenance burden

### After (UDF Approach)
```sql
WHERE NORMALIZE_TEXT_UDF(PLAYERNAME) ILIKE '%robert bozenik%'
```

**Benefits:**
- Works for ALL Unicode diacritics automatically
- Zero maintenance
- No hardcoded mappings
- Consistent behavior

## Performance Considerations

### Current Performance
- **UDF calls prevent index usage**
- Queries perform full table scans
- Acceptable for moderate datasets
- May be slow for very large datasets

### Future Optimization (if needed)
If performance becomes an issue, consider adding a normalized column:

```sql
-- Add physical column (one-time migration)
ALTER TABLE players
ADD COLUMN playername_normalized VARCHAR(255);

-- Populate it
UPDATE players
SET playername_normalized = NORMALIZE_TEXT_UDF(PLAYERNAME);

-- Create index
CREATE INDEX idx_playername_normalized
ON players(playername_normalized);

-- Use in queries
WHERE playername_normalized ILIKE '%robert%'
```

This trades storage for query performance.

## Affected Endpoints

All endpoints now use `NORMALIZE_TEXT_UDF()`:

1. **GET /players/search**
   - Main player autocomplete search
   - Pattern: `WHERE NORMALIZE_TEXT_UDF(PLAYERNAME) ILIKE %s`

2. **GET /scout-reports**
   - Filter reports by player name
   - Pattern: `WHERE NORMALIZE_TEXT_UDF(p.PLAYERNAME) ILIKE %s`

3. **GET /players/all**
   - Search across multiple fields
   - Pattern: `WHERE NORMALIZE_TEXT_UDF(p.PLAYERNAME) ILIKE %s OR NORMALIZE_TEXT_UDF(p.FIRSTNAME) ILIKE %s...`

4. **GET /player-lists**
   - Player and position filters
   - Pattern: `WHERE NORMALIZE_TEXT_UDF(COALESCE(p.PLAYERNAME, ip.PLAYERNAME)) ILIKE %s`
   - **Bonus:** Also fixed SQL injection vulnerability in this endpoint

## Troubleshooting

### Error: "Unknown function NORMALIZE_TEXT_UDF"
**Cause:** UDF not created in Snowflake
**Fix:** Run `create_normalize_udf.sql` in Snowflake console

### Search not finding accented names
**Cause:** UDF not working correctly
**Test:** Run `SELECT NORMALIZE_TEXT_UDF('Róbert')` - should return `"robert"`
**Fix:** Recreate the UDF

### Performance is too slow
**Cause:** Full table scans due to UDF
**Short-term:** Add `LIMIT` to queries
**Long-term:** Add normalized column (see Performance section above)

## Rollback Plan

If issues arise:

```bash
# Go back to previous commit (with hardcoded mappings)
git checkout 5e1f712^

# Or go back to player-lists branch (before any accent work)
git checkout feature/player-lists-improvements

# Restart backend
python backend/main.py
```

## Testing Checklist

- [ ] UDF created in Snowflake
- [ ] Backend restarted
- [ ] Search "Robert Bozenik" finds "Róbert Boženík"
- [ ] Search "Oscar" finds "Óscar"
- [ ] Search "Jose" finds "José"
- [ ] Search is case-insensitive (ROBERT = robert)
- [ ] All 4 endpoints work correctly
- [ ] Performance is acceptable
- [ ] No SQL errors in logs

## Files Changed

- `backend/main.py` - Updated 4 search endpoints
- `create_normalize_udf.sql` - NEW: UDF creation script
- `test_collation.sql` - Updated test queries
- `TESTING_ACCENT_SEARCH.md` - Updated documentation

## Commit History

```
4cde41e fix: Switch from COLLATE to NORMALIZE_TEXT_UDF
5e1f712 fix: Correct collation syntax utf8-ai to en-ci-ai
d0c3200 feat: Implement scalable accent-insensitive search
b9d2301 fix: Add accent mappings for Robert Bozenik (temporary)
```

## Summary

**What Changed:** Replaced hardcoded accent mappings with Snowflake UDF
**Why Changed:** COLLATE doesn't work with ILIKE (pattern matching)
**Action Required:** Create UDF in Snowflake before deploying
**Performance Impact:** Full table scans (no index usage)
**Future Optimization:** Add normalized column if performance is an issue
