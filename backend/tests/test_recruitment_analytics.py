from services.recruitment_analytics import aggregate


def player(external=1, internal=None, **kw):
    return dict(
        PLAYER_ID=external,
        CAFC_PLAYER_ID=internal,
        NAME=f"Player {external or internal}",
        CLUB="Club",
        POSITION="CM",
        COUNTRY="England",
        COMPETITION="League",
        **kw,
    )


def report(pid=1, internal=None, **kw):
    return dict(
        PLAYER_ID=pid,
        CAFC_PLAYER_ID=internal,
        ID=kw.pop("ID", 1),
        CREATED_AT=kw.pop("CREATED_AT", "2026-01-15"),
        FIXTURE_KEY=12,
        MODE=kw.pop("MODE", "Live"),
        SCOUT=(scout := kw.pop("SCOUT", "Phil Chapple")),
        SCOUT_ID=kw.pop(
            "SCOUT_ID", {"Phil Chapple": 302, "Calvin Charlton": 303}.get(scout, 999)
        ),
        **kw,
    )


def item(pid=1, **kw):
    return dict(
        PLAYER_ID=pid,
        CAFC_PLAYER_ID=None,
        LIST_ITEM_ID=kw.pop("LIST_ITEM_ID", 1),
        CREATED_AT="2025-01-01",
        STAGE=kw.pop("STAGE", "Stage 3"),
        **kw,
    )


def history(old=None, new="Stage 1", changed="2026-01-10", **kw):
    return dict(
        PLAYER_ID=kw.pop("PLAYER_ID", 1),
        CAFC_PLAYER_ID=None,
        LIST_ITEM_ID=kw.pop("LIST_ITEM_ID", 1),
        ID=kw.pop("ID", 1),
        OLD_STAGE=old,
        NEW_STAGE=new,
        CHANGED_AT=changed,
        SCOUT="Phil Chapple",
        **kw,
    )


def result(players=None, reports=None, items=None, events=None, filters=None):
    return aggregate(
        players or [player()],
        reports or [],
        items or [],
        events or [],
        "2026-01-01",
        "2026-01-31",
        filters or {},
    )


def test_fixture_overlap_and_distinct_player_senior_coverage():
    r = result(
        players=[player(), player(2)],
        reports=[
            report(ID=1),
            report(ID=2, MODE="Video", SCOUT="Calvin Charlton"),
            report(2, ID=3, SCOUT="Other"),
        ],
    )
    assert r["summary"]["fixtures"] == 1
    assert r["summary"]["live"] == r["summary"]["video"] == r["summary"]["both"] == 1
    assert r["summary"]["players"] == 2
    assert r["summary"]["senior_players"] == 1
    assert r["summary"]["senior_coverage"] == 50
    assert r["summary"]["reports"] == 3


def test_external_internal_id_collision_and_canonical_alias():
    r = result(
        players=[player(1, 100), player(None, 1)],
        reports=[report(None, 100), report(None, 1, ID=2)],
    )
    assert r["summary"]["players"] == 2
    assert {p["player_id"] for p in r["players"]} == {"external_1", "internal_1"}


def test_historical_snapshot_dedup_highest_stage_and_stage5():
    events = [history(new="Stage 2"), history(new="Stage 5", LIST_ITEM_ID=2, ID=2)]
    r = result(items=[item(STAGE="Stage 4"), item(LIST_ITEM_ID=2)], events=events)
    assert r["stage_counts"]["Stage 5"] == 1
    assert r["stage_counts"]["Stage 2"] == 0
    assert r["stage_counts"]["Stage 4"] == 0


def test_missing_history_is_unknown_not_projected_backwards():
    r = result(items=[item(STAGE="Stage 5")])
    assert r["stage_counts"]["Unknown"] == 1
    assert r["stage_counts"]["Stage 5"] == 0


def test_movement_headlines_distinct_players_but_sankey_counts_events():
    events = [
        history(),
        history("Stage 1", "Stage 3", "2026-01-11", ID=2),
        history("Stage 3", "Stage 5", "2026-01-12", ID=3),
        history("Stage 5", "Archived", "2026-01-13", ID=4),
    ]
    r = result(items=[item()], events=events)
    assert r["summary"]["new"] == 1
    assert r["summary"]["progressed"] == 1
    assert r["summary"]["archived"] == 1
    assert len(r["events"]) == 4
    assert sum(l["value"] for l in r["links"]) == 4


def test_reentry_is_not_a_new_player_and_return_is_not_progression():
    events = [
        history(changed="2025-01-01"),
        history("Stage 4", "Stage 2", ID=2),
        history(None, "Stage 1", "2026-01-20", ID=3, LIST_ITEM_ID=2),
    ]
    r = result(items=[item(), item(LIST_ITEM_ID=2)], events=events)
    assert r["summary"]["new"] == r["summary"]["progressed"] == 0


def test_stage_filter_keeps_full_market_denominator():
    r = result(
        players=[player(), player(2)],
        reports=[report(), report(2, ID=2)],
        items=[item()],
        events=[history(new="Stage 3")],
        filters={"stages": ["Stage 3"]},
    )
    assert r["summary"]["players"] == 1
    assert r["market"]["players"] == 2
    assert r["market"]["covered_players"] == 1


def test_date_boundaries_and_scout_filter_do_not_leak():
    rows = [
        report(CREATED_AT="2026-01-01"),
        report(ID=2, CREATED_AT="2026-01-31"),
        report(ID=3, CREATED_AT="2026-02-01"),
    ]
    r = result(reports=rows)
    assert r["summary"]["reports"] == 2
    assert result(reports=rows, filters={"scouts": ["99"]})["summary"]["reports"] == 0


def test_empty_denominators_are_not_zero_percent():
    r = result(filters={"competitions": ["Missing league"]})
    assert r["summary"]["senior_coverage"] is None
    assert r["market"]["players"] == 0


def test_competition_position_and_club_market_denominators():
    players=[player(),player(2),dict(player(3),CLUB='Other',POSITION='GK',COMPETITION='Other league')]
    r=result(players=players,reports=[report()],filters={'competitions':['League'],'positions':['CM']})
    assert r['market']['players']==2
    assert r['market']['teams']==1
    assert r['teams']==[{'name':'Club','competition':'League','covered':1,'total':2}]


def test_map_uses_playing_country_and_only_snapshot_stages_3_to_5():
    r=result(players=[dict(player(),COUNTRY='Belgium')],items=[item()],events=[history(new='Stage 3')])
    assert r['countries'][0]['name']=='Belgium'
    assert r['countries'][0]['stages']=={'Stage 3':1,'Stage 4':0,'Stage 5':0}


def test_seniors_are_matched_by_user_id_not_name():
    r = result(
        players=[player(), player(2), player(3)],
        reports=[
            report(ID=1, SCOUT="Calvin C.", SCOUT_ID=303),
            report(2, ID=2, SCOUT="Phil Chapple", SCOUT_ID=999),
            report(3, ID=3, SCOUT="Someone", SCOUT_ID=302),
        ],
    )
    assert r["summary"]["senior_players"] == 2
    assert {s["id"]: s["reports"] for s in r["seniors"]} == {302: 1, 303: 1}
    assert [x["senior"] for x in r["reports"]] == [True, False, True]


def test_clubless_player_is_covered_but_outside_the_market():
    r = result(
        players=[player(), dict(player(2), CLUB=None)],
        reports=[report(ID=1), report(2, ID=2)],
    )
    assert r["summary"]["players"] == 2
    assert r["market"]["players"] == 1
    assert r["market"]["covered_players"] == 1
    assert r["market"]["covered_without_club"] == 1
    assert sum(p["total"] for p in r["positions"]) == 1


def test_competition_coverage_counts_teams_and_players():
    r = result(
        players=[
            player(),
            dict(player(2), CLUB="Other"),
            dict(player(3), CLUB="Cup club", COMPETITION="Cup"),
        ],
        reports=[report(ID=1)],
    )
    league = next(c for c in r["competitions"] if c["name"] == "League")
    assert league == {
        "name": "League",
        "teams": 2,
        "covered_teams": 1,
        "players": 2,
        "covered_players": 1,
    }


def test_player_rows_carry_all_time_report_counts():
    r = result(
        reports=[report(ID=1, CREATED_AT="2025-06-01"), report(ID=2, CREATED_AT="2025-07-01")],
        items=[item()],
        events=[history(changed="2025-01-01")],
    )
    row = r["players"][0]
    assert (row["reports"], row["reports_all"]) == (0, 2)


def test_german_country_names_are_normalised_to_english():
    r = result(
        players=[dict(player(), COUNTRY="Frankreich"), dict(player(2), COUNTRY="unknown")],
        reports=[report(ID=1)],
        filters={"countries": ["France"]},
    )
    assert r["summary"]["players"] == 1
    assert "France" in r["options"]["countries"]
    assert "Frankreich" not in r["options"]["countries"]
    assert "Unknown" in [c["name"] for c in r["countries"]] or len(r["countries"]) == 1


def test_club_takes_the_league_most_of_its_players_are_in():
    players = [player(i) for i in range(1, 4)] + [
        dict(player(9), CLUB="Club", COMPETITION="Stray cup")
    ]
    r = result(players=players, reports=[report(9, ID=1)])
    assert [c["name"] for c in r["competitions"]] == ["League"]
    assert r["competitions"][0]["teams"] == 1
    assert r["market"]["teams"] == 1
