"""
Read-only data-quality profile of exactly the tables the recruitment platform reads and writes.

Every statement is a SELECT (or SHOW/DESCRIBE); nothing is modified. Safe to run against live
CAFC_DB.CORE. Prints one line per check so the output can be diffed between runs (before/after a fix).

    python tools/profile_recruitment_tables.py              # all sections
    python tools/profile_recruitment_tables.py users recs   # named sections only

Sections: users recs intel lists sharing canonical

Connection: same environment variables as run_normalization_migrations.py
(SNOWFLAKE_PRIVATE_KEY inline PEM or SNOWFLAKE_[DEV_]PRIVATE_KEY_PATH, SNOWFLAKE_ACCOUNT,
SNOWFLAKE_USER[NAME], SNOWFLAKE_WAREHOUSE, SNOWFLAKE_ROLE). Override the schema with PROFILE_CORE.
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from run_normalization_migrations import connect  # noqa: E402

C = os.getenv("PROFILE_CORE", "CAFC_DB.CORE") + "."
IMPECT = f"(select source_player_id from {C}CORE_PLAYER_ID_RESOLUTIONS where source_system='IMPECT')"

cur = None


def q(label, sql, n=12):
    try:
        assert sql.lstrip().lower().startswith(("select", "show", "describe", "with")), "read-only runner"
        cur.execute(sql)
        rows = cur.fetchall()
        shown = str(rows[0][0]) if len(rows) == 1 and len(rows[0]) == 1 else str(rows[:n])
        more = f" ...(+{len(rows) - n})" if len(rows) > n else ""
        print(f"- {label}: {shown}{more}")
    except Exception as exc:  # noqa: BLE001 - keep profiling; report the failure
        print(f"- {label}: ERR {str(exc)[:110]}")


def users():
    print("##### USERS / AGENT_PROFILES / PASSWORD_RESET_TOKENS")
    q("USERS by role", f"select role, count(*) from {C}USERS group by 1 order by 2 desc")
    q("dup usernames (case-insens) / dup emails / blank email",
      f"select (select count(*) from (select 1 from {C}USERS group by lower(username) having count(*)>1)),"
      f" (select count(*) from (select 1 from {C}USERS where email is not null group by lower(trim(email)) having count(*)>1)),"
      f" (select count_if(email is null or trim(email)='') from {C}USERS)")
    q("password hash prefixes", f"select left(hashed_password,4), count(*) from {C}USERS group by 1")
    q("blank first/last name", f"select count_if(nullif(trim(firstname),'') is null), count_if(nullif(trim(lastname),'') is null) from {C}USERS")
    q("non-agent users never referenced (reports/lists/views)",
      f"select count(*) from {C}USERS u where u.role<>'agent' and u.id not in (select user_id from {C}SCOUT_REPORTS where user_id is not null)"
      f" and u.id not in (select coalesce(user_id,-1) from {C}PLAYER_LISTS) and u.id not in (select user_id from {C}SCOUT_REPORT_VIEWS)")
    q("agent users / profiles / agent-no-profile / profile-no-user / profile-for-non-agent",
      f"select (select count(*) from {C}USERS where role='agent'), (select count(*) from {C}AGENT_PROFILES),"
      f" (select count(*) from {C}USERS where role='agent' and id not in (select user_id from {C}AGENT_PROFILES)),"
      f" (select count(*) from {C}AGENT_PROFILES where user_id not in (select id from {C}USERS)),"
      f" (select count(*) from {C}AGENT_PROFILES p join {C}USERS u on u.id=p.user_id where u.role<>'agent')")
    q("profile blank name/agency/email/number",
      f"select count_if(nullif(trim(agent_name),'') is null), count_if(nullif(trim(agency),'') is null),"
      f" count_if(nullif(trim(agent_email),'') is null), count_if(nullif(trim(agent_number),'') is null) from {C}AGENT_PROFILES")
    q("profile email differs from user email",
      f"select count_if(lower(trim(p.agent_email)) is distinct from lower(trim(u.email))) from {C}AGENT_PROFILES p join {C}USERS u on u.id=p.user_id")
    q("RESET_TOKENS rows / null id / orphan user / expired-but-active",
      f"select count(*), count_if(id is null), count_if(user_id not in (select id from {C}USERS)),"
      f" count_if(is_active and expires_at<current_timestamp()) from {C}PASSWORD_RESET_TOKENS")


def recs():
    print("##### PLAYER_RECOMMENDATIONS / STATUS_HISTORY / RECOMMENDATION_NOTES_HISTORY")
    R = f"{C}PLAYER_RECOMMENDATIONS"
    q("status x agent_status", f"select status, agent_status, count(*) from {R} group by 1,2 order by 3 desc")
    q("submitter null / orphan; status_updated_by orphan",
      f"select count_if(submitted_by_user_id is null), count_if(submitted_by_user_id not in (select id from {C}USERS)),"
      f" count_if(status_updated_by is not null and status_updated_by not in (select id from {C}USERS)) from {R}")
    q("submitter role", f"select u.role, count(*) from {R} r left join {C}USERS u on u.id=r.submitted_by_user_id group by 1")
    q("recs w/o history; orphan history; orphan notes",
      f"select (select count(*) from {R} where id not in (select recommendation_id from {C}STATUS_HISTORY)),"
      f" (select count(*) from {C}STATUS_HISTORY where recommendation_id not in (select id from {R})),"
      f" (select count(*) from {C}RECOMMENDATION_NOTES_HISTORY where recommendation_id not in (select id from {R}))")
    q("status <> latest history",
      f"select count(*) from {R} pr join (select recommendation_id, new_status from {C}STATUS_HISTORY qualify row_number() over"
      f" (partition by recommendation_id order by changed_at desc nulls last, id desc)=1) h on h.recommendation_id=pr.id where pr.status is distinct from h.new_status")
    q("blank player_name/agent_name/agent_email/date/created_at",
      f"select count_if(nullif(trim(player_name),'') is null), count_if(nullif(trim(agent_name),'') is null),"
      f" count_if(nullif(trim(agent_email),'') is null), count_if(date is null), count_if(created_at is null) from {R}")
    q("future DATE / contract_expiry<date / implausible DOB",
      f"select count_if(date>current_date()), count_if(contract_expiry<date),"
      f" count_if(player_date_of_birth is not null and (player_date_of_birth<'1975-01-01' or player_date_of_birth>dateadd(year,-14,current_date()))) from {R}")
    q("wages: legacy / amount / min populated; legacy<>amount; min>max cur/exp",
      f"select count_if(current_wages is not null), count_if(current_wages_amount is not null), count_if(current_wages_min is not null),"
      f" count_if(current_wages is not null and current_wages_amount is not null and current_wages<>current_wages_amount),"
      f" count_if(current_wages_min>current_wages_max), count_if(expected_wages_min>expected_wages_max) from {R}")
    q("fee: text / amount / text-without-amount / min>max",
      f"select count_if(nullif(trim(transfer_fee),'') is not null), count_if(transfer_fee_amount is not null),"
      f" count_if(nullif(trim(transfer_fee),'') is not null and transfer_fee_amount is null), count_if(transfer_fee_min>transfer_fee_max) from {R}")
    q("currency combos", f"select transfer_fee_currency, current_wages_currency, expected_wages_currency, count(*) from {R} group by 1,2,3 order by 4 desc", 8)
    q("amount with no currency (fee, wages)",
      f"select count_if(transfer_fee_amount is not null and transfer_fee_currency is null), count_if(current_wages_amount is not null and current_wages_currency is null) from {R}")
    q("wage_basis", f"select wage_basis, count(*) from {R} group by 1")
    q("agreement_type", f"select agreement_type, count(*) from {R} group by 1 order by 2 desc", 8)
    q("recommended_position", f"select recommended_position, count(*) from {R} group by 1 order by 2 desc", 10)
    q("LINKED_UNIVERSAL_ID null / set / resolvable",
      f"select count_if(linked_universal_id is null), count_if(linked_universal_id is not null),"
      f" count_if(regexp_substr(linked_universal_id,'[0-9]+') in {IMPECT}) from {R}")
    q("linked to a retired player",
      f"select count(*) from {R} r join {C}CORE_PLAYER_ID_RESOLUTIONS x on x.source_system='IMPECT' and x.source_player_id=regexp_substr(r.linked_universal_id,'[0-9]+')"
      f" join {C}PLAYERS p on p.cafc_player_id=x.cafc_player_id where not p.is_active")
    q("probable duplicate recs (agent email + player name)",
      f"select count(*), sum(n-1) from (select count(*) n from {R} group by lower(trim(agent_email)), lower(trim(player_name)) having count(*)>1)")
    q("same player from different agents",
      f"select count(*) from (select lower(trim(player_name)) from {R} group by 1 having count(distinct lower(trim(agent_email)))>1)")
    q("internal_notes populated / recs with notes-history rows",
      f"select count_if(nullif(trim(internal_notes),'') is not null), (select count(distinct recommendation_id) from {C}RECOMMENDATION_NOTES_HISTORY) from {R}")
    q("distinct agent emails on recs / distinct submitters",
      f"select count(distinct lower(trim(agent_email))), count(distinct submitted_by_user_id) from {R}")
    q("staff-entered recs (submitter not agent role)",
      f"select count(*) from {R} r join {C}USERS u on u.id=r.submitted_by_user_id where u.role<>'agent'")


def intel():
    print("##### PLAYER_INFORMATION (intel; no PK) / PLAYER_NOTES")
    P = f"{C}PLAYER_INFORMATION"
    q("rows / null id / duplicate id", f"select count(*), count_if(id is null), count(*)-count(distinct id) from {P}")
    q("intel_type x data_source", f"select intel_type, data_source, count(*) from {P} group by 1,2")
    q("user null / orphan", f"select count_if(user_id is null), count_if(user_id not in (select id from {C}USERS)) from {P}")
    q("player_id null / resolves via IMPECT / is a CAFC id",
      f"select count_if(player_id is null), count_if(to_varchar(player_id) in {IMPECT}), count_if(player_id in (select cafc_player_id from {C}PLAYERS)) from {P}")
    q("deal-type vocabulary", f"select potential_deal_type, count(*) from {P} group by 1 order by 2 desc", 14)
    q("blank contact / notes / date", f"select count_if(nullif(trim(contact_name),'') is null), count_if(nullif(trim(conversation_notes),'') is null), count_if(date_of_information is null) from {P}")
    q("dates: future date_of_information / created_at range", f"select count_if(date_of_information>current_date()), min(created_at), max(created_at) from {P}")
    q("wages min>max / legacy vs range", f"select count_if(current_wages_min>current_wages_max), count_if(expected_wages_min>expected_wages_max), count_if(current_wages is not null), count_if(current_wages_min is not null) from {P}")
    q("PLAYER_NOTES rows / orphan user / player resolves",
      f"select count(*), count_if(user_id not in (select id from {C}USERS)), count_if(to_varchar(player_id) in {IMPECT}) from {C}PLAYER_NOTES")


def lists():
    print("##### PLAYER_LISTS / PLAYER_LIST_ITEMS / PLAYER_STAGE_HISTORY / PLAYER_LIST_FLAGS")
    L, I, H, F = f"{C}PLAYER_LISTS", f"{C}PLAYER_LIST_ITEMS", f"{C}PLAYER_STAGE_HISTORY", f"{C}PLAYER_LIST_FLAGS"
    q("lists by category (n, names)", f"select list_category, count(*), listagg(distinct list_name, ',') from {L} group by 1")
    q("lists: orphan owner / blank name / duplicate (category,name)",
      f"select count_if(user_id is not null and user_id not in (select id from {C}USERS)), count_if(nullif(trim(list_name),'') is null),"
      f" (select count(*) from (select 1 from {L} group by list_category, list_name having count(*)>1)) from {L}")
    q("items: null list / orphan list / orphan adder",
      f"select count_if(list_id is null), count_if(list_id not in (select id from {L})), count_if(added_by is not null and added_by not in (select id from {C}USERS)) from {I}")
    q("items: player linkage (both/cafc only/impect only/neither)",
      f"select count_if(cafc_player_id is not null and player_id is not null), count_if(cafc_player_id is not null and player_id is null),"
      f" count_if(cafc_player_id is null and player_id is not null), count_if(cafc_player_id is null and player_id is null) from {I}")
    q("items: cafc id not in PLAYERS / impect unresolvable",
      f"select count_if(i.cafc_player_id is not null and p.cafc_player_id is null),"
      f" count_if(i.cafc_player_id is null and i.player_id is not null and r.cafc_player_id is null)"
      f" from {I} i left join {C}PLAYERS p on p.cafc_player_id = i.cafc_player_id"
      f" left join {C}CORE_PLAYER_ID_RESOLUTIONS r on r.source_system='IMPECT' and r.source_player_id = to_varchar(i.player_id)")
    q("same player twice in one list", f"select count(*), sum(n-1) from (select count(*) n from {I} group by list_id, coalesce(cafc_player_id, player_id) having count(*)>1)")
    q("same player in several lists of the same category", f"select count(*) from (select 1 from {I} i join {L} l on l.id=i.list_id group by l.list_category, coalesce(i.cafc_player_id,i.player_id) having count(distinct i.list_id)>1)")
    q("stage x category", f"select l.list_category, i.stage, count(*) from {I} i join {L} l on l.id=i.list_id group by 1,2 order by 1,2", 20)
    q("DISPLAY_ORDER duplicates within list / negative", f"select (select count(*) from (select 1 from {I} group by list_id, display_order having count(*)>1)), count_if(display_order<0) from {I}")
    q("history: orphan item / orphan list / orphan user",
      f"select count_if(list_item_id not in (select id from {I})), count_if(list_id not in (select id from {L})), count_if(changed_by not in (select id from {C}USERS)) from {H}")
    q("history: LIST_ID disagrees with item's list",
      f"select count(*) from {H} h join {I} i on i.id=h.list_item_id where h.list_id is distinct from i.list_id")
    q("history: null changed_at / rows with NULL old_stage (entry events)",
      f"select count_if(changed_at is null), count_if(old_stage is null) from {H}")
    q("items whose STAGE <> latest history NEW_STAGE (of items with history)",
      f"select count(*), count_if(i.stage is distinct from h.new_stage) from {I} i join (select list_item_id, new_stage from {H} qualify row_number() over"
      f" (partition by list_item_id order by changed_at desc nulls last, id desc)=1) h on h.list_item_id=i.id")
    q("items with NO history", f"select count(*) from {I} where id not in (select list_item_id from {H})")
    q("history stage vocabulary", f"select new_stage, count(*) from {H} group by 1 order by 2 desc")
    q("FLAGS: rows / universal_id shapes / favorited_by orphan / resolvable",
      f"select count(*), listagg(distinct regexp_replace(universal_id,'[0-9]+','N'), ','), count_if(favorited_by is not null and favorited_by not in (select id from {C}USERS)),"
      f" count_if(regexp_substr(universal_id,'[0-9]+') in {IMPECT}) from {F}")


def sharing():
    print("##### SCOUT_REPORT_VIEWS / SHARED_REPORT_LINKS")
    V, S = f"{C}SCOUT_REPORT_VIEWS", f"{C}SHARED_REPORT_LINKS"
    q("views: rows / orphan report / orphan user (deleted users) / dup (report,user)",
      f"select count(*), count_if(scout_report_id not in (select id from {C}SCOUT_REPORTS)), count_if(user_id not in (select id from {C}USERS)),"
      f" (select count(*) from (select 1 from {V} group by scout_report_id, user_id having count(*)>1)) from {V}")
    q("views by user role", f"select u.role, count(*) from {V} v join {C}USERS u on u.id=v.user_id group by 1")
    q("views: viewed_at before the report was created", f"select count(*) from {V} v join {C}SCOUT_REPORTS r on r.id=v.scout_report_id where v.viewed_at<r.created_at")
    q("links: rows / orphan report / orphan creator / active / expired-but-active",
      f"select count(*), count_if(report_id not in (select id from {C}SCOUT_REPORTS)), count_if(created_by not in (select id from {C}USERS)),"
      f" count_if(is_active), count_if(is_active and expires_at<current_timestamp()) from {S}")
    q("links: never accessed / access_count vs last_accessed inconsistent",
      f"select count_if(access_count=0), count_if((access_count>0) <> (last_accessed is not null)) from {S}")
    q("links: token length / non-url-safe", f"select min(length(share_token)), max(length(share_token)), count_if(regexp_like(share_token,'.*[^A-Za-z0-9_-].*')) from {S}")
    q("links per report (max)", f"select max(n) from (select count(*) n from {S} group by report_id)")


def canonical():
    print("##### CANONICAL (PLAYERS / PLAYER_IDENTITIES / OVERRIDES / FIXTURES / FIXTURE_IDENTITIES) the app writes and reads")
    q("PLAYERS total / inactive / no identity / no name / no birth date",
      f"select count(*), count_if(not is_active), count_if(cafc_player_id not in (select cafc_player_id from {C}PLAYER_IDENTITIES)),"
      f" count_if(nullif(trim(display_name),'') is null), count_if(birth_date is null) from {C}PLAYERS")
    q("PLAYERS created_from_source", f"select created_from_source, count(*), count_if(not is_active) from {C}PLAYERS group by 1 order by 2 desc")
    q("PLAYERS probable duplicates: same name+birth_date (groups, extra rows)",
      f"select count(*), sum(n-1) from (select count(*) n from {C}PLAYERS where birth_date is not null and is_active group by lower(trim(display_name)), birth_date having count(*)>1)")
    q("PLAYERS implausible birth_date", f"select count_if(birth_date<'1970-01-01' or birth_date>dateadd(year,-10,current_date())) from {C}PLAYERS where birth_date is not null")
    q("PLAYERS current_squad_id not in CORE_SQUADS", f"select count_if(current_squad_id is not null and current_squad_id not in (select cafc_squad_id from {C}CORE_SQUADS)) from {C}PLAYERS")
    q("IDENTITIES orphan player / by source_system",
      f"select (select count(*) from {C}PLAYER_IDENTITIES where cafc_player_id not in (select cafc_player_id from {C}PLAYERS)),"
      f" (select listagg(source_system||':'||n, ', ') from (select source_system, count(*) n from {C}PLAYER_IDENTITIES group by 1))")
    q("IDENTITIES: players with >1 primary / (system,id) mapping to >1 player",
      f"select (select count(*) from (select 1 from {C}PLAYER_IDENTITIES where is_primary group by source_system, cafc_player_id having count(*)>1)),"
      f" (select count(*) from (select 1 from {C}PLAYER_IDENTITIES group by source_system, source_player_id having count(distinct cafc_player_id)>1))")
    q("OVERRIDES: rows / target missing or retired",
      f"select count(*), count_if(cafc_player_id not in (select cafc_player_id from {C}PLAYERS)),"
      f" count_if(cafc_player_id in (select cafc_player_id from {C}PLAYERS where not is_active)) from {C}PLAYER_IDENTITY_OVERRIDES")
    q("FIXTURES total / no identity / null date / no squads",
      f"select count(*), count_if(cafc_fixture_id not in (select cafc_fixture_id from {C}FIXTURE_IDENTITIES)), count_if(fixture_date is null),"
      f" count_if(home_squad_id is null or away_squad_id is null) from {C}FIXTURES")
    q("FIXTURES squad ids not in CORE_SQUADS", f"select count_if(home_squad_id is not null and home_squad_id not in (select cafc_squad_id from {C}CORE_SQUADS)), count_if(away_squad_id is not null and away_squad_id not in (select cafc_squad_id from {C}CORE_SQUADS)) from {C}FIXTURES")
    q("FIXTURE_IDENTITIES: IMPECT ids mapped to >1 fixture (ids, extra)",
      f"select count(*), sum(n-1) from (select count(distinct cafc_fixture_id) n from {C}FIXTURE_IDENTITIES where source_system='IMPECT' group by source_fixture_id having count(distinct cafc_fixture_id)>1)")
    q("FIXTURE_IDENTITIES orphan fixture", f"select count(*) from {C}FIXTURE_IDENTITIES where cafc_fixture_id not in (select cafc_fixture_id from {C}FIXTURES)")
    q("FIXTURES manual (no IMPECT identity)",
      f"select count(*) from {C}FIXTURES where cafc_fixture_id not in (select cafc_fixture_id from {C}FIXTURE_IDENTITIES where source_system='IMPECT' and cafc_fixture_id is not null)")
    q("KPIS players not in PLAYERS (distinct)", f"select count(distinct cafc_player_id) from {C}CORE_PLAYER_FIXTURE_KPIS where cafc_player_id not in (select cafc_player_id from {C}PLAYERS)")


SECTIONS = {"users": users, "recs": recs, "intel": intel, "lists": lists, "sharing": sharing, "canonical": canonical}

if __name__ == "__main__":
    wanted = sys.argv[1:] or list(SECTIONS)
    unknown = [w for w in wanted if w not in SECTIONS]
    if unknown:
        sys.exit(f"unknown section(s) {unknown}; choose from {list(SECTIONS)}")
    conn = connect()
    cur = conn.cursor()
    try:
        started = time.time()
        for name in wanted:
            SECTIONS[name]()
            print()
        print(f"done in {time.time() - started:.0f}s")
    finally:
        cur.close()
        conn.close()
