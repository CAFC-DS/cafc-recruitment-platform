"""
Runner for the normalization migrations in backend/migrations/normalization/.

Default is a DRY RUN: it prints the rendered statements and touches nothing.

    python tools/run_normalization_migrations.py                      # dry run, all migrations
    python tools/run_normalization_migrations.py --apply              # apply NNN_*.sql in order
    python tools/run_normalization_migrations.py --validate           # run validate/ only
    python tools/run_normalization_migrations.py --validate --strict  # warnings become failures
    python tools/run_normalization_migrations.py --mark-cutover recommendations
    python tools/run_normalization_migrations.py --parity                          # compat view == legacy table?
    python tools/run_normalization_migrations.py --swap recommendations --apply    # legacy name becomes a view
    python tools/run_normalization_migrations.py --swap-rollback recommendations --apply
    python tools/run_normalization_migrations.py --contract recommendations --apply
    python tools/run_normalization_migrations.py --cleanup sharing --apply         # delete-policy cleanup of orphans

Rehearse in a dev schema first:  --core CAFC_DB.CORE_DEV_<you>
(the snapshot schema defaults to <core schema>_PRE_NORMALIZATION in the same database).

Safety rules enforced here:
  * files tagged `-- @sync-until-cutover: <domain>` rebuild derived tables; once
    `--mark-cutover <domain>` is recorded they are refused (the app owns that data now);
  * contract/ scripts run only with --contract <domain>, only after that domain is marked
    cut over, and only if validation (strict) passes first;
  * cleanup/ scripts (orphan rows, per the delete policy: dependents of a deleted report are deleted, rows about a
    deleted user are archived) run only with --cleanup <domain> --apply, and only when the snapshot schema exists;
  * --swap renames the legacy table to <name>_LEGACY and creates a view with the legacy NAME over the
    normalized tables. It runs only if the domain is marked cut over (the app already writes the normalized
    tables) AND parity (parity/*.sql: the view equals the legacy table exactly) is clean;
  * --swap-rollback copies the normalized data back into the legacy table, restores the name, and un-marks
    the cutover so the derived tables can be re-synced;
  * a failed statement triggers ROLLBACK and stops the run.

Connection settings mirror backend/tools/backfill_stage_history_changed_at.py.
"""
import argparse
import hashlib
import os
import re
import sys
from pathlib import Path
from typing import Dict, Iterator, List, Optional, Tuple

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations" / "normalization"
QUALIFIED_NAME = re.compile(r"^[A-Za-z0-9_$]+(\.[A-Za-z0-9_$]+){1,2}$")
TOKEN = re.compile(r"\$\{([A-Z_]+)\}")
SYNC_TAG = re.compile(r"^--\s*@sync-until-cutover:\s*([a-z_]+)\s*$", re.MULTILINE)
LEDGER = "SCHEMA_MIGRATIONS"
# Targets the runner will never write to without --allow-production.
#   PROTECTED_TARGETS   exact DATABASE.SCHEMA names (the live app schemas)
#   PROTECTED_DATABASES whole databases
# Override with NORMALIZATION_PROTECTED_TARGETS / NORMALIZATION_PROTECTED_DATABASES (comma lists).
def _env_set(name: str, default: str) -> set:
    return {d.strip().upper() for d in os.getenv(name, default).split(",") if d.strip()}


PROTECTED_TARGETS = _env_set("NORMALIZATION_PROTECTED_TARGETS", "CAFC_DB.CORE,CAFC_DB.APP,CAFC_DB.APP_COMPAT")
PROTECTED_DATABASES = _env_set("NORMALIZATION_PROTECTED_DATABASES", "RECRUITMENT_TEST")
DEFAULT_SANDBOX = "CAFC_DB.CORE_DEV_NORMALIZATION"   # schema clone: DEV_ROLE cannot CREATE DATABASE
DEFAULT_SANDBOX_SOURCE = "CAFC_DB.CORE"


# --------------------------------------------------------------------------------------
# Pure helpers (unit-tested; no Snowflake needed)
# --------------------------------------------------------------------------------------
def validate_qualified_name(value: str, what: str) -> str:
    if not QUALIFIED_NAME.match(value):
        raise ValueError(f"{what} must look like DATABASE.SCHEMA, got {value!r}")
    return value


def is_protected(target: str) -> bool:
    """True for a live app schema (CAFC_DB.CORE ...) or anything inside a protected database."""
    parts = validate_qualified_name(target, "target").upper().split(".")
    if parts[0] in PROTECTED_DATABASES:
        return True
    return ".".join(parts[:2]) in PROTECTED_TARGETS


def assert_writable(core: str, allow_production: bool) -> None:
    """Refuse writes to a live app schema unless explicitly overridden."""
    if is_protected(core) and not allow_production:
        raise SystemExit(
            f"refusing to write to protected target {core.upper()}. Clone it and target the clone:\n"
            f"  python tools/run_normalization_migrations.py --create-sandbox --apply\n"
            f"  python tools/run_normalization_migrations.py --core {DEFAULT_SANDBOX} --apply\n"
            f"(override only for a reviewed production run: --allow-production)"
        )


def make_tokens(core: str, snapshot: str, legacy_suffix: str = "") -> Dict[str, str]:
    """Tokens available to every SQL file. CORE is DATABASE.SCHEMA; CORE_DB / CORE_SCHEMA are its parts."""
    parts = core.split(".")
    if len(parts) != 2:
        raise ValueError(f"--core must be DATABASE.SCHEMA, got {core!r}")
    if legacy_suffix and not re.match(r"^_[A-Z0-9_]+$", legacy_suffix):
        raise ValueError(f"--legacy-suffix must look like _LEGACY, got {legacy_suffix!r}")
    return {"CORE": core, "SNAPSHOT": snapshot, "CORE_DB": parts[0], "CORE_SCHEMA": parts[1].upper(),
            "LEGACY_SUFFIX": legacy_suffix}


RECOVERY_TAG = re.compile(r"^--\s*@recovery:\s*(.+)$", re.MULTILINE)


def recovery_statement(raw_sql: str, tokens: Dict[str, str]) -> Optional[str]:
    """The `-- @recovery: <sql>` line of a swap script, rendered, or None."""
    match = RECOVERY_TAG.search(raw_sql)
    return render(match.group(1).strip(), tokens) if match else None


def swap_file(domain: str, rollback: bool = False, directory: Path = MIGRATIONS_DIR) -> Path:
    name = f"{domain}_rollback" if rollback else domain
    path = directory / "swap" / f"{name}.sql"
    if not re.match(r"^[a-z_]+$", domain) or not path.exists():
        available = sorted(p.stem for p in (directory / "swap").glob("*.sql") if not p.stem.endswith("_rollback"))
        raise SystemExit(f"unknown swap domain {domain!r}; available: {available}")
    return path


def default_snapshot(core: str) -> str:
    parts = validate_qualified_name(core, "--core").split(".")
    return ".".join(parts[:-1] + [parts[-1] + "_PRE_NORMALIZATION"])


def render(sql: str, tokens: Dict[str, str]) -> str:
    """Substitute ${NAME} tokens; an unknown token is an error, never passed through."""

    def sub(match: "re.Match[str]") -> str:
        name = match.group(1)
        if name not in tokens:
            raise KeyError(f"unknown token ${{{name}}}")
        return tokens[name]

    return TOKEN.sub(sub, sql)


def split_statements(sql: str) -> List[str]:
    """Split a SQL script on top-level semicolons.

    Understands -- and /* */ comments (dropped), single-quoted strings ('' and backslash
    escapes), and $$ ... $$ bodies (kept intact, so UDF bodies may contain semicolons).
    Empty statements are discarded.
    """
    statements: List[str] = []
    buf: List[str] = []
    i, n = 0, len(sql)
    while i < n:
        ch = sql[i]
        two = sql[i : i + 2]
        if two == "--":
            j = sql.find("\n", i)
            i = n if j == -1 else j  # keep the newline
            continue
        if two == "/*":
            j = sql.find("*/", i + 2)
            if j == -1:
                raise ValueError("unterminated /* comment")
            i = j + 2
            continue
        if two == "$$":
            j = sql.find("$$", i + 2)
            if j == -1:
                raise ValueError("unterminated $$ block")
            buf.append(sql[i : j + 2])
            i = j + 2
            continue
        if ch == "'":
            j = i + 1
            while j < n:
                if sql[j] == "\\":
                    j += 2
                    continue
                if sql[j] == "'":
                    if sql[j + 1 : j + 2] == "'":
                        j += 2
                        continue
                    break
                j += 1
            else:
                raise ValueError("unterminated string literal")
            buf.append(sql[i : j + 1])
            i = j + 1
            continue
        if ch == ";":
            stmt = "".join(buf).strip()
            if stmt:
                statements.append(stmt)
            buf = []
            i += 1
            continue
        buf.append(ch)
        i += 1
    tail = "".join(buf).strip()
    if tail:
        statements.append(tail)
    return statements


def checksum(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sync_domain(raw_sql: str) -> Optional[str]:
    match = SYNC_TAG.search(raw_sql)
    return match.group(1) if match else None


def discover_migrations(directory: Path = MIGRATIONS_DIR) -> List[Path]:
    """NNN_*.sql in numeric order. validate/ and contract/ are separate and never included."""
    files = [p for p in directory.glob("*.sql") if re.match(r"^\d{3}_", p.name)]
    return sorted(files, key=lambda p: p.name)


def discover_validations(directory: Path = MIGRATIONS_DIR) -> List[Tuple[Path, bool]]:
    """(file, is_warning). Files named warn_* are informational unless --strict."""
    files = sorted((directory / "validate").glob("*.sql"), key=lambda p: p.name)
    return [(p, p.name.startswith("warn_")) for p in files]


def contract_file(domain: str, directory: Path = MIGRATIONS_DIR) -> Path:
    path = directory / "contract" / f"{domain}.sql"
    if not re.match(r"^[a-z_]+$", domain) or not path.exists():
        available = sorted(p.stem for p in (directory / "contract").glob("*.sql"))
        raise SystemExit(f"unknown contract domain {domain!r}; available: {available}")
    return path


def cleanup_file(domain: str, directory: Path = MIGRATIONS_DIR) -> Path:
    path = directory / "cleanup" / f"{domain}.sql"
    if not re.match(r"^[a-z_]+$", domain) or not path.exists():
        available = sorted(p.stem for p in (directory / "cleanup").glob("*.sql"))
        raise SystemExit(f"unknown cleanup domain {domain!r}; available: {available}")
    return path


# --------------------------------------------------------------------------------------
# Snowflake-facing code
# --------------------------------------------------------------------------------------
def connect():  # pragma: no cover - needs a live account
    import snowflake.connector
    from cryptography.hazmat.backends import default_backend
    from cryptography.hazmat.primitives import serialization
    from dotenv import load_dotenv

    load_dotenv()
    inline_key = os.getenv("SNOWFLAKE_PRIVATE_KEY")  # inline PEM (CI / hosted sessions)
    if inline_key and inline_key.strip().startswith("-----BEGIN"):
        pem = inline_key.encode()
    else:
        key_path = os.getenv("SNOWFLAKE_DEV_PRIVATE_KEY_PATH") or os.getenv("SNOWFLAKE_PRIVATE_KEY_PATH")
        if not key_path:
            raise SystemExit("set SNOWFLAKE_PRIVATE_KEY (inline PEM) or SNOWFLAKE_[DEV_]PRIVATE_KEY_PATH")
        with open(key_path, "rb") as fh:
            pem = fh.read()
    key = serialization.load_pem_private_key(pem, password=None, backend=default_backend())
    der = key.private_bytes(
        serialization.Encoding.DER, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    )
    return snowflake.connector.connect(
        user=os.getenv("SNOWFLAKE_DEV_USERNAME") or os.getenv("SNOWFLAKE_USERNAME") or os.getenv("SNOWFLAKE_USER"),
        account=os.getenv("SNOWFLAKE_DEV_ACCOUNT") or os.getenv("SNOWFLAKE_ACCOUNT"),
        warehouse=os.getenv("SNOWFLAKE_DEV_WAREHOUSE") or os.getenv("SNOWFLAKE_WAREHOUSE"),
        database=os.getenv("SNOWFLAKE_DEV_DATABASE") or os.getenv("SNOWFLAKE_DATABASE"),
        role=os.getenv("NORMALIZATION_ROLE") or os.getenv("SNOWFLAKE_DEV_ROLE") or os.getenv("SNOWFLAKE_ROLE"),
        private_key=der,
        session_parameters={"QUERY_TAG": "normalization-migration"},
    )


def ensure_ledger(cur, core: str) -> None:
    cur.execute(
        f"""CREATE TABLE IF NOT EXISTS {core}.{LEDGER} (
            VERSION    VARCHAR(200) NOT NULL,
            KIND       VARCHAR(20)  NOT NULL,
            CHECKSUM   VARCHAR(64),
            APPLIED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
            APPLIED_BY VARCHAR(255) DEFAULT CURRENT_USER()
        )"""
    )


def record(cur, core: str, version: str, kind: str, digest: Optional[str]) -> None:
    cur.execute(
        f"INSERT INTO {core}.{LEDGER} (VERSION, KIND, CHECKSUM) VALUES (%s, %s, %s)",
        (version, kind, digest),
    )


def _latest_kind(cur, core: str, domain: str, kinds: Tuple[str, str]) -> Optional[str]:
    cur.execute(
        f"SELECT KIND FROM {core}.{LEDGER} WHERE VERSION = %s AND KIND IN ('{kinds[0]}', '{kinds[1]}') "
        f"ORDER BY APPLIED_AT DESC LIMIT 1",
        (domain,),
    )
    row = cur.fetchone()
    return row[0] if row else None


def is_cut_over(cur, core: str, domain: str) -> bool:
    """Latest of CUTOVER / UNCUTOVER for the domain (a rollback un-marks it)."""
    return _latest_kind(cur, core, domain, ("CUTOVER", "UNCUTOVER")) == "CUTOVER"


def is_swapped(cur, core: str, domain: str) -> bool:
    """Latest of SWAP / SWAPBACK for the domain."""
    return _latest_kind(cur, core, domain, ("SWAP", "SWAPBACK")) == "SWAP"


def run_parity(cur, tokens: Dict[str, str], core: Optional[str] = None) -> int:
    """Run parity/*.sql; every statement must return zero rows. Returns the number of failing statements.

    Domains swap one at a time, so each parity file (named for its domain) compares against the legacy table under
    that domain's own name: '_LEGACY' once the ledger says the domain is swapped, the plain name before. An explicit
    --legacy-suffix (tokens already non-empty) applies to every domain and skips the ledger lookup."""
    failures = 0
    for path in sorted((MIGRATIONS_DIR / "parity").glob("*.sql")):
        file_tokens = tokens
        if core and not tokens.get("LEGACY_SUFFIX"):
            try:
                swapped = is_swapped(cur, core, path.stem)
            except Exception:  # noqa: BLE001 - no ledger yet means nothing has been swapped
                swapped = False
            file_tokens = {**tokens, "LEGACY_SUFFIX": "_LEGACY" if swapped else ""}
        for stmt in split_statements(render(path.read_text(), file_tokens)):
            cur.execute(stmt)
            rows = cur.fetchall()
            if rows:
                failures += 1
                print(f"[PARITY FAIL] {path.name}: {len(rows)} row(s)")
                for row in rows[:10]:
                    print("        ", tuple(row))
    return failures


def run_statements(cur, statements: List[str], label: str) -> None:
    for index, stmt in enumerate(statements, 1):
        try:
            cur.execute(stmt)
        except Exception as exc:  # noqa: BLE001 - we re-raise after rollback
            try:
                cur.execute("ROLLBACK")
            except Exception:  # noqa: BLE001
                pass
            first_line = stmt.strip().splitlines()[0][:120]
            raise SystemExit(f"FAILED {label} statement {index}/{len(statements)}: {first_line}\n  -> {exc}")


def run_validations(cur, tokens: Dict[str, str], strict: bool) -> int:
    """Return the number of failing checks. Hard checks fail on any row; warn_* only under --strict."""
    failures = 0
    for path, is_warning in discover_validations():
        for stmt in split_statements(render(path.read_text(), tokens)):
            cur.execute(stmt)
            rows = cur.fetchall()
            if not rows:
                continue
            label = "WARN" if is_warning else "FAIL"
            counts_as_failure = (not is_warning) or strict
            print(f"[{label}] {path.name}: {len(rows)} row(s)")
            for row in rows[:10]:
                print("        ", tuple(row))
            if len(rows) > 10:
                print(f"         ... {len(rows) - 10} more")
            if counts_as_failure:
                failures += 1
    return failures


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--core", default=os.getenv("NORMALIZATION_CORE", "CAFC_DB.CORE"),
                        help="DATABASE.SCHEMA to operate on (writes to a live app schema are refused)")
    parser.add_argument("--create-sandbox", nargs="?", const=DEFAULT_SANDBOX, metavar="NAME",
                        help=f"zero-copy clone into a sandbox that is safe to migrate (default {DEFAULT_SANDBOX}). "
                             "NAME is DATABASE.SCHEMA (schema clone) or DATABASE (database clone, needs CREATE DATABASE). "
                             "Uses IF NOT EXISTS: never replaces an existing sandbox.")
    parser.add_argument("--source", default=None,
                        help=f"what --create-sandbox clones (default {DEFAULT_SANDBOX_SOURCE}, or CAFC_DB for a database clone)")
    parser.add_argument("--allow-production", action="store_true", help="permit writes to a live app schema (reviewed production run only)")
    parser.add_argument("--snapshot", default=None, help="default: <core>_PRE_NORMALIZATION")
    parser.add_argument("--apply", action="store_true", help="execute (default is a dry run)")
    parser.add_argument("--only", default=None, help="run only the migration whose file name starts with this (e.g. 020)")
    parser.add_argument("--validate", action="store_true", help="run the validate/ queries only")
    parser.add_argument("--strict", action="store_true", help="treat warn_* validation rows as failures")
    parser.add_argument("--mark-cutover", metavar="DOMAIN", help="record that the app now owns DOMAIN's new tables")
    parser.add_argument("--contract", metavar="DOMAIN", help="run contract/<DOMAIN>.sql (destructive)")
    parser.add_argument("--cleanup", metavar="DOMAIN", help="run cleanup/<DOMAIN>.sql (deletes/archives orphan rows; needs the snapshot)")
    parser.add_argument("--parity", action="store_true", help="read-only: check the compat views equal the legacy tables")
    parser.add_argument("--legacy-suffix", default="", help="suffix of the renamed legacy table for --parity after a swap (e.g. _LEGACY)")
    parser.add_argument("--swap", metavar="DOMAIN", help="rename the legacy table to *_LEGACY and put the compat view under the legacy name")
    parser.add_argument("--swap-rollback", metavar="DOMAIN", help="undo --swap: copy data back into the legacy table and restore the name")
    args = parser.parse_args(argv)

    if args.create_sandbox:
        name = args.create_sandbox.upper()
        is_schema = "." in name
        validate_qualified_name(name if is_schema else name + ".X", "--create-sandbox")
        source = (args.source or (DEFAULT_SANDBOX_SOURCE if is_schema else "CAFC_DB")).upper()
        validate_qualified_name(source if is_schema else source + ".X", "--source")
        if is_protected(name if is_schema else name + ".X") or name == source:
            parser.error(f"{name} is a live/protected target; choose a different sandbox name")
        kind = "SCHEMA" if is_schema else "DATABASE"
        ddl = f"CREATE {kind} IF NOT EXISTS {name} CLONE {source}"
        if not args.apply:
            print(f"-- DRY RUN\n{ddl};\n-- Re-run with --apply. Then: --core {name if is_schema else name + '.CORE'} --apply")
            return 0
        conn = connect()  # pragma: no cover
        cur = conn.cursor()
        try:
            cur.execute(ddl)
            target = name if is_schema else name + ".CORE"
            print(f"sandbox ready: {name} (zero-copy clone of {source}). Next:\n"
                  f"  python tools/run_normalization_migrations.py --core {target} --apply")
            return 0
        finally:
            cur.close()
            conn.close()

    core = validate_qualified_name(args.core, "--core")
    writes = args.apply or bool(args.mark_cutover)
    if writes:
        assert_writable(core, args.allow_production)
    snapshot = validate_qualified_name(args.snapshot or default_snapshot(core), "--snapshot")
    try:
        tokens = make_tokens(core, snapshot, args.legacy_suffix)
    except ValueError as exc:
        parser.error(str(exc))

    exclusive = [bool(args.mark_cutover), bool(args.contract), bool(args.cleanup), args.validate, args.parity,
                 bool(args.swap), bool(args.swap_rollback)]
    if sum(exclusive) > 1:
        parser.error("--mark-cutover, --contract, --cleanup, --validate, --parity, --swap and --swap-rollback "
                     "are mutually exclusive")

    # ---- swap / swap-rollback: rendered up front so a dry run shows exactly what would run ----
    swap_domain = args.swap or args.swap_rollback
    if swap_domain:
        rollback = bool(args.swap_rollback)
        swap_sql = render(swap_file(swap_domain, rollback).read_text(), tokens)
        if not args.apply:
            print(f"-- DRY RUN: {'ROLLBACK of ' if rollback else ''}SWAP {swap_domain}, core={core}")
            for stmt in split_statements(swap_sql):
                print(stmt + ";\n")
            return 0
        conn = connect()  # pragma: no cover
        cur = conn.cursor()
        try:
            ensure_ledger(cur, core)
            if rollback:
                if not is_swapped(cur, core, swap_domain):
                    raise SystemExit(f"refusing rollback: {swap_domain!r} is not currently swapped")
            else:
                if is_swapped(cur, core, swap_domain):
                    raise SystemExit(f"refusing swap: {swap_domain!r} is already swapped")
                if not is_cut_over(cur, core, swap_domain):
                    raise SystemExit(f"refusing swap: {swap_domain!r} is not marked cut over "
                                     f"(the app must already write the normalized tables; use --mark-cutover)")
                print("checking parity before the swap ...")
                if run_parity(cur, tokens, core):
                    raise SystemExit("refusing swap: the compat view does not equal the legacy table (see above)")
            statements = split_statements(swap_sql)
            print(f"applying {'rollback' if rollback else 'swap'} {swap_domain} ({len(statements)} statements) ...")
            try:
                run_statements(cur, statements, f"swap/{swap_domain}{'_rollback' if rollback else ''}")
            except SystemExit:
                hint = recovery_statement(swap_file(swap_domain, rollback).read_text(), tokens)
                if hint:
                    print("DDL cannot be rolled back. If the original table name no longer exists, restore it with:\n  " + hint)
                print("Inspect the objects (SHOW TABLES / SHOW VIEWS LIKE ...) before retrying.")
                raise
            if rollback:
                record(cur, core, swap_domain, "SWAPBACK", checksum(swap_sql))
                record(cur, core, swap_domain, "UNCUTOVER", None)
                print("rolled back; cutover un-marked so the derived tables can be re-synced from the legacy table")
            else:
                record(cur, core, swap_domain, "SWAP", checksum(swap_sql))
                print(f"swapped: the legacy name now resolves to the compat view over the normalized tables")
            return 0
        finally:
            cur.close()
            conn.close()

    if args.parity:
        conn = connect()  # pragma: no cover
        cur = conn.cursor()
        try:
            failures = run_parity(cur, tokens, core)
            print("parity:", "PASS (compat views equal the legacy tables)" if failures == 0 else f"{failures} failing statement(s)")
            return 0 if failures == 0 else 1
        finally:
            cur.close()
            conn.close()

    # ---- selection -----------------------------------------------------------------
    plan: List[Tuple[str, str, str, Optional[str]]] = []  # (version, kind, rendered sql, sync domain)
    if args.contract:
        path = contract_file(args.contract)
        raw = path.read_text()
        plan.append((f"contract/{args.contract}", "CONTRACT", render(raw, tokens), None))
    elif args.cleanup:
        raw = cleanup_file(args.cleanup).read_text()
        plan.append((f"cleanup/{args.cleanup}", "CLEANUP", render(raw, tokens), None))
    elif not args.validate and not args.mark_cutover:
        for path in discover_migrations():
            if args.only and not path.name.startswith(args.only):
                continue
            raw = path.read_text()
            plan.append((path.name, "MIGRATION", render(raw, tokens), sync_domain(raw)))
        if not plan:
            parser.error(f"no migration matches --only {args.only!r}")

    # ---- dry run -------------------------------------------------------------------
    if not args.apply and not args.validate and not args.mark_cutover:
        for version, kind, sql, domain in plan:
            stmts = split_statements(sql)
            tag = f"  [sync-until-cutover: {domain}]" if domain else ""
            print(f"-- {kind} {version}: {len(stmts)} statement(s){tag}")
            for stmt in stmts:
                print(stmt + ";\n")
        print(f"-- DRY RUN: {len(plan)} file(s), core={core}, snapshot={snapshot}. Re-run with --apply to execute.")
        return 0

    # ---- live ------------------------------------------------------------------------
    conn = connect()  # pragma: no cover
    cur = conn.cursor()
    try:
        if args.mark_cutover:
            if not re.match(r"^[a-z_]+$", args.mark_cutover):
                parser.error("domain must be lowercase letters/underscores")
            ensure_ledger(cur, core)
            record(cur, core, args.mark_cutover, "CUTOVER", None)
            print(f"recorded cutover for {args.mark_cutover!r}; its sync-until-cutover migrations are now refused")
            return 0

        if args.validate:
            failures = run_validations(cur, tokens, args.strict)
            print("validation:", "PASS" if failures == 0 else f"{failures} failing check file(s)")
            return 0 if failures == 0 else 1

        ensure_ledger(cur, core)
        for version, kind, sql, domain in plan:
            if kind == "CONTRACT":
                if not is_cut_over(cur, core, args.contract):
                    raise SystemExit(f"refusing contract/{args.contract}: domain not marked cut over")
                print("running strict validation before destructive contract step ...")
                if run_validations(cur, tokens, strict=True):
                    raise SystemExit("refusing contract step: validation (strict) failed")
            if kind == "CLEANUP":
                snap_db, snap_schema = snapshot.split(".")[0], snapshot.split(".")[-1].upper()
                cur.execute(f"SELECT COUNT(*) FROM {snap_db}.INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = %s", (snap_schema,))
                if cur.fetchone()[0] == 0:
                    raise SystemExit(f"refusing cleanup/{args.cleanup}: snapshot schema {snapshot} does not exist "
                                     f"(a --apply of 000_snapshot.sql creates it)")
            if domain and is_cut_over(cur, core, domain):
                print(f"SKIP {version}: domain {domain!r} is cut over (the app owns that data)")
                continue
            statements = split_statements(sql)
            print(f"applying {version} ({len(statements)} statements) ...")
            run_statements(cur, statements, version)
            record(cur, core, version, kind, checksum(sql))

        print("running validation ...")
        failures = run_validations(cur, tokens, args.strict)
        print("validation:", "PASS" if failures == 0 else f"{failures} failing check file(s)")
        return 0 if failures == 0 else 1
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
