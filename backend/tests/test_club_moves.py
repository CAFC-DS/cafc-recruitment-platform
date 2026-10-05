"""Verify the bundled snapshot without requiring a database connection."""
import csv
from services.club_moves import SNAPSHOT, get_club_move, load_club_moves


def test_snapshot_matches_every_row_including_reserve_moves():
    with SNAPSHOT.open(encoding="utf-8-sig", newline="") as source:
        rows = list(csv.DictReader(source))
    assert len(rows) == len(load_club_moves()) == 13643
    assert any(row["sameClubReserveMove"] == "True" for row in rows)
    for row in rows:
        move = get_club_move(int(row["playerId"]))
        assert move["from_club"] == row["fromSquad"].strip()
        assert move["to_club"] == row["toSquad"].strip()
        assert move["last_old_club_appearance"] == (row["lastAppOldClub"].strip() or None)
        assert move["first_new_club_appearance"] == (row["firstAppNewClub"].strip() or None)


def test_identity_and_category_boundaries():
    assert get_club_move(161255) == get_club_move("161255")
    assert get_club_move(None) is None
    assert get_club_move(-1) is None
    assert get_club_move(161255, "emerging_talent_u21") is None
    assert get_club_move(161255, "emerging_talent_u18") is None


def test_snapshot_is_cached():
    assert load_club_moves() is load_club_moves()
