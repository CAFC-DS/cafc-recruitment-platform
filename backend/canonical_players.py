"""Native player projection preserving the app's public dual-ID contract."""
import re


def validate_schema(schema):
    if not re.fullmatch(r'CAFC_DB\.CORE(?:_DEV_[A-Z0-9_]+)?', schema.upper()):
        raise ValueError('Native player reads require CAFC_DB.CORE or an isolated CORE_DEV schema')
    return schema


def identities(schema):
    schema = validate_schema(schema)
    return f"""SELECT cafc_player_id, source_player_id FROM {schema}.PLAYER_IDENTITIES
        WHERE source_system = 'IMPECT'
        QUALIFY ROW_NUMBER() OVER (PARTITION BY cafc_player_id ORDER BY
            IFF(is_primary, 0, 1), match_confidence DESC NULLS LAST,
            player_identity_id) = 1"""


def projection(schema):
    schema = validate_schema(schema)
    return f"""(SELECT TRY_TO_NUMBER(i.source_player_id) AS PLAYERID,
        c.display_name AS PLAYERNAME, c.first_name AS FIRSTNAME,
        c.last_name AS LASTNAME, c.birth_date AS BIRTHDATE,
        c.birth_place AS BIRTHPLACE, c.strong_foot AS LEG,
        ctx.competition_name AS COMPETITIONNAME, ctx.squad_name AS SQUADNAME,
        pos.position_code AS POSITION, ctx.cafc_season_id AS ITERATIONID,
        ctx.competition_type AS COMPETITIONTYPE, ctx.season_name AS SEASON,
        c.cafc_player_id AS CAFC_PLAYER_ID,
        IFF(i.cafc_player_id IS NULL, 'internal', 'external') AS DATA_SOURCE
        FROM {schema}.PLAYERS c
        LEFT JOIN ({identities(schema)}) i ON i.cafc_player_id = c.cafc_player_id
        LEFT JOIN {schema}.CORE_PLAYER_CURRENT_CONTEXT ctx ON ctx.cafc_player_id = c.cafc_player_id
        LEFT JOIN {schema}.CORE_PLAYER_RECENT_POSITION pos ON pos.cafc_player_id = c.cafc_player_id
        WHERE COALESCE(c.is_active, TRUE))"""


def validate(cursor, schema):
    """Fail closed on identity conflicts or fan-out, never silently deduplicate them."""
    schema = validate_schema(schema)
    cursor.execute(f"""SELECT COUNT(*) FROM ({identities(schema)}) i
        JOIN {schema}.PLAYERS p ON p.cafc_player_id = i.cafc_player_id
        WHERE COALESCE(p.is_active, TRUE) AND (TRY_TO_NUMBER(i.source_player_id) IS NULL OR NOT EXISTS (
            SELECT 1 FROM {schema}.CORE_PLAYER_ID_RESOLUTIONS r
            WHERE r.source_system = 'IMPECT' AND r.source_player_id = i.source_player_id
              AND r.cafc_player_id = i.cafc_player_id))""")
    if cursor.fetchone()[0]:
        raise RuntimeError('Native player reads blocked: selected IMPECT identities disagree with the canonical resolver')
    for table, key in [('PLAYERS', 'CAFC_PLAYER_ID'),
                       ('CORE_PLAYER_CURRENT_CONTEXT', 'CAFC_PLAYER_ID'),
                       ('CORE_PLAYER_RECENT_POSITION', 'CAFC_PLAYER_ID'),
                       ('CORE_PLAYER_ID_RESOLUTIONS', 'SOURCE_SYSTEM, SOURCE_PLAYER_ID')]:
        cursor.execute(f'SELECT COUNT(*) FROM (SELECT {key} FROM {schema}.{table} GROUP BY {key} HAVING COUNT(*) > 1)')
        if cursor.fetchone()[0]:
            raise RuntimeError(f'Native player reads blocked: duplicate keys in {table}')
