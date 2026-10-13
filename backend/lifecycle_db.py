"""Shared transaction mutex. Call before reading state, and commit/rollback before releasing.

Snowflake standard-table UNIQUE constraints are not enforced. Updating the same
seeded row serializes writers across processes without modifying recommendation rows.
"""


def acquire_mutex(cursor, table):
    cursor.execute("BEGIN")
    cursor.execute(
        f'UPDATE {table("lifecycle_mutex")} SET REVISION = REVISION + 1 WHERE ID = 1'
    )
    if cursor.rowcount != 1:
        raise RuntimeError("Lifecycle migration incomplete: expected one mutex row")


class StaleRecommendation(Exception):
    pass


_UNSET = object()


def update_recommendation_status(
    cursor,
    table,
    recommendation_id,
    old_status,
    new_status,
    actor,
    changed_at,
    expected_updated_at=_UNSET,
):
    if old_status == new_status:
        return False
    condition, params = "", (
        new_status,
        changed_at,
        actor,
        changed_at,
        recommendation_id,
    )
    if expected_updated_at is not _UNSET:
        condition = " AND STATUS=%s"
        params += (old_status,)
        if expected_updated_at is None:
            condition += " AND UPDATED_AT IS NULL"
        else:
            condition += " AND UPDATED_AT=%s"
            params += (expected_updated_at,)
    cursor.execute(
        f'UPDATE {table("player_recommendations")} SET STATUS=%s, STATUS_UPDATED_AT=%s, '
        "STATUS_UPDATED_BY=%s, UPDATED_AT=%s WHERE ID=%s" + condition,
        params,
    )
    if expected_updated_at is not _UNSET and cursor.rowcount != 1:
        raise StaleRecommendation("Recommendation changed during apply")
    cursor.execute(
        f'INSERT INTO {table("status_history")} '
        "(RECOMMENDATION_ID, OLD_STATUS, NEW_STATUS, CHANGED_BY, CHANGED_AT) VALUES (%s,%s,%s,%s,%s)",
        (recommendation_id, old_status, new_status, actor, changed_at),
    )
    return True
