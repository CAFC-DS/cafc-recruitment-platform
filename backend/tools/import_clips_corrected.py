"""
Re-import the clips that failed the first pass, using corrected names/clubs from
clips_import_unmatched_changed.xlsx
(cols: row, player, club, reason, new_name, club_in_system).

For each corrected row: join back to the original "Player Profiles" sheet by
`row` to recover Notes / Notes Sentiment / Match Date, match the player using
new_name (if given) and club_in_system (if given, else the observed club), and
insert an archived clip identical in shape to the first import. Idempotent
(dedupe on author+player+date+summary), so safe to re-run.

Usage (from backend/):
  python tools/import_clips_corrected.py            # DRY RUN (no writes)
  python tools/import_clips_corrected.py --commit   # insert
"""
import os
import sys
import csv
import pandas as pd

# Reuse the exact matching + connection logic from the first import.
from import_clips_player_profiles import (
    norm, best_match, connect, EXCEL as ORIG_EXCEL, SHEET as ORIG_SHEET,
    TEAM_USERNAME, TEAM_NAME,
)

CORR = "/Users/hashim.umarji/Desktop/clips_import_unmatched_changed.xlsx"
CORR_SHEET = "clips_import_unmatched"
COMMIT = "--commit" in sys.argv


def val(x):
    return None if x is None or (isinstance(x, float) and pd.isna(x)) else x


def main():
    df_orig = pd.read_excel(ORIG_EXCEL, sheet_name=ORIG_SHEET)
    df_corr = pd.read_excel(CORR, sheet_name=CORR_SHEET)
    print(f"Corrected rows: {len(df_corr)}. Mode: {'COMMIT' if COMMIT else 'DRY RUN (no writes)'}")

    conn = connect()
    cur = conn.cursor()

    cur.execute(
        "SELECT ID FROM users WHERE UPPER(USERNAME)=UPPER(%s) "
        "OR (UPPER(FIRSTNAME)=UPPER(%s) AND UPPER(LASTNAME)=UPPER(%s)) LIMIT 1",
        [TEAM_USERNAME, TEAM_NAME[0], TEAM_NAME[1]],
    )
    urow = cur.fetchone()
    if not urow:
        print("ERROR: 'Charlton Athletic Analysis Team' user not found — run the main import first.")
        sys.exit(1)
    team_user_id = urow[0]
    print(f"Author user id: {team_user_id}")

    cur.execute("SELECT PLAYERID, CAFC_PLAYER_ID, PLAYERNAME, SQUADNAME, POSITION, DATA_SOURCE FROM PLAYERS")
    players = []
    for pid, cafc, pname, squad, pos, src in cur.fetchall():
        players.append({
            "pid": pid, "cafc": cafc, "name": pname, "squad": squad, "position": pos,
            "source": (src or "").lower(), "_nname": norm(pname), "_nname_squad": norm(squad),
        })
    print(f"Loaded {len(players)} players for matching.")

    matched, still = [], []
    inserted = dupe = mismatch = 0

    for _, cr in df_corr.iterrows():
        row_num = int(cr["row"])
        try:
            orig = df_orig.iloc[row_num - 2]  # first import logged row = df index + 2
        except Exception:
            still.append([row_num, val(cr.get("player")), "row out of range"])
            continue

        orig_player = val(cr.get("player"))
        # sanity: the corrected file's original player should match the sheet row
        if orig_player and norm(orig.get("Player")) != norm(orig_player):
            mismatch += 1

        new_name = val(cr.get("new_name"))
        club_sys = val(cr.get("club_in_system"))
        orig_club = val(orig.get("Club"))
        notes = val(orig.get("Notes"))
        sentiment = val(orig.get("Notes Sentiment"))
        mdate = val(orig.get("Match Date"))

        match_name = new_name or orig_player
        match_club = club_sys or orig_club
        if not match_name:
            still.append([row_num, orig_player, "no corrected name provided"])
            continue

        p, err = best_match(match_name, match_club, players)
        if not p:
            still.append([row_num, match_name, err])
            continue

        clip_cat = str(sentiment).strip().title() if sentiment is not None else None
        note_txt = "" if notes is None else str(notes).strip()
        club_txt = "" if orig_club is None else str(orig_club).strip()  # summary uses observed club
        summary = f"{club_txt} — {note_txt}".strip(" —") if club_txt else note_txt
        created_at = None if mdate is None else pd.to_datetime(mdate).strftime("%Y-%m-%d")
        ext_id = p["pid"] if p["source"] != "internal" else None
        cafc_id = p["cafc"] if p["source"] == "internal" else None

        matched.append([row_num, match_name, p["name"], p["squad"], clip_cat, created_at])

        if COMMIT:
            cur.execute(
                """SELECT ID FROM scout_reports
                   WHERE USER_ID=%s AND REPORT_TYPE='Clips' AND IS_ARCHIVED=TRUE
                     AND ((PLAYER_ID=%s AND PLAYER_ID IS NOT NULL) OR (CAFC_PLAYER_ID=%s AND CAFC_PLAYER_ID IS NOT NULL))
                     AND TO_DATE(CREATED_AT)=TO_DATE(%s) AND SUMMARY=%s LIMIT 1""",
                [team_user_id, ext_id, cafc_id, created_at, summary],
            )
            if cur.fetchone():
                dupe += 1
                continue
            cur.execute(
                """INSERT INTO scout_reports
                   (PLAYER_ID, CAFC_PLAYER_ID, POSITION, SUMMARY, CLIP_CATEGORY, REPORT_TYPE,
                    IS_ARCHIVED, USER_ID, CREATED_AT)
                   VALUES (%s, %s, %s, %s, %s, 'Clips', TRUE, %s, COALESCE(%s::TIMESTAMP, CURRENT_TIMESTAMP()))""",
                [ext_id, cafc_id, p["position"], summary, clip_cat, team_user_id, created_at],
            )
            inserted += 1

    if COMMIT:
        conn.commit()

    with open("clips_corrected_matched.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(["row", "search_name", "matched_player", "matched_club", "sentiment", "date"]); w.writerows(matched)
    with open("clips_corrected_still_unmatched.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(["row", "name", "reason"]); w.writerows(still)

    print("\n=== SUMMARY ===")
    print(f"matched          : {len(matched)}")
    print(f"still unmatched  : {len(still)}  -> clips_corrected_still_unmatched.csv")
    if mismatch:
        print(f"row-join warnings: {mismatch} (sheet player != corrected 'player')")
    if COMMIT:
        print(f"inserted clips   : {inserted}")
        print(f"duplicates skipped: {dupe}")
    else:
        print("DRY RUN — no rows written. Re-run with --commit to insert.")
    cur.close(); conn.close()


if __name__ == "__main__":
    main()
