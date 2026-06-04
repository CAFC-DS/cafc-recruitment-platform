# Phase 1+2 SQL Query Catalog - Canonical Cutover Migration

**Project:** Recruitment Platform  
**Date Generated:** 2026-06-02  
**Backend File:** `backend/main.py` (617.4 KB, 14000+ lines)

---

## Executive Summary

- **Total Features Cataloged:** 6
- **Total Endpoints:** 7
- **Total cursor.execute() calls per typical request:** 15-20
- **Primary Tables:** players, scout_reports, player_information, recommendations, player_notes, users
- **Query Types:** 90% SELECT, 10% INSERT, some CREATE TABLE IF NOT EXISTS
- **Scope:** READ-ONLY for Phase 1+2 (no DELETE/UPDATE in scope)

---

## PHASE 1 FEATURES (Reads Only)

### 1. SEARCH - Player Search Functionality

**Endpoint:** `GET /players/search`  
**Function:** `search_players(query, limit=10, offset=0)`  
**Lines:** 6215-6348  
**Access Level:** All authenticated users

**Cursor.execute() Calls: 3 (+ 2 DEBUG)**
1. Line 6227: `SELECT CURRENT_DATABASE(), CURRENT_SCHEMA()` [DEBUG]
2. Line 6232: `SHOW USER FUNCTIONS LIKE 'NORMALIZE_TEXT_UDF'` [DEBUG]
3. Line 6258-6273: SELECT from players with accent-insensitive search
4. Line 6275-6290: SELECT fallback query (if CAFC_PLAYER_ID column missing)

**Key SQL Pattern:**
```sql
SELECT CAFC_PLAYER_ID, PLAYERID, PLAYERNAME, POSITION, SQUADNAME, DATA_SOURCE, BIRTHDATE
FROM players
WHERE NORMALIZE_TEXT_UDF(PLAYERNAME) ILIKE %s
ORDER BY CASE WHEN exact THEN 1 WHEN prefix THEN 2 ELSE 3 END
LIMIT %s OFFSET %s
```

**Tables:** players  
**Type:** READ  
**Pagination:** Yes (LIMIT + OFFSET)  
**Caching:** Yes (can be cached at frontend)  

---

### 2. PROFILE - Player Profile Views

**Endpoint:** `GET /players/{player_id}/profile`  
**Function:** `get_player_profile(player_id)`  
**Lines:** 9444-9850  
**Access Level:** All authenticated users (with role-based filtering)

**Cursor.execute() Calls: 6+**
1. Lines 118-126: find_player_by_any_id (CAFC_PLAYER_ID lookup)
2. Lines 133-141: find_player_by_any_id (PLAYERID fallback)
3. Line 9512: Scout reports query (role-filtered)
4. Line 9552: Intel reports query (role-filtered)
5. Line 9574-9603: Agent recommendations query (fuzzy match)
6. Line 9617-9626: Player notes query

**Key Queries:**

Scout Reports:
```sql
SELECT sr.ID, sr.CREATED_AT, sr.REPORT_TYPE, sr.SCOUTING_TYPE, 
       sr.PERFORMANCE_SCORE, sr.ATTRIBUTE_SCORE, sr.SUMMARY, u.USERNAME, sr.IS_POTENTIAL
FROM scout_reports sr
LEFT JOIN users u ON sr.USER_ID = u.ID
WHERE {player_id_column} = %s [AND role-based filter]
ORDER BY sr.CREATED_AT DESC
```

Intel Reports:
```sql
SELECT pi.ID, pi.CREATED_AT, pi.CONTACT_NAME, pi.CONTACT_ORGANISATION,
       pi.ACTION_REQUIRED, pi.CONVERSATION_NOTES, pi.TRANSFER_FEE, pi.CURRENT_WAGES,
       pi.EXPECTED_WAGES, pi.CONTRACT_EXPIRY, pi.POTENTIAL_DEAL_TYPE, u.USERNAME
FROM player_information pi
LEFT JOIN users u ON pi.USER_ID = u.ID
WHERE pi.PLAYER_ID = %s [AND role-based filter]
ORDER BY pi.CREATED_AT DESC
```

Agent Recommendations:
```sql
WITH recommendation_feed AS (...)
SELECT * FROM recommendation_feed rf
WHERE rf.LINKED_UNIVERSAL_ID = %s
   OR rf.LINKED_PLAYER_ID = %s
   OR rf.LINKED_CAFC_PLAYER_ID = %s
   OR (NORMALIZE_TEXT_UDF(rf.PLAYER_NAME) = NORMALIZE_TEXT_UDF(%s) AND ...)
ORDER BY rf.CREATED_AT DESC
```

Player Notes:
```sql
SELECT pn.ID, pn.NOTE_CONTENT, pn.IS_PRIVATE, pn.CREATED_AT, u.USERNAME
FROM player_notes pn
LEFT JOIN users u ON pn.USER_ID = u.ID
WHERE pn.PLAYER_ID = %s
ORDER BY pn.CREATED_AT DESC
```

**Tables:** players, scout_reports, player_information, recommendations, player_notes, users  
**Type:** READ  
**Caching:** Yes (`player_profile_{player_id}_{role}_{user_id_if_restricted}`)  
**Role-Based Filtering:**
- SCOUT: Own reports only (`AND sr.USER_ID = %s`)
- LOAN_MANAGER: Loan reports only (`AND PURPOSE = 'Loan Report'`)
- ADMIN/SENIOR_MANAGER/MANAGER: All reports (no filter)

---

### 3. ANALYTICS - Analytics Dashboard

**Endpoints:** 
- `GET /analytics/timeline`
- `GET /analytics/timeline-daily`

**Functions:** 
- `get_analytics_timeline(min_months=None)` [Lines 4157-4271]
- `get_analytics_timeline_daily(days=30)` [Lines 4275-4320]

**Access Level:** ROLE_ADMIN, ROLE_SENIOR_MANAGER, ROLE_MANAGER only

**Cursor.execute() Calls: 2 (one per endpoint)**

**Monthly Timeline:**
```sql
SELECT
    TO_CHAR(sr.CREATED_AT, 'YYYY-MM') as month,
    sr.SCOUTING_TYPE,
    COALESCE(u.USERNAME, 'Unknown Scout') as scout_name,
    COUNT(sr.ID) as report_count
FROM scout_reports sr
LEFT JOIN users u ON sr.USER_ID = u.ID
WHERE sr.CREATED_AT >= DATEADD(month, -{min_months}, CURRENT_DATE())
GROUP BY TO_CHAR(sr.CREATED_AT, 'YYYY-MM'), sr.SCOUTING_TYPE, u.USERNAME
ORDER BY month ASC, scout_name ASC
```

**Daily Timeline:**
```sql
SELECT
    TO_CHAR(sr.CREATED_AT, 'YYYY-MM-DD') as day,
    sr.SCOUTING_TYPE,
    COALESCE(u.USERNAME, 'Unknown Scout') as scout_name,
    COUNT(sr.ID) as report_count
FROM scout_reports sr
LEFT JOIN users u ON sr.USER_ID = u.ID
WHERE sr.CREATED_AT >= DATEADD(day, -%s, CURRENT_DATE())
GROUP BY TO_CHAR(sr.CREATED_AT, 'YYYY-MM-DD'), sr.SCOUTING_TYPE, u.USERNAME
ORDER BY day ASC, scout_name ASC
```

**Tables:** scout_reports, users  
**Type:** READ (aggregation)  
**Caching:** Yes (`analytics_timeline_{min_months}` with 5-minute TTL)  
**Pagination:** No  

---

### 4. CHATBOT - AI-Powered Queries

**Endpoint:** `POST /chatbot/query`  
**Function:** `process_chatbot_query(query_data)` [Lines 14282-14322]  
**Service:** `SQLGeneratorService` in `services/sql_generator.py`  
**Access Level:** manager, admin roles only

**Cursor.execute() Calls: Variable (2+ in service layer)**
1. Schema introspection query
2. AI-generated SQL execution

**Execution Flow:**
1. Validate user role (manager/admin)
2. Get SQLGeneratorService
3. Call `process_natural_language_query()`
4. Service generates SQL via Ollama AI
5. Validate and execute generated SQL
6. Return results

**Tables:** Dynamic (user-specified via natural language)  
**Type:** READ (SELECT only, by design)  
**Role-Based Access:** Manager/Admin only  
**Caching:** No (each query is unique)  

---

## PHASE 2 FEATURES (Reads Only)

### 5. PLAYER_NOTES - Player Notes Management

**Endpoint:** `POST /players/{player_id}/notes`  
**Function:** `add_player_note(player_id, note)`  
**Lines:** 10209-10253  
**Access Level:** All authenticated users

**Cursor.execute() Calls: 2**

**Create Table (if not exists):**
```sql
CREATE TABLE IF NOT EXISTS player_notes (
    ID INTEGER AUTOINCREMENT,
    PLAYER_ID INTEGER,
    USER_ID INTEGER,
    NOTE_CONTENT VARCHAR(2000),
    IS_PRIVATE BOOLEAN DEFAULT TRUE,
    CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ID)
)
```

**Insert Note:**
```sql
INSERT INTO player_notes (PLAYER_ID, USER_ID, NOTE_CONTENT, IS_PRIVATE)
VALUES (%s, %s, %s, %s)
```

**Read Notes** (in PROFILE endpoint):
```sql
SELECT pn.ID, pn.NOTE_CONTENT, pn.IS_PRIVATE, pn.CREATED_AT, u.USERNAME
FROM player_notes pn
LEFT JOIN users u ON pn.USER_ID = u.ID
WHERE pn.PLAYER_ID = %s
ORDER BY pn.CREATED_AT DESC
```

**Tables:** player_notes  
**Type:** WRITE (INSERT + CREATE TABLE)  
**Caching Impact:** Invalidates `player_profile_{player_id}_*` cache  

---

### 6. INTEL - Player Information / Intelligence Reports

**Endpoint:** `GET /intel_reports/all`  
**Function:** `get_all_intel_reports(page, limit, filters...)`  
**Lines:** 11076-11282  
**Access Level:** ROLE_ADMIN, ROLE_SENIOR_MANAGER only

**Cursor.execute() Calls: 2**

**Count Query:**
```sql
SELECT COUNT(*)
FROM player_information pi
{join_clause}
{where_conditions}
```

**Main Query:**
```sql
SELECT pi.ID, pi.CREATED_AT, pi.DATE_OF_INFORMATION, pi.CONTACT_NAME,
       pi.CONTACT_ORGANISATION, pi.ACTION_REQUIRED, pi.CONVERSATION_NOTES,
       pi.TRANSFER_FEE, pi.CURRENT_WAGES, pi.EXPECTED_WAGES, pi.CONTRACT_EXPIRY,
       pi.POTENTIAL_DEAL_TYPE, p.PLAYERNAME, p.POSITION, p.SQUADNAME,
       p.PLAYERID, p.CAFC_PLAYER_ID, p.DATA_SOURCE, u.USERNAME
FROM player_information pi
LEFT JOIN players p ON (
    (pi.PLAYER_ID = p.PLAYERID AND pi.DATA_SOURCE = 'external' AND p.DATA_SOURCE = 'external')
    OR (pi.PLAYER_ID = p.CAFC_PLAYER_ID AND pi.DATA_SOURCE = 'internal' AND p.DATA_SOURCE = 'internal')
)
LEFT JOIN users u ON pi.USER_ID = u.ID
{where_conditions}
ORDER BY pi.CREATED_AT DESC
LIMIT %s OFFSET %s
```

**Filters (Optional):**
- `recency_days`: `pi.CREATED_AT >= DATEADD(day, -%s, CURRENT_DATE())`
- `recommendation`: `UPPER(pi.ACTION_REQUIRED) = UPPER(%s)`
- `contact_name`: `UPPER(pi.CONTACT_NAME) LIKE UPPER(%s)`
- `player_name`: `UPPER(COALESCE(p.PLAYERNAME, '')) LIKE UPPER(%s)`
- `date_from`: `pi.CREATED_AT >= %s`
- `date_to`: `pi.CREATED_AT <= %s`
- **Role-based**: If SCOUT/LOAN_MANAGER: `pi.USER_ID = %s`

**Tables:** player_information, players, users  
**Type:** READ  
**Pagination:** Yes (LIMIT + OFFSET)  
**Caching:** No  

---

## Cross-Feature Analysis

### Tables Accessed
| Table | Phase 1 | Phase 2 | Access |
|-------|---------|---------|--------|
| players | SEARCH, PROFILE | - | READ |
| scout_reports | PROFILE, ANALYTICS | - | READ |
| player_information | PROFILE | INTEL | READ |
| recommendations | PROFILE | - | READ |
| player_notes | PROFILE | PLAYER_NOTES | READ/WRITE |
| users | All endpoints | All endpoints | READ |

### Cursor.execute() Count Summary
| Feature | Calls | Type |
|---------|-------|------|
| SEARCH | 2-3 | READ |
| PROFILE | 4-6 | READ |
| ANALYTICS (timeline) | 1 | READ |
| ANALYTICS (daily) | 1 | READ |
| CHATBOT | 2+ | READ |
| PLAYER_NOTES | 2 | WRITE |
| INTEL | 2 | READ |
| **Total per session** | **15-20** | **Mixed** |

### Role-Based Access Summary
| Role | Search | Profile | Analytics | Chatbot | Notes | Intel |
|------|--------|---------|-----------|---------|-------|-------|
| Scout | YES (own) | YES (filtered) | NO | NO | YES | NO |
| Loan Manager | YES (filtered) | YES (filtered) | NO | NO | YES | NO |
| Manager | YES (all) | YES (all) | YES | YES | YES | YES (own) |
| Senior Manager | YES (all) | YES (all) | YES | YES | YES | YES |
| Admin | YES (all) | YES (all) | YES | YES | YES | YES |

---

## Key SQL Patterns for Migration

### 1. Accent-Insensitive Search
```sql
WHERE NORMALIZE_TEXT_UDF(PLAYERNAME) ILIKE %s
ORDER BY CASE 
    WHEN NORMALIZE_TEXT_UDF(PLAYERNAME) = %s THEN 1
    WHEN NORMALIZE_TEXT_UDF(PLAYERNAME) ILIKE %s THEN 2
    ELSE 3
END
```

### 2. Universal ID Lookup
```sql
SELECT ... FROM players
WHERE (CAFC_PLAYER_ID = %s AND DATA_SOURCE = 'internal')
   OR (PLAYERID = %s AND DATA_SOURCE = 'external')
```

### 3. Role-Based Filtering
```sql
WHERE (
    -- Admin/Manager see all
    %s IN ('admin', 'senior_manager', 'manager')
    -- Scouts/Loan Managers see own
    OR (USER_ID = %s)
)
```

### 4. Data Source Aware JOIN
```sql
LEFT JOIN players p ON (
    (pi.PLAYER_ID = p.PLAYERID AND pi.DATA_SOURCE = 'external' AND p.DATA_SOURCE = 'external')
    OR (pi.PLAYER_ID = p.CAFC_PLAYER_ID AND pi.DATA_SOURCE = 'internal' AND p.DATA_SOURCE = 'internal')
)
```

### 5. Fuzzy Name Matching
```sql
WHERE NORMALIZE_TEXT_UDF(PLAYERNAME) = NORMALIZE_TEXT_UDF(%s)
AND (DOB IS NULL OR player_dob IS NULL OR player_dob = %s)
```

---

## Migration Dependencies

### Schema Requirements
- **players table**: CAFC_PLAYER_ID, PLAYERID, PLAYERNAME, POSITION, SQUADNAME, DATA_SOURCE, BIRTHDATE
- **scout_reports table**: ID, CREATED_AT, REPORT_TYPE, SCOUTING_TYPE, PERFORMANCE_SCORE, ATTRIBUTE_SCORE, SUMMARY, USER_ID, IS_POTENTIAL, PURPOSE, PLAYER_ID
- **player_information table**: ID, CREATED_AT, DATE_OF_INFORMATION, CONTACT_NAME, CONTACT_ORGANISATION, ACTION_REQUIRED, CONVERSATION_NOTES, TRANSFER_FEE, CURRENT_WAGES, EXPECTED_WAGES, CONTRACT_EXPIRY, POTENTIAL_DEAL_TYPE, PLAYER_ID, USER_ID, DATA_SOURCE
- **recommendations table**: ID, CREATED_AT, PLAYER_NAME, PLAYER_DATE_OF_BIRTH, LINKED_UNIVERSAL_ID, LINKED_PLAYER_ID, LINKED_CAFC_PLAYER_ID
- **player_notes table**: Created on-demand if not exists
- **users table**: ID, USERNAME, FIRSTNAME, LASTNAME

### UDF Requirements
- **NORMALIZE_TEXT_UDF()**: Used in SEARCH and PROFILE endpoints for accent-insensitive matching
- Must exist in Snowflake or queries will fail

### Column Requirements (Conditional)
- **player_information**: CURRENT_WAGES_MIN, CURRENT_WAGES_MAX, EXPECTED_WAGES_MIN, EXPECTED_WAGES_MAX, INTEL_TYPE, RELATIONSHIP_TO_PLAYER, LENGTH_OF_RELATIONSHIP, RELEVANCE_OF_RELATIONSHIP, REFERENCE_RATING (all optional, schema-aware)

---

## Performance Notes

### Caching Opportunities
1. **Search results** - Can be cached at frontend
2. **Player profiles** - Cache key: `player_profile_{player_id}_{role}_{user_id_if_restricted}`
3. **Analytics** - Cache key: `analytics_timeline_{min_months}` (5-minute TTL)

### Query Optimization
- Analytics queries use date-based grouping with COUNT() aggregation
- Profile endpoint has 4+ LEFT JOINs per request
- Role-based filtering applied at query level (efficient)
- Pagination implemented in SEARCH and INTEL endpoints

### Indexes to Consider
- `scout_reports(PLAYER_ID, USER_ID, CREATED_AT)`
- `player_information(PLAYER_ID, USER_ID, CREATED_AT)`
- `player_notes(PLAYER_ID, CREATED_AT)`
- `players(PLAYERID, CAFC_PLAYER_ID, DATA_SOURCE)`

---

## File References

- **Main Backend:** `/backend/main.py` (14000+ lines)
- **Services:** `/backend/services/sql_generator.py`
- **Project Config:** `CLAUDE.md` (role definitions and access patterns)

---

**Generated:** 2026-06-02  
**For:** Canonical Cutover Migration Planning  
**Status:** Complete Catalog of Phase 1+2 Features
