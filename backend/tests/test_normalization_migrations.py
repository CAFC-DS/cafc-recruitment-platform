"""Tests for the normalization migrations and their runner.

No Snowflake needed: these cover the runner's pure helpers, its safety guards (with a fake
cursor), and lint rules over the SQL files that protect re-runnability and rollback.
"""
import re
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
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
    for m in re.finditer(r"(?i)CREATE\s+OR\s+REPLACE\s+(?!TEMPORARY|FUNCTION)(\w+)", sql):
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
def test_rebuild_files_are_transactional_and_tagged(path):
    raw = path.read_text()
    uses_delete = re.search(r"(?im)^\s*DELETE FROM", raw)
    tag = runner.sync_domain(raw)
    if uses_delete:
        assert tag, f"{path.name}: rebuilds derived tables but has no @sync-until-cutover tag"
        stmts = [s.strip().upper() for s in statements(path)]
        assert "BEGIN" in stmts and "COMMIT" in stmts
        assert stmts.index("BEGIN") < stmts.index("COMMIT")
        # no DELETE outside the transaction
        begin, commit = stmts.index("BEGIN"), stmts.index("COMMIT")
        assert all(begin < i < commit for i, s in enumerate(stmts) if s.startswith("DELETE FROM"))
    else:
        assert tag is None


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
    for path in MIGRATIONS:
        created |= set(re.findall(r"(?i)CREATE TABLE IF NOT EXISTS \$\{CORE\}\.(\w+)", path.read_text()))
    grants = (runner.MIGRATIONS_DIR / "090_grants.sql").read_text()
    missing = [t for t in created if f"${{CORE}}.{t} " not in grants and f"${{CORE}}.{t}\n" not in grants]
    assert not missing, f"no grant for {missing}"
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
    for name in ("RECOMMENDATION_STATUSES", "ALLOWED_POTENTIAL_DEAL_TYPES", "ALLOWED_RELATIONSHIP_TO_PLAYER"):
        for value in constant(name):
            assert f"'{value}'" in lookups, f"{name} value {value!r} missing from 010_lookups.sql"


# ---- runner guards with a fake cursor --------------------------------------------------
class FakeCursor:
    def __init__(self, cutover_domains=()):
        self.executed = []
        self.cutover = set(cutover_domains)
        self._last = None

    def execute(self, sql, params=None):
        self.executed.append((sql, params))
        self._last = (sql, params)

    def fetchone(self):
        sql, params = self._last
        if "KIND = 'CUTOVER'" in sql:
            return (1 if params[0] in self.cutover else 0,)
        return (0,)

    def fetchall(self):
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
    with pytest.raises(SystemExit, match="FAILED 030_agents.sql"):
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
