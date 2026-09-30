"""Regression: GET /admin/detect-clashes must surface near-duplicate names
(e.g. "Daniel Urpen" / "Daniel Urpens" / "Daniels Urpens") even when the
players table is large. The fuzzy pass used to stop after 50,000 pairwise
comparisons in name order, so with ~120k players nothing past the first few
names was ever compared."""
import asyncio
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tests.test_detect_clashes_squadless import _call, _player_row


def test_near_duplicates_found_among_many_players():
    # Unrelated, unique names that sort before "Daniel Urpen" and would have
    # exhausted the old comparison cap (300 rows x ~2000 > 50,000 pairs is
    # avoided by using 3,000 rows: 3000*3000/2 = 4.5M pairs).
    filler = [
        _player_row(None, 1000 + i, f"Aaa{i:05d} Filler{i:05d}", data_source="external")
        for i in range(3000)
    ]
    urpens = [
        _player_row(None, 278384, "Daniel Urpen", data_source="external"),
        _player_row(None, 332640, "Daniel Urpens", data_source="external", birthdate=date(2008, 6, 28)),
        _player_row(None, 285626, "Daniels Urpens", squad="Sutton United", data_source="external"),
    ]
    result = asyncio.run(_call(filler + urpens))
    pairs = {
        frozenset((c["player1"]["player_id"], c["player2"]["player_id"]))
        for c in result["player_clashes"]
    }
    assert frozenset((278384, 332640)) in pairs
    assert frozenset((332640, 285626)) in pairs
    assert frozenset((278384, 285626)) in pairs
