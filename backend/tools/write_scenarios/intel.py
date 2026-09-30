"""Intel write scenarios: create (each report type), validation errors, edit, read back through the list and detail
endpoints, delete. The recorded rows are read through the LEGACY name, so the same script runs against a schema that
still has the legacy table and one where it has become a view."""

LEGACY_COLUMNS = (
    "ID, CONTACT_NAME, CONTACT_ORGANISATION, DATE_OF_INFORMATION, CONTRACT_EXPIRY, CONTRACT_OPTIONS, "
    "POTENTIAL_DEAL_TYPE, TRANSFER_FEE, CURRENT_WAGES, EXPECTED_WAGES, CONVERSATION_NOTES, ACTION_REQUIRED, "
    "CREATED_AT, PLAYER_ID, USER_ID, DATA_SOURCE, EXPECTED_WAGES_MAX, EXPECTED_WAGES_MIN, CURRENT_WAGES_MAX, "
    "CURRENT_WAGES_MIN, INTEL_TYPE, RELATIONSHIP_TO_PLAYER, LENGTH_OF_RELATIONSHIP, RELEVANCE_OF_RELATIONSHIP, "
    "REFERENCE_RATING"
)
COLS = [c.strip() for c in LEGACY_COLUMNS.split(",")]
TIMESTAMPS = {"CREATED_AT"}


def snapshot(ctx, report_id):
    T = ctx.main.core_table
    row = ctx.rows(f"SELECT {LEGACY_COLUMNS} FROM {T('player_information')} WHERE ID = %s", (report_id,))
    if not row:
        return {"row": None}
    return {"row": {c: ("<ts>" if c in TIMESTAMPS and v is not None else v) for c, v in zip(COLS, row[0]) if c != "ID"}}


def report(main, player, **over):
    base = dict(
        player_id=player, intel_type="player_information", contact_name="Scenario Contact",
        contact_organisation="Scenario FC", date_of_information="2026-09-01", confirmed_contract_expiry="2027-06-30",
        contract_options="+ 1 Year Club Option", potential_deal_types=["permanent", "loan_with_option"],
        transfer_fee="1.5m", current_wages="8000", expected_wages="10000-12000",
        conversation_notes="Scenario notes", recommendation="Monitor",
    )
    base.update(over)
    return main.IntelReport(**base)


async def run(ctx):
    main, T = ctx.main, ctx.main.core_table
    # The endpoint resolves players through the read layer (read_table), so pick ids from there.
    R = main.read_table
    cafc_id = ctx.rows(f"SELECT CAFC_PLAYER_ID FROM {R('players')} WHERE DATA_SOURCE = 'internal' AND CAFC_PLAYER_ID IS NOT NULL "
                       f"ORDER BY CAFC_PLAYER_ID LIMIT 1")[0][0]
    impect_id = ctx.rows(f"SELECT PLAYERID FROM {R('players')} WHERE DATA_SOURCE = 'external' AND PLAYERID IS NOT NULL "
                         f"ORDER BY PLAYERID LIMIT 1")[0][0]
    admin_id, admin_name = ctx.rows(f"SELECT ID, USERNAME FROM {T('users')} WHERE ROLE = 'admin' ORDER BY ID LIMIT 1")[0]
    sm = ctx.rows(f"SELECT ID, USERNAME FROM {T('users')} WHERE ROLE = 'senior_manager' ORDER BY ID LIMIT 1")
    admin = main.User(id=admin_id, username=admin_name, role="admin")
    senior = main.User(id=sm[0][0], username=sm[0][1], role="senior_manager") if sm else admin
    scout = main.User(id=admin_id, username=admin_name, role="scout")
    internal, external = f"internal_{cafc_id}", f"external_{impect_id}"
    ctx.record("inputs", {"have_senior_manager": bool(sm)})
    before = ctx.rows(f"SELECT COUNT(*) FROM {T('player_information')}")[0][0]

    async def create(label, user, **over):
        res = await ctx.call(f"create::{label}", main.create_intel_report, report(main, **over), current_user=user)
        rid = (res or {}).get("intel_id") if isinstance(res, dict) else None
        real = next((k for k, v in ctx.id_map.items() if v == rid), None) if rid else None
        if real is not None:
            ctx.record(f"db::{label}", snapshot(ctx, real))
        return real

    i1 = await create("player_info_internal", admin, player=internal)
    i2 = await create("player_info_external_single_wages", senior, player=external, potential_deal_types=["na"],
                      current_wages="6500", expected_wages="9000", transfer_fee=None, contract_options=None,
                      contact_name="Second Contact", contact_organisation="Other FC")
    i3 = await create("general_note", admin, player=internal, intel_type="general_note", notes="A general note",
                      potential_deal_types=None, transfer_fee=None, current_wages=None, expected_wages=None,
                      recommendation=None, contract_options=None, confirmed_contract_expiry=None)
    i4 = await create("reference_form", admin, player=external, intel_type="reference_form",
                      relationship_to_player=["Worked With", "Played With"], length_of_relationship="1-2 Years",
                      relevance_of_relationship="Recent (Within 2 Years)", reference_rating="Positive", notes="Reference text",
                      potential_deal_types=None, transfer_fee=None, current_wages=None, expected_wages=None,
                      recommendation=None, contract_options=None, confirmed_contract_expiry=None)
    i5 = await create("same_contact_reused", admin, player=internal)
    await ctx.call("create::missing_contact_is_refused", main.create_intel_report,
                   report(main, internal, contact_name=""), current_user=admin)
    await ctx.call("create::scout_is_refused", main.create_intel_report, report(main, internal), current_user=scout)
    await ctx.call("create::unknown_player", main.create_intel_report, report(main, 999999999), current_user=admin)

    if i1:
        await ctx.call("edit::change_contact_deals_wages", main.update_intel_report, i1,
                       report(main, external, contact_name="Edited Contact", contact_organisation="Edited FC",
                              potential_deal_types=["free", "loan"], current_wages=None, expected_wages="20000",
                              transfer_fee="500k", conversation_notes="edited", recommendation="Sign"),
                       current_user=admin)
        ctx.record("db::edited", snapshot(ctx, i1))
    if i4:
        await ctx.call("edit::reference_form", main.update_intel_report, i4,
                       report(main, external, intel_type="reference_form", relationship_to_player=["Friend/Family"],
                              length_of_relationship="3+ Years", relevance_of_relationship="Recent (Within 2 Years)",
                              reference_rating="Mixed", notes="Edited reference", potential_deal_types=None,
                              transfer_fee=None, current_wages=None, expected_wages=None, recommendation=None,
                              contract_options=None, confirmed_contract_expiry=None), current_user=admin)
        ctx.record("db::edited_reference", snapshot(ctx, i4))
    if i2:
        await ctx.call("edit::type_change_to_general_note", main.update_intel_report, i2,
                       report(main, internal, intel_type="general_note", notes="now a note", potential_deal_types=None,
                              transfer_fee=None, current_wages=None, expected_wages=None, recommendation=None,
                              contract_options=None, confirmed_contract_expiry=None), current_user=admin)
        ctx.record("db::type_changed", snapshot(ctx, i2))
    await ctx.call("edit::missing_report", main.update_intel_report, 999999999, report(main, internal), current_user=admin)

    for label, rid in (("i1", i1), ("i3", i3), ("i4", i4)):
        if rid:
            await ctx.call(f"read::single::{label}", main.get_single_intel_report, rid, current_user=admin)
    await ctx.call("read::all", main.get_all_intel_reports, current_user=admin, page=1, limit=5)
    await ctx.call("read::all_filtered", main.get_all_intel_reports, current_user=admin, page=1, limit=5,
                   contact_name="Edited")

    if i3:
        await ctx.call("delete::general_note", main.delete_intel_report, i3, current_user=admin)
        ctx.record("db::deleted_general_note", snapshot(ctx, i3))
    if i5:
        await ctx.call("delete::same_contact_reused", main.delete_intel_report, i5, current_user=admin)
    await ctx.call("delete::missing", main.delete_intel_report, 999999999, current_user=admin)
    await ctx.call("delete::scout_is_refused", main.delete_intel_report, i1 or 1, current_user=scout)
    ctx.record("row_count_delta", ctx.rows(f"SELECT COUNT(*) FROM {T('player_information')}")[0][0] - before)
