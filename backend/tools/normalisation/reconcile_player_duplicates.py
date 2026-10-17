"""Audit five migration duplicates; apply only to an isolated development schema.

Retain retired players and their identity history. Pin existing resolver decisions
with overrides so future ingestion cannot revive the duplicate canonical records.
This is not a general player merge tool and never executes production mutations.
"""
import argparse
from collections import Counter
import json
from pathlib import Path
import re
from connection import connect, isolated_schema

PAIRS = ((1354027,1329814), (1282585,1246662), (1365024,1297062),
         (1350827,1275591), (1299064,1289281))
CANONICAL_COLUMNS = {'CAFC_PLAYER_ID','CANONICAL_PLAYER_ID','LINKED_CANONICAL_PLAYER_ID',
                     'CANDIDATE_CAFC_PLAYER_ID','INTERNAL_PLAYER_ID','CORE_PLAYER_ID'}
SOURCE_COLUMNS = {'PLAYER_ID','PLAYERID','IMPECT_PLAYER_ID','SOURCE_PLAYER_ID','LEGACY_PLAYER_ID'}
UNIVERSAL_COLUMNS = {'LINKED_UNIVERSAL_ID','UNIVERSAL_ID','PLAYER_UNIVERSAL_ID'}


def rows(cursor, sql, params=None):
    cursor.execute(sql, params)
    names = [c[0] for c in cursor.description]
    return [dict(zip(names,row)) for row in cursor.fetchall()]


def fingerprint(row, excluded):
    return json.dumps({k:v for k,v in row.items() if k not in excluded},sort_keys=True,default=str)


def audit(connection, schema_name, *, include_legacy=False):
    schema = 'CAFC_DB.CORE' if schema_name == 'CORE' else isolated_schema(schema_name)
    cursor = connection.cursor()
    ids = ','.join(str(i) for pair in PAIRS for i in pair)
    players = {int(r['CAFC_PLAYER_ID']):r for r in rows(cursor,f'SELECT * FROM {schema}.PLAYERS WHERE CAFC_PLAYER_ID IN ({ids})')}
    identities = rows(cursor,f'SELECT * FROM {schema}.PLAYER_IDENTITIES WHERE CAFC_PLAYER_ID IN ({ids})')
    result = {'schema':schema,'pairs':[],'references':[],'excluded_archives':[]}
    for duplicate,survivor in PAIRS:
        if duplicate not in players or survivor not in players:
            raise ValueError('Expected migration player record is missing')
        old = [r for r in identities if r['CAFC_PLAYER_ID']==duplicate]
        keep = [r for r in identities if r['CAFC_PLAYER_ID']==survivor]
        source_pairs = sorted({(r['SOURCE_SYSTEM'],r['SOURCE_PLAYER_ID']) for r in old})
        links=[]
        for system,source_id in source_pairs:
            resolved=rows(cursor,f'SELECT * FROM {schema}.CORE_PLAYER_ID_RESOLUTIONS WHERE SOURCE_SYSTEM=%s AND SOURCE_PLAYER_ID=%s',(system,source_id))
            override=rows(cursor,f'SELECT * FROM {schema}.PLAYER_IDENTITY_OVERRIDES WHERE SOURCE_SYSTEM=%s AND SOURCE_PLAYER_ID=%s',(system,source_id))
            links.append({'system':system,'source_id':source_id,'resolved_ids':[int(r['CAFC_PLAYER_ID']) for r in resolved],
                          'override_ids':[int(r['CAFC_PLAYER_ID']) for r in override]})
        ignore={'CAFC_PLAYER_ID','IS_ACTIVE','CREATED_AT','UPDATED_AT'}
        identity_ignore={'PLAYER_IDENTITY_ID','CAFC_PLAYER_ID','CREATED_AT','UPDATED_AT'}
        result['pairs'].append({'duplicate':duplicate,'survivor':survivor,'name':players[duplicate]['DISPLAY_NAME'],
            'duplicate_active':players[duplicate]['IS_ACTIVE'],'survivor_active':players[survivor]['IS_ACTIVE'],
            'duplicate_updated_at':players[duplicate]['UPDATED_AT'],
            'profiles_equal':fingerprint(players[duplicate],ignore)==fingerprint(players[survivor],ignore),
            'identity_bags_equal':Counter(fingerprint(r,identity_ignore) for r in old)==Counter(fingerprint(r,identity_ignore) for r in keep),
            'retained_identity_rows':len(old),'sources':links})
    sources=sorted({link['source_id'] for pair in result['pairs'] for link in pair['sources']})
    source_literals=','.join("'"+s.replace("'","''")+"'" for s in sources)
    canonical_literals=','.join(f"'{i}'" for pair in PAIRS for i in pair)
    schemas=[('CAFC_DB',schema_name)] + ([('CAFC_DB','APP'),('CAFC_DB','MIGRATION'),('RECRUITMENT_TEST','PUBLIC')] if include_legacy else [])
    for database,name in schemas:
        metadata=rows(cursor,f'''SELECT c.TABLE_NAME,c.COLUMN_NAME,t.TABLE_TYPE
            FROM {database}.INFORMATION_SCHEMA.COLUMNS c
            JOIN {database}.INFORMATION_SCHEMA.TABLES t ON t.TABLE_SCHEMA=c.TABLE_SCHEMA AND t.TABLE_NAME=c.TABLE_NAME
            WHERE c.TABLE_SCHEMA=%s ORDER BY c.TABLE_NAME,c.ORDINAL_POSITION''',(name,))
        for meta in metadata:
            table=meta['TABLE_NAME'];column=meta['COLUMN_NAME']
            if column not in CANONICAL_COLUMNS|SOURCE_COLUMNS|UNIVERSAL_COLUMNS:
                continue
            if database=='CAFC_DB' and table in {'PLAYERS','PLAYER_IDENTITIES','PLAYER_IDENTITY_OVERRIDES'}:
                continue
            if re.search(r'(?:BAK|BACKUP|COPY|OLD)',table):
                result['excluded_archives'].append(f'{database}.{name}.{table}.{column}');continue
            if not re.fullmatch('[A-Z0-9_]+',table+column):
                raise ValueError('Unexpected database identifier')
            target=f'{database}.{name}.{table}'
            # Keep source references visible, but never confuse provider IDs with canonical IDs.
            if column in CANONICAL_COLUMNS:
                match=f'{column} IN ({ids})'
            elif column in UNIVERSAL_COLUMNS:
                universal=','.join([f"'internal_{i}'" for pair in PAIRS for i in pair]+[f"'external_{s}'" for s in sources])
                match=f'{column} IN ({universal})'
            else:
                # Legacy PLAYER_ID may hold internal canonical IDs as well as provider IDs.
                match=f'TO_VARCHAR({column}) IN ({source_literals},{canonical_literals})'
            cursor.execute(f'SELECT {column},COUNT(*) FROM {target} WHERE {match} GROUP BY {column}')
            counts={str(r[0]):int(r[1]) for r in cursor.fetchall()}
            result['references'].append({'object':target,'column':column,'type':meta['TABLE_TYPE'],'counts':counts})
    return result


def require_safe_plan(result):
    for pair in result['pairs']:
        if not pair['profiles_equal'] or not pair['identity_bags_equal'] or not pair['sources']:
            raise ValueError('Player/context evidence changed; automatic retirement refused')
        if pair['survivor_active'] is False:
            raise ValueError('Surviving player must be active')
        for link in pair['sources']:
            if link['resolved_ids'] != [pair['survivor']] or link['override_ids'] not in ([],[pair['survivor']]):
                raise ValueError('Resolver or override disagrees with the reviewed survivor')
    duplicates={str(pair['duplicate']) for pair in result['pairs']}
    for reference in result['references']:
        # Resolver rows are checked separately above. Every other live reference
        # to a retiring record needs an explicit domain migration, not a guess.
        if reference['object'].endswith('.CORE_PLAYER_ID_RESOLUTIONS'):
            continue
        if any(reference['counts'].get(identity,0) or reference['counts'].get('internal_'+identity,0) for identity in duplicates):
            raise ValueError(f"Duplicate has a live canonical reference: {reference['object']}.{reference['column']}")


def statements(result, schema):
    for pair in result['pairs']:
        for link in pair['sources']:
            yield (f'''INSERT INTO {schema}.PLAYER_IDENTITY_OVERRIDES
                (SOURCE_SYSTEM,SOURCE_PLAYER_ID,CAFC_PLAYER_ID,REASON,CREATED_BY)
                SELECT %s,%s,%s,%s,CURRENT_USER() WHERE NOT EXISTS (
                    SELECT 1 FROM {schema}.PLAYER_IDENTITY_OVERRIDES WHERE SOURCE_SYSTEM=%s AND SOURCE_PLAYER_ID=%s)''',
                (link['system'],link['source_id'],pair['survivor'],
                 f"Migration duplicate {pair['duplicate']} retired; preserve existing resolver {pair['survivor']}",link['system'],link['source_id']))
        yield (f'UPDATE {schema}.PLAYERS SET IS_ACTIVE=FALSE,UPDATED_AT=CURRENT_TIMESTAMP() WHERE CAFC_PLAYER_ID=%s AND COALESCE(IS_ACTIVE,TRUE)',(pair['duplicate'],))


def apply(connection, schema_name):
    schema=isolated_schema(schema_name)  # Production mutation is intentionally impossible.
    connection.autocommit(False)
    try:
        cursor=connection.cursor();cursor.execute('BEGIN')
        result=audit(connection,schema_name)
        require_safe_plan(result)
        for sql,params in statements(result,schema):
            cursor.execute(sql,params)
        after=audit(connection,schema_name)
        require_safe_plan(after)
        if any(pair['duplicate_active'] is not False for pair in after['pairs']):
            raise ValueError('Retirement did not complete')
        import sys
        sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
        import canonical_players
        canonical_players.validate(cursor,schema)
        connection.commit()
        return after
    except Exception:
        connection.rollback();raise
    finally:
        connection.autocommit(True)


def rollback(connection, schema_name, baseline):
    """Restore the recorded state only in an isolated rehearsal, with writers stopped."""
    schema=isolated_schema(schema_name)
    if baseline['schema'] != schema:
        raise ValueError('Rollback evidence belongs to a different schema')
    if tuple((pair['duplicate'],pair['survivor']) for pair in baseline['pairs']) != PAIRS:
        raise ValueError('Rollback evidence does not match the reviewed five pairs')
    require_safe_plan(baseline)
    connection.autocommit(False)
    try:
        cursor=connection.cursor();cursor.execute('BEGIN')
        current=audit(connection,schema_name);require_safe_plan(current)
        for pair in baseline['pairs']:
            for link in pair['sources']:
                if link['override_ids']:
                    continue  # Never remove an override that preceded this correction.
                reason=f"Migration duplicate {pair['duplicate']} retired; preserve existing resolver {pair['survivor']}"
                records=rows(cursor,f'SELECT CAFC_PLAYER_ID,REASON FROM {schema}.PLAYER_IDENTITY_OVERRIDES WHERE SOURCE_SYSTEM=%s AND SOURCE_PLAYER_ID=%s',
                             (link['system'],link['source_id']))
                if records != [{'CAFC_PLAYER_ID':pair['survivor'],'REASON':reason}]:
                    raise ValueError('Override ownership changed; rollback refused')
                cursor.execute(f'DELETE FROM {schema}.PLAYER_IDENTITY_OVERRIDES WHERE SOURCE_SYSTEM=%s AND SOURCE_PLAYER_ID=%s AND CAFC_PLAYER_ID=%s AND REASON=%s',
                               (link['system'],link['source_id'],pair['survivor'],reason))
            cursor.execute(f'UPDATE {schema}.PLAYERS SET IS_ACTIVE=%s,UPDATED_AT=%s WHERE CAFC_PLAYER_ID=%s',
                           (pair['duplicate_active'],pair['duplicate_updated_at'],pair['duplicate']))
        after=audit(connection,schema_name);require_safe_plan(after)
        connection.commit();return after
    except Exception:
        connection.rollback();raise
    finally:
        connection.autocommit(True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env-file',required=True)
    parser.add_argument('--schema',required=True)
    parser.add_argument('--include-legacy',action='store_true')
    parser.add_argument('--apply-isolated',action='store_true')
    parser.add_argument('--rollback-baseline',type=Path)
    parser.add_argument('--writers-stopped',action='store_true')
    parser.add_argument('--result',type=Path,required=True)
    args=parser.parse_args()
    if args.apply_isolated and args.rollback_baseline:
        parser.error('Choose apply or rollback, not both')
    if (args.apply_isolated or args.rollback_baseline) and not args.writers_stopped:
        parser.error('Isolated corrections require all writers stopped')
    connection=connect(args.env_file)
    try:
        if args.rollback_baseline:
            result=rollback(connection,args.schema,json.loads(args.rollback_baseline.read_text()))
        elif args.apply_isolated:
            result=apply(connection,args.schema)
        else:
            result=audit(connection,args.schema,include_legacy=args.include_legacy)
        args.result.write_text(json.dumps(result,indent=2,default=str)+'\n')
        require_safe_plan(result)
        print(json.dumps({'schema':result['schema'],'pairs':result['pairs'],'audited_columns':len(result['references'])},indent=2,default=str))
    finally:
        connection.close()
