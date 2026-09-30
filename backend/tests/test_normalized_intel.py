"""Unit tests for the normalized intel writer (fake cursor: what SQL, in what order, in one transaction)."""
import os
import sys
from datetime import date, datetime

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from normalized import intel  # noqa: E402


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


REPORT = dict(
    intel_type="player_information", contact_name="Jo Bloggs", contact_organisation="Some FC",
    date_of_information="2026-09-01", confirmed_contract_expiry="2027-06-30", contract_options="+1 Year",
    potential_deal_types=["permanent", "loan_with_option", "permanent"], transfer_fee="1.5m",
    conversation_notes="notes", recommendation="Monitor", relationship_to_player=[],
    length_of_relationship=None, relevance_of_relationship=None, reference_rating=None,
)


def payload(**over):
    p = intel.build_payload({**REPORT, **over}, 8000, 8000, 10000, 12000)
    return p


def test_build_payload_sets_single_wage_only_when_the_range_collapses():
    p = payload()
    assert (p["current_wages_single"], p["current_wages_min"], p["current_wages_max"]) == (8000, 8000, 8000)
    assert (p["expected_wages_single"], p["expected_wages_min"], p["expected_wages_max"]) == (None, 10000, 12000)
    assert intel.build_payload(REPORT, None, None, None, None)["current_wages_single"] is None
    assert p["action_required"] == "Monitor" and p["contract_expiry"] == "2027-06-30"


@pytest.mark.parametrize("code,label", [
    ("permanent", "Permanent Transfer"), ("free", "Free"), ("loan", "Loan"), ("loan_with_option", "Loan with Option"),
    ("na", "Not Applicable"), (" LOAN ", "Loan"), ("Something New", "Something New"),
])
def test_deal_type_label(code, label):
    assert intel.deal_type_label(code) == label


def test_ordered_unique_trims_drops_blanks_and_duplicates_keeping_order():
    assert intel.ordered_unique([" b ", "a", "b", "", None]) == [(0, "b"), (1, "a")]
    assert intel.ordered_unique(["permanent", "permanent", "loan"], intel.deal_type_label) == [
        (0, "Permanent Transfer"), (1, "Loan")]
    assert intel.ordered_unique(None) == []


def test_contact_key_is_exact_and_distinguishes_a_missing_organisation_only_from_a_named_one():
    assert intel.contact_key("Jo", "FC") == "Jo\x1fFC"
    assert intel.contact_key("Jo", None) == "Jo\x1f"
    assert intel.contact_key("Jo ", "FC") != intel.contact_key("Jo", "FC")   # exact strings, like the legacy rows


def test_create_is_one_transaction_with_a_sequence_id_and_all_children():
    cur = Cursor(fetch=[(6700,), (5,), (99,)])  # NEXTVAL, contact id, canonical player id
    new_id = intel.create(cur, T, payload(), 42, 123, "internal", datetime(2026, 9, 30))
    sqls = cur.sqls()
    assert new_id == 6700
    assert sqls[0] == "BEGIN" and sqls[-1] == "COMMIT"
    assert "DB.S.intel_reports_id_seq.NEXTVAL" in sqls[1]
    assert any(s.startswith("MERGE INTO DB.S.contacts") for s in sqls)
    insert = next((s, p) for s, p in cur.log if s.startswith("INSERT INTO DB.S.intel_reports"))
    assert insert[1][:7] == (6700, 42, 123, "internal", 99, 5, "player_information")
    deals = [p for s, p in cur.log if s.startswith("INSERT INTO DB.S.intel_deal_types")]
    assert deals == [(6700, "Permanent Transfer", 0), (6700, "Loan with Option", 1)]   # duplicate dropped, labels canonical
    terms = [p for s, p in cur.log if s.startswith("INSERT INTO DB.S.intel_terms")]
    assert (6700, "CURRENT_WAGES", 8000, 8000, 8000) in terms and (6700, "EXPECTED_WAGES", None, 10000, 12000) in terms
    assert any(p == (6700, "1.5m") for p in terms)
    assert not any(s.startswith("INSERT INTO DB.S.intel_reference_details") for s in sqls)


def test_create_writes_reference_details_only_for_reference_forms():
    p = payload(intel_type="reference_form", potential_deal_types=[], relationship_to_player=["Worked With", "Played With"],
                length_of_relationship="1-2 Years", relevance_of_relationship="Current", reference_rating="Positive",
                transfer_fee=None)
    cur = Cursor(fetch=[(6701,), (5,), None])
    intel.create(cur, T, p, 1, None, None, datetime(2026, 9, 30))
    rels = [q for s, q in cur.log if s.startswith("INSERT INTO DB.S.intel_relationships")]
    assert rels == [(6701, "Worked With", 0), (6701, "Played With", 1)]
    assert [q for s, q in cur.log if s.startswith("INSERT INTO DB.S.intel_reference_details")] == [
        (6701, "1-2 Years", "Current", "Positive")]
    # no player: no canonical lookup at all
    assert not any("core_player_id_resolutions" in s or "players" in s for s in cur.sqls())


def test_create_rolls_back_when_a_child_insert_fails():
    cur = Cursor(fetch=[(6702,), (5,), None], fail_on="INSERT INTO DB.S.intel_deal_types")
    with pytest.raises(RuntimeError):
        intel.create(cur, T, payload(), 1, None, None, datetime(2026, 9, 30))
    assert cur.sqls()[-1] == "ROLLBACK" and "COMMIT" not in cur.sqls()


def test_update_keeps_the_stored_data_source_when_no_player_was_given():
    cur = Cursor(fetch=[(5,), ("external",), None])  # contact id, stored DATA_SOURCE, no canonical (player_id None)
    intel.update(cur, T, 6700, payload(), None, None, data_source_given=False)
    update = next((s, p) for s, p in cur.log if s.startswith("UPDATE DB.S.intel_reports"))
    assert update[1][0] is None and update[1][1] == "external" and update[1][-1] == 6700
    assert cur.sqls()[0] == "BEGIN" and cur.sqls()[-1] == "COMMIT"
    assert "DELETE FROM DB.S.intel_terms WHERE INTEL_REPORT_ID = %s" in cur.sqls()   # children are replaced


def test_update_uses_the_new_data_source_when_a_player_is_given():
    cur = Cursor(fetch=[(5,), (77,)])
    intel.update(cur, T, 6700, payload(), 1234, "internal", data_source_given=True)
    update = next((s, p) for s, p in cur.log if s.startswith("UPDATE DB.S.intel_reports"))
    assert update[1][:3] == (1234, "internal", 77)
    assert not any(s.startswith("SELECT DATA_SOURCE") for s in cur.sqls())


def test_delete_removes_every_dependent_before_the_report_in_one_transaction():
    cur = Cursor()
    intel.delete(cur, T, 6700)
    sqls = cur.sqls()
    assert sqls[0] == "BEGIN" and sqls[-1] == "COMMIT"
    deletes = [s.split()[2] for s in sqls if s.startswith("DELETE FROM")]
    assert deletes == ["DB.S.intel_terms", "DB.S.intel_deal_types", "DB.S.intel_relationships",
                       "DB.S.intel_reference_details", "DB.S.intel_reports"]
    assert not any("contacts" in s for s in sqls)   # the contact is a person we hold information about: kept


def test_reassign_player_moves_reports_and_refreshes_the_canonical_key():
    cur = Cursor(fetch=[(55,)])
    cur.rowcount = 3
    assert intel.reassign_player(cur, T, 10, 20, "internal") == 3
    update = next((s, p) for s, p in cur.log if s.startswith("UPDATE DB.S.intel_reports"))
    assert update[1] == (10, 55, 20)
