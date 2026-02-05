# Testing Accent-Insensitive Search Implementation

## Overview
This document outlines how to test the new accent-insensitive search feature using Snowflake COLLATE 'utf8-ai'.

## Endpoints Updated
1. `GET /players/search` - Main player search (autocomplete)
2. `GET /scout-reports` - Filter scout reports by player name
3. `GET /players/all` - Paginated player list with search
4. `GET /player-lists` - Player lists with filters (also fixed SQL injection)

## Test Cases

### 1. Basic Accent-Insensitive Search
Test that searching for non-accented characters finds accented names:

**Test**: Search for "Robert Bozenik"
- **Expected**: Should find "Róbert Boženík"
- **Endpoints to test**: All 4 endpoints above

**Test**: Search for "Oscar"
- **Expected**: Should find all players with "Óscar", "Òscar", "Ôscar", etc.

**Test**: Search for "Jose"
- **Expected**: Should find all players with "José", "Josè", etc.

**Test**: Search for "Joao"
- **Expected**: Should find all players with "João"

### 2. Reverse Search (Accented → Non-accented)
Test that searching with accents still works:

**Test**: Search for "Róbert"
- **Expected**: Should find "Robert" and "Róbert"

**Test**: Search for "José"
- **Expected**: Should find "Jose" and "José"

### 3. Case Insensitivity
Test that case variations work:

**Test**: Search for "ROBERT", "robert", "Robert"
- **Expected**: All should find "Róbert Boženík"

### 4. Partial Matches
Test that partial name searches work:

**Test**: Search for "Rob"
- **Expected**: Should find "Róbert", "Robert", "Robertson", etc.

**Test**: Search for "Boz"
- **Expected**: Should find "Boženík", "Bozenik", etc.

### 5. Multi-word Searches
Test that searching multiple words works:

**Test**: Search for "Robert Bozenik"
- **Expected**: Should find "Róbert Boženík"

**Test**: Search for "Oscar Gil"
- **Expected**: Should find any player with "Óscar" or "Gil" in their name

### 6. Position Filter (player-lists)
Test that position filtering is also accent-insensitive:

**Test**: Filter by position "Defender"
- **Expected**: Should work regardless of accents in position field

### 7. SQL Injection Prevention (/player-lists)
Test that SQL injection is prevented:

**Test**: Search for `Robert'; DROP TABLE players; --`
- **Expected**: Should safely handle the input without executing SQL commands
- **Expected**: Should return no results (or results matching the literal string)

## How to Test

### Frontend Testing
1. Start the backend: `python backend/main.py`
2. Start the frontend: `cd frontend && npm start`
3. Navigate to player search or player lists page
4. Try searching for "Robert Bozenik" - should find "Róbert Boženík"
5. Try other test cases listed above

### API Testing (using curl)

#### Test /players/search
```bash
curl -X GET "http://localhost:8000/players/search?query=Robert%20Bozenik" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Test /scout-reports with player filter
```bash
curl -X GET "http://localhost:8000/scout-reports?player_name=Robert" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Test /players/all with search
```bash
curl -X GET "http://localhost:8000/players/all?search=Oscar" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Test /player-lists with filters
```bash
curl -X GET "http://localhost:8000/player-lists?player_name=Jose" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Snowflake Testing
Run the queries in `test_collation.sql` to verify Snowflake COLLATE behavior.

## Expected Performance
- No performance degradation expected
- COLLATE should use indexes efficiently
- Queries should return in similar time as before

## Rollback Plan
If issues arise:
1. Checkout the previous commit: `git checkout feature/player-lists-improvements`
2. The hardcoded accent mappings are still in that commit
3. Or revert specific changes using `git revert`

## Success Criteria
✅ Searching "Robert Bozenik" finds "Róbert Boženík"
✅ Searching "Oscar" finds all variations (Óscar, Òscar, etc.)
✅ Case insensitivity works (ROBERT = robert = Robert)
✅ Partial matches work (Rob finds Róbert)
✅ No SQL injection vulnerabilities in /player-lists
✅ Performance is acceptable
✅ All existing functionality still works
