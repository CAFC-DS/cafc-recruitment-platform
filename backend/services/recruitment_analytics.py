"""Read-only recruitment analytics and deterministic, database-free aggregation."""
from collections import Counter, defaultdict
from datetime import date

STAGES = [f"Stage {i}" for i in range(1, 6)]
# Senior recruitment scouts, by USERS.ID so a renamed account still counts.
SENIORS = {302: "Phil Chapple", 303: "Calvin Charlton"}


def is_senior(report):
    try:
        return int(report.get("SCOUT_ID")) in SENIORS
    except (TypeError, ValueError):
        return False


# Fixture country names arrive partly in German; show them in English so the
# country filter, map and lists agree.
COUNTRY_NAMES = {
    "Deutschland": "Germany", "Italien": "Italy", "Spanien": "Spain",
    "Vereinigte Staaten": "United States", "Brasilien": "Brazil",
    "Frankreich": "France", "Argentinien": "Argentina", "Norwegen": "Norway",
    "Türkei": "Turkey", "Polen": "Poland", "Niederlande": "Netherlands",
    "Schweden": "Sweden", "Kolumbien": "Colombia", "Schweiz": "Switzerland",
    "Belgien": "Belgium", "Tschechien": "Czechia",
    "Saudi-Arabien": "Saudi Arabia", "Dänemark": "Denmark",
    "Österreich": "Austria", "Südafrika": "South Africa", "Russland": "Russia",
    "Schottland": "Scotland", "Island": "Iceland", "Bolivien": "Bolivia",
    "Rumänien": "Romania", "Südkorea": "South Korea", "Serbien": "Serbia",
    "Mexiko": "Mexico", "Vereinigte Arabische Emirate": "United Arab Emirates",
    "Griechenland": "Greece", "Ungarn": "Hungary", "Finnland": "Finland",
    "Irland": "Ireland", "Kroatien": "Croatia", "Marokko": "Morocco",
    "Slowakei": "Slovakia", "Bulgarien": "Bulgaria", "Katar": "Qatar",
    "Lettland": "Latvia", "Slowenien": "Slovenia",
    "Nordirland": "Northern Ireland", "Litauen": "Lithuania",
    "Australien": "Australia", "Georgien": "Georgia", "Kanada": "Canada",
    "Zypern": "Cyprus", "Bosnien-Herzegowina": "Bosnia and Herzegovina",
    "Kasachstan": "Kazakhstan", "Usbekistan": "Uzbekistan",
    "Armenien": "Armenia", "Aserbaidschan": "Azerbaijan",
    "Moldawien": "Moldova", "Irak": "Iraq", "Estland": "Estonia",
    "Albanien": "Albania", "Färöer": "Faroe Islands", "Hongkong": "Hong Kong",
    "Luxemburg": "Luxembourg", "Jordanien": "Jordan", "Singapur": "Singapore",
    "Neuseeland": "New Zealand", "Ägypten": "Egypt", "Indien": "India",
    "Nordmazedonien": "North Macedonia", "Tunesien": "Tunisia",
    "Jamaika": "Jamaica", "Dominikanische Republik": "Dominican Republic",
    "Tadschikistan": "Tajikistan", "Indonesien": "Indonesia",
    "Philippinen": "Philippines", "Französisch-Guayana": "French Guiana",
    "Neukaledonien": "New Caledonia",
}


def country_name(value):
    if not value or str(value).strip().lower() == "unknown":
        return None
    return COUNTRY_NAMES.get(value, value)


def identity(row):
    # External and internal numeric IDs occupy different namespaces.
    if row.get("PLAYER_ID") is not None:
        return f"external_{int(row['PLAYER_ID'])}"
    if row.get("CAFC_PLAYER_ID") is not None:
        return f"internal_{int(row['CAFC_PLAYER_ID'])}"
    return None


def day(value):
    return str(value)[:10] if value else None


def aggregate(players, reports, items, history, start, end, filters):
    # A club belongs to the league most of its players are in. Single players
    # whose competition comes from a stray cup or loan iteration would
    # otherwise add their club to the wrong league (e.g. 32 "League Two" clubs).
    club_leagues = defaultdict(Counter)
    for p in players:
        if p.get("CLUB") and p.get("COMPETITION"):
            club_leagues[p["CLUB"]][p["COMPETITION"]] += 1
    league_of = {c: n.most_common(1)[0][0] for c, n in club_leagues.items()}
    players = {
        identity(p): dict(
            p,
            COUNTRY=country_name(p.get("COUNTRY")),
            COMPETITION=league_of.get(p.get("CLUB"), p.get("COMPETITION")),
        )
        for p in players
        if identity(p)
    }
    aliases = {}
    for key, p in players.items():
        if p.get("CAFC_PLAYER_ID") is not None:
            aliases[f"internal_{int(p['CAFC_PLAYER_ID'])}"] = key

    def key(row):
        value = identity(row)
        return aliases.get(value, value)

    def label(p, field):
        return str(p.get(field) or "Unknown")

    histories = defaultdict(list)
    for h in history:
        h = dict(h, key=key(h))
        if h["key"] and day(h.get("CHANGED_AT")) and day(h["CHANGED_AT"]) <= end:
            histories[str(h["LIST_ITEM_ID"])].append(h)
    for events in histories.values():
        events.sort(key=lambda h: (str(h["CHANGED_AT"]), int(h.get("ID") or 0)))
    stage_sets = defaultdict(set)
    for item in items:
        k = key(item)
        if not k or (day(item.get("CREATED_AT")) or "9999") > end:
            continue
        events = histories.get(str(item["LIST_ITEM_ID"]), [])
        if end >= date.today().isoformat():
            stage = item.get("STAGE")
        elif events:
            stage = events[-1]["NEW_STAGE"]
        else:
            # Never project today's stage backwards across missing history.
            stage = "Unknown"
        stage_sets[k].add(stage or "Unknown")

    def stage_rank(s):
        return STAGES.index(s) if s in STAGES else -1

    snapshot = {
        k: max(stages, key=stage_rank)
        if any(s in STAGES for s in stages)
        else ("Archived" if "Archived" in stages else "Unknown")
        for k, stages in stage_sets.items()
    }

    def market_match(p):
        return all(
            not filters.get(f) or label(p, col) in filters[f]
            for f, col in [
                ("competitions", "COMPETITION"),
                ("countries", "COUNTRY"),
                ("positions", "POSITION"),
                ("clubs", "CLUB"),
            ]
        )

    # population: every player matching the filters (drives covered players,
    # stage totals and drilldowns). market: the subset currently at a club,
    # which is the only denominator for market coverage.
    population = {k: p for k, p in players.items() if market_match(p)}
    market = {k: p for k, p in population.items() if p.get("CLUB")}
    cohort = {
        k
        for k in population
        if not filters.get("stages") or snapshot.get(k, "Unlisted") in filters["stages"]
    }
    dated_reports = [
        r for r in reports if start <= (day(r.get("CREATED_AT")) or "") <= end
    ]

    def report_match(r):
        return (
            not filters.get("scouts") or str(r.get("SCOUT_ID")) in filters["scouts"]
        ) and (
            not filters.get("mode")
            or str(r.get("MODE") or "").lower() == filters["mode"]
        )

    matched = [r for r in dated_reports if key(r) in cohort and report_match(r)]
    # When selecting a scout/method, pipeline views describe their reported-player cohort.
    if filters.get("scouts") or filters.get("mode"):
        cohort &= {key(r) for r in matched}
    covered = {key(r) for r in matched}
    senior_reports = [r for r in matched if is_senior(r)]
    senior_players = {key(r) for r in senior_reports}
    fixture_modes = defaultdict(set)
    for r in matched:
        if r.get("FIXTURE_KEY"):
            fixture_modes[str(r["FIXTURE_KEY"])].add(str(r.get("MODE") or "").lower())
    senior_counts = [
        {
            "id": sid,
            "name": name,
            "reports": sum(int(r["SCOUT_ID"]) == sid for r in senior_reports),
            "players": len(
                {key(r) for r in senior_reports if int(r["SCOUT_ID"]) == sid}
            ),
        }
        for sid, name in SENIORS.items()
    ]
    events, seen = [], set()
    first = {}
    for rows in histories.values():
        for h in rows:
            k = h["key"]
            first[k] = min(first.get(k, day(h["CHANGED_AT"])), day(h["CHANGED_AT"]))
    for rows in histories.values():
        for h in rows:
            k = h["key"]
            if (
                k not in cohort
                or not start <= day(h["CHANGED_AT"]) <= end
                or h.get("OLD_STAGE") == h.get("NEW_STAGE")
            ):
                continue
            signature = (
                k,
                h.get("OLD_STAGE"),
                h.get("NEW_STAGE"),
                str(h["CHANGED_AT"]),
            )
            if signature in seen:
                continue
            seen.add(signature)
            old, new = h.get("OLD_STAGE"), h.get("NEW_STAGE")
            category = (
                "new"
                if not old and first[k] == day(h["CHANGED_AT"])
                else "archived"
                if new == "Archived"
                else "progressed"
                if old in STAGES and new in STAGES and stage_rank(new) > stage_rank(old)
                else "other"
            )
            p = population[k]
            events.append(
                {
                    "player_id": k,
                    "name": label(p, "NAME"),
                    "club": label(p, "CLUB"),
                    "position": label(p, "POSITION"),
                    "from": old
                    or ("New entrants" if category == "new" else "List additions"),
                    "to": new,
                    "date": str(h["CHANGED_AT"]),
                    "scout": h.get("SCOUT") or "Unknown",
                    "category": category,
                }
            )
    links = Counter((e["from"], e["to"]) for e in events)
    stage_counts = Counter(snapshot.get(k) for k in cohort if snapshot.get(k))
    positions = []
    for pos in sorted({label(p, "POSITION") for p in population.values()}):
        ids = {k for k, p in market.items() if label(p, "POSITION") == pos}
        positions.append(
            {
                "name": pos,
                # every covered player in the position (matches the drilldown)
                "players": sum(
                    1 for k in covered if label(population[k], "POSITION") == pos
                ),
                # market share: covered players at a club / players at a club
                "covered": len(ids & covered),
                "total": len(ids),
            }
        )
    countries = []
    for country in sorted({label(p, "COUNTRY") for p in population.values()}):
        ids = {k for k, p in population.items() if label(p, "COUNTRY") == country}
        counts = Counter(snapshot.get(k) for k in ids & cohort)
        countries.append(
            {
                "name": country,
                "covered": len(ids & covered),
                "total": len(ids),
                "stages": {s: counts[s] for s in STAGES[2:]},
            }
        )
    months = defaultdict(lambda: {"reports": 0, "live": set(), "video": set()})
    for r in matched:
        m = months[day(r["CREATED_AT"])[:7]]
        m["reports"] += 1
        mode = str(r.get("MODE") or "").lower()
        if mode in ("live", "video") and r.get("FIXTURE_KEY"):
            m[mode].add(str(r["FIXTURE_KEY"]))
    teams = {
        (label(p, "COMPETITION"), label(p, "CLUB"))
        for p in market.values()
        if p.get("CLUB")
    }
    covered_teams = {
        (label(market[k], "COMPETITION"), label(market[k], "CLUB"))
        for k in covered
        if k in market
    }
    team_groups = defaultdict(set)
    for k, p in market.items():
        if p.get("CLUB"):
            team_groups[(label(p, "COMPETITION"), label(p, "CLUB"))].add(k)
    team_coverage = sorted(
        [
            {
                "name": club,
                "competition": competition,
                "covered": len(ids & covered),
                "total": len(ids),
            }
            for (competition, club), ids in team_groups.items()
        ],
        key=lambda t: (-t["covered"], t["name"]),
    )
    competitions = defaultdict(
        lambda: {"teams": set(), "covered_teams": set(), "players": 0, "covered": 0}
    )
    for k, p in market.items():
        c = competitions[label(p, "COMPETITION")]
        c["teams"].add(p["CLUB"])
        c["players"] += 1
        if k in covered:
            c["covered"] += 1
            c["covered_teams"].add(p["CLUB"])
    competition_coverage = sorted(
        [
            {
                "name": name,
                "teams": len(c["teams"]),
                "covered_teams": len(c["covered_teams"]),
                "players": c["players"],
                "covered_players": c["covered"],
            }
            for name, c in competitions.items()
        ],
        key=lambda c: (-c["covered_players"], -c["players"], c["name"]),
    )
    player_rows = []
    counts = Counter(key(r) for r in matched)
    # All-time count (any scout, any date) so a listed player with no report in
    # the selected period is not mistaken for one who has never been reported.
    all_time = Counter(key(r) for r in reports)
    for k in sorted(cohort):
        p = population[k]
        if k in covered or snapshot.get(k):
            player_rows.append(
                {
                    "player_id": k,
                    "name": label(p, "NAME"),
                    "club": label(p, "CLUB"),
                    "country": label(p, "COUNTRY"),
                    "competition": label(p, "COMPETITION"),
                    "position": label(p, "POSITION"),
                    "stage": snapshot.get(k, "Unlisted"),
                    "reports": counts[k],
                    "reports_all": all_time[k],
                    "in_market": k in market,
                    "senior": k in senior_players,
                }
            )
    report_rows = [
        {
            "id": int(r["ID"]),
            "player_id": key(r),
            "name": label(population[key(r)], "NAME"),
            "scout": r.get("SCOUT") or "Unknown",
            "senior": is_senior(r),
            "date": str(r["CREATED_AT"]),
            "mode": r.get("MODE") or "Unknown",
            "fixture": r.get("FIXTURE_KEY"),
            "fixture_label": r.get("FIXTURE_LABEL"),
            "fixture_date": day(r.get("FIXTURE_DATE")),
        }
        for r in matched
    ]
    return {
        "summary": {
            "fixtures": len(fixture_modes),
            "live": sum("live" in m for m in fixture_modes.values()),
            "video": sum("video" in m for m in fixture_modes.values()),
            "both": sum({"live", "video"} <= m for m in fixture_modes.values()),
            "players": len(covered),
            "reports": len(matched),
            "senior_players": len(senior_players),
            "senior_coverage": round(100 * len(senior_players) / len(covered), 1)
            if covered
            else None,
            "new": len({e["player_id"] for e in events if e["category"] == "new"}),
            "progressed": len(
                {e["player_id"] for e in events if e["category"] == "progressed"}
            ),
            "archived": len(
                {e["player_id"] for e in events if e["category"] == "archived"}
            ),
        },
        "market": {
            "players": len(market),
            "covered_players": len(covered & market.keys()),
            "teams": len(teams),
            "covered_teams": len(covered_teams),
            # Covered players with no current club sit outside the market.
            "covered_without_club": len(covered - market.keys()),
        },
        "competitions": competition_coverage,
        "stage_counts": {s: stage_counts[s] for s in STAGES + ["Archived", "Unknown"]},
        "links": [
            {"from": a, "to": b, "value": n}
            for (a, b), n in sorted(links.items(), key=lambda x: str(x[0]))
        ],
        "events": sorted(events, key=lambda e: e["date"], reverse=True),
        "players": player_rows,
        "reports": report_rows,
        "teams": team_coverage,
        "positions": positions,
        "countries": countries,
        "seniors": senior_counts,
        "timeline": [
            {
                "month": m,
                "reports": v["reports"],
                "live": len(v["live"]),
                "video": len(v["video"]),
            }
            for m, v in sorted(months.items())
        ],
        "options": {
            **{
                f: sorted({label(p, col) for p in players.values()})
                for f, col in [
                    ("competitions", "COMPETITION"),
                    ("countries", "COUNTRY"),
                    ("positions", "POSITION"),
                    ("clubs", "CLUB"),
                ]
            },
            "scouts": sorted(
                {
                    str(r["SCOUT_ID"]): str(r.get("SCOUT") or "Unknown")
                    for r in reports
                    if r.get("SCOUT_ID") is not None
                }.items(),
                key=lambda s: s[1],
            ),
        },
        "start_date": start,
        "end_date": end,
    }


def load_dataset(cursor, read_table, core_table, squad_competition):
    """Fetch minimal source rows; query results are cached server-side by the caller."""
    cursor.execute(
        f"""
        WITH club_country AS (
            SELECT CLUB, COUNTRY FROM (
                SELECT HOMESQUADNAME AS CLUB, HOMESQUADCOUNTRYNAME AS COUNTRY, SCHEDULEDDATE AS D
                FROM {read_table('matches')}
                UNION ALL
                SELECT AWAYSQUADNAME, AWAYSQUADCOUNTRYNAME, SCHEDULEDDATE FROM {read_table('matches')}
            ) WHERE CLUB IS NOT NULL AND COUNTRY IS NOT NULL
            QUALIFY ROW_NUMBER() OVER (PARTITION BY CLUB ORDER BY D DESC NULLS LAST, COUNTRY) = 1
        )
        SELECT p.PLAYERID AS PLAYER_ID, p.CAFC_PLAYER_ID, p.PLAYERNAME AS NAME,
               p.SQUADNAME AS CLUB, p.POSITION, c.COUNTRY,
               COALESCE(sl.COMPETITION_NAME, p.COMPETITIONNAME) AS COMPETITION
        FROM {read_table('players')} p
        LEFT JOIN club_country c ON p.SQUADNAME = c.CLUB
        LEFT JOIN {squad_competition()} sl ON sl.SQUAD_NAME = p.SQUADNAME
    """
    )
    players = cursor.fetchall()
    cursor.execute(
        f"""
        SELECT sr.ID, sr.PLAYER_ID, sr.CAFC_PLAYER_ID, sr.CREATED_AT,
               sr.MATCH_ID AS FIXTURE_KEY, sr.SCOUTING_TYPE AS MODE,
               u.ID AS SCOUT_ID, COALESCE(NULLIF(TRIM(CONCAT(u.FIRSTNAME, ' ', u.LASTNAME)), ''), u.USERNAME) AS SCOUT,
               CONCAT_WS(' v ', m.HOMESQUADNAME, m.AWAYSQUADNAME) AS FIXTURE_LABEL,
               m.SCHEDULEDDATE AS FIXTURE_DATE
        FROM {core_table('scout_reports')} sr
        LEFT JOIN {core_table('users')} u ON sr.USER_ID = u.ID
        -- Equi-join on the derived match key (external ID / internal CAFC_MATCH_ID).
        LEFT JOIN (
            SELECT HOMESQUADNAME, AWAYSQUADNAME, SCHEDULEDDATE,
                   IFF(DATA_SOURCE = 'external', ID,
                       IFF(DATA_SOURCE = 'internal', CAFC_MATCH_ID, NULL)) AS JOIN_MATCH_ID
            FROM {read_table('matches')}
        ) m ON sr.MATCH_ID = m.JOIN_MATCH_ID
        WHERE COALESCE(sr.IS_ARCHIVED, FALSE) = FALSE
          AND sr.REPORT_TYPE IN ('Player Assessment', 'Flag')
        -- Some fixtures are stored twice in matches; keep one row per report.
        QUALIFY ROW_NUMBER() OVER (PARTITION BY sr.ID ORDER BY m.SCHEDULEDDATE) = 1
    """
    )
    reports = cursor.fetchall()
    cursor.execute(
        f"""
        SELECT pli.ID AS LIST_ITEM_ID, pli.PLAYER_ID, pli.CAFC_PLAYER_ID, pli.STAGE, pli.CREATED_AT
        FROM {core_table('player_list_items')} pli
        JOIN {core_table('player_lists')} pl ON pl.ID = pli.LIST_ID
        WHERE pl.LIST_CATEGORY = 'first_team'
    """
    )
    items = cursor.fetchall()
    cursor.execute(
        f"""
        SELECT h.ID, h.LIST_ITEM_ID, pli.PLAYER_ID, pli.CAFC_PLAYER_ID,
               h.OLD_STAGE, h.NEW_STAGE, COALESCE(h.CHANGED_AT, pli.CREATED_AT) AS CHANGED_AT,
               COALESCE(NULLIF(TRIM(CONCAT(u.FIRSTNAME, ' ', u.LASTNAME)), ''), u.USERNAME) AS SCOUT
        FROM {core_table('player_stage_history')} h
        JOIN {core_table('player_list_items')} pli ON pli.ID = h.LIST_ITEM_ID
        JOIN {core_table('player_lists')} pl ON pl.ID = pli.LIST_ID
        LEFT JOIN {core_table('users')} u ON u.ID = h.CHANGED_BY
        WHERE pl.LIST_CATEGORY = 'first_team'
    """
    )
    return players, reports, items, cursor.fetchall()
