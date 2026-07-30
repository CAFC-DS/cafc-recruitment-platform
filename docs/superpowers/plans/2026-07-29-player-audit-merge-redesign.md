# Player Audit & Clash Merge Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the admin "Internal Player Audit" and "General Clashes" merge machinery so merges can keep either the internal or external record (chosen per-merge), fully retire the losing record, and give General Clashes the same tiered confidence scoring as Internal Audit — scoped to avoid overlap between the two tabs.

**Architecture:** A new pure-function scoring module (`backend/duplicate_detection.py`) is extracted from the existing inline `score_candidate()` logic in `internal_player_audit()` and reused by both `GET /admin/internal-player-audit` and the reworked `GET /admin/detect-clashes`. `POST /admin/merge-players` is reworked from an internal-ID-anchored one-way operation into a universal-ID-based, transactional, bidirectional merge that also deletes the losing player's row and reassigns all five tables that reference a player (`scout_reports`, `player_information`, `player_notes`, `player_list_items`, `player_list_flags`). A new `POST /admin/internal-player-audit/bulk-merge` endpoint (with a `dry_run` preview mode) drives the bulk-merge UI action. Frontend changes are confined to `InternalPlayerAuditTab.tsx` and `DataClashesTab.tsx`.

**Tech Stack:** Python/FastAPI backend (`backend/main.py`, monolithic — no router layer for this feature), Snowflake via `snowflake-connector-python`, `rapidfuzz` for fuzzy string matching, React/TypeScript frontend with `react-bootstrap`, `axios`.

## Global Constraints

- Admin-only: every endpoint touched in this plan already gates on `current_user.role != ROLE_ADMIN` — preserve that check on all new/modified endpoints (per CLAUDE.md: "Test role-based access thoroughly").
- Backend handles all filtering/business logic; frontend only displays results and sends the chosen action (per CLAUDE.md).
- Minimal, targeted changes — do not restructure unrelated parts of `backend/main.py` (17.8k lines, single file — follow existing convention, do not split it as part of this plan).
- Use bare table names (`players`, `scout_reports`, etc.), not the `read_table()`/`write_table()` cutover-seam helpers — the functions this plan touches don't use that seam today and mixing conventions inside one function is out of scope.
- Snowflake connections from `get_snowflake_connection()` default to `autocommit=True`. Any function that must roll back on partial failure must explicitly set `conn.autocommit = False` after opening the cursor, call `conn.commit()` on success, `conn.rollback()` on failure, and reset `conn.autocommit = True` in the `finally` block before `conn.close()` (matches the existing pattern at `backend/main.py:7127` / `7103`) — pooled connections are reused across requests, so leaving `autocommit = False` on a returned connection would break the next request that borrows it.
- `TRANSFERMARKT_LINK` is not guaranteed to exist on `players` (verified: absent in the current dev database; inserted conditionally elsewhere in the code at `backend/main.py:2472-2474`). Any SQL or scoring logic that touches it must be gated with `has_column("players", "TRANSFERMARKT_LINK")` (defined at `backend/main.py:275-278`) and must treat empty-string values as absent (not just `NULL`).
- `DATA_SOURCE` values are always `'internal'` or `'external'` in practice (verified: no NULLs in the current dev database), but `internal_player_audit()` still defensively `COALESCE`s it (`backend/main.py:6105`, `6134`). New code that builds a universal ID from a freshly-queried row must do the same `COALESCE(DATA_SOURCE, 'internal'|'external')` before calling `get_player_universal_id()`, so a stray NULL can never produce a malformed universal ID like `external_None`.

---

## File Structure

- **Create** `backend/duplicate_detection.py` — pure, DB-free scoring functions shared by Internal Audit and General Clashes. No FastAPI/Snowflake imports; only `rapidfuzz`.
- **Create** `backend/tests/test_duplicate_detection.py` — pins the scoring behavior with unit tests (no DB required).
- **Modify** `backend/main.py`:
  - `internal_player_audit()` (lines 6050-6346) — replace inline `score_candidate()` with a call into `duplicate_detection.score_player_match()`.
  - `merge_players()` (lines 5601-5687) — reworked to `keep_universal_id`/`remove_universal_id`, bidirectional, transactional, deletes the losing row, reassigns 5 tables.
  - `detect_data_clashes()` (lines 5690-5991) — add DOB/TRANSFERMARKT_LINK fetch, confidence tiers via `duplicate_detection.score_player_match()`, `both_have_reports` flag, exclude internal-vs-external pairs.
  - New function + route: `internal_player_audit_bulk_merge()` at `POST /admin/internal-player-audit/bulk-merge`.
- **Modify** `frontend/src/components/admin/InternalPlayerAuditTab.tsx` — two explicit merge-direction buttons in the Review modal; new bulk-merge button + confirmation modal with dry-run preview.
- **Modify** `frontend/src/components/DataClashesTab.tsx` — confidence badge + evidence list + "both have reports" caution badge on player clashes; scope subtitle; merge call updated to universal IDs.
- **Modify** `frontend/src/pages/AdminPage.tsx` — no functional change; only the "General Clashes" tab title/subtitle text if needed (folded into the DataClashesTab task, not a separate task).

---

## Task 1: Extract shared scoring module with pinning tests

**Files:**
- Create: `backend/duplicate_detection.py`
- Create: `backend/tests/__init__.py` (empty, makes the dir a package)
- Create: `backend/tests/test_duplicate_detection.py`
- Modify: `backend/requirements.txt`

**Interfaces:**
- Produces: `duplicate_detection.score_player_match(name_a, name_b, dob_a, dob_b, squad_a, squad_b, transfermarkt_a=None, transfermarkt_b=None) -> Optional[dict]`. Returns `None` if no tier is met, otherwise `{"confidence": "high"|"medium"|"low", "name_similarity": float, "squad_similarity": float, "evidence": list[str]}`. `dob_a`/`dob_b` accept `date`/`datetime`/`None`. `transfermarkt_a`/`transfermarkt_b` accept `str`/`None`.
- Produces: `duplicate_detection.normalize_text(text: str) -> str` — moved here verbatim from `backend/main.py:56-72` (accent-stripping normalizer), so `main.py` can import it instead of defining its own copy.

This task is a **behavior-preserving refactor** of the existing tiering logic at `backend/main.py:6151-6221` (the `score_candidate` closure), generalized to take raw values instead of DB row tuples, plus one **new** signal (TRANSFERMARKT_LINK exact match ⇒ high) that Internal Audit doesn't currently have a data source for but General Clashes will use.

- [ ] **Step 1: Add pytest to requirements and install it**

```bash
cd backend
source venv/bin/activate
pip install pytest
echo "pytest>=7.0.0,<9.0.0" >> requirements.txt
pip install -r requirements.txt
```

Expected: `rapidfuzz` and `pytest` both importable afterward — run `python3 -c "import pytest, rapidfuzz; print('ok')"` and expect `ok`.

- [ ] **Step 2: Write the failing tests pinning current Internal Audit behavior**

Create `backend/tests/__init__.py` (empty file).

Create `backend/tests/test_duplicate_detection.py`:

```python
import sys
import os
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from duplicate_detection import score_player_match, normalize_text


def test_normalize_text_strips_accents_and_lowercases():
    assert normalize_text("José García") == "jose garcia"
    assert normalize_text("") == ""
    assert normalize_text(None) == ""


def test_high_confidence_requires_exact_name_and_exact_dob():
    result = score_player_match(
        name_a="John Smith", name_b="John Smith",
        dob_a=date(2000, 1, 1), dob_b=date(2000, 1, 1),
        squad_a="Charlton", squad_b="Millwall",
    )
    assert result is not None
    assert result["confidence"] == "high"
    assert "Name exact" in result["evidence"]
    assert "DOB exact" in result["evidence"]


def test_medium_confidence_exact_name_exact_squad_no_dob():
    result = score_player_match(
        name_a="John Smith", name_b="John Smith",
        dob_a=None, dob_b=None,
        squad_a="Charlton", squad_b="Charlton",
    )
    assert result is not None
    assert result["confidence"] == "medium"
    assert "DOB missing" in result["evidence"]
    assert "Squad exact" in result["evidence"]


def test_exact_name_with_no_squad_and_no_dob_on_either_side_is_low_not_medium():
    # Matches the "Mauricio Benitez has no club" case: exact name alone,
    # with no distinguishing squad/DOB evidence on either side, must not
    # be promoted to medium.
    result = score_player_match(
        name_a="Mauricio Benitez", name_b="Mauricio Benitez",
        dob_a=None, dob_b=None,
        squad_a=None, squad_b=None,
    )
    assert result is not None
    assert result["confidence"] == "low"
    assert "Squad unknown" in result["evidence"]
    assert "DOB missing" in result["evidence"]


def test_low_confidence_fuzzy_name_with_squad_match():
    result = score_player_match(
        name_a="Jon Smith", name_b="John Smith",
        dob_a=None, dob_b=None,
        squad_a="Charlton", squad_b="Charlton",
    )
    assert result is not None
    assert result["confidence"] == "low"
    assert result["name_similarity"] >= 88


def test_no_match_returns_none():
    result = score_player_match(
        name_a="Alice Jones", name_b="Bob Taylor",
        dob_a=None, dob_b=None,
        squad_a="Charlton", squad_b="Millwall",
    )
    assert result is None


def test_squad_mismatch_when_both_present_and_different_is_not_medium():
    result = score_player_match(
        name_a="John Smith", name_b="John Smith",
        dob_a=None, dob_b=None,
        squad_a="Charlton", squad_b="Arsenal",
    )
    assert result is None or result["confidence"] != "medium"


def test_transfermarkt_exact_match_forces_high_confidence():
    result = score_player_match(
        name_a="Jon Smith", name_b="John Smyth",
        dob_a=None, dob_b=None,
        squad_a=None, squad_b=None,
        transfermarkt_a="https://transfermarkt.com/john-smith/profil/spieler/12345",
        transfermarkt_b="https://transfermarkt.com/john-smith/profil/spieler/12345",
    )
    assert result is not None
    assert result["confidence"] == "high"
    assert "Transfermarkt link match" in result["evidence"]


def test_transfermarkt_empty_string_is_not_treated_as_a_match():
    result = score_player_match(
        name_a="Alice Jones", name_b="Bob Taylor",
        dob_a=None, dob_b=None,
        squad_a=None, squad_b=None,
        transfermarkt_a="", transfermarkt_b="",
    )
    assert result is None
```

- [ ] **Step 3: Run tests to verify they fail (module doesn't exist yet)**

```bash
cd backend
source venv/bin/activate
python3 -m pytest tests/test_duplicate_detection.py -v
```

Expected: `ModuleNotFoundError: No module named 'duplicate_detection'`.

- [ ] **Step 4: Implement `backend/duplicate_detection.py`**

```python
"""Pure, DB-free duplicate-player scoring shared by Internal Player Audit
and General Clashes. No FastAPI/Snowflake imports — keep this importable
and testable without a database connection."""

import unicodedata
from typing import Optional

from rapidfuzz.distance import Levenshtein as levenshtein_module


def normalize_text(text: str) -> str:
    """Remove diacritical marks (accents) and lowercase for fuzzy comparison."""
    if not text:
        return ""
    normalized = unicodedata.normalize("NFD", text)
    return "".join(
        char for char in normalized if unicodedata.category(char) != "Mn"
    ).lower()


def _similarity(a: str, b: str) -> float:
    max_len = max(len(a), len(b), 1)
    dist = levenshtein_module.distance(a, b)
    return (1 - (dist / max_len)) * 100


def score_player_match(
    name_a: Optional[str],
    name_b: Optional[str],
    dob_a,
    dob_b,
    squad_a: Optional[str],
    squad_b: Optional[str],
    transfermarkt_a: Optional[str] = None,
    transfermarkt_b: Optional[str] = None,
) -> Optional[dict]:
    """Score a candidate duplicate pair. Returns None if no confidence tier
    is met, otherwise a dict with confidence/evidence/similarity fields.

    Tiers:
      - high: exact normalized name AND exact DOB, OR a shared non-empty
        TRANSFERMARKT_LINK (treated as definitive external-system evidence).
      - medium: exact normalized name AND exact normalized squad (both
        present and equal).
      - low: fuzzy name similarity >= 88% AND (exact or near [>=90%] squad
        match), OR an exact name match with squad missing/empty on BOTH
        sides and no DOB match (e.g. a player with no club set on either
        record) — that case still surfaces as low, it just can't be
        promoted to medium since nothing positively confirms it.
    """
    norm_name_a = normalize_text(name_a or "")
    norm_name_b = normalize_text(name_b or "")
    norm_squad_a = normalize_text(squad_a or "")
    norm_squad_b = normalize_text(squad_b or "")

    name_similarity = _similarity(norm_name_a, norm_name_b)
    squad_similarity = _similarity(norm_squad_a, norm_squad_b)

    name_exact = norm_name_a == norm_name_b and norm_name_a != ""
    dob_exact = dob_a is not None and dob_b is not None and dob_a == dob_b
    squad_exact = norm_squad_a == norm_squad_b and norm_squad_a != ""
    # Guard against the empty-vs-empty case: Levenshtein distance between
    # two empty strings is 0, which would otherwise compute a false 100%
    # "near match" for two players who both simply have no squad on file.
    squad_near = squad_similarity >= 90 and norm_squad_a != "" and norm_squad_b != ""

    tm_a = (transfermarkt_a or "").strip()
    tm_b = (transfermarkt_b or "").strip()
    transfermarkt_match = tm_a != "" and tm_b != "" and tm_a == tm_b

    both_squads_missing = norm_squad_a == "" and norm_squad_b == ""

    confidence = None
    if transfermarkt_match or (name_exact and dob_exact):
        confidence = "high"
    elif name_exact and squad_exact:
        confidence = "medium"
    elif name_similarity >= 88 and (squad_exact or squad_near):
        confidence = "low"
    elif name_exact and both_squads_missing:
        # Exact name, but neither side has squad or DOB evidence to lean
        # on (e.g. a player with no club set) — the dob_exact case was
        # already caught by the high-confidence branch above, so reaching
        # here means DOB didn't help either. Still worth surfacing, just
        # not promotable past low.
        confidence = "low"

    if confidence is None:
        return None

    evidence = []
    if transfermarkt_match:
        evidence.append("Transfermarkt link match")
    if name_exact:
        evidence.append("Name exact")
    else:
        evidence.append(f"Fuzzy {round(name_similarity, 1)}%")
    if dob_exact:
        evidence.append("DOB exact")
    elif dob_a is None or dob_b is None:
        evidence.append("DOB missing")
    else:
        evidence.append("DOB mismatch")
    if squad_exact:
        evidence.append("Squad exact")
    elif squad_near:
        evidence.append(f"Squad near {round(squad_similarity, 1)}%")
    elif norm_squad_a == "" or norm_squad_b == "":
        evidence.append("Squad unknown")
    else:
        evidence.append("Squad mismatch")

    return {
        "confidence": confidence,
        "name_similarity": round(name_similarity, 1),
        "squad_similarity": round(squad_similarity, 1),
        "evidence": evidence,
    }
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend
source venv/bin/activate
python3 -m pytest tests/test_duplicate_detection.py -v
```

Expected: all 9 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/duplicate_detection.py backend/tests/__init__.py backend/tests/test_duplicate_detection.py backend/requirements.txt
git commit -m "Add shared duplicate-player scoring module with pinning tests"
```

---

## Task 2: Wire Internal Audit to use the shared scoring module

**Files:**
- Modify: `backend/main.py:6151-6221` (delete the inline `score_candidate` closure), `backend/main.py:6266-6270` (call site), imports section near line 20-50.

**Interfaces:**
- Consumes: `duplicate_detection.score_player_match()` and `duplicate_detection.normalize_text()` from Task 1.
- Produces: `internal_player_audit()` response shape is **unchanged** — this task must not alter the JSON contract the frontend already relies on (`AuditCandidate`/`AuditItem` types in `InternalPlayerAuditTab.tsx`).

- [ ] **Step 1: Add the import**

In `backend/main.py`, near the existing local imports at the top of the file (after line 49, `from iteration_mapping import ITERATION_MAPPING`), add:

```python
from duplicate_detection import score_player_match, normalize_text as dd_normalize_text
```

(Aliased as `dd_normalize_text` because `backend/main.py:56` already defines its own `normalize_text` — leave that one in place since other endpoints still call it directly; don't rename call sites outside this task's scope.)

- [ ] **Step 2: Replace the inline `score_candidate` closure**

In `backend/main.py`, delete lines 6151-6221 (the entire `def score_candidate(internal_row, external_row): ... return {...}` block) and replace with a thin adapter that calls the shared scorer but keeps the exact same return shape the rest of `internal_player_audit()` expects (it reads `scored["confidence"]`, `scored["name_similarity"]`, `scored["squad_similarity"]`, plus builds `scored["external"]` and `scored["evidence"]`):

```python
        def score_candidate(internal_row, external_row):
            scored = score_player_match(
                name_a=internal_row[1],
                name_b=external_row[1],
                dob_a=internal_row[4],
                dob_b=external_row[4],
                squad_a=internal_row[5],
                squad_b=external_row[5],
            )
            if scored is None:
                return None

            return {
                "external": {
                    "player_id": external_row[0],
                    "player_name": external_row[1],
                    "first_name": external_row[2],
                    "last_name": external_row[3],
                    "birth_date": external_row[4].isoformat() if external_row[4] else None,
                    "squad_name": external_row[5],
                    "position": external_row[6],
                    "data_source": external_row[7],
                    "universal_id": f"external_{external_row[0]}",
                },
                "confidence": scored["confidence"],
                "name_similarity": scored["name_similarity"],
                "squad_similarity": scored["squad_similarity"],
                "evidence": scored["evidence"],
            }
```

Note: this task deliberately does **not** pass `transfermarkt_a`/`transfermarkt_b` — Internal Audit's SELECT statements (lines 6095-6141) don't fetch `TRANSFERMARKT_LINK`, and adding it here is out of scope (only General Clashes gets that signal per the design spec, Task 4).

- [ ] **Step 3: Update the two remaining raw `normalize_text(...)` calls inside `internal_player_audit()` that fed the deleted closure's candidate-pooling logic**

Lines 6239-6240 and 6232-6233 (the candidate-pooling fuzzy pass, which is separate from `score_candidate` and stays in `main.py`) call the module-level `normalize_text()` already imported at the top of the file (`backend/main.py:56`) — **leave these calls as-is**, they still resolve correctly since that function still exists. No change needed here; this step is a verification-only checkpoint, not an edit.

- [ ] **Step 4: Manual verification — confirm the audit endpoint still returns identical results**

Since there's no DB-mocking test harness for this endpoint, verify by running the app and comparing:

```bash
cd backend
source venv/bin/activate
python main.py &
sleep 3
curl -s "http://localhost:8000/admin/internal-player-audit?limit=5" -H "Authorization: Bearer <admin-token>" | python3 -m json.tool
```

Expected: response has the same shape as before this change (`items`, `summary`, `page`, `limit`, `total`, `total_pages`), and confidence tiers for known duplicate pairs (e.g. search `?name=Benitez` if that record exists in this environment) look the same as pre-refactor. Kill the server after checking (`kill %1`).

- [ ] **Step 5: Commit**

```bash
git add backend/main.py
git commit -m "Wire internal-player-audit to shared duplicate_detection scorer"
```

---

## Task 3: Rework `POST /admin/merge-players` — bidirectional, transactional, deletes losing row

**Files:**
- Modify: `backend/main.py:5601-5687` (replace `merge_players` function body and signature entirely).

**Interfaces:**
- Consumes: `resolve_player_lookup(universal_id: str) -> tuple[str, list]` (already defined at `backend/main.py:92-99`).
- Produces: `POST /admin/merge-players?keep_universal_id=<str>&remove_universal_id=<str>` — **replaces** the old `keep_cafc_id`/`remove_player_id` params entirely (both current call sites are updated in Tasks 5 and 6). Response shape: `{"message": str, "target_player": str, "results": list[str]}` (same shape as before, so no frontend type changes needed beyond the request params).

This is the highest-risk change in the plan — it deletes rows. Read the Global Constraints section on `autocommit` before implementing.

- [ ] **Step 1: Replace the function**

Replace `backend/main.py:5601-5687` (the full `@app.post("/admin/merge-players") async def merge_players(...)` function) with:

```python
@app.post("/admin/merge-players")
async def merge_players(
    keep_universal_id: str,
    remove_universal_id: str,
    current_user: User = Depends(get_current_user),
):
    """Merge two player records: reassign all dependent rows from the losing
    player onto the surviving player, then delete the losing player's row.
    Works in either direction (keep internal or keep external) — the caller
    picks which universal ID survives. (admin only)"""
    if current_user.role != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    if keep_universal_id == remove_universal_id:
        raise HTTPException(
            status_code=400, detail="keep_universal_id and remove_universal_id must differ"
        )

    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        conn.autocommit = False

        keep_condition, keep_params = resolve_player_lookup(keep_universal_id)
        remove_condition, remove_params = resolve_player_lookup(remove_universal_id)

        cursor.execute(
            f"SELECT CAFC_PLAYER_ID, PLAYERID, PLAYERNAME, DATA_SOURCE FROM players WHERE {keep_condition}",
            keep_params,
        )
        keep_row = cursor.fetchone()
        if not keep_row:
            raise HTTPException(status_code=404, detail="Target player (keep_universal_id) not found")
        keep_cafc_id, keep_player_id, keep_name, keep_source = keep_row

        cursor.execute(
            f"SELECT CAFC_PLAYER_ID, PLAYERID, PLAYERNAME, DATA_SOURCE FROM players WHERE {remove_condition}",
            remove_params,
        )
        remove_row = cursor.fetchone()
        if not remove_row:
            raise HTTPException(status_code=404, detail="Player to remove (remove_universal_id) not found")
        remove_cafc_id, remove_player_id, remove_name, remove_source = remove_row

        results = []

        # Reassign scout_reports, player_information, player_notes: these
        # tables carry both a legacy PLAYER_ID (external) column and a
        # CAFC_PLAYER_ID (internal) column. Move whichever of the loser's
        # id columns is populated onto the corresponding survivor id column,
        # and null out the loser's id so no row can resolve to the deleted
        # player after this transaction commits.
        for table_name, has_intel_table_guard in (
            ("scout_reports", False),
            ("player_information", True),
            ("player_notes", True),
        ):
            try:
                if remove_source == "external" and keep_source == "internal":
                    cursor.execute(
                        f"""
                        UPDATE {table_name}
                        SET CAFC_PLAYER_ID = %s, PLAYER_ID = NULL
                        WHERE PLAYER_ID = %s
                        """,
                        (keep_cafc_id, remove_player_id),
                    )
                elif remove_source == "internal" and keep_source == "external":
                    cursor.execute(
                        f"""
                        UPDATE {table_name}
                        SET PLAYER_ID = %s, CAFC_PLAYER_ID = NULL
                        WHERE CAFC_PLAYER_ID = %s
                        """,
                        (keep_player_id, remove_cafc_id),
                    )
                elif remove_source == "internal" and keep_source == "internal":
                    cursor.execute(
                        f"""
                        UPDATE {table_name}
                        SET CAFC_PLAYER_ID = %s
                        WHERE CAFC_PLAYER_ID = %s
                        """,
                        (keep_cafc_id, remove_cafc_id),
                    )
                else:  # both external
                    cursor.execute(
                        f"""
                        UPDATE {table_name}
                        SET PLAYER_ID = %s
                        WHERE PLAYER_ID = %s
                        """,
                        (keep_player_id, remove_player_id),
                    )
                results.append(f"Updated {cursor.rowcount} rows in {table_name}")
            except Exception as e:
                if not has_intel_table_guard:
                    raise
                results.append(f"{table_name} table not found or no updates needed: {e}")

        # Reassign player_list_items (same dual PLAYER_ID/CAFC_PLAYER_ID pattern).
        try:
            if remove_source == "external" and keep_source == "internal":
                cursor.execute(
                    "UPDATE player_list_items SET CAFC_PLAYER_ID = %s, PLAYER_ID = NULL WHERE PLAYER_ID = %s",
                    (keep_cafc_id, remove_player_id),
                )
            elif remove_source == "internal" and keep_source == "external":
                cursor.execute(
                    "UPDATE player_list_items SET PLAYER_ID = %s, CAFC_PLAYER_ID = NULL WHERE CAFC_PLAYER_ID = %s",
                    (keep_player_id, remove_cafc_id),
                )
            elif remove_source == "internal" and keep_source == "internal":
                cursor.execute(
                    "UPDATE player_list_items SET CAFC_PLAYER_ID = %s WHERE CAFC_PLAYER_ID = %s",
                    (keep_cafc_id, remove_cafc_id),
                )
            else:
                cursor.execute(
                    "UPDATE player_list_items SET PLAYER_ID = %s WHERE PLAYER_ID = %s",
                    (keep_player_id, remove_player_id),
                )
            results.append(f"Updated {cursor.rowcount} rows in player_list_items")
        except Exception as e:
            results.append(f"player_list_items table not found or no updates needed: {e}")

        # Reassign player_list_flags (keyed by UNIVERSAL_ID text, not a dual column pair).
        try:
            cursor.execute(
                "UPDATE player_list_flags SET UNIVERSAL_ID = %s WHERE UNIVERSAL_ID = %s",
                (keep_universal_id, remove_universal_id),
            )
            results.append(f"Updated {cursor.rowcount} rows in player_list_flags")
        except Exception as e:
            results.append(f"player_list_flags table not found or no updates needed: {e}")

        # Delete the losing player's row now that everything referencing it
        # has been reassigned.
        cursor.execute(f"DELETE FROM players WHERE {remove_condition}", remove_params)
        results.append(f"Deleted losing player record ({remove_universal_id})")

        conn.commit()

        return {
            "message": f"Successfully merged {remove_name or remove_universal_id} into {keep_name or keep_universal_id}",
            "target_player": keep_name,
            "results": results,
        }

    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error merging players: {e}")
    finally:
        if conn:
            conn.autocommit = True
            conn.close()
```

- [ ] **Step 2: Manual verification — all four merge direction combinations**

There's no DB-mocking harness for this endpoint (Snowflake-only, no local test DB), so this must be verified against the **dev** Snowflake environment (confirm `ENVIRONMENT=development` in `backend/.env` before running — never run this against production data). For each of the four combinations, pick or create two throwaway duplicate player rows, merge them, and confirm:
  1. The response's `results` list shows non-error entries for all 5 tables.
  2. `SELECT * FROM players WHERE <remove_condition>` returns zero rows after the merge.
  3. Any scout report that existed on the losing player still renders correctly in the app UI under the surviving player (per the advisor's flagged risk: an incomplete reassignment becomes a silently orphaned report once the row is deleted) — this is the one check that must not be skipped.
  4. A failure injected mid-merge (e.g. temporarily rename `player_notes` to force the `UPDATE` to throw) causes `conn.rollback()` to actually undo prior `UPDATE`s in the same request — confirm via `SELECT` that no partial reassignment persisted.

Combinations to check: internal↔external (both directions), internal↔internal, external↔external.

- [ ] **Step 3: Commit**

```bash
git add backend/main.py
git commit -m "Rework merge-players endpoint: bidirectional, transactional, deletes losing row"
```

---

## Task 4: Bulk-merge endpoint for Internal Audit (High + Medium confidence)

**Files:**
- Modify: `backend/main.py` — add new route after `internal_player_audit()` (after line 6346, before `merge_duplicate_match` at line 6349).

**Interfaces:**
- Consumes: `merge_players()` from Task 3, called directly as an in-process async function per pair (not over HTTP) — this is the single source of truth for merge/delete behavior; this task must not reimplement it.
- Produces: `POST /admin/internal-player-audit/bulk-merge?dry_run=<bool>` → `{"dry_run": bool, "merged_count": int, "pairs": [{"internal_universal_id": str, "internal_name": str, "external_universal_id": str, "external_name": str, "confidence": str}], "skipped": [{"internal_universal_id": str, "internal_name": str, "reason": str}], "failed": [{"internal_universal_id": str, "external_universal_id": str, "error": str}]}`.

Note on scope: this endpoint recomputes the candidate list itself (never trusts a stale client-supplied list — the spec requires this), which means duplicating the "one internal anchor → one best external candidate" selection already done inside `internal_player_audit()`. Rather than refactor `internal_player_audit()` into a separately-callable helper (a larger change than this plan's scope), this task re-queries with the same SQL shape and reuses `score_player_match` directly — a small amount of duplication is the right tradeoff here per YAGNI (extracting a shared "compute candidate list" helper is worth doing only if a third caller shows up).

- [ ] **Step 1: Implement the endpoint**

Insert immediately after line 6346 (the `finally: if conn: conn.close()` that closes `internal_player_audit`, right before the blank lines preceding `@app.post("/admin/merge-duplicate-match")`):

```python
@app.post("/admin/internal-player-audit/bulk-merge")
async def internal_player_audit_bulk_merge(
    dry_run: bool = True,
    current_user: User = Depends(get_current_user),
):
    """Merge every internal anchor whose best candidate is High or Medium
    confidence, always keeping the EXTERNAL record as survivor. Internal
    anchors with more than one Medium-confidence candidate are skipped as
    ambiguous. Set dry_run=false to actually perform the merges; dry_run=true
    (default) returns the pair list without writing anything, for the
    confirmation-modal preview. (admin only)"""
    if current_user.role != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()

        cursor.execute(
            """
            SELECT CAFC_PLAYER_ID, PLAYERNAME, FIRSTNAME, LASTNAME, BIRTHDATE, SQUADNAME, POSITION,
                   COALESCE(DATA_SOURCE, 'internal') as DATA_SOURCE
            FROM players
            WHERE CAFC_PLAYER_ID IS NOT NULL AND PLAYERID IS NULL
            ORDER BY PLAYERNAME, CAFC_PLAYER_ID
            """
        )
        internal_rows = cursor.fetchall()

        cursor.execute(
            """
            SELECT PLAYERID, PLAYERNAME, FIRSTNAME, LASTNAME, BIRTHDATE, SQUADNAME, POSITION,
                   COALESCE(DATA_SOURCE, 'external') as DATA_SOURCE
            FROM players
            WHERE PLAYERID IS NOT NULL AND COALESCE(DATA_SOURCE, 'external') = 'external'
            ORDER BY PLAYERNAME, PLAYERID
            """
        )
        external_rows = cursor.fetchall()

        by_exact_name: Dict[str, list] = {}
        for ext in external_rows:
            ext_name = dd_normalize_text(ext[1] or "")
            if ext_name:
                by_exact_name.setdefault(ext_name, []).append(ext)

        confidence_rank = {"high": 3, "medium": 2, "low": 1}
        pairs = []
        skipped = []

        for internal in internal_rows:
            internal_name_norm = dd_normalize_text(internal[1] or "")
            candidate_rows = by_exact_name.get(internal_name_norm, [])

            scored_candidates = []
            for external in candidate_rows:
                scored = score_player_match(
                    name_a=internal[1], name_b=external[1],
                    dob_a=internal[4], dob_b=external[4],
                    squad_a=internal[5], squad_b=external[5],
                )
                if scored and scored["confidence"] in ("high", "medium"):
                    scored_candidates.append((scored, external))

            if not scored_candidates:
                continue

            scored_candidates.sort(key=lambda sc: confidence_rank[sc[0]["confidence"]], reverse=True)
            best_confidence = scored_candidates[0][0]["confidence"]
            same_tier = [sc for sc in scored_candidates if sc[0]["confidence"] == best_confidence]

            if len(same_tier) > 1:
                skipped.append({
                    "internal_universal_id": f"internal_{internal[0]}",
                    "internal_name": internal[1],
                    "reason": f"Ambiguous: {len(same_tier)} candidates tied at {best_confidence} confidence",
                })
                continue

            external = same_tier[0][1]
            pairs.append({
                "internal_universal_id": f"internal_{internal[0]}",
                "internal_name": internal[1],
                "external_universal_id": f"external_{external[0]}",
                "external_name": external[1],
                "confidence": best_confidence,
            })

        if dry_run:
            return {
                "dry_run": True,
                "merged_count": 0,
                "pairs": pairs,
                "skipped": skipped,
                "failed": [],
            }

        merged_count = 0
        failed = []
        for pair in pairs:
            # Reuse the exact same merge logic as the per-row Review modal
            # (Task 3's merge_players) instead of reimplementing reassignment
            # and deletion here — merge_players is a plain async function,
            # directly callable in-process, so this is a normal function
            # call, not an HTTP round-trip.
            try:
                await merge_players(
                    keep_universal_id=pair["external_universal_id"],
                    remove_universal_id=pair["internal_universal_id"],
                    current_user=current_user,
                )
                merged_count += 1
            except HTTPException as e:
                failed.append({
                    "internal_universal_id": pair["internal_universal_id"],
                    "external_universal_id": pair["external_universal_id"],
                    "error": e.detail,
                })
            except Exception as e:
                failed.append({
                    "internal_universal_id": pair["internal_universal_id"],
                    "external_universal_id": pair["external_universal_id"],
                    "error": str(e),
                })

        return {
            "dry_run": False,
            "merged_count": merged_count,
            "pairs": pairs,
            "skipped": skipped,
            "failed": failed,
        }

    except HTTPException:
        raise
    except Exception as e:
        logging.exception(e)
        raise HTTPException(status_code=500, detail=f"Error running bulk merge: {e}")
    finally:
        if conn:
            conn.close()
```

- [ ] **Step 2: Manual verification**

```bash
cd backend
source venv/bin/activate
python main.py &
sleep 3
curl -s -X POST "http://localhost:8000/admin/internal-player-audit/bulk-merge?dry_run=true" -H "Authorization: Bearer <admin-token>" | python3 -m json.tool
kill %1
```

Expected: `dry_run: true`, `merged_count: 0`, and `pairs` lists every current High/Medium internal anchor with exactly one candidate at its best tier — cross-check the count against the `high`/`medium` summary counts from `GET /admin/internal-player-audit` (they should be `<=`, since ambiguous multi-candidate ties get skipped here but still count in that summary). Then, in the dev environment only, re-run with `dry_run=false` against a small controlled duplicate you created for Task 3's verification, and confirm `merged_count` and the resulting deleted row match expectations.

- [ ] **Step 3: Commit**

```bash
git add backend/main.py
git commit -m "Add bulk-merge endpoint for internal-player-audit high/medium candidates"
```

---

## Task 5: Rework `GET /admin/detect-clashes` — confidence tiers, scope exclusion, caution flag

**Files:**
- Modify: `backend/main.py:5690-5991` (`detect_data_clashes` function).

**Interfaces:**
- Consumes: `duplicate_detection.score_player_match()` (Task 1), `has_column()` (`backend/main.py:275-278`).
- Produces: each item in `player_clashes` gains three new fields: `confidence: "high"|"medium"|"low"`, `evidence: list[str]`, `both_have_reports: bool`. `similarity` field is kept for continuity. Internal-vs-external pairs are no longer present in the response at all (previously they were).

- [ ] **Step 1: Add the TRANSFERMARKT_LINK-aware SELECT and scope exclusion**

Replace the two `cursor.execute(...)` blocks at `backend/main.py:5714-5747` (the name-filtered and unfiltered player queries) with versions that also fetch `BIRTHDATE` and, if present, `TRANSFERMARKT_LINK`:

```python
        has_transfermarkt = has_column("players", "TRANSFERMARKT_LINK")
        transfermarkt_select = ", TRANSFERMARKT_LINK" if has_transfermarkt else ""

        if name_filter:
            cursor.execute(
                f"""
                SELECT
                    CAFC_PLAYER_ID,
                    PLAYERID,
                    PLAYERNAME,
                    SQUADNAME,
                    COALESCE(DATA_SOURCE, 'external') as DATA_SOURCE,
                    FIRSTNAME,
                    LASTNAME,
                    BIRTHDATE
                    {transfermarkt_select}
                FROM players
                WHERE PLAYERNAME IS NOT NULL
                  AND PLAYERNAME ILIKE %s
                ORDER BY PLAYERNAME
            """,
                (f"%{name_filter}%",)
            )
        else:
            cursor.execute(
                f"""
                SELECT
                    CAFC_PLAYER_ID,
                    PLAYERID,
                    PLAYERNAME,
                    SQUADNAME,
                    COALESCE(DATA_SOURCE, 'external') as DATA_SOURCE,
                    FIRSTNAME,
                    LASTNAME,
                    BIRTHDATE
                    {transfermarkt_select}
                FROM players
                WHERE PLAYERNAME IS NOT NULL
                ORDER BY PLAYERNAME
            """
            )
        players = cursor.fetchall()
```

- [ ] **Step 2: Update `all_players` building to carry the new fields**

Replace lines 5751-5762 (`all_players = []` loop) with:

```python
        all_players = []
        for player in players:
            if has_transfermarkt:
                cafc_id, player_id, name, squad, data_source, firstname, lastname, birthdate, transfermarkt = player
            else:
                cafc_id, player_id, name, squad, data_source, firstname, lastname, birthdate = player
                transfermarkt = None
            all_players.append({
                "cafc_player_id": cafc_id,
                "player_id": player_id,
                "name": name,
                "squad": squad,
                "data_source": data_source,
                "firstname": firstname,
                "lastname": lastname,
                "birthdate": birthdate,
                "transfermarkt_link": transfermarkt,
            })
```

- [ ] **Step 3: Exclude internal-vs-external pairs, and add scoring + `both_have_reports`, in the exact-name-duplicate pass**

In the exact-name loop (lines 5774-5818), immediately after the two existing same-ID skip checks (lines 5780-5785), add a same-data-source check, and replace the `player_clashes.append({...})` block (5787-5818) to include the new fields. The full replacement for that loop body:

```python
        for name, name_players in players_by_name.items():
            if len(name_players) > 1:
                for i, p1 in enumerate(name_players):
                    for p2 in name_players[i + 1:]:
                        if (p1["cafc_player_id"] == p2["cafc_player_id"] and
                            p1["cafc_player_id"] is not None):
                            continue
                        if (p1["player_id"] == p2["player_id"] and
                            p1["player_id"] is not None):
                            continue
                        if p1["data_source"] != p2["data_source"]:
                            # Internal-vs-external duplicates are handled by
                            # the Internal Player Audit tab, not here.
                            continue

                        scored = score_player_match(
                            name_a=p1["name"], name_b=p2["name"],
                            dob_a=p1["birthdate"], dob_b=p2["birthdate"],
                            squad_a=p1["squad"], squad_b=p2["squad"],
                            transfermarkt_a=p1["transfermarkt_link"],
                            transfermarkt_b=p2["transfermarkt_link"],
                        )
                        confidence = scored["confidence"] if scored else "low"
                        evidence = scored["evidence"] if scored else ["Name exact"]

                        player_clashes.append({
                            "player1": {
                                "universal_id": get_player_universal_id({
                                    "CAFC_PLAYER_ID": p1["cafc_player_id"],
                                    "PLAYERID": p1["player_id"],
                                    "DATA_SOURCE": p1["data_source"],
                                }),
                                "cafc_player_id": p1["cafc_player_id"],
                                "player_id": p1["player_id"],
                                "name": p1["name"],
                                "firstname": p1["firstname"],
                                "lastname": p1["lastname"],
                                "data_source": p1["data_source"],
                            },
                            "player2": {
                                "universal_id": get_player_universal_id({
                                    "CAFC_PLAYER_ID": p2["cafc_player_id"],
                                    "PLAYERID": p2["player_id"],
                                    "DATA_SOURCE": p2["data_source"],
                                }),
                                "cafc_player_id": p2["cafc_player_id"],
                                "player_id": p2["player_id"],
                                "name": p2["name"],
                                "firstname": p2["firstname"],
                                "lastname": p2["lastname"],
                                "data_source": p2["data_source"],
                            },
                            "squad1": p1["squad"],
                            "squad2": p2["squad"],
                            "similarity": 100.0,
                            "confidence": confidence,
                            "evidence": evidence,
                            "clash_type": "player",
                        })
```

Note: `scored` can legitimately be `None` here — unlike Internal Audit (which uses the scorer's tiers to both rank *and filter* fuzzy candidates), this exact-name-duplicate pass already found the pair by direct name grouping, so a `None` score (e.g. exact name but two clearly different, both-present squads, no DOB) must not cause the pair to be dropped — it would still have been shown pre-refactor (as `similarity: 100.0` with no tier at all). The `if scored else` fallback keeps that pair visible at `low` confidence with `["Name exact"]` evidence instead of hiding it.

- [ ] **Step 4: Exclude internal-vs-external pairs and add scoring in the fuzzy-name pass**

In the fuzzy pass (lines 5824-5895), add the same data-source check next to the existing ID-skip checks (after line 5840), and add scoring to the `player_clashes.append` block (5864-5895):

```python
        for i, p1 in enumerate(all_players):
            if len(player_clashes) >= max_results:
                break

            for p2 in all_players[i + 1:]:
                total_comparisons += 1
                if total_comparisons > max_comparisons:
                    break

                if (p1["cafc_player_id"] == p2["cafc_player_id"] and
                    p1["cafc_player_id"] is not None):
                    continue

                if (p1["player_id"] == p2["player_id"] and
                    p1["player_id"] is not None):
                    continue

                if p1["data_source"] != p2["data_source"]:
                    continue

                name1 = (p1["name"] or "").lower().strip()
                name2 = (p2["name"] or "").lower().strip()

                if not name1 or not name2:
                    continue

                if name1 == name2:
                    continue

                len_diff = abs(len(name1) - len(name2))
                max_len = max(len(name1), len(name2))
                if len_diff / max_len > 0.3:
                    continue

                dist = levenshtein_module.distance(name1, name2)
                similarity = (1 - (dist / max_len)) * 100 if max_len > 0 else 0

                if similarity > 70 and similarity < 100:
                    scored = score_player_match(
                        name_a=p1["name"], name_b=p2["name"],
                        dob_a=p1["birthdate"], dob_b=p2["birthdate"],
                        squad_a=p1["squad"], squad_b=p2["squad"],
                        transfermarkt_a=p1["transfermarkt_link"],
                        transfermarkt_b=p2["transfermarkt_link"],
                    )
                    if scored is None:
                        # Below every confidence threshold (e.g. fuzzy name
                        # 71-87% with no squad corroboration) — still surface
                        # it as low, matching this endpoint's existing
                        # behavior of showing all 70%+ matches.
                        confidence = "low"
                        evidence = [f"Fuzzy {round(similarity, 1)}%"]
                    else:
                        confidence = scored["confidence"]
                        evidence = scored["evidence"]

                    player_clashes.append({
                        "player1": {
                            "universal_id": get_player_universal_id({
                                "CAFC_PLAYER_ID": p1["cafc_player_id"],
                                "PLAYERID": p1["player_id"],
                                "DATA_SOURCE": p1["data_source"],
                            }),
                            "cafc_player_id": p1["cafc_player_id"],
                            "player_id": p1["player_id"],
                            "name": p1["name"],
                            "firstname": p1["firstname"],
                            "lastname": p1["lastname"],
                            "data_source": p1["data_source"],
                        },
                        "player2": {
                            "universal_id": get_player_universal_id({
                                "CAFC_PLAYER_ID": p2["cafc_player_id"],
                                "PLAYERID": p2["player_id"],
                                "DATA_SOURCE": p2["data_source"],
                            }),
                            "cafc_player_id": p2["cafc_player_id"],
                            "player_id": p2["player_id"],
                            "name": p2["name"],
                            "firstname": p2["firstname"],
                            "lastname": p2["lastname"],
                            "data_source": p2["data_source"],
                        },
                        "squad1": p1["squad"],
                        "squad2": p2["squad"],
                        "similarity": round(similarity, 1),
                        "confidence": confidence,
                        "evidence": evidence,
                        "clash_type": "player",
                    })

            if total_comparisons > max_comparisons:
                break
```

- [ ] **Step 5: Add `both_have_reports` flag after clash lists are built, before the fixture-clash section**

Insert this right after the fuzzy-name pass loop ends and before the fixture clash detection block (i.e., right before line 5900's `# Detect fixture clashes` comment):

```python
        # Annotate each player clash with whether both sides already have
        # their own scout reports — a caution signal (not a confidence
        # input) since merging two actively-reported players is higher risk.
        if player_clashes:
            all_ids = set()
            for clash in player_clashes:
                for side in ("player1", "player2"):
                    p = clash[side]
                    if p["data_source"] == "internal" and p["cafc_player_id"] is not None:
                        all_ids.add(("internal", p["cafc_player_id"]))
                    elif p["player_id"] is not None:
                        all_ids.add(("external", p["player_id"]))

            internal_ids = [pid for source, pid in all_ids if source == "internal"]
            external_ids = [pid for source, pid in all_ids if source == "external"]

            has_reports = set()
            if internal_ids:
                placeholders = ",".join(["%s"] * len(internal_ids))
                cursor.execute(
                    f"SELECT DISTINCT CAFC_PLAYER_ID FROM scout_reports WHERE CAFC_PLAYER_ID IN ({placeholders})",
                    internal_ids,
                )
                for row in cursor.fetchall():
                    has_reports.add(("internal", row[0]))
            if external_ids:
                placeholders = ",".join(["%s"] * len(external_ids))
                cursor.execute(
                    f"SELECT DISTINCT PLAYER_ID FROM scout_reports WHERE PLAYER_ID IN ({placeholders})",
                    external_ids,
                )
                for row in cursor.fetchall():
                    has_reports.add(("external", row[0]))

            def _player_has_reports(p):
                if p["data_source"] == "internal" and p["cafc_player_id"] is not None:
                    return ("internal", p["cafc_player_id"]) in has_reports
                if p["player_id"] is not None:
                    return ("external", p["player_id"]) in has_reports
                return False

            for clash in player_clashes:
                clash["both_have_reports"] = (
                    _player_has_reports(clash["player1"]) and _player_has_reports(clash["player2"])
                )
```

- [ ] **Step 6: Manual verification**

```bash
cd backend
source venv/bin/activate
python main.py &
sleep 3
curl -s "http://localhost:8000/admin/detect-clashes" -H "Authorization: Bearer <admin-token>" | python3 -m json.tool | head -80
kill %1
```

Expected: every item in `player_clashes` now has `confidence`, `evidence`, and `both_have_reports` fields; every item has `player1.data_source == player2.data_source` (no cross-source pairs); search for a known no-squad duplicate (the Benítez-style case, if present in this environment) and confirm it shows `confidence: "low"` with `"Squad unknown"` in evidence, not `"medium"`.

- [ ] **Step 7: Commit**

```bash
git add backend/main.py
git commit -m "Add confidence tiers, scope exclusion, and both_have_reports to detect-clashes"
```

---

## Task 6: Internal Player Audit frontend — merge direction choice + bulk merge

**Files:**
- Modify: `frontend/src/components/admin/InternalPlayerAuditTab.tsx`.

**Interfaces:**
- Consumes: `POST /admin/merge-players?keep_universal_id=&remove_universal_id=` (Task 3), `POST /admin/internal-player-audit/bulk-merge?dry_run=` (Task 4).
- Both `AuditItem.internal_player` and `AuditCandidate.external` already carry `universal_id` fields (see the existing interfaces at lines 20-51) — no new backend fields are needed for the per-row merge buttons.

- [ ] **Step 1: Replace the single merge handler with two direction-explicit handlers**

In `frontend/src/components/admin/InternalPlayerAuditTab.tsx`, replace `handleMergeToInternal` (lines 222-253) with:

```typescript
  const handleMerge = async (
    item: AuditItem,
    candidate: AuditCandidate,
    keepSide: "internal" | "external"
  ) => {
    const keepId =
      keepSide === "internal"
        ? item.internal_player.universal_id
        : candidate.external.universal_id;
    const removeId =
      keepSide === "internal"
        ? candidate.external.universal_id
        : item.internal_player.universal_id;
    const keepLabel =
      keepSide === "internal" ? item.internal_player.player_name : candidate.external.player_name;

    if (
      !window.confirm(
        `Merge these two records, keeping the ${keepSide} record ("${keepLabel}")?\n\nThis will re-assign related records and delete the other record.`
      )
    ) {
      return;
    }

    try {
      setMergeLoadingId(candidate.external.player_id);
      setError(null);
      await axiosInstance.post(
        `/admin/merge-players?keep_universal_id=${keepId}&remove_universal_id=${removeId}`
      );
      setSuccess(`Merged, keeping the ${keepSide} record ("${keepLabel}").`);
      closeReview();
      fetchAudit(true);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.detail || "Failed to merge duplicate players");
      } else {
        setError("Failed to merge duplicate players");
      }
    } finally {
      setMergeLoadingId(null);
    }
  };
```

- [ ] **Step 2: Replace the single "Merge to Internal" button with two buttons in the Review modal**

Replace the `<Button>` block at lines 571-579 with:

```tsx
                        <td>
                          <div className="d-flex flex-column gap-1">
                            <Button
                              size="sm"
                              variant="dark"
                              disabled={mergeLoadingId === candidate.external.player_id}
                              onClick={() => handleMerge(reviewItem, candidate, "internal")}
                            >
                              {mergeLoadingId === candidate.external.player_id
                                ? "Merging..."
                                : "Merge (keep internal)"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline-dark"
                              disabled={mergeLoadingId === candidate.external.player_id}
                              onClick={() => handleMerge(reviewItem, candidate, "external")}
                            >
                              {mergeLoadingId === candidate.external.player_id
                                ? "Merging..."
                                : "Merge (keep external)"}
                            </Button>
                          </div>
                        </td>
```

- [ ] **Step 3: Add bulk-merge state, types, and handlers**

Add these interfaces near the top of the file, after the existing `SafetyCheck` interface (after line 77):

```typescript
interface BulkMergePair {
  internal_universal_id: string;
  internal_name: string;
  external_universal_id: string;
  external_name: string;
  confidence: ConfidenceLevel;
}

interface BulkMergeSkip {
  internal_universal_id: string;
  internal_name: string;
  reason: string;
}

interface BulkMergeFailure {
  internal_universal_id: string;
  external_universal_id: string;
  error: string;
}

interface BulkMergeResponse {
  dry_run: boolean;
  merged_count: number;
  pairs: BulkMergePair[];
  skipped: BulkMergeSkip[];
  failed: BulkMergeFailure[];
}
```

Add new state, alongside the existing `useState` declarations (after line 129, the `candidateImpact` state):

```typescript
  const [showBulkMergeModal, setShowBulkMergeModal] = useState(false);
  const [bulkMergePreview, setBulkMergePreview] = useState<BulkMergeResponse | null>(null);
  const [bulkMergeLoading, setBulkMergeLoading] = useState(false);
  const [bulkMergeResult, setBulkMergeResult] = useState<BulkMergeResponse | null>(null);
```

Add handlers, after `handleMerge` (defined in Step 1):

```typescript
  const openBulkMergePreview = async () => {
    setShowBulkMergeModal(true);
    setBulkMergeResult(null);
    setBulkMergePreview(null);
    setBulkMergeLoading(true);
    try {
      const response = await axiosInstance.post<BulkMergeResponse>(
        "/admin/internal-player-audit/bulk-merge?dry_run=true"
      );
      setBulkMergePreview(response.data);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.detail || "Failed to preview bulk merge");
      } else {
        setError("Failed to preview bulk merge");
      }
      setShowBulkMergeModal(false);
    } finally {
      setBulkMergeLoading(false);
    }
  };

  const confirmBulkMerge = async () => {
    setBulkMergeLoading(true);
    try {
      const response = await axiosInstance.post<BulkMergeResponse>(
        "/admin/internal-player-audit/bulk-merge?dry_run=false"
      );
      setBulkMergeResult(response.data);
      fetchAudit(true);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.detail || "Failed to run bulk merge");
      } else {
        setError("Failed to run bulk merge");
      }
    } finally {
      setBulkMergeLoading(false);
    }
  };

  const closeBulkMergeModal = () => {
    setShowBulkMergeModal(false);
    setBulkMergePreview(null);
    setBulkMergeResult(null);
  };
```

- [ ] **Step 4: Add the bulk-merge button and confirmation modal**

Add the button next to the existing "Refresh" button in the card header (modify the `d-flex gap-2`-equivalent area at lines 284-291 — there's only one button there today, wrap both in a `div className="d-flex gap-2"`):

```tsx
            <div className="d-flex gap-2">
              <Button size="sm" variant="outline-light" onClick={openBulkMergePreview}>
                Merge all High + Medium
              </Button>
              <Button
                size="sm"
                variant="outline-light"
                onClick={() => fetchAudit(true)}
                disabled={refreshing}
              >
                {refreshing ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
```

(This replaces the single `<Button>` currently at lines 284-291, keeping it as the second item.)

Add the modal, right after the closing `</Modal>` of the existing Review modal (after line 594, before the closing `</div>` of the component):

```tsx
      <Modal show={showBulkMergeModal} onHide={closeBulkMergeModal} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Merge All High + Medium Confidence Pairs</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {bulkMergeLoading && (
            <div className="text-center py-3">
              <Spinner animation="border" size="sm" />
              <span className="ms-2">Loading...</span>
            </div>
          )}
          {!bulkMergeLoading && bulkMergeResult && (
            <Alert variant="success">
              Merged {bulkMergeResult.merged_count} pair(s).
              {bulkMergeResult.failed.length > 0 &&
                ` ${bulkMergeResult.failed.length} failed — see below.`}
            </Alert>
          )}
          {!bulkMergeLoading && bulkMergeResult && bulkMergeResult.failed.length > 0 && (
            <ul>
              {bulkMergeResult.failed.map((f) => (
                <li key={f.internal_universal_id}>
                  {f.internal_universal_id} / {f.external_universal_id}: {f.error}
                </li>
              ))}
            </ul>
          )}
          {!bulkMergeLoading && !bulkMergeResult && bulkMergePreview && (
            <>
              <Alert variant="warning">
                This will merge {bulkMergePreview.pairs.length} pair(s), keeping the{" "}
                <strong>external</strong> record as survivor in every case.
                {bulkMergePreview.skipped.length > 0 &&
                  ` ${bulkMergePreview.skipped.length} internal player(s) are skipped as ambiguous.`}
              </Alert>
              <div className="table-responsive" style={{ maxHeight: 300, overflowY: "auto" }}>
                <Table size="sm" hover>
                  <thead>
                    <tr>
                      <th>Internal</th>
                      <th>External (kept)</th>
                      <th>Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkMergePreview.pairs.map((p) => (
                      <tr key={p.internal_universal_id}>
                        <td>{p.internal_name}</td>
                        <td>{p.external_name}</td>
                        <td>
                          <Badge bg={getConfidenceBadge(p.confidence)}>
                            {p.confidence.toUpperCase()}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeBulkMergeModal}>
            Close
          </Button>
          {!bulkMergeResult && bulkMergePreview && bulkMergePreview.pairs.length > 0 && (
            <Button variant="danger" onClick={confirmBulkMerge} disabled={bulkMergeLoading}>
              {bulkMergeLoading ? "Merging..." : `Merge ${bulkMergePreview.pairs.length} pair(s)`}
            </Button>
          )}
        </Modal.Footer>
      </Modal>
```

- [ ] **Step 5: Type-check and build**

```bash
cd frontend
npm run build
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 6: Manual smoke test in the running app**

Per CLAUDE.md's guidance to test UI changes in-browser before reporting complete:

```bash
cd frontend && npm start &
cd backend && source venv/bin/activate && python main.py &
```

Log in as an admin, navigate to Admin → Data Quality → Internal Player Audit, open a Review modal and confirm both "Merge (keep internal)" and "Merge (keep external)" buttons are present and call the endpoint with the right `keep_universal_id`/`remove_universal_id` (check the Network tab). Click "Merge all High + Medium", confirm the preview table renders, and confirm the confirmation button shows the correct pair count.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/admin/InternalPlayerAuditTab.tsx
git commit -m "Add merge-direction choice and bulk-merge UI to Internal Player Audit"
```

---

## Task 7: General Clashes frontend — confidence badges, evidence, caution flag, scope subtitle

**Files:**
- Modify: `frontend/src/components/DataClashesTab.tsx`.

**Interfaces:**
- Consumes: the new `confidence`, `evidence`, `both_have_reports` fields on `PlayerClash` from Task 5, and the reworked `/admin/merge-players` endpoint from Task 3.

- [ ] **Step 1: Update the `PlayerClash` interface**

Replace the `PlayerClash` interface (lines 36-43) with:

```typescript
type ConfidenceLevel = "high" | "medium" | "low";

interface PlayerClash {
  player1: Player;
  player2: Player;
  squad1: string;
  squad2: string;
  similarity: number;
  confidence: ConfidenceLevel;
  evidence: string[];
  both_have_reports: boolean;
  clash_type: "player";
}
```

- [ ] **Step 2: Update `handleMergePlayer` to use universal IDs**

Replace lines 102-126 (`handleMergePlayer`) with:

```typescript
  const handleMergePlayer = async (clash: PlayerClash, keepPlayer: 1 | 2) => {
    const keep = keepPlayer === 1 ? clash.player1 : clash.player2;
    const remove = keepPlayer === 1 ? clash.player2 : clash.player1;

    setActionLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await axiosInstance.post(
        `/admin/merge-players?keep_universal_id=${keep.universal_id}&remove_universal_id=${remove.universal_id}`
      );
      setSuccess(`Successfully merged players: kept "${keep.name}"`);
      setShowMergePlayerModal(false);
      fetchClashes();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        setError(err.response.data.detail || "Failed to merge players");
      } else {
        setError("An unexpected error occurred");
      }
    } finally {
      setActionLoading(false);
    }
  };
```

- [ ] **Step 3: Add a confidence-badge helper and clarifying subtitle**

Add next to the existing `getSimilarityBadgeVariant` (after line 191):

```typescript
  const getConfidenceBadgeVariant = (confidence: ConfidenceLevel) => {
    if (confidence === "high") return "danger";
    if (confidence === "medium") return "warning";
    return "info";
  };
```

Update the Player Clashes card header subtitle (lines 239-241):

```tsx
          <small className="text-muted">
            Duplicates within internal records or within external records
            (70%+ name similarity). Internal-vs-external duplicates are
            handled in the Internal Player Audit tab.
          </small>
```

- [ ] **Step 4: Add confidence badge, evidence, and caution flag to the Player Clashes table**

Update the table header (lines 250-258) to add a "Confidence" column and an "Evidence" column:

```tsx
              <thead>
                <tr>
                  <th>Player 1</th>
                  <th>Club 1</th>
                  <th>Player 2</th>
                  <th>Club 2</th>
                  <th>Similarity</th>
                  <th>Confidence</th>
                  <th>Evidence</th>
                  <th>Actions</th>
                </tr>
              </thead>
```

Update each row (replace the `<td>` for Similarity at lines 283-289, and the Actions `<td>` at lines 290-316, to insert the new cells and the caution badge):

```tsx
                    <td>
                      <Badge
                        bg={getSimilarityBadgeVariant(clash.similarity)}
                      >
                        {clash.similarity}%
                      </Badge>
                    </td>
                    <td>
                      <Badge bg={getConfidenceBadgeVariant(clash.confidence)}>
                        {clash.confidence.toUpperCase()}
                      </Badge>
                      {clash.both_have_reports && (
                        <div className="mt-1">
                          <Badge bg="dark">⚠ Both have reports</Badge>
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="d-flex flex-wrap gap-1">
                        {clash.evidence.map((ev) => (
                          <Badge key={ev} bg="secondary">
                            {ev}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td>
                      <ButtonGroup size="sm" className="d-flex">
                        <Button
                          variant="primary"
                          onClick={() => {
                            setSelectedClash(clash);
                            setShowMergePlayerModal(true);
                          }}
                        >
                          Merge
                        </Button>
                        <Button
                          variant="outline-secondary"
                          onClick={() => {
                            setDeleteTarget({
                              entityType: "player",
                              universalId: clash.player2.universal_id,
                              label: clash.player2.name,
                            });
                            setDeleteConfirmText("");
                            setShowDeleteModal(true);
                          }}
                        >
                          Delete
                        </Button>
                      </ButtonGroup>
                    </td>
```

- [ ] **Step 5: Type-check and build**

```bash
cd frontend
npm run build
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 6: Manual smoke test in the running app**

With both servers running (from Task 6, Step 6, or restart them), navigate to Admin → Data Quality → General Clashes. Confirm:
- No internal-vs-external pairs appear in the Player Clashes table (cross-check a known internal↔external duplicate from the Internal Audit tab does NOT also show up here).
- Confidence badges and evidence badges render per row.
- A pair where both players have scout reports shows the "⚠ Both have reports" badge (create one via two scout reports on a throwaway duplicate pair in dev if none exists naturally).
- Clicking "Merge" and picking either side calls `/admin/merge-players` with `keep_universal_id`/`remove_universal_id` (check Network tab), and the merge succeeds.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/DataClashesTab.tsx
git commit -m "Add confidence tiers, evidence, and caution flag to General Clashes UI"
```

---

## Task 8: End-to-end verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full backend test suite**

```bash
cd backend
source venv/bin/activate
python3 -m pytest tests/ -v
```

Expected: all tests from Task 1 still pass (confirms Task 2's refactor didn't silently change scoring behavior, since Task 2 doesn't touch `duplicate_detection.py` itself).

- [ ] **Step 2: Run the frontend build one more time from a clean state**

```bash
cd frontend
rm -rf build
npm run build
```

Expected: clean build, no errors.

- [ ] **Step 3: Full manual role-check per CLAUDE.md**

Log in as a non-admin role (e.g. `manager` or `scout`) and confirm:
- `GET /admin/internal-player-audit`, `GET /admin/detect-clashes`, `POST /admin/merge-players`, `POST /admin/internal-player-audit/bulk-merge` all return 403 for non-admin users.
- The Data Quality tab is not reachable/visible in the UI for non-admin roles (existing behavior — confirm it wasn't broken by these changes).

- [ ] **Step 4: Final review against the design spec**

Re-read `docs/superpowers/specs/2026-07-29-player-audit-merge-redesign-design.md` section by section and confirm each backend/frontend change in this plan was implemented: merge direction choice, row deletion, bulk merge (external-keep default, dry-run preview), General Clashes scope narrowing, confidence tiers with the Benítez-style low-not-medium rule, TRANSFERMARKT_LINK signal, both-have-reports caution flag.
