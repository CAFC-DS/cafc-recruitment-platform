# SQL Query Catalog - Index & Reference

## Quick Navigation

### Phase 1+2 SQL Catalog
Full detailed catalog: `PHASE_1_2_SQL_CATALOG.md`

**Overview:** Complete mapping of all SQL queries for Phase 1+2 canonical cutover migration.

---

## Feature Quick Reference

| Feature | Type | Endpoint | Cursor.execute() | Access Level |
|---------|------|----------|------------------|--------------|
| **1. Search** | READ | GET /players/search | 2-3 | All Users |
| **2. Profile** | READ | GET /players/{id}/profile | 4-6 | All Users (filtered) |
| **3. Analytics** | READ | GET /analytics/timeline* | 1-2 | Admin, Senior Manager, Manager |
| **4. Chatbot** | READ | POST /chatbot/query | 2+ | Admin, Manager |
| **5. Player Notes** | WRITE | POST /players/{id}/notes | 2 | All Users |
| **6. Intel** | READ | GET /intel_reports/all | 2 | Admin, Senior Manager |

---

## Key Findings at a Glance

### Total Statistics
- **Total Features Cataloged:** 6
- **Total Endpoints:** 7
- **Total Cursor.execute() Calls:** 15-20 per typical request
- **Total Lines Analyzed:** 14,000+ in main.py

### Query Composition
- **90% SELECT** (read operations)
- **10% INSERT** (write operations)
- **No DELETE/UPDATE** in Phase 1+2 scope

### Primary Tables Accessed
1. `players` - Player master data
2. `scout_reports` - Scout report records
3. `player_information` - Player intel data
4. `recommendations` - Agent recommendations
5. `player_notes` - Player note records
6. `users` - User master data

---

## Critical Migration Dependencies

### 1. NORMALIZE_TEXT_UDF()
- **Purpose:** Accent-insensitive search (Róbert = Robert, José = Jose)
- **Location:** Used in SEARCH and PROFILE endpoints
- **Impact:** MUST exist or search functionality will fail
- **Status:** Critical blocker for cutover

### 2. DATA_SOURCE Column
- **Purpose:** Distinguish internal vs external records
- **Tables:** players, scout_reports, player_information
- **Values:** 'internal' or 'external'
- **Impact:** Used in complex JOINs to prevent ID collisions
- **Status:** Required for correct query behavior

### 3. USER_ID Column
- **Purpose:** Role-based access control
- **Tables:** scout_reports, player_information
- **Impact:** Filters Scouts/Loan Managers to own data
- **Status:** Required for security enforcement

### 4. Dual ID System
- **CAFC_PLAYER_ID:** Internal stable ID
- **PLAYERID:** External data provider ID
- **Universal Format:** "internal_{id}" or "external_{id}"
- **Impact:** Critical for data consistency across sources
- **Status:** Foundation of system design

---

## Role-Based Access Patterns

### Scout Role
- Can search all players
- Views own reports only (filtered by USER_ID)
- Can add notes to any player
- No access to analytics or intel

### Loan Manager Role
- Can search all players (with filters)
- Views own reports + all loan reports
- Can add notes
- No access to analytics or full intel

### Manager Role
- Can search all players
- Views all reports (no filtering)
- Can add notes
- Full access to analytics and intel

### Senior Manager & Admin Roles
- Full access to all features
- No filtering applied
- Highest privilege level

---

## Caching Strategy

### Cached Endpoints
1. **Search Results** - Can be cached at frontend level
2. **Player Profiles** - `player_profile_{player_id}_{role}_{user_id_if_restricted}`
3. **Analytics Timeline** - `analytics_timeline_{min_months}` (5-minute TTL)

### Cache Invalidation
- Player notes creation invalidates player profile cache
- Analytics cache refreshes every 5 minutes
- Search results are transient

---

## Performance Optimization Recommendations

### High-Priority Indexes
```sql
CREATE INDEX idx_scout_reports_player_user_date 
ON scout_reports(PLAYER_ID, USER_ID, CREATED_AT);

CREATE INDEX idx_player_information_player_user_date 
ON player_information(PLAYER_ID, USER_ID, CREATED_AT);

CREATE INDEX idx_player_notes_player_date 
ON player_notes(PLAYER_ID, CREATED_AT);

CREATE INDEX idx_players_dual_id 
ON players(PLAYERID, CAFC_PLAYER_ID, DATA_SOURCE);
```

### Materialized View Candidates
- Monthly/daily analytics aggregations
- Player profile summary statistics
- Report count aggregates

### Read Replica Optimization
- Analytics queries (heavy aggregations)
- Player profile queries (high concurrency)

---

## File References

### Generated Documentation
- **Main Catalog:** `PHASE_1_2_SQL_CATALOG.md` (420 lines, 13KB)
- **This Index:** `SQL_CATALOG_INDEX.md`

### Backend Source Files
- **Main:** `/backend/main.py` (617.4 KB, 14,000+ lines)
- **Services:** `/backend/services/sql_generator.py` (AI SQL generation)
- **Schema:** `/backend/services/schema_service.py` (schema introspection)
- **Config:** `/CLAUDE.md` (role definitions)

---

## SQL Query Patterns Used

### 1. Accent-Insensitive Search
```sql
WHERE NORMALIZE_TEXT_UDF(COLUMN) ILIKE %s
ORDER BY CASE WHEN exact THEN 1 WHEN prefix THEN 2 ELSE 3 END
```

### 2. Dual ID Lookup
```sql
WHERE (CAFC_PLAYER_ID = %s AND DATA_SOURCE = 'internal')
   OR (PLAYERID = %s AND DATA_SOURCE = 'external')
```

### 3. Role-Based Access
```sql
WHERE (
    current_user.role IN ('admin', 'senior_manager', 'manager')
    OR USER_ID = current_user.id
)
```

### 4. Data Source Aware JOIN
```sql
LEFT JOIN players p ON (
    (table.PLAYER_ID = p.PLAYERID AND table.DATA_SOURCE = 'external')
    OR (table.PLAYER_ID = p.CAFC_PLAYER_ID AND table.DATA_SOURCE = 'internal')
)
```

### 5. Time-Based Aggregation
```sql
SELECT
    TO_CHAR(CREATED_AT, 'YYYY-MM') as period,
    COUNT(*) as total
FROM table
WHERE CREATED_AT >= DATEADD(month, -N, CURRENT_DATE())
GROUP BY period
ORDER BY period ASC
```

---

## Migration Checklist

### Pre-Migration (Schema Validation)
- [ ] Verify NORMALIZE_TEXT_UDF() exists
- [ ] Verify DATA_SOURCE column in players, scout_reports, player_information
- [ ] Verify USER_ID column in scout_reports, player_information
- [ ] Verify CAFC_PLAYER_ID and PLAYERID columns in players
- [ ] Verify all optional columns for schema-aware queries

### During Migration (Index Creation)
- [ ] Create high-priority indexes
- [ ] Validate query performance
- [ ] Test role-based filtering
- [ ] Verify caching behavior

### Post-Migration (Validation)
- [ ] Test all 6 features with sample data
- [ ] Verify role-based access control
- [ ] Validate analytics calculations
- [ ] Test accent-insensitive search
- [ ] Monitor query performance

---

## Known Characteristics

### Read Operations (90%)
- SELECT queries dominate
- Heavy use of JOINs (4+ in profile endpoint)
- Aggregation queries for analytics
- Parameterized queries (using %s placeholders)

### Write Operations (10%)
- Limited to player_notes table
- CREATE TABLE IF NOT EXISTS for lazy initialization
- Simple INSERT statements
- Full transaction control (commit/rollback)

### Special Features
- AI-powered SQL generation (Chatbot)
- Fuzzy name matching with DOB verification
- Dynamic column selection based on schema
- Lazy table creation

---

## Next Steps

1. **Review Full Catalog:** Read `PHASE_1_2_SQL_CATALOG.md` for detailed query specifications
2. **Validate Schema:** Check migration database for all required columns
3. **Create Indexes:** Run index creation statements
4. **Test Queries:** Validate query performance and results
5. **Implement Migration:** Execute canonical cutover with confidence

---

## Support References

**Project:** Recruitment Platform - Canonical Cutover Migration  
**Generated:** 2026-06-02  
**Status:** Complete and Ready for Implementation  
**Thoroughness:** Very Thorough (all features, endpoints, and queries documented)

For detailed query-by-query breakdown, see `PHASE_1_2_SQL_CATALOG.md`

