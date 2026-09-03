#!/usr/bin/env python3
"""
Diff two capture labels (e.g. default vs flipped) produced by capture.py.

    python tools/cutover_compare/diff.py --a default --b flipped

For every (role, endpoint) captured under both labels it compares HTTP status
and the normalized body. Any difference is a real cutover finding: the
CAFC_DB.APP_COMPAT layer returned something the legacy layer didn't (or a role's
access changed). Exits non-zero if anything differs or is missing.

Only the Python standard library is used.
"""
import argparse
import difflib
import json
import os
import sys

GREEN, RED, YELLOW, DIM, RESET = "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[0m"


def load(path):
    with open(path) as f:
        return json.load(f)


def pretty(body):
    return json.dumps(body, indent=2, sort_keys=True, default=str).splitlines()


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--a", required=True, help="first label dir name (e.g. default)")
    ap.add_argument("--b", required=True, help="second label dir name (e.g. flipped)")
    ap.add_argument("--out", default="tools/cutover_compare/out")
    ap.add_argument("--max-diff-lines", type=int, default=60,
                    help="cap unified-diff lines printed per endpoint")
    args = ap.parse_args()

    dir_a = os.path.join(args.out, args.a)
    dir_b = os.path.join(args.out, args.b)
    for d in (dir_a, dir_b):
        if not os.path.isdir(d):
            sys.exit(f"missing capture dir: {d}")

    roles = sorted(set(os.listdir(dir_a)) | set(os.listdir(dir_b)))
    n_ok = n_diff = n_status = n_missing = 0

    for role in roles:
        ra, rb = os.path.join(dir_a, role), os.path.join(dir_b, role)
        files = sorted(
            set(os.listdir(ra) if os.path.isdir(ra) else [])
            | set(os.listdir(rb) if os.path.isdir(rb) else [])
        )
        print(f"\n=== role: {role} ===")
        for fn in files:
            if not fn.endswith(".json"):
                continue
            name = fn[:-5]
            pa, pb = os.path.join(ra, fn), os.path.join(rb, fn)
            if not os.path.exists(pa) or not os.path.exists(pb):
                where = args.b if not os.path.exists(pb) else args.a
                print(f"  {YELLOW}MISSING{RESET} {name} (absent in '{where}')")
                n_missing += 1
                continue

            a, b = load(pa), load(pb)
            if a.get("status") != b.get("status"):
                print(f"  {RED}STATUS  {RESET} {name}: {args.a}=HTTP {a.get('status')} "
                      f"vs {args.b}=HTTP {b.get('status')}")
                n_status += 1
                continue

            if a.get("body") == b.get("body"):
                print(f"  {GREEN}OK      {RESET} {name} (HTTP {a.get('status')})")
                n_ok += 1
            else:
                print(f"  {RED}DIFF    {RESET} {name} (HTTP {a.get('status')})")
                n_diff += 1
                diff = list(difflib.unified_diff(
                    pretty(a.get("body")), pretty(b.get("body")),
                    fromfile=f"{args.a}/{role}/{name}", tofile=f"{args.b}/{role}/{name}",
                    lineterm="",
                ))
                shown = diff[:args.max_diff_lines]
                for line in shown:
                    color = GREEN if line.startswith("+") else RED if line.startswith("-") else DIM
                    print(f"      {color}{line}{RESET}")
                if len(diff) > len(shown):
                    print(f"      {DIM}... ({len(diff) - len(shown)} more diff lines){RESET}")

    print(f"\nSummary: {GREEN}{n_ok} OK{RESET}, {RED}{n_diff} DIFF{RESET}, "
          f"{RED}{n_status} STATUS{RESET}, {YELLOW}{n_missing} MISSING{RESET}")
    sys.exit(0 if (n_diff == n_status == n_missing == 0) else 1)


if __name__ == "__main__":
    main()
