"""Agent contact book: one set of contact details per agent account.

The agent's own profile wins; any blank field falls back to what they typed on their
most recent recommendation (older submissions predate profiles). A name of last resort
comes from the user account.
"""
from typing import Optional, Tuple

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
