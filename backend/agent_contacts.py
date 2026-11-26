"""Agent contact book: one set of contact details per agent account.

The agent's own profile wins; any blank field falls back to what they typed on their
most recent recommendation (older submissions predate profiles). A name of last resort
comes from the user account.
"""
from typing import Any, Callable, Dict, Iterable, Optional, Tuple

CONTACT_FIELDS = ("name", "agency", "email", "phone")


def _clean(value) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def merge_contact(profile: Optional[dict], latest: dict, user: dict) -> Tuple[dict, bool]:
    profile = profile or {}
    merged = {}
    from_latest_rec = False
    for field in CONTACT_FIELDS:
        value = _clean(profile.get(field))
        if value is None:
            value = _clean(latest.get(field))
            if value is not None:
                from_latest_rec = True
        merged[field] = value
    if merged["name"] is None:
        full_name = " ".join(part for part in (_clean(user.get("firstname")), _clean(user.get("lastname"))) if part)
        merged["name"] = full_name or _clean(user.get("username")) or "Unknown agent"
    return merged, from_latest_rec


def summarise_scores(rows: Iterable[tuple], data_lookup: Optional[Callable[[Any], Optional[float]]], include_perf: bool) -> Dict[int, dict]:
    """Per-agent average performance and data score, counting each recommended player once.

    rows: (submitter_id, player_key, avg_performance_score, external_player_id). A player only counts
    towards an average if they have that score. data_lookup is None when data scores are hidden.
    """
    players: Dict[int, Dict[str, tuple]] = {}
    for submitter, player_key, perf, external_id in rows:
        players.setdefault(submitter, {}).setdefault(player_key, (perf, external_id))

    result = {}
    for submitter, by_player in players.items():
        perfs = [float(perf) for perf, _ in by_player.values() if include_perf and perf is not None]
        datas = []
        if data_lookup is not None:
            for _, external_id in by_player.values():
                value = data_lookup(external_id) if external_id is not None else None
                if value is not None:
                    datas.append(float(value))
        result[submitter] = {
            "avg_performance_score": round(sum(perfs) / len(perfs), 2) if perfs else None,
            "performance_scored_count": len(perfs),
            "avg_data_score": round(sum(datas) / len(datas), 1) if datas else None,
            "data_scored_count": len(datas),
        }
    return result
