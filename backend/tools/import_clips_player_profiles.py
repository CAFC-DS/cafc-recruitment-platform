"""
Import opposition player profiles as archived Clip reports.

Source: /Users/hashim.umarji/Desktop/Opposition Reports/League/Player Profiles - All Clubs.xlsx
Sheet:  "Player Profiles"  (cols: Half, Club, Match Date, No., Player, Notes Sentiment, Notes)

Each row -> a scout_reports row with REPORT_TYPE='Clips', IS_ARCHIVED=TRUE:
  PLAYER_ID/CAFC_PLAYER_ID  matched from PLAYERS (by Player name, Club to disambiguate)
  SUMMARY                   = "{Club} — {Notes}"  (Club folded in; match date/half/shirt are NOT)
  CLIP_CATEGORY             = Notes Sentiment (Positive/Neutral/Negative)
  POSITION                  = the matched player's PLAYERS.POSITION
  CREATED_AT                = Match Date
  USER_ID                   = the "Charlton Athletic Analysis Team" user (created if missing)
  MATCH_ID, BUILD, HEIGHT, STRENGTHS, WEAKNESSES, PERFORMANCE_SCORE, ... = left blank
    (old-style archived report; sparse data is expected/acceptable)

Prereq: CLIP_CATEGORY column must exist (run migrations/add_clip_category_to_scout_reports.sql
as an admin first). player_lists/scout_reports DML may need a privileged role — set
SNOWFLAKE_SEED_ROLE if the default role lacks INSERT on USERS/scout_reports.

Usage (from backend/):
  python tools/import_clips_player_profiles.py            # DRY RUN (matching report only, no writes)
  python tools/import_clips_player_profiles.py --commit   # actually insert
"""
import os
import sys
import csv
import unicodedata
from difflib import SequenceMatcher
import pandas as pd
from dotenv import load_dotenv
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend
import snowflake.connector

EXCEL = "/Users/hashim.umarji/Desktop/Opposition Reports/League/Player Profiles - All Clubs.xlsx"
SHEET = "Player Profiles"
FUZZY_THRESHOLD = 0.85
FOLD_CLUB = True
COMMIT = "--commit" in sys.argv
MIGRATE = "--migrate" in sys.argv  # also add the CLIP_CATEGORY column (needs a MODIFY-capable role)
TEAM_NAME = ("Charlton Athletic", "Analysis Team")
TEAM_USERNAME = "cafc_analysis_team"

load_dotenv()


# Letters NFD can't decompose into base+accent (distinct letters/ligatures).
_TRANSLIT = str.maketrans({
    "ø": "o", "Ø": "o", "æ": "ae", "Æ": "ae", "å": "a", "Å": "a",
    "ß": "ss", "ð": "d", "Ð": "d", "þ": "th", "Þ": "th", "ł": "l", "Ł": "l",
})


def norm(s):
    if s is None or (isinstance(s, float) and pd.isna(s)):
        return ""
    s = str(s).translate(_TRANSLIT)
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return " ".join(s.upper().split())


def connect():
    with open(os.getenv("SNOWFLAKE_DEV_PRIVATE_KEY_PATH", "./keys/rsa_key_unencrypted.pem"), "rb") as f:
        pk = serialization.load_pem_private_key(f.read(), password=None, backend=default_backend())
    pkb = pk.private_bytes(serialization.Encoding.DER, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    return snowflake.connector.connect(
        user=os.getenv("SNOWFLAKE_DEV_USERNAME") or os.getenv("SNOWFLAKE_USERNAME"),
        account=os.getenv("SNOWFLAKE_DEV_ACCOUNT") or os.getenv("SNOWFLAKE_ACCOUNT"),
        warehouse=os.getenv("SNOWFLAKE_DEV_WAREHOUSE") or os.getenv("SNOWFLAKE_WAREHOUSE"),
        database=os.getenv("SNOWFLAKE_DEV_DATABASE") or os.getenv("SNOWFLAKE_DATABASE"),
        schema=os.getenv("SNOWFLAKE_DEV_SCHEMA") or os.getenv("SNOWFLAKE_SCHEMA"),
        role=os.getenv("SNOWFLAKE_SEED_ROLE") or os.getenv("SNOWFLAKE_DEV_ROLE", "DEV_ROLE"),
        private_key=pkb,
        client_session_keep_alive=True,  # long run (matching + per-row dedupe); avoid token expiry
    )


_CLUB_STOP = {"FC", "AFC", "CF", "SC", "SK", "AC", "AS", "RC", "FK", "U21", "U23", "U18", "II", "B", "PR"}


def norm_club(s):
    toks = [t for t in norm(s).replace("(", " ").replace(")", " ").split() if t not in _CLUB_STOP]
    return " ".join(toks)


def club_ok(sheet_club, squad):
    """True if the sheet club and the player's squad plausibly refer to the same club."""
    a, b = norm_club(sheet_club), norm_club(squad)
    if not a or not b:
        return False
    if a in b or b in a:
        return True
    return SequenceMatcher(None, a, b).ratio() >= 0.6


def best_match(name, club, players):
    """players: list of dicts with name/squad/position/pid/cafc/source/_nname."""
    nm = norm(name)
    if not nm:
        return None, "empty name"
    exact = [p for p in players if p["_nname"] == nm]
    if exact:
        # Trust an exact full-name match; disambiguate duplicates by club.
        if len(exact) > 1 and club:
            cl = norm(club)
            exact = sorted(exact, key=lambda p: SequenceMatcher(None, cl, p["_nname_squad"]).ratio(), reverse=True)
        return exact[0], None
    # Fuzzy name match REQUIRES club agreement (guards against same-ish names at
    # unrelated clubs when the real player isn't in the DB).
    scored = [(SequenceMatcher(None, nm, p["_nname"]).ratio(), p) for p in players]
    cand = [p for s, p in scored if s >= FUZZY_THRESHOLD]
    if not cand:
        return None, "no name match >= %.0f%%" % (FUZZY_THRESHOLD * 100)
    cand_club = [p for p in cand if club_ok(club, p["squad"])]
    if not cand_club:
        return None, "fuzzy name only, club mismatch (likely not in DB)"
    if len(cand_club) > 1 and club:
        cl = norm(club)
        cand_club = sorted(cand_club, key=lambda p: SequenceMatcher(None, cl, p["_nname_squad"]).ratio(), reverse=True)
    return cand_club[0], None


def get_team_user(cur):
    cur.execute(
        "SELECT ID FROM users WHERE UPPER(USERNAME)=UPPER(%s) "
        "OR (UPPER(FIRSTNAME)=UPPER(%s) AND UPPER(LASTNAME)=UPPER(%s)) LIMIT 1",
        [TEAM_USERNAME, TEAM_NAME[0], TEAM_NAME[1]],
    )
    row = cur.fetchone()
    if row:
        return row[0]
    if not COMMIT:
        print(f"  (dry-run) would create user '{TEAM_NAME[0]} {TEAM_NAME[1]}' ({TEAM_USERNAME})")
        return None
    # placeholder bcrypt hash for "changeme"; system account, not for login
    pwd = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYqDqWEKjSu"
    cur.execute(
        "INSERT INTO users (USERNAME, HASHED_PASSWORD, FIRSTNAME, LASTNAME, ROLE, EMAIL, CREATED_AT) "
        "VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP())",
        [TEAM_USERNAME, pwd, TEAM_NAME[0], TEAM_NAME[1], "scout", f"{TEAM_USERNAME}@cafc.import"],
    )
    cur.execute("SELECT ID FROM users WHERE UPPER(USERNAME)=UPPER(%s) LIMIT 1", [TEAM_USERNAME])
    uid = cur.fetchone()[0]
    print(f"  created user '{TEAM_NAME[0]} {TEAM_NAME[1]}' (id {uid})")
    return uid


def main():
    df = pd.read_excel(EXCEL, sheet_name=SHEET)
    print(f"Read {len(df)} rows from '{SHEET}'. Mode: {'COMMIT' if COMMIT else 'DRY RUN (no writes)'}")

    conn = connect()
    cur = conn.cursor()

    if MIGRATE:
        try:
            cur.execute("ALTER TABLE scout_reports ADD COLUMN CLIP_CATEGORY VARCHAR(50)")
            print("Migration: added scout_reports.CLIP_CATEGORY")
        except Exception as e:
            print(f"Migration: ALTER skipped ({str(e)[:100]})")

    # confirm column exists
    cur.execute(
        "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=CURRENT_SCHEMA() "
        "AND TABLE_NAME='SCOUT_REPORTS' AND COLUMN_NAME='CLIP_CATEGORY' LIMIT 1"
    )
    has_clip_col = cur.fetchone() is not None
    if not has_clip_col:
        msg = ("scout_reports.CLIP_CATEGORY does not exist. Run the migration first "
               "(migrations/add_clip_category_to_scout_reports.sql, admin role).")
        if COMMIT:
            print("ERROR: " + msg)
            sys.exit(1)
        print("NOTE: " + msg + "\n      Continuing dry-run (matching only; no column needed).")

    team_user_id = get_team_user(cur)

    cur.execute("SELECT PLAYERID, CAFC_PLAYER_ID, PLAYERNAME, SQUADNAME, POSITION, DATA_SOURCE FROM PLAYERS")
    players = []
    for pid, cafc, pname, squad, pos, src in cur.fetchall():
        players.append({
            "pid": pid, "cafc": cafc, "name": pname, "squad": squad, "position": pos,
            "source": (src or "").lower(), "_nname": norm(pname), "_nname_squad": norm(squad),
        })
    print(f"Loaded {len(players)} players for matching.")

    matched_rows, unmatched_rows = [], []
    inserted = skipped_dupe = 0
    sentiment_counts = {}

    for idx, row in df.iterrows():
        player_name = row.get("Player")
        club = row.get("Club")
        notes = row.get("Notes")
        sentiment = row.get("Notes Sentiment")
        match_date = row.get("Match Date")
        if player_name is None or (isinstance(player_name, float) and pd.isna(player_name)):
            continue

        p, err = best_match(player_name, club, players)
        if not p:
            unmatched_rows.append([idx + 2, player_name, club, err])
            continue

        clip_cat = str(sentiment).strip().title() if sentiment is not None and not (isinstance(sentiment, float) and pd.isna(sentiment)) else None
        sentiment_counts[clip_cat] = sentiment_counts.get(clip_cat, 0) + 1
        note_txt = "" if notes is None or (isinstance(notes, float) and pd.isna(notes)) else str(notes).strip()
        club_txt = "" if club is None or (isinstance(club, float) and pd.isna(club)) else str(club).strip()
        summary = f"{club_txt} — {note_txt}".strip(" —") if (FOLD_CLUB and club_txt) else note_txt
        created_at = None if (match_date is None or (isinstance(match_date, float) and pd.isna(match_date))) else pd.to_datetime(match_date).strftime("%Y-%m-%d")
        ext_id = p["pid"] if p["source"] != "internal" else None
        cafc_id = p["cafc"] if p["source"] == "internal" else None

        matched_rows.append([idx + 2, player_name, p["name"], p["squad"], clip_cat, created_at])

        if COMMIT and team_user_id is not None:
            # dedupe: same author + player + clip + date + summary
            cur.execute(
                """SELECT ID FROM scout_reports
                   WHERE USER_ID=%s AND REPORT_TYPE='Clips' AND IS_ARCHIVED=TRUE
                     AND ((PLAYER_ID=%s AND PLAYER_ID IS NOT NULL) OR (CAFC_PLAYER_ID=%s AND CAFC_PLAYER_ID IS NOT NULL))
                     AND TO_DATE(CREATED_AT)=TO_DATE(%s) AND SUMMARY=%s LIMIT 1""",
                [team_user_id, ext_id, cafc_id, created_at, summary],
            )
            if cur.fetchone():
                skipped_dupe += 1
                continue
            cur.execute(
                """INSERT INTO scout_reports
                   (PLAYER_ID, CAFC_PLAYER_ID, POSITION, SUMMARY, CLIP_CATEGORY, REPORT_TYPE,
                    IS_ARCHIVED, USER_ID, CREATED_AT)
                   VALUES (%s, %s, %s, %s, %s, 'Clips', TRUE, %s, COALESCE(%s::TIMESTAMP, CURRENT_TIMESTAMP()))""",
                [ext_id, cafc_id, p["position"], summary, clip_cat, team_user_id, created_at],
            )
            inserted += 1
            if inserted % 100 == 0:
                conn.commit()
                print(f"  ...committed {inserted}")

    if COMMIT:
        conn.commit()

    # write logs
    with open("clips_import_matched.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(["row", "sheet_player", "matched_player", "matched_club", "sentiment", "date"]); w.writerows(matched_rows)
    with open("clips_import_unmatched.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(["row", "player", "club", "reason"]); w.writerows(unmatched_rows)

    print("\n=== SUMMARY ===")
    print(f"rows processed     : {len(df)}")
    print(f"matched players    : {len(matched_rows)}")
    print(f"unmatched (skipped): {len(unmatched_rows)}  -> clips_import_unmatched.csv")
    print(f"sentiment breakdown: {sentiment_counts}")
    if COMMIT:
        print(f"inserted clips     : {inserted}")
        print(f"skipped duplicates : {skipped_dupe}")
    else:
        print("DRY RUN — no rows written. Re-run with --commit to insert.")
    cur.close(); conn.close()


if __name__ == "__main__":
    main()
