"""
Runner for the normalization migrations in backend/migrations/normalization/.

Default is a DRY RUN: it prints the rendered statements and touches nothing.

    python tools/run_normalization_migrations.py                      # dry run, all migrations
    python tools/run_normalization_migrations.py --apply              # apply NNN_*.sql in order
    python tools/run_normalization_migrations.py --validate           # run validate/ only
    python tools/run_normalization_migrations.py --validate --strict  # warnings become failures
    python tools/run_normalization_migrations.py --mark-cutover recommendations
    python tools/run_normalization_migrations.py --contract recommendations --apply

Rehearse in a dev schema first:  --core CAFC_DB.CORE_DEV_<you>
(the snapshot schema defaults to <core schema>_PRE_NORMALIZATION in the same database).

Safety rules enforced here:
  * files tagged `-- @sync-until-cutover: <domain>` rebuild derived tables; once
    `--mark-cutover <domain>` is recorded they are refused (the app owns that data now);
  * contract/ scripts run only with --contract <domain>, only after that domain is marked
    cut over, and only if validation (strict) passes first;
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


# --------------------------------------------------------------------------------------
# Pure helpers (unit-tested; no Snowflake needed)
# --------------------------------------------------------------------------------------
def validate_qualified_name(value: str, what: str) -> str:
    if not QUALIFIED_NAME.match(value):
        raise ValueError(f"{what} must look like DATABASE.SCHEMA, got {value!r}")
    return value


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


# --------------------------------------------------------------------------------------
# Snowflake-facing code
# --------------------------------------------------------------------------------------
def connect():  # pragma: no cover - needs a live account
    import snowflake.connector
    from cryptography.hazmat.backends import default_backend
    from cryptography.hazmat.primitives import serialization
    from dotenv import load_dotenv

    load_dotenv()
    key_path = os.getenv("SNOWFLAKE_DEV_PRIVATE_KEY_PATH") or os.getenv("SNOWFLAKE_PRIVATE_KEY_PATH")
    if not key_path:
        raise SystemExit("set SNOWFLAKE_DEV_PRIVATE_KEY_PATH or SNOWFLAKE_PRIVATE_KEY_PATH")
    with open(key_path, "rb") as fh:
        key = serialization.load_pem_private_key(fh.read(), password=None, backend=default_backend())
    der = key.private_bytes(
        serialization.Encoding.DER, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    )
    return snowflake.connector.connect(
        user=os.getenv("SNOWFLAKE_DEV_USERNAME") or os.getenv("SNOWFLAKE_USERNAME"),
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


def is_cut_over(cur, core: str, domain: str) -> bool:
    cur.execute(
        f"SELECT COUNT(*) FROM {core}.{LEDGER} WHERE KIND = 'CUTOVER' AND VERSION = %s", (domain,)
    )
    return cur.fetchone()[0] > 0


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
    parser.add_argument("--core", default=os.getenv("NORMALIZATION_CORE", "CAFC_DB.CORE"))
    parser.add_argument("--snapshot", default=None, help="default: <core>_PRE_NORMALIZATION")
    parser.add_argument("--apply", action="store_true", help="execute (default is a dry run)")
    parser.add_argument("--only", default=None, help="run only the migration whose file name starts with this (e.g. 020)")
    parser.add_argument("--validate", action="store_true", help="run the validate/ queries only")
    parser.add_argument("--strict", action="store_true", help="treat warn_* validation rows as failures")
    parser.add_argument("--mark-cutover", metavar="DOMAIN", help="record that the app now owns DOMAIN's new tables")
    parser.add_argument("--contract", metavar="DOMAIN", help="run contract/<DOMAIN>.sql (destructive)")
    args = parser.parse_args(argv)

    core = validate_qualified_name(args.core, "--core")
    snapshot = validate_qualified_name(args.snapshot or default_snapshot(core), "--snapshot")
    tokens = {"CORE": core, "SNAPSHOT": snapshot}

    if args.mark_cutover and (args.contract or args.validate):
        parser.error("--mark-cutover cannot be combined with --contract/--validate")

    # ---- selection -----------------------------------------------------------------
    plan: List[Tuple[str, str, str, Optional[str]]] = []  # (version, kind, rendered sql, sync domain)
    if args.contract:
        path = contract_file(args.contract)
        raw = path.read_text()
        plan.append((f"contract/{args.contract}", "CONTRACT", render(raw, tokens), None))
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
