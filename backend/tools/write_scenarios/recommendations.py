"""Recommendation write scenarios: create, edit, agent status, internal status + notes, bulk status, blank-profile fill."""

LEGACY_COLUMNS = (
    "ID, AGENT_NAME, AGENCY, AGENT_EMAIL, AGENT_NUMBER, DATE, TRANSFERMARKT_LINK, AGREEMENT_TYPE, CONTRACT_EXPIRY, "
    "CONTRACT_OPTIONS, POTENTIAL_DEAL_TYPE, TRANSFER_FEE, CURRENT_WAGES, EXPECTED_WAGES, ADDITIONAL_INFO, PLAYER_NAME, "
    "SUBMITTED_BY_USER_ID, STATUS, STATUS_UPDATED_AT, STATUS_UPDATED_BY, INTERNAL_NOTES, UPDATED_AT, CREATED_AT, "
    "EXPECTED_WAGES_CURRENCY, EXPECTED_WAGES_AMOUNT, CURRENT_WAGES_CURRENCY, CURRENT_WAGES_AMOUNT, "
    "TRANSFER_FEE_CURRENCY, TRANSFER_FEE_AMOUNT, RECOMMENDED_POSITION, PLAYER_DATE_OF_BIRTH, AGENT_STATUS, "
    "AGENT_STATUS_UPDATED_AT, EXPECTED_WAGES_MAX, EXPECTED_WAGES_MIN, CURRENT_WAGES_MAX, CURRENT_WAGES_MIN, "
    "WAGE_BASIS, TRANSFER_FEE_MAX, TRANSFER_FEE_MIN, LINKED_UNIVERSAL_ID"
)
COLS = [c.strip() for c in LEGACY_COLUMNS.split(",")]
TIMESTAMPS = {"STATUS_UPDATED_AT", "UPDATED_AT", "CREATED_AT", "AGENT_STATUS_UPDATED_AT"}


def snapshot(ctx, rec_id):
    """The recommendation as the app reads it: legacy names, legacy columns, timestamps masked."""
    T = ctx.main.core_table
    row = ctx.rows(f"SELECT {LEGACY_COLUMNS} FROM {T('player_recommendations')} WHERE ID = %s", (rec_id,))
    out = {"row": None}
    if row:
        out["row"] = {c: ("<ts>" if c in TIMESTAMPS and v is not None else v)
                      for c, v in zip(COLS, row[0]) if c != "ID"}
    out["status_history"] = ctx.rows(
        f"SELECT OLD_STATUS, NEW_STATUS, CHANGED_BY FROM {T('status_history')} WHERE RECOMMENDATION_ID = %s ORDER BY ID", (rec_id,))
    out["notes_history"] = ctx.rows(
        f"SELECT NOTE_CONTENT, CREATED_BY FROM {T('recommendation_notes_history')} WHERE RECOMMENDATION_ID = %s ORDER BY ID", (rec_id,))
    return out


def form(linked, **over):
    base = dict(
        agent_name="Test Agent", agency="Test Agency", agent_email="agent@example.com", agent_number=None,
        submission_date="2026-09-29", player_name="Scenario Player", player_date_of_birth=None,
        recommended_position="CM", transfermarkt_link="https://www.transfermarkt.com/x/profil/spieler/1",
        player_manual_squad=None, agreement_type="Mandate (Player)", confirmed_contract_expiry="2027-06-30",
        contract_options="None", potential_deal_type="Free", transfer_fee=None, transfer_fee_currency=None,
        current_wages_per_week=None, current_wages_currency=None, wage_basis=None, current_wages_basis=None,
        expected_wages_per_week="10000", expected_wages_currency=None, expected_wages_basis=None,
        additional_information=None, linked_universal_id=linked, player_manual_entry=False, confirm_new_player=False,
        supporting_file=None,
    )
    base.update(over)
    return base


async def run(ctx):
    main, T = ctx.main, ctx.main.core_table
    # Deterministic inputs that exist identically in both schemas.
    agent_id, agent_name = ctx.rows(f"""
        SELECT r.SUBMITTED_BY_USER_ID, u.USERNAME FROM {T('player_recommendations')} r JOIN {T('users')} u ON u.ID = r.SUBMITTED_BY_USER_ID
        JOIN {T('agent_profiles')} p ON p.USER_ID = u.ID
        WHERE NULLIF(TRIM(p.AGENT_NUMBER), '') IS NOT NULL AND NULLIF(TRIM(p.AGENCY), '') IS NOT NULL
        GROUP BY 1, 2 ORDER BY COUNT(*) DESC, 1 LIMIT 1""")[0]
    blank_id, blank_name = ctx.rows(f"""
        SELECT p.USER_ID, u.USERNAME FROM {T('agent_profiles')} p JOIN {T('users')} u ON u.ID = p.USER_ID
        WHERE NULLIF(TRIM(p.AGENT_NUMBER), '') IS NULL ORDER BY p.USER_ID LIMIT 1""")[0]
    admin_id, admin_name = ctx.rows(f"SELECT ID, USERNAME FROM {T('users')} WHERE ROLE = 'admin' ORDER BY ID LIMIT 1")[0]
    linked = ctx.rows(f"SELECT LINKED_UNIVERSAL_ID FROM {T('player_recommendations')} WHERE LINKED_UNIVERSAL_ID IS NOT NULL ORDER BY ID LIMIT 1")[0][0]
    agent = main.User(id=agent_id, username=agent_name, role="agent")
    blank_agent = main.User(id=blank_id, username=blank_name, role="agent")
    admin = main.User(id=admin_id, username=admin_name, role="admin")
    ctx.record("inputs", {"agent_role": "agent", "linked_shape": linked.split("_")[0]})

    before = ctx.rows(f"SELECT COUNT(*) FROM {T('player_recommendations')}")[0][0]

    async def create(label, user, **over):
        res = await ctx.call(f"create::{label}", main.create_agent_recommendation, **form(linked, **over), current_user=user)
        rid = (res or {}).get("id") if isinstance(res, dict) else None
        real = next((k for k, v in ctx.id_map.items() if v == rid), None) if rid else None
        if real is not None:
            ctx.record(f"db::{label}", snapshot(ctx, real))
        return real

    r1 = await create("basic", agent)
    r2 = await create("multi_lists_ranges", agent,
                      recommended_position="CM,DM,RW", agreement_type="Mandate (Player),Exclusive/Registered Player Agreement",
                      contract_options="+1 Club,Other", potential_deal_type="Permanent Transfer,Loan with Option",
                      transfer_fee="1,000,000-2,500,000", transfer_fee_currency="EUR",
                      current_wages_per_week="8000-9000", current_wages_currency="EUR",
                      expected_wages_per_week="12000-15000", expected_wages_currency="EUR", wage_basis="Net",
                      additional_information="range scenario")
    r3 = await create("dob_single_values", agent, player_date_of_birth="2004-03-09", transfer_fee="750000",
                      current_wages_per_week="6500", expected_wages_per_week="9000", potential_deal_type="Permanent Transfer",
                      additional_information="single-value scenario")
    r4 = await create("blank_profile_agent_fills_profile", blank_agent, agent_number="+447700900123",
                      agent_name="Typed Name", agency="Typed Agency")
    ctx.record("profile::blank_agent_after", ctx.rows(
        f"SELECT AGENT_NUMBER FROM {T('agent_profiles')} WHERE USER_ID = %s", (blank_id,)))

    if r2:
        res = await ctx.call("edit::multi_lists_ranges", main.update_agent_recommendation, r2,
                             **form(linked, player_name="Scenario Player Edited", recommended_position="GK,LB",
                                    agreement_type="None", contract_options="+2 Club", potential_deal_type="Loan",
                                    transfer_fee=None, current_wages_per_week=None, expected_wages_per_week="20000",
                                    expected_wages_currency="GBP", wage_basis="Gross", additional_information="edited"),
                             current_user=agent)
        ctx.record("db::edited", snapshot(ctx, r2))
    if r1:
        await ctx.call("agent_status::withdrawn", main.update_agent_recommendation_status, r1,
                       main.AgentStatusUpdateRequest(new_agent_status="Withdrawn"), current_user=agent)
        ctx.record("db::after_agent_status", snapshot(ctx, r1))
        await ctx.call("internal_status::under_review_with_notes", main.update_internal_recommendation_status, r1,
                       main.RecommendationStatusUpdateRequest(new_status="Under Review", shared_notes="looks interesting"),
                       current_user=admin)
        ctx.record("db::after_internal_status", snapshot(ctx, r1))
        await ctx.call("edit::after_status_change_is_refused", main.update_agent_recommendation, r1,
                       **form(linked), current_user=agent)
    if r2:
        await ctx.call("internal_notes::update", main.update_internal_recommendation_notes, r2,
                       main.RecommendationNotesUpdateRequest(shared_notes="shared note v1"), current_user=admin)
        await ctx.call("internal_notes::update_again", main.update_internal_recommendation_notes, r2,
                       main.RecommendationNotesUpdateRequest(shared_notes="shared note v2"), current_user=admin)
        ctx.record("db::after_notes", snapshot(ctx, r2))
    bulk = [r for r in (r2, r3) if r]
    if bulk:
        await ctx.call("bulk_status", main.bulk_update_internal_recommendation_status,
                       main.BulkRecommendationStatusUpdateRequest(updates=[
                           main.BulkRecommendationStatusUpdateItem(recommendation_id=r, new_status="Not Currently under Consideration")
                           for r in bulk]), current_user=admin)
        for label, r in (("r2", r2), ("r3", r3)):
            if r:
                ctx.record(f"db::after_bulk::{label}", snapshot(ctx, r))
    if r4:
        ctx.record("db::blank_profile_final", snapshot(ctx, r4))
    ctx.record("row_count_delta", ctx.rows(f"SELECT COUNT(*) FROM {T('player_recommendations')}")[0][0] - before)
