"""Tests for the normalization migrations and their runner.

No Snowflake needed: these cover the runner's pure helpers, its safety guards (with a fake
cursor), and lint rules over the SQL files that protect re-runnability and rollback.
"""
import re
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import run_normalization_migrations as runner  # noqa: E402

TOKENS = {"CORE": "CAFC_DB.CORE", "SNAPSHOT": "CAFC_DB.CORE_PRE_NORMALIZATION"}
MIGRATIONS = runner.discover_migrations()
VALIDATIONS = runner.discover_validations()
CONTRACTS = sorted((runner.MIGRATIONS_DIR / "contract").glob("*.sql"))
ALL_FILES = MIGRATIONS + [p for p, _ in VALIDATIONS] + CONTRACTS


def statements(path):
    return runner.split_statements(runner.render(path.read_text(), TOKENS))


# ---- pure helpers ---------------------------------------------------------------------
def test_split_handles_comments_strings_and_dollar_bodies():
    sql = """
    -- leading comment; with semicolon
    SELECT 'a;b', 'it''s' ; /* block; comment */
    CREATE FUNCTION f(v VARCHAR) RETURNS VARCHAR AS $$ SELECT 1; SELECT 2 $$;
    SELECT '\\s+' AS re;
    """
    out = runner.split_statements(sql)
    assert out[0] == "SELECT 'a;b', 'it''s'"
    assert out[1].startswith("CREATE FUNCTION") and "SELECT 1; SELECT 2" in out[1]
    assert out[2] == "SELECT '\\s+' AS re"
    assert len(out) == 3


@pytest.mark.parametrize("bad", ["SELECT 'open", "SELECT /* open", "SELECT $$ open"])
def test_split_rejects_unterminated_input(bad):
    with pytest.raises(ValueError):
        runner.split_statements(bad)


def test_render_substitutes_and_rejects_unknown_tokens():
    assert runner.render("SELECT * FROM ${CORE}.T", TOKENS) == "SELECT * FROM CAFC_DB.CORE.T"
    with pytest.raises(KeyError):
        runner.render("SELECT * FROM ${NOPE}.T", TOKENS)


def test_qualified_names_are_validated():
    assert runner.default_snapshot("CAFC_DB.CORE") == "CAFC_DB.CORE_PRE_NORMALIZATION"
    assert runner.default_snapshot("CAFC_DB.CORE_DEV_X") == "CAFC_DB.CORE_DEV_X_PRE_NORMALIZATION"
    for bad in ["CORE", "A.B;DROP TABLE X", "A.B.C.D", "a b.c"]:
        with pytest.raises(ValueError):
            runner.validate_qualified_name(bad, "--core")


def test_discovery_separates_migrations_validations_and_contracts():
    names = [p.name for p in MIGRATIONS]
    assert names == sorted(names) and names[0] == "000_snapshot.sql"
    assert all(re.match(r"^\d{3}_", n) for n in names)
    assert not any("contract" in str(p) or "validate" in str(p) for p in MIGRATIONS)
    assert {p.stem for p in CONTRACTS} == {"recommendations", "intel", "reports_lists"}
    assert any(is_warn for _, is_warn in VALIDATIONS) and any(not w for _, w in VALIDATIONS)


# ---- every file renders and splits --------------------------------------------------
@pytest.mark.parametrize("path", ALL_FILES, ids=lambda p: p.name)
def test_every_file_renders_and_has_statements(path):
    stmts = statements(path)
    assert stmts, f"{path.name} has no statements"
    assert "${" not in "".join(stmts)


@pytest.mark.parametrize("path", ALL_FILES, ids=lambda p: p.name)
def test_every_statement_parses_as_snowflake_sql(path):
    sqlglot = pytest.importorskip("sqlglot")
    for stmt in statements(path):
        if re.match(r"(?is)^ALTER TABLE .* DROP COLUMN", stmt):
            continue  # multi-column DROP COLUMN is valid Snowflake; sqlglot models only the single form
        sqlglot.parse_one(stmt, read="snowflake")


# ---- lint: re-runnability and rollback ------------------------------------------------
@pytest.mark.parametrize("path", MIGRATIONS, ids=lambda p: p.name)
def test_migrations_are_rerunnable(path):
    sql = "\n".join(statements(path))
    for m in re.finditer(r"(?i)\bCREATE\s+(?!OR\s+REPLACE|SCHEMA IF|TABLE IF|TEMPORARY)(TABLE|SCHEMA)\b", sql):
        pytest.fail(f"{path.name}: CREATE {m.group(1)} without IF NOT EXISTS")
    for m in re.finditer(r"(?i)CREATE\s+OR\s+REPLACE\s+(?!TEMPORARY|FUNCTION|VIEW)(\w+)", sql):
        pytest.fail(f"{path.name}: CREATE OR REPLACE {m.group(1)} would clobber existing data")
    for m in re.finditer(r"(?is)ADD\s+COLUMN\s+(?!IF NOT EXISTS)", sql):
        pytest.fail(f"{path.name}: ADD COLUMN without IF NOT EXISTS")
    assert not re.search(r"(?i)\b(DROP\s+(TABLE|COLUMN|SCHEMA)|TRUNCATE)\b", sql), (
        f"{path.name}: destructive DDL belongs in contract/"
    )


def test_only_contract_scripts_drop_columns():
    for path in CONTRACTS:
        assert re.search(r"(?i)DROP COLUMN", path.read_text())
        assert "DESTRUCTIVE" in path.read_text().splitlines()[0]


@pytest.mark.parametrize("path", MIGRATIONS, ids=lambda p: p.name)
def test_files_that_overwrite_derived_data_are_tagged_and_deletes_are_transactional(path):
    raw = path.read_text()
    stmts = statements(path)
    upper = [s.strip().upper() for s in stmts]
    rebuilds = any(s.startswith("DELETE FROM") for s in upper)
    recomputes = any(s.startswith("UPDATE") and "IS DISTINCT FROM" in s for s in upper)
    tag = runner.sync_domain(raw)
    if rebuilds or recomputes:
        assert tag, f"{path.name}: overwrites derived data but has no @sync-until-cutover tag"
    else:
        assert tag is None, f"{path.name}: tagged sync-until-cutover but overwrites nothing"
    if rebuilds:
        assert "BEGIN" in upper and "COMMIT" in upper and upper.index("BEGIN") < upper.index("COMMIT")
        begin, commit = upper.index("BEGIN"), upper.index("COMMIT")
        assert all(begin < i < commit for i, s in enumerate(upper) if s.startswith("DELETE FROM"))


def test_snapshot_never_overwrites_an_existing_snapshot():
    for stmt in statements(runner.MIGRATIONS_DIR / "000_snapshot.sql"):
        assert re.match(r"(?i)^CREATE (SCHEMA|TABLE) IF NOT EXISTS", stmt), stmt


def test_every_table_dropped_from_contract_is_snapshotted_first():
    snap = (runner.MIGRATIONS_DIR / "000_snapshot.sql").read_text().upper()
    for path in CONTRACTS:
        for table in re.findall(r"ALTER TABLE \$\{CORE\}\.(\w+)", path.read_text()):
            assert f"${{SNAPSHOT}}.{table}" in snap, f"{path.name}: {table} has no rollback snapshot"


def test_every_new_table_is_granted():
    created = set()
    grants = []
    for path in MIGRATIONS:
        text = path.read_text()
        created |= set(re.findall(r"(?i)CREATE TABLE IF NOT EXISTS \$\{CORE\}\.(\w+)", text))
        grants += [l for l in text.splitlines() if l.strip().upper().startswith("GRANT")]
    granted = "\n".join(grants)
    missing = [t for t in created if not re.search(rf"\$\{{CORE\}}\.{t}\s+TO ROLE APP_ROLE", granted)]
    assert not missing, f"no APP_ROLE grant for {missing}"
    assert len(created) >= 20


def test_lookup_seeds_match_backend_constants():
    """The code-origin lookup rows must equal the constants in backend/main.py."""
    main_py = (Path(__file__).resolve().parent.parent / "main.py").read_text()
    lookups = (runner.MIGRATIONS_DIR / "010_lookups.sql").read_text()

    def constant(name):
        block = re.search(rf"^{name}\s*=\s*\[(.*?)\]", main_py, re.S | re.M).group(1)
        return re.findall(r'"([^"]+)"', block)

    roles = re.findall(r'^ROLE_\w+ = "(\w+)"', main_py, re.M)
    assert sorted(roles) == sorted(re.findall(r"\('(\w+)',\s+'[\w ]+',\s+(?:TRUE|FALSE),\s+(?:TRUE|FALSE)\)", lookups))
    for name in ("RECOMMENDATION_STATUSES", "ALLOWED_POTENTIAL_DEAL_TYPES", "ALLOWED_RELATIONSHIP_TO_PLAYER",
                 "ALLOWED_AGREEMENT_TYPES", "ALLOWED_CONTRACT_OPTIONS", "ALLOWED_RECOMMENDED_POSITIONS"):
        for value in constant(name):
            assert f"'{value}'" in lookups, f"{name} value {value!r} missing from 010_lookups.sql"


# ---- runner guards with a fake cursor --------------------------------------------------
class FakeCursor:
    def __init__(self, cutover_domains=(), swapped_domains=(), parity_rows=()):
        self.executed = []
        self.cutover = set(cutover_domains)
        self.swapped = set(swapped_domains)
        self.parity_rows = list(parity_rows)  # rows returned by parity queries (non-empty = parity failure)
        self._last = None

    def execute(self, sql, params=None):
        self.executed.append((sql, params))
        self._last = (sql, params)

    def fetchone(self):
        sql, params = self._last
        if "'CUTOVER', 'UNCUTOVER'" in sql or "'CUTOVER','UNCUTOVER'" in sql:
            return ("CUTOVER",) if params[0] in self.cutover else None
        if "'SWAP', 'SWAPBACK'" in sql:
            return ("SWAP",) if params[0] in self.swapped else None
        return (0,)

    def fetchall(self):
        sql = (self._last or ("", None))[0]
        if "EXCEPT" in sql or "row counts differ" in sql or "columns differ" in sql:
            return list(self.parity_rows)
        return []

    def close(self):
        pass


class FakeConn:
    def __init__(self, cursor):
        self._cursor = cursor

    def cursor(self):
        return self._cursor

    def close(self):
        pass


SANDBOX = "CAFC_DB.CORE_DEV_NORMALIZATION"


def run_main(monkeypatch, cursor, *argv):
    monkeypatch.setattr(runner, "connect", lambda: FakeConn(cursor))
    args = list(argv)
    if "--core" not in args:  # default target in tests is the duplicate, never production
        args += ["--core", SANDBOX]
    return runner.main(args)


def test_dry_run_prints_and_never_connects(monkeypatch, capsys):
    monkeypatch.setattr(runner, "connect", lambda: pytest.fail("dry run must not connect"))
    assert runner.main([]) == 0
    out = capsys.readouterr().out
    assert "DRY RUN" in out and "CAFC_DB.CORE.SCOUT_REPORTS" in out


def test_dry_run_honours_dev_schema(monkeypatch, capsys):
    monkeypatch.setattr(runner, "connect", lambda: pytest.fail("dry run must not connect"))
    runner.main(["--core", "CAFC_DB.CORE_DEV_TEST", "--only", "000"])
    out = capsys.readouterr().out
    assert "CAFC_DB.CORE_DEV_TEST.SCOUT_REPORTS" in out
    assert "CAFC_DB.CORE_DEV_TEST_PRE_NORMALIZATION" in out
    assert "CAFC_DB.CORE." not in out


def test_apply_skips_sync_files_after_cutover(monkeypatch):
    cur = FakeCursor(cutover_domains={"recommendations"})
    run_main(monkeypatch, cur, "--apply", "--only", "040")
    sql = " ".join(s for s, _ in cur.executed)
    assert "DELETE FROM" not in sql
    assert f"CREATE TABLE IF NOT EXISTS {SANDBOX}.RECOMMENDATION_TERMS" not in sql
    assert not any(p and p[0] == "040_recommendation_terms.sql" for _, p in cur.executed)  # not ledgered


def test_apply_runs_sync_files_before_cutover(monkeypatch):
    cur = FakeCursor()
    run_main(monkeypatch, cur, "--apply", "--only", "040")
    sql = " ".join(s for s, _ in cur.executed)
    assert f"DELETE FROM {SANDBOX}.RECOMMENDATION_TERMS" in sql


def test_contract_refused_without_cutover(monkeypatch):
    cur = FakeCursor()
    with pytest.raises(SystemExit, match="not marked cut over"):
        run_main(monkeypatch, cur, "--apply", "--contract", "recommendations")
    assert not any("DROP COLUMN" in s for s, _ in cur.executed)


def test_contract_runs_after_cutover_and_clean_validation(monkeypatch):
    cur = FakeCursor(cutover_domains={"intel"})
    assert run_main(monkeypatch, cur, "--apply", "--contract", "intel") == 0
    assert any("DROP COLUMN" in s for s, _ in cur.executed)


def test_failed_statement_rolls_back_and_stops(monkeypatch):
    class Boom(FakeCursor):
        def execute(self, sql, params=None):
            super().execute(sql, params)
            if "NORMALIZE_NAME_KEY" in sql and sql.lstrip().upper().startswith("CREATE OR REPLACE FUNCTION"):
                raise RuntimeError("boom")

    cur = Boom()
    with pytest.raises(SystemExit, match="FAILED 030_agencies.sql"):
        run_main(monkeypatch, cur, "--apply", "--only", "030")
    assert cur.executed[-1][0] == "ROLLBACK"


def test_mark_cutover_is_recorded(monkeypatch):
    cur = FakeCursor()
    assert run_main(monkeypatch, cur, "--mark-cutover", "intel") == 0
    assert any(p and p[1] == "CUTOVER" and p[0] == "intel" for _, p in cur.executed)


# ---- live-schema guard ------------------------------------------------------------------
def test_is_protected_covers_live_schemas_but_not_dev_clones():
    for live in ("CAFC_DB.CORE", "cafc_db.core", "CAFC_DB.APP", "CAFC_DB.APP_COMPAT", "RECRUITMENT_TEST.PUBLIC", "RECRUITMENT_TEST.X"):
        assert runner.is_protected(live), live
    for dev in ("CAFC_DB.CORE_DEV_NORMALIZATION", "CAFC_DB.CORE_DEV_HUMARJI", "OTHER_DB.CORE"):
        assert not runner.is_protected(dev), dev


def test_apply_to_live_schema_is_refused(monkeypatch):
    cur = FakeCursor()
    for argv in (["--apply", "--core", "CAFC_DB.CORE"], ["--mark-cutover", "intel", "--core", "CAFC_DB.CORE"],
                 ["--apply", "--contract", "intel", "--core", "cafc_db.core"]):
        with pytest.raises(SystemExit, match="protected target CAFC_DB.CORE"):
            run_main(monkeypatch, cur, *argv)
    assert cur.executed == []


def test_apply_to_dev_clone_is_allowed_and_only_touches_it(monkeypatch):
    cur = FakeCursor()
    assert run_main(monkeypatch, cur, "--apply", "--only", "000") == 0
    sql = " ".join(s for s, _ in cur.executed)
    assert f"{SANDBOX}.USERS" in sql
    assert "CAFC_DB.CORE." not in sql and "CAFC_DB.CORE " not in sql


def test_every_rendered_statement_stays_inside_the_target_schema(monkeypatch):
    """Whole-run guarantee: nothing in a sandbox run may reference the live CORE schema."""
    cur = FakeCursor()
    run_main(monkeypatch, cur, "--apply")
    assert cur.executed
    for sql, _ in cur.executed:
        assert not re.search(r"CAFC_DB\.CORE\b(?!_)", sql), sql[:120]


def test_validate_and_dry_run_remain_allowed_on_live_schema(monkeypatch):
    assert runner.main([]) == 0  # dry run renders, writes nothing
    cur = FakeCursor()
    assert run_main(monkeypatch, cur, "--validate", "--core", "CAFC_DB.CORE") == 0  # read-only


def test_allow_production_overrides_the_guard(monkeypatch):
    cur = FakeCursor()
    assert run_main(monkeypatch, cur, "--apply", "--allow-production", "--core", "CAFC_DB.CORE", "--only", "000") == 0


def test_create_sandbox_defaults_to_schema_clone_and_never_replaces(monkeypatch):
    cur = FakeCursor()
    assert run_main(monkeypatch, cur, "--create-sandbox", "--apply") == 0
    sql = cur.executed[0][0]
    assert sql == "CREATE SCHEMA IF NOT EXISTS CAFC_DB.CORE_DEV_NORMALIZATION CLONE CAFC_DB.CORE"
    assert "REPLACE" not in sql.upper()


def test_create_sandbox_database_clone_and_refusals(monkeypatch, capsys):
    monkeypatch.setattr(runner, "connect", lambda: pytest.fail("must not connect"))
    assert runner.main(["--create-sandbox"]) == 0
    assert "DRY RUN" in capsys.readouterr().out
    assert runner.main(["--create-sandbox", "CAFC_DB_COPY"]) == 0
    assert "CREATE DATABASE IF NOT EXISTS CAFC_DB_COPY CLONE CAFC_DB;" in capsys.readouterr().out
    for bad in ("CAFC_DB.CORE", "RECRUITMENT_TEST", "CAFC_DB.APP"):
        with pytest.raises(SystemExit):
            runner.main(["--create-sandbox", bad, "--apply"])


# ---- sync files: full recompute, per-domain, never NULL-only ------------------------------
KEY_SYNC = [p for p in MIGRATIONS if p.name.startswith("02")]


def test_key_sync_is_split_per_domain_and_tagged():
    assert [p.name for p in KEY_SYNC] == [
        "020_keys_reports_lists.sql", "021_keys_recommendations.sql", "022_keys_intel.sql"]
    assert [runner.sync_domain(p.read_text()) for p in KEY_SYNC] == ["reports_lists", "recommendations", "intel"]


@pytest.mark.parametrize("path", KEY_SYNC, ids=lambda p: p.name)
def test_key_sync_recomputes_instead_of_filling_nulls(path):
    """The legacy columns are rewritten in place by merge endpoints, so a NULL-only backfill goes stale."""
    updates = [s for s in statements(path) if s.upper().startswith("UPDATE")]
    assert updates
    for stmt in updates:
        assert "IS DISTINCT FROM" in stmt, stmt[:100]
        assert not re.search(r"(?i)CANONICAL\w*\s+IS\s+NULL|CAFC_PLAYER_ID\s+IS\s+NULL", stmt), stmt[:100]


def test_every_sync_until_cutover_update_recomputes():
    """Same rule for agency/contact links: 030 and 050 UPDATEs must not be NULL-only."""
    for name in ("030_agencies.sql", "050_intel.sql"):
        for stmt in statements(runner.MIGRATIONS_DIR / name):
            if stmt.upper().startswith("UPDATE"):
                assert not re.search(r"(?i)\b(AGENCY_ID|CONTACT_ID)\s+IS\s+NULL\s+AND", stmt), stmt[:100]


def test_agencies_file_is_tagged_for_the_recommendations_domain():
    assert runner.sync_domain((runner.MIGRATIONS_DIR / "030_agencies.sql").read_text()) == "recommendations"


def test_contract_scripts_do_not_break_known_dbt_dependents():
    """APP_COMPAT views reference these columns explicitly (checked live 2026-09-30)."""
    intel = (runner.MIGRATIONS_DIR / "contract" / "intel.sql").read_text()
    rl = (runner.MIGRATIONS_DIR / "contract" / "reports_lists.sql").read_text()
    assert not re.search(r"(?i)DROP COLUMN\s+PLAYER_ID", intel)          # APP_COMPAT.PLAYER_INFORMATION joins pi.PLAYER_ID
    assert not re.search(r"(?i)RENAME COLUMN CANONICAL_PLAYER_ID TO CAFC_PLAYER_ID", intel)  # duplicate-column clash
    assert not re.search(r"(?i)PLAYER_STAGE_HISTORY\s+DROP COLUMN[^;]*PLAYER_ID", rl)   # APP_COMPAT.PLAYER_STAGE_HISTORY


def test_contract_scripts_drop_the_key_views_before_the_columns_they_read():
    # intel is excluded on purpose: its PLAYER_ID/DATA_SOURCE drop is deferred, so V_INTEL_KEYS stays valid.
    for name, view in (("reports_lists", "V_SCOUT_REPORT_KEYS"), ("recommendations", "V_RECOMMENDATION_KEYS")):
        sql = (runner.MIGRATIONS_DIR / "contract" / f"{name}.sql").read_text()
        assert sql.index(f"DROP VIEW IF EXISTS ${{CORE}}.{view}") < sql.index("DROP COLUMN")


def test_no_separate_agents_table():
    """Live data showed recommendation agent facts equal the submitter's AGENT_PROFILES row; AGENTS would duplicate it."""
    for path in ALL_FILES:  # statements() strips comments, so the explanatory header may mention the old draft
        sql = "\n".join(statements(path)).replace("AGENT_PROFILES", "")
        assert not re.search(r"(?i)\bAGENTS\b|\bAGENT_KEY\b", sql), path.name


def test_multi_valued_recommendation_columns_all_get_a_junction():
    sql = (runner.MIGRATIONS_DIR / "040_recommendation_terms.sql").read_text()
    for table in ("RECOMMENDATION_DEAL_TYPES", "RECOMMENDATION_AGREEMENT_TYPES",
                  "RECOMMENDATION_CONTRACT_OPTIONS", "RECOMMENDATION_POSITIONS"):
        assert f"CREATE TABLE IF NOT EXISTS ${{CORE}}.{table}" in sql
        assert f"DELETE FROM ${{CORE}}.{table}" in sql
    contract = (runner.MIGRATIONS_DIR / "contract" / "recommendations.sql").read_text()
    for col in ("AGREEMENT_TYPE", "CONTRACT_OPTIONS", "RECOMMENDED_POSITION", "POTENTIAL_DEAL_TYPE"):
        assert col in contract


def test_contract_keeps_agent_profiles_as_source_of_truth():
    contract = (runner.MIGRATIONS_DIR / "contract" / "recommendations.sql").read_text()
    assert "ALTER TABLE ${CORE}.AGENT_PROFILES DROP COLUMN AGENCY;" in contract
    assert not re.search(r"(?i)AGENT_PROFILES DROP COLUMN[^;]*AGENT_(NAME|EMAIL|NUMBER)", contract)


# ---- swap / rollback / parity -----------------------------------------------------------------
def test_swap_files_come_in_apply_and_rollback_pairs():
    swaps = sorted(p.stem for p in (runner.MIGRATIONS_DIR / "swap").glob("*.sql"))
    domains = {n for n in swaps if not n.endswith("_rollback")}
    assert domains and all(f"{d}_rollback" in swaps for d in domains)


@pytest.mark.parametrize("path", sorted((runner.MIGRATIONS_DIR / "swap").glob("*.sql")), ids=lambda p: p.name)
def test_swap_scripts_render_and_parse(path):
    sqlglot = pytest.importorskip("sqlglot")
    stmts = statements(path)
    assert stmts
    for stmt in stmts:
        if re.match(r"(?is)^ALTER TABLE .*(DROP|ADD) FOREIGN KEY", stmt):
            continue  # Snowflake syntax that sqlglot does not model
        sqlglot.parse_one(stmt, read="snowflake")


def test_swap_renames_legacy_and_puts_the_view_under_the_legacy_name():
    sql = "\n".join(statements(runner.MIGRATIONS_DIR / "swap" / "recommendations.sql"))
    build = sql.index("CREATE OR REPLACE VIEW CAFC_DB.CORE.PLAYER_RECOMMENDATIONS_SWAPVIEW")
    rename_table = sql.index("PLAYER_RECOMMENDATIONS RENAME TO CAFC_DB.CORE.PLAYER_RECOMMENDATIONS_LEGACY")
    rename_view = sql.index("ALTER VIEW CAFC_DB.CORE.PLAYER_RECOMMENDATIONS_SWAPVIEW RENAME TO CAFC_DB.CORE.PLAYER_RECOMMENDATIONS")
    assert build < rename_table < rename_view          # the view is compiled BEFORE anything is renamed
    between = sql[rename_table:rename_view]
    assert between.count(";") <= 1 and "ALTER TABLE CAFC_DB.CORE.RECOMMENDATION_NOTES_HISTORY" not in between  # renames are back to back
    assert "DROP TABLE" not in sql.upper()  # the legacy table is kept for rollback


def test_swap_scripts_declare_a_recovery_statement():
    raw = (runner.MIGRATIONS_DIR / "swap" / "recommendations.sql").read_text()
    hint = runner.recovery_statement(raw, TOKENS)
    assert hint == "ALTER TABLE CAFC_DB.CORE.PLAYER_RECOMMENDATIONS_LEGACY RENAME TO CAFC_DB.CORE.PLAYER_RECOMMENDATIONS;"


def test_failed_swap_prints_the_recovery_statement(monkeypatch, capsys):
    class Boom(FakeCursor):
        def execute(self, sql, params=None):
            super().execute(sql, params)
            if sql.lstrip().upper().startswith("ALTER VIEW"):
                raise RuntimeError("boom")

    cur = Boom(cutover_domains={"recommendations"})
    with pytest.raises(SystemExit, match="FAILED swap/recommendations"):
        run_main(monkeypatch, cur, "--swap", "recommendations", "--apply")
    out = capsys.readouterr().out
    assert "PLAYER_RECOMMENDATIONS_LEGACY RENAME TO" in out and "cannot be rolled back" in out
    assert not any(p and len(p) == 3 and p[1] == "SWAP" for _, p in cur.executed)  # a failed swap is not ledgered


def test_rollback_copies_data_back_before_restoring_the_name():
    sql = "\n".join(statements(runner.MIGRATIONS_DIR / "swap" / "recommendations_rollback.sql"))
    restore = re.search(r"RENAME TO CAFC_DB\.CORE\.PLAYER_RECOMMENDATIONS\s*$", sql, re.M)
    assert restore and sql.index("INSERT OVERWRITE") < sql.index("DROP VIEW") < restore.start()
    assert not re.search(r"(?i)DROP TABLE\s+(IF EXISTS\s+)?\S*PLAYER_RECOMMENDATIONS", sql)  # legacy data is never dropped
    # the legacy identity counter is advanced past every id issued while the normalized tables were live
    assert sql.index("CREATE OR REPLACE TEMPORARY TABLE CAFC_DB.CORE.ROLLBACK_PAD") < sql.index("INSERT OVERWRITE")
    assert sql.index("__ROLLBACK_PAD__") > sql.index("INSERT OVERWRITE")


def test_swap_creates_the_id_sequence_above_every_existing_id():
    sql = "\n".join(statements(runner.MIGRATIONS_DIR / "swap" / "recommendations.sql"))
    assert "CREATE OR REPLACE SEQUENCE CAFC_DB.CORE.RECOMMENDATIONS_ID_SEQ START = " in sql
    assert "MAX(ID)" in sql and "GREATEST" in sql
    assert sql.index("RECOMMENDATIONS_ID_SEQ") < sql.index("RENAME TO")   # ready before anything is renamed


def test_compat_view_has_all_legacy_columns_in_legacy_order():
    view = "\n".join(statements(runner.MIGRATIONS_DIR / "061_compat_recommendations.sql"))
    body = view[view.upper().rindex("SELECT\n") if "SELECT\n" in view.upper() else view.upper().rindex("SELECT"):]
    aliases = re.findall(r"(?:AS\s+(\w+)|\b\w+\.(\w+))\s*,?\s*$", body.split("FROM ${CORE}.RECOMMENDATIONS".replace("${CORE}", "CAFC_DB.CORE"))[0], re.M)
    names = [a or b for a, b in aliases]
    legacy = ["ID", "AGENT_NAME", "AGENCY", "AGENT_EMAIL", "AGENT_NUMBER", "DATE", "TRANSFERMARKT_LINK", "AGREEMENT_TYPE",
              "CONTRACT_EXPIRY", "CONTRACT_OPTIONS", "POTENTIAL_DEAL_TYPE", "TRANSFER_FEE", "CURRENT_WAGES", "EXPECTED_WAGES",
              "ADDITIONAL_INFO", "PLAYER_NAME", "SUBMITTED_BY_USER_ID", "STATUS", "STATUS_UPDATED_AT", "STATUS_UPDATED_BY",
              "INTERNAL_NOTES", "UPDATED_AT", "CREATED_AT", "EXPECTED_WAGES_CURRENCY", "EXPECTED_WAGES_AMOUNT",
              "CURRENT_WAGES_CURRENCY", "CURRENT_WAGES_AMOUNT", "TRANSFER_FEE_CURRENCY", "TRANSFER_FEE_AMOUNT",
              "RECOMMENDED_POSITION", "PLAYER_DATE_OF_BIRTH", "AGENT_STATUS", "AGENT_STATUS_UPDATED_AT", "EXPECTED_WAGES_MAX",
              "EXPECTED_WAGES_MIN", "CURRENT_WAGES_MAX", "CURRENT_WAGES_MIN", "WAGE_BASIS", "TRANSFER_FEE_MAX",
              "TRANSFER_FEE_MIN", "LINKED_UNIVERSAL_ID"]
    assert names == legacy  # captured live from DESCRIBE TABLE PLAYER_RECOMMENDATIONS, 2026-09-30


def test_tokens_expose_db_schema_and_legacy_suffix():
    t = runner.make_tokens("CAFC_DB.core_dev_x", "CAFC_DB.S", "_LEGACY")
    assert (t["CORE_DB"], t["CORE_SCHEMA"], t["LEGACY_SUFFIX"]) == ("CAFC_DB", "CORE_DEV_X", "_LEGACY")
    with pytest.raises(ValueError):
        runner.make_tokens("ONLYONE", "S")
    with pytest.raises(ValueError):
        runner.make_tokens("A.B", "S", "; DROP")


def test_swap_dry_run_prints_and_never_connects(monkeypatch, capsys):
    monkeypatch.setattr(runner, "connect", lambda: pytest.fail("dry run must not connect"))
    assert runner.main(["--swap", "recommendations", "--core", SANDBOX]) == 0
    out = capsys.readouterr().out
    assert "DRY RUN" in out and f"{SANDBOX}.PLAYER_RECOMMENDATIONS_LEGACY" in out


def test_swap_refused_on_live_schema(monkeypatch):
    with pytest.raises(SystemExit, match="protected target"):
        run_main(monkeypatch, FakeCursor(), "--swap", "recommendations", "--apply", "--core", "CAFC_DB.CORE")


def test_swap_refused_without_cutover_mark(monkeypatch):
    cur = FakeCursor()
    with pytest.raises(SystemExit, match="not marked cut over"):
        run_main(monkeypatch, cur, "--swap", "recommendations", "--apply")
    assert not any("RENAME" in s for s, _ in cur.executed)


def test_swap_refused_when_parity_fails(monkeypatch):
    cur = FakeCursor(cutover_domains={"recommendations"}, parity_rows=[("row differs",)])
    with pytest.raises(SystemExit, match="does not equal the legacy table"):
        run_main(monkeypatch, cur, "--swap", "recommendations", "--apply")
    assert not any("RENAME" in s for s, _ in cur.executed)


def test_swap_applies_when_cut_over_and_parity_clean(monkeypatch):
    cur = FakeCursor(cutover_domains={"recommendations"})
    assert run_main(monkeypatch, cur, "--swap", "recommendations", "--apply") == 0
    sql = " ".join(s for s, _ in cur.executed)
    assert "RENAME TO" in sql and "VIEW" in sql
    assert any(p and len(p) == 3 and p[1] == "SWAP" for _, p in cur.executed)


def test_swap_refused_when_already_swapped(monkeypatch):
    cur = FakeCursor(cutover_domains={"recommendations"}, swapped_domains={"recommendations"})
    with pytest.raises(SystemExit, match="already swapped"):
        run_main(monkeypatch, cur, "--swap", "recommendations", "--apply")


def test_rollback_refused_when_not_swapped(monkeypatch):
    cur = FakeCursor(cutover_domains={"recommendations"})
    with pytest.raises(SystemExit, match="not currently swapped"):
        run_main(monkeypatch, cur, "--swap-rollback", "recommendations", "--apply")
    assert not any("INSERT OVERWRITE" in s for s, _ in cur.executed)


def test_rollback_restores_and_unmarks_cutover(monkeypatch):
    cur = FakeCursor(cutover_domains={"recommendations"}, swapped_domains={"recommendations"})
    assert run_main(monkeypatch, cur, "--swap-rollback", "recommendations", "--apply") == 0
    kinds = [p[1] for _, p in cur.executed if p and len(p) == 3]
    assert "SWAPBACK" in kinds and "UNCUTOVER" in kinds


def test_parity_mode_is_read_only_and_reports_failure(monkeypatch):
    ok = FakeCursor()
    assert run_main(monkeypatch, ok, "--parity", "--core", "CAFC_DB.CORE") == 0  # read-only: allowed on live
    bad = FakeCursor(parity_rows=[("x",)])
    assert run_main(monkeypatch, bad, "--parity") == 1
    assert all(s.lstrip().upper().startswith(("SELECT", "WITH")) for s, _ in ok.executed)


def test_modes_are_mutually_exclusive():
    for argv in (["--swap", "recommendations", "--parity"], ["--swap", "recommendations", "--swap-rollback", "recommendations"],
                 ["--parity", "--validate"]):
        with pytest.raises(SystemExit):
            runner.main(argv + ["--core", SANDBOX])


# ---- write flags wired into the swap scripts --------------------------------------------------
def test_flag_table_is_insert_only_and_defaults_every_domain_off():
    sql = "\n".join(statements(runner.MIGRATIONS_DIR / "070_write_flags.sql"))
    assert "WHEN NOT MATCHED THEN INSERT" in sql and "WHEN MATCHED" not in sql   # a re-run can never flip a flag
    assert "VALUES (s.DOMAIN, FALSE)" in sql
    import write_path
    for domain in write_path.DOMAINS:
        assert f"('{domain}')" in sql


def test_swap_turns_the_flag_on_last_and_rollback_turns_it_off_first():
    swap = statements(runner.MIGRATIONS_DIR / "swap" / "recommendations.sql")
    back = statements(runner.MIGRATIONS_DIR / "swap" / "recommendations_rollback.sql")
    assert "NORMALIZED_WRITES = TRUE" in swap[-1] and "'recommendations'" in swap[-1]
    assert "NORMALIZED_WRITES = FALSE" in back[0] and "'recommendations'" in back[0]


# ---- cleanup/ (delete-policy scripts) --------------------------------------------------------
def test_cleanup_file_resolves_and_rejects_unknown_domains():
    assert runner.cleanup_file("sharing").name == "sharing.sql"
    with pytest.raises(SystemExit):
        runner.cleanup_file("nope")
    with pytest.raises(SystemExit):
        runner.cleanup_file("../sharing")


def test_cleanup_scripts_are_never_picked_up_as_migrations():
    assert not any("cleanup" in str(p) for p in runner.discover_migrations())


def test_cleanup_is_exclusive_with_the_other_modes(capsys):
    with pytest.raises(SystemExit):
        runner.main(["--core", "CAFC_DB.CORE_DEV_X", "--cleanup", "sharing", "--contract", "intel"])


def test_cleanup_dry_run_prints_and_touches_nothing(capsys):
    assert runner.main(["--core", "CAFC_DB.CORE_DEV_X", "--cleanup", "sharing"]) == 0
    out = capsys.readouterr().out
    assert "CLEANUP cleanup/sharing" in out and "DRY RUN" in out


def test_cleanup_on_a_live_schema_is_refused_without_the_override():
    with pytest.raises(SystemExit):
        runner.main(["--core", "CAFC_DB.CORE", "--cleanup", "sharing", "--apply"])


def test_every_cleanup_script_is_one_transaction_that_archives_before_it_removes_user_rows():
    for path in (runner.MIGRATIONS_DIR / "cleanup").glob("*.sql"):
        statements = runner.split_statements(path.read_text())
        assert "BEGIN" in statements and statements[-1] == "COMMIT", path.name
        text = path.read_text()
        for archive in re.findall(r"INSERT INTO \$\{CORE\}\.(ARCHIVED_\w+)", text):
            assert text.index(f"INSERT INTO ${{CORE}}.{archive}") < text.rindex("DELETE FROM"), (path.name, archive)
