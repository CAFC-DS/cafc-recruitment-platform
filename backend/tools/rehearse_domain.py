"""
Full rehearsal of one domain's cutover on throwaway clone schemas, end to end:

    python tools/rehearse_domain.py intel [--keep]

  1. (re)creates CORE_DEV_<DOMAIN> and CORE_DEV_<DOMAIN>_SWAP as zero-copy clones of the live CORE (read-only source)
  2. applies the migrations to the first; clones it into the second and re-applies there (a clone's views keep pointing at
     the SOURCE schema until the migrations are applied again)
  3. marks the domain cut over in the second, checks parity, swaps, checks parity again
  4. runs the write scenario through the real endpoints on both (legacy write path vs normalized write path) and diffs
  5. rolls the swap back in the second and checks that the legacy table holds every row the scenario wrote

Only schemas this script names itself are ever dropped, and only when the name matches ^CORE_DEV_[A-Z_]+$ and is not a
protected schema. Nothing touches live CORE / APP / APP_COMPAT / RECRUITMENT_TEST.
"""
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(HERE)
sys.path.insert(0, HERE)

DB = "CAFC_DB"
SAFE = re.compile(r"^CORE_DEV_[A-Z_]+$")


def run(cmd, env=None, allow_fail=False):
    full_env = {**os.environ, **(env or {})}
    print("+", " ".join(cmd))
    proc = subprocess.run(cmd, cwd=BACKEND, env=full_env, capture_output=True, text=True)
    lines = [ln for ln in (proc.stdout + proc.stderr).splitlines() if "warn" not in ln.lower() and "DEBUG" not in ln]
    print("\n".join(lines[-25:]))
    if proc.returncode and not allow_fail:
        sys.exit(f"step failed ({proc.returncode}): {' '.join(cmd)}")
    return proc.returncode, "\n".join(lines)


def drop_schema(name):
    from run_normalization_migrations import connect, is_protected

    if not SAFE.match(name) or is_protected(f"{DB}.{name}"):
        sys.exit(f"refusing to drop {name!r}: not a CORE_DEV_ rehearsal schema")
    conn = connect()
    cur = conn.cursor()
    try:
        cur.execute(f"DROP SCHEMA IF EXISTS {DB}.{name}")
        cur.execute(f"DROP SCHEMA IF EXISTS {DB}.{name}_PRE_NORMALIZATION")
    finally:
        cur.close()
        conn.close()


def main(domain, keep):
    tag = domain.upper()
    legacy_schema, swap_schema = f"CORE_DEV_{tag}", f"CORE_DEV_{tag}_SWAP"
    runner = [sys.executable, "tools/run_normalization_migrations.py"]
    scratch = os.environ.get("REHEARSAL_OUT", "/tmp")
    a, b = os.path.join(scratch, f"{domain}_legacy.json"), os.path.join(scratch, f"{domain}_normalized.json")

    for schema in (swap_schema, legacy_schema):
        drop_schema(schema)
    run(runner + ["--create-sandbox", f"{DB}.{legacy_schema}", "--apply"])
    run(runner + ["--core", f"{DB}.{legacy_schema}", "--apply"])
    run(runner + ["--create-sandbox", f"{DB}.{swap_schema}", "--source", f"{DB}.{legacy_schema}", "--apply"])
    run(runner + ["--core", f"{DB}.{swap_schema}", "--apply"])
    run(runner + ["--core", f"{DB}.{swap_schema}", "--mark-cutover", domain])
    run(runner + ["--core", f"{DB}.{swap_schema}", "--swap", domain, "--apply"])
    run(runner + ["--core", f"{DB}.{swap_schema}", "--parity"])

    env = {"CANONICAL_DB": DB, "PLATFORM_DB_SCHEMA": "APP_COMPAT"}
    scenario = [sys.executable, "tools/verify_write_compat.py", domain]
    run(scenario + [a], {**env, "CORE_DB_SCHEMA": legacy_schema})
    run(scenario + [b], {**env, "CORE_DB_SCHEMA": swap_schema})
    code, _ = run([sys.executable, "tools/verify_write_compat.py", "--diff", a, b], allow_fail=True)

    run(runner + ["--core", f"{DB}.{swap_schema}", "--swap-rollback", domain, "--apply"])
    run(runner + ["--core", f"{DB}.{swap_schema}", "--parity"])
    if not keep:
        print(f"(schemas {legacy_schema} and {swap_schema} kept for inspection; drop them by re-running or manually)")
    print("REHEARSAL", "PASS" if code == 0 else "DIFFERENCES FOUND (see above)")
    return code


if __name__ == "__main__":
    args = [x for x in sys.argv[1:] if not x.startswith("--")]
    if len(args) != 1:
        sys.exit(__doc__)
    sys.exit(main(args[0], "--keep" in sys.argv))
