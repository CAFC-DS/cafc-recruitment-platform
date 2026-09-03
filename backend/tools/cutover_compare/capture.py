#!/usr/bin/env python3
"""
Capture templated-read endpoint responses for the canonical-cutover comparison.

Idea: run the backend twice — once on the DEFAULT seam config, once FLIPPED to
CAFC_DB.APP_COMPAT — capturing the same endpoints each time. diff.py then proves
the new canonical layer returns the same data as legacy RECRUITMENT_TEST.PUBLIC,
for every role.

Workflow
--------
1. Start backend on defaults:
       cd backend && python main.py
   Capture (from the backend/ dir):
       python tools/cutover_compare/capture.py --label default \
              --creds-file tools/cutover_compare/creds.json

2. Restart backend flipped:
       CANONICAL_DB=CAFC_DB PLATFORM_DB_SCHEMA=APP_COMPAT CORE_DB_SCHEMA=CORE python main.py
   Capture again:
       python tools/cutover_compare/capture.py --label flipped \
              --creds-file tools/cutover_compare/creds.json

3. Diff:
       python tools/cutover_compare/diff.py --a default --b flipped

Single-role mode (no creds file):
       python tools/cutover_compare/capture.py --label default \
              --role admin --user <u> --password <p>

Only the Python standard library is used.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

# Endpoints that Phase 1+2 templated. {player_id} is filled from a live search.
ENDPOINTS = [
    {"name": "search", "path": "/players/search", "query": {"limit": 10}},  # query= filled from --search-seed
    {"name": "profile", "path": "/players/{player_id}/profile", "needs_player_id": True},
    {"name": "analytics_timeline", "path": "/analytics/timeline"},
    {"name": "analytics_daily", "path": "/analytics/timeline-daily", "query": {"days": 30}},
    {"name": "intel_all", "path": "/intel_reports/all", "query": {"page": 1, "limit": 10}},
    {"name": "agents_recs", "path": "/agents/recommendations"},
    {"name": "internal_recs", "path": "/internal/recommendations"},
]

# Keys whose values are generated at request time (not data) — blanked so they
# don't show up as false-positive diffs. Real data timestamps are left intact.
DEFAULT_VOLATILE = {"generated_at", "server_time", "request_id", "as_of", "elapsed_ms"}

# Candidate id keys, in the order we prefer when deriving a player id from search.
ID_KEYS = ["player_id", "playerId", "PLAYER_ID", "playerid", "PLAYERID",
           "cafc_player_id", "CAFC_PLAYER_ID", "id", "ID"]


def login(base, username, password):
    data = urllib.parse.urlencode(
        {"username": username, "password": password, "grant_type": "password"}
    ).encode()
    req = urllib.request.Request(
        base + "/token", data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)["access_token"]


def http_get(base, path, token, query=None):
    url = base + path
    if query:
        url += "?" + urllib.parse.urlencode(query)
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            raw = r.read().decode() or "null"
            return r.status, _maybe_json(raw)
    except urllib.error.HTTPError as e:
        return e.code, _maybe_json(e.read().decode())
    except Exception as e:  # connection refused, timeout, etc.
        return None, {"_error": str(e)}


def _maybe_json(raw):
    try:
        return json.loads(raw)
    except Exception:
        return raw


def normalize(obj, sort_lists, volatile):
    if isinstance(obj, dict):
        return {
            k: ("<volatile>" if k.lower() in volatile else normalize(v, sort_lists, volatile))
            for k, v in sorted(obj.items())
        }
    if isinstance(obj, list):
        items = [normalize(v, sort_lists, volatile) for v in obj]
        if sort_lists:
            items = sorted(items, key=lambda x: json.dumps(x, sort_keys=True, default=str))
        return items
    return obj


def find_player_id(obj):
    """Breadth-first search for the first numeric id-like value."""
    queue = [obj]
    while queue:
        cur = queue.pop(0)
        if isinstance(cur, dict):
            for k in ID_KEYS:
                if k in cur:
                    v = cur[k]
                    if isinstance(v, int):
                        return v
                    if isinstance(v, str) and v.isdigit():
                        return int(v)
            queue.extend(cur.values())
        elif isinstance(cur, list):
            queue.extend(cur)
    return None


def capture_role(base, role, username, password, outdir, seed, player_id_override,
                 sort_lists, volatile):
    print(f"  [{role}] logging in...", flush=True)
    try:
        token = login(base, username, password)
    except Exception as e:
        print(f"  [{role}] LOGIN FAILED: {e}", file=sys.stderr)
        return 0

    role_dir = os.path.join(outdir, role)
    os.makedirs(role_dir, exist_ok=True)
    player_id = player_id_override
    written = 0

    for ep in ENDPOINTS:
        query = dict(ep.get("query", {}))
        if ep["name"] == "search":
            query["query"] = seed

        path = ep["path"]
        if ep.get("needs_player_id"):
            if player_id is None:
                print(f"  [{role}] {ep['name']}: skipped (no player id derived from search)")
                continue
            path = path.replace("{player_id}", str(player_id))

        status, body = http_get(base, path, token, query or None)
        record = {
            "endpoint": ep["name"],
            "request": path + ("?" + urllib.parse.urlencode(query) if query else ""),
            "status": status,
            "body": normalize(body, sort_lists, volatile),
        }
        with open(os.path.join(role_dir, ep["name"] + ".json"), "w") as f:
            json.dump(record, f, indent=2, sort_keys=True, default=str)
        written += 1
        print(f"  [{role}] {ep['name']}: HTTP {status}")

        # Derive a player id from the first search response for the profile call.
        if ep["name"] == "search" and player_id is None:
            player_id = find_player_id(body)
            if player_id is not None:
                print(f"  [{role}] derived player_id={player_id} for profile call")

    return written


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--label", required=True, help="e.g. 'default' or 'flipped'")
    ap.add_argument("--base-url", default="http://localhost:8000")
    ap.add_argument("--out", default="tools/cutover_compare/out",
                    help="base output dir (label subdir created under it)")
    ap.add_argument("--creds-file", help="JSON {role: {username, password}} — loops all roles")
    ap.add_argument("--role")
    ap.add_argument("--user")
    ap.add_argument("--password")
    ap.add_argument("--search-seed", default="a", help="query string for /players/search")
    ap.add_argument("--player-id", type=int, help="override the profile player id")
    ap.add_argument("--no-sort-lists", action="store_true",
                    help="don't order-normalize lists (keeps server ordering)")
    ap.add_argument("--volatile-key", action="append", default=[],
                    help="extra key to blank as request-time-volatile (repeatable)")
    args = ap.parse_args()

    volatile = {k.lower() for k in DEFAULT_VOLATILE} | {k.lower() for k in args.volatile_key}
    sort_lists = not args.no_sort_lists

    if args.creds_file:
        with open(args.creds_file) as f:
            creds = json.load(f)
    elif args.role and args.user and args.password is not None:
        creds = {args.role: {"username": args.user, "password": args.password}}
    else:
        ap.error("provide --creds-file OR --role/--user/--password")

    outdir = os.path.join(args.out, args.label)
    os.makedirs(outdir, exist_ok=True)
    print(f"Capturing label='{args.label}' from {args.base_url} -> {outdir}")

    total = 0
    for role, c in creds.items():
        total += capture_role(args.base_url, role, c["username"], c["password"],
                              outdir, args.search_seed, args.player_id,
                              sort_lists, volatile)
    print(f"Done. Wrote {total} response files under {outdir}")


if __name__ == "__main__":
    main()
