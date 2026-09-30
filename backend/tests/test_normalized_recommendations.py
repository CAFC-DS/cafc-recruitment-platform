"""Unit tests for the normalized recommendations writer (fake cursor: what SQL, in what order, in one transaction)."""
import os
import sys
from datetime import date, datetime

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from normalized import recommendations as rec  # noqa: E402


def T(name):
    return f"DB.S.{name}"


class Cursor:
    def __init__(self, fetch=None, fail_on=None):
        self.log, self.fetch, self.fail_on, self.rowcount = [], list(fetch or []), fail_on, 0

    def execute(self, sql, params=None):
        sql = " ".join(sql.split())
        self.log.append((sql, params))
        if self.fail_on and self.fail_on in sql:
            raise RuntimeError("boom")

    def fetchone(self):
        return self.fetch.pop(0) if self.fetch else None

    def sqls(self):
        return [s for s, _ in self.log]


PAYLOAD = dict(
    PLAYER_NAME="P", DATE=date(2026, 9, 29), TRANSFERMARKT_LINK="tm", CONTRACT_EXPIRY=date(2027, 1, 1),
    ADDITIONAL_INFO="info", WAGE_BASIS="Gross", TRANSFER_FEE="100-200", CURRENT_WAGES=None, EXPECTED_WAGES=300,
    PLAYER_DATE_OF_BIRTH=None,
    TRANSFER_FEE_AMOUNT=None, TRANSFER_FEE_MIN=100, TRANSFER_FEE_MAX=200, TRANSFER_FEE_CURRENCY="GBP",
    CURRENT_WAGES_AMOUNT=None, CURRENT_WAGES_MIN=None, CURRENT_WAGES_MAX=None, CURRENT_WAGES_CURRENCY=None,
    EXPECTED_WAGES_AMOUNT=300, EXPECTED_WAGES_MIN=300, EXPECTED_WAGES_MAX=300, EXPECTED_WAGES_CURRENCY="GBP",
    RECOMMENDED_POSITION="DM,CM", POTENTIAL_DEAL_TYPE="Free", AGREEMENT_TYPE="None", CONTRACT_OPTIONS="None,+1 Club",
    AGENT_NAME="A", AGENCY="Ag", AGENT_EMAIL="a@x.com", AGENT_NUMBER="+447700900123",
)


@pytest.mark.parametrize("raw,expected", [
    ("DM,CM", [(0, "DM"), (1, "CM")]),
    (" DM , CM,DM ,, ", [(0, "DM"), (1, "CM")]),   # trimmed, blanks and duplicates dropped, order kept
    ("", []), (None, []), ("Loan with Option", [(0, "Loan with Option")]),
])
def test_split_list(raw, expected):
    assert rec.split_list(raw) == expected


def test_create_is_one_transaction_with_a_sequence_id_and_all_children():
    cur = Cursor(fetch=[(777,), ("ok",)])  # NEXTVAL, then "profile exists"
    new_id = rec.create(cur, T, PAYLOAD, 42, None, datetime(2026, 9, 29))
    sqls = cur.sqls()
    assert new_id == 777
    assert sqls[0] == "BEGIN" and sqls[-1] == "COMMIT"
    assert "DB.S.recommendations_id_seq.NEXTVAL" in sqls[1]
    assert any(s.startswith("INSERT INTO DB.S.recommendations ") for s in sqls)
    inserted_terms = [p for s, p in cur.log if s.startswith("INSERT INTO DB.S.recommendation_terms")]
    assert [p[1] for p in inserted_terms] == ["TRANSFER_FEE", "EXPECTED_WAGES"]   # no CURRENT_WAGES row: nothing to store
    positions = [p for s, p in cur.log if s.startswith("INSERT INTO DB.S.recommendation_positions")]
    assert positions == [(777, "DM", 0), (777, "CM", 1)]                         # original order preserved via SEQ
    contract = [p for s, p in cur.log if s.startswith("INSERT INTO DB.S.recommendation_contract_options")]
    assert contract == [(777, "None", 0), (777, "+1 Club", 1)]
    assert any("UPDATE DB.S.agent_profiles" in s for s in sqls)                   # profile blanks filled


def test_create_stores_the_legacy_carry_columns_verbatim():
    cur = Cursor(fetch=[(5,), (1,)])
    rec.create(cur, T, PAYLOAD, 42, "external_9", datetime(2026, 9, 29))
    sql, params = next((s, p) for s, p in cur.log if s.startswith("INSERT INTO DB.S.recommendations "))
    assert "TRANSFER_FEE_TEXT" in sql and "CURRENT_WAGES_LEGACY" in sql and "EXPECTED_WAGES_LEGACY" in sql
    assert "100-200" in params and 300 in params and None in params               # fee text, expected wages, current wages NULL
    assert "external_9" in params
    assert "'Submitted'" in sql and "'Active'" in sql                             # legacy defaults made explicit


def test_a_failure_anywhere_rolls_back_everything_and_reraises():
    cur = Cursor(fetch=[(5,), (1,)], fail_on="INSERT INTO DB.S.recommendation_positions")
    with pytest.raises(RuntimeError):
        rec.create(cur, T, PAYLOAD, 42, None, datetime(2026, 9, 29))
    assert cur.sqls()[-1] == "ROLLBACK" and "COMMIT" not in cur.sqls()


def test_update_rewrites_terms_and_lists_in_one_transaction():
    cur = Cursor(fetch=[(1,)])
    rec.update(cur, T, 10, {**PAYLOAD, "RECOMMENDED_POSITION": "GK"}, None, 42, datetime(2026, 9, 29))
    sqls = cur.sqls()
    assert sqls[0] == "BEGIN" and sqls[-1] == "COMMIT"
    assert sqls.index("DELETE FROM DB.S.recommendation_terms WHERE RECOMMENDATION_ID = %s") < \
           next(i for i, s in enumerate(sqls) if s.startswith("INSERT INTO DB.S.recommendation_terms"))
    assert [p for s, p in cur.log if s.startswith("INSERT INTO DB.S.recommendation_positions")] == [(10, "GK", 0)]
    assert not any(s.startswith("INSERT INTO DB.S.recommendations ") for s in sqls)   # an edit never inserts a new row


def test_profile_is_created_when_the_agent_has_none_and_only_blanks_are_filled_otherwise():
    none = Cursor(fetch=[None])
    rec.fill_profile_blanks(none, T, 7, PAYLOAD)
    assert any(s.startswith("INSERT INTO DB.S.agent_profiles") for s in none.sqls())
    some = Cursor(fetch=[(1,)])
    rec.fill_profile_blanks(some, T, 7, PAYLOAD)
    update = next(s for s in some.sqls() if s.startswith("UPDATE DB.S.agent_profiles"))
    assert update.count("COALESCE(NULLIF(TRIM(") == 4     # a filled value is never overwritten


@pytest.mark.parametrize("uid,expect_sql", [("internal_55", "DB.S.players"), ("external_912", "DB.S.core_player_id_resolutions")])
def test_canonical_resolution_parses_both_forms(uid, expect_sql):
    cur = Cursor(fetch=[(1234,)])
    assert rec.resolve_canonical_player_id(cur, T, uid) == 1234
    assert expect_sql in cur.sqls()[0]


@pytest.mark.parametrize("uid", [None, "", "garbage", "internal_", "external_abc", "internal_5; DROP TABLE x"])
def test_canonical_resolution_rejects_malformed_ids_without_touching_the_database(uid):
    cur = Cursor()
    assert rec.resolve_canonical_player_id(cur, T, uid) is None
    assert cur.log == []


def test_relink_moves_the_universal_id_and_the_canonical_key_together():
    cur = Cursor(fetch=[(99,)])
    cur.rowcount = 3
    assert rec.relink_player(cur, T, "external_1", "internal_2") == 3
    sql, params = cur.log[-1]
    assert "LINKED_UNIVERSAL_ID = %s, LINKED_CANONICAL_PLAYER_ID = %s" in sql
    assert params == ("internal_2", 99, "external_1")
