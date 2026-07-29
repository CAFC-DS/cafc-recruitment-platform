# Player Audit & Clash Merge Redesign

Date: 2026-07-29
Status: Approved for planning

## Problem

Two admin "Data Quality" tabs detect duplicate player records — **Internal Player Audit** (internal-only records vs external-only records) and **General Clashes** (all players vs all players, name-similarity only). Both share one merge endpoint, `POST /admin/merge-players`, which has structural problems:

1. It's **one-directional**: `keep_cafc_id` must always be an internal `CAFC_PLAYER_ID`. There's no way to keep the external record as the survivor.
2. It never deletes the losing player's row from `players` — only dependent `scout_reports`/`player_information`/`player_notes` rows get reassigned. The duplicate keeps reappearing in future audit/clash scans.
3. General Clashes has no confidence tiering — only a raw name-similarity percentage — and doesn't use DOB, squad, or external identifiers at all, so it both misses valid duplicates (e.g. a player with no squad set) and surfaces noisy near-name matches with no way to judge trustworthiness.
4. General Clashes overlaps with Internal Audit (it compares internal-vs-external pairs too), so the same pair can show up as a "clash" in two different tabs with no clear division of responsibility.

## Goals

- Support merging in either direction: keep the internal record or keep the external record, chosen per merge.
- Fully retire the losing record (delete its `players` row) after merge, for both features.
- Add confidence tiers (High/Medium/Low) to General Clashes, using the same evidence model as Internal Audit (name, DOB, squad) plus a new external-ID signal (`TRANSFERMARKT_LINK`).
- Narrow General Clashes' scope to internal↔internal and external↔external pairs only; Internal Audit remains the sole home for internal↔external detection.
- Add a bulk-merge action for Internal Audit's High + Medium confidence pairs.
- Surface a caution signal when both sides of a clash already have their own scout reports, since merging two actively-reported players is higher risk.

## Non-goals

- No changes to fixture/match clash detection or `POST /admin/merge-duplicate-match` (already universal-ID based and already deletes the losing row — used as the reference pattern here).
- No changes to `POST /admin/delete-duplicate` or `GET /admin/player-safety-check/{player_id}`.
- No retroactive cleanup of previously "merged" duplicate rows still lingering in `players` from before this change — out of scope; can be a follow-up data-quality pass if needed.

## Backend changes

### 1. `POST /admin/merge-players` — rework to be direction-agnostic

Replace params `keep_cafc_id: int, remove_player_id: int` with `keep_universal_id: str, remove_universal_id: str` (format `internal_<id>` / `external_<id>`, matching `get_player_universal_id()` / `resolve_player_lookup()` already used by the fixture-merge endpoint).

Behavior:
1. Resolve both universal IDs via `resolve_player_lookup()` to get each side's `(id_column, id_value, DATA_SOURCE)`.
2. Reassign dependent rows from the losing player onto the survivor:
   - `scout_reports`: set `CAFC_PLAYER_ID` or `PLAYER_ID` (whichever the survivor's DATA_SOURCE implies is the meaningful key) on rows currently pointing at the loser's id.
   - `player_information`, `player_notes`: same pattern.
   - This generalizes the existing reassignment logic — today it only handles "loser is external, survivor is internal"; the new version must handle all four combinations (internal↔external, external↔internal, internal↔internal, external↔external).
3. Delete the losing player's row from `players` (new — matches fixture-merge's existing behavior).
4. Wrap steps 2–3 in a single transaction; roll back entirely on any failure so a partial merge never leaves reports reassigned but the loser row still present (or vice versa).

Both call sites (Internal Audit tab, Clashes tab) are updated to pass universal IDs instead of the old params.

### 2. New bulk-merge endpoint for Internal Audit

`POST /admin/internal-player-audit/bulk-merge` — admin-only.

- Re-runs the same candidate-scoring logic as `GET /admin/internal-player-audit` to get the current set of High + Medium confidence pairs (never trust a stale list passed from the client — always compute fresh at merge time).
- Skips (records as "skipped") any internal anchor with more than one Medium-confidence candidate — ambiguous, needs manual review.
- For every remaining pair, calls the reworked merge logic keeping the **external** record as survivor (per product decision — bulk merge always keeps external; the internal↔external direction choice is only exposed per-row in the manual Review modal).
- Returns `{ merged_count, skipped: [{internal_id, reason}], failed: [{pair, error}] }`.

### 3. `GET /admin/detect-clashes` — scope + confidence tiers

- Scope: exclude any pair where one side is internal and the other external (drop cross-source comparisons — Internal Audit already owns that). Keep internal↔internal and external↔external.
- Fetch `BIRTHDATE` and `TRANSFERMARKT_LINK` in addition to the fields already selected (currently missing DOB entirely).
- Confidence scoring (mirrors Internal Audit's `score_candidate()`, reused/extracted rather than duplicated where practical):
  - **High**: `name_exact AND dob_exact`, OR both records have the same non-null `TRANSFERMARKT_LINK`.
  - **Medium**: `name_exact AND squad_exact` (both squads present and equal).
  - **Low**: fuzzy name similarity ≥88% AND (`squad_exact` OR `squad_near` ≥90%).
  - An exact name match with squad and DOB both missing/empty on either side stays **Low** (not Medium) — insufficient distinguishing evidence, but still surfaced with an "evidence" note (e.g. "Squad unknown", "DOB unknown") so admins can see why.
  - Existing raw `similarity` percentage is kept in the response alongside the new `confidence` tier and `evidence` list, for continuity with the current UI.
- New `both_have_reports: bool` field per clash pair — true if both players already have their own `scout_reports` rows. Informational only; does not affect tier.

## Frontend changes

### `InternalPlayerAuditTab.tsx`

- Review modal: replace the single "Merge to Internal" button with two explicit actions per candidate — **"Merge (keep internal)"** and **"Merge (keep external)"** — both calling the reworked merge endpoint with the appropriate `keep_universal_id`/`remove_universal_id`.
- New "Merge all High + Medium confidence" button above the summary cards. Opens a confirmation modal stating the pair count and that external records will be kept as survivors, then calls the bulk-merge endpoint and displays a result summary (merged/skipped/failed counts, with skip/fail reasons listed).

### `DataClashesTab.tsx`

- Subtitle/help text clarifying scope: "Duplicate detection within internal records and within external records. Internal-vs-external duplicates are handled in the Internal Player Audit tab."
- Confidence badge (High/red, Medium/yellow, Low/blue — matching Internal Audit's existing convention) shown alongside the existing similarity percentage, plus an evidence list per row.
- "⚠ Both have reports" badge shown when `both_have_reports` is true.
- Merge modal: no functional change needed on the frontend beyond passing universal IDs to the reworked endpoint — the existing "pick which side to keep" UI already exists here and will now work correctly for all record-type combinations.

## Testing

- Backend: unit/integration tests for the reworked merge endpoint covering all four direction combinations, transaction rollback on partial failure, and confirming the losing row is deleted.
- Backend: bulk-merge endpoint tests — happy path, ambiguous-skip case (>1 medium candidate), partial failure reporting.
- Backend: `detect-clashes` tests for the new tier boundaries (including the Benítez-style missing-squad-and-DOB case landing in Low, not Medium) and for scope exclusion of internal↔external pairs.
- Frontend: manual verification of both merge directions in Internal Audit's Review modal, the bulk-merge confirmation flow, and the new badges/evidence display in Clashes tab.
- Manual smoke test in the running app per CLAUDE.md guidance (role-based access — this is admin-only, verify non-admin roles still can't reach these endpoints).
