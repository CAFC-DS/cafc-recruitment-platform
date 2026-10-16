"""Probe production reads as the real app role, with secondary roles disabled."""
import argparse
import json
from pathlib import Path
import re
from connection import connect

SOURCES={'PLAYERS','PLAYER_IDENTITIES','CORE_PLAYER_CURRENT_CONTEXT',
         'CORE_PLAYER_RECENT_POSITION','CORE_PLAYER_ID_RESOLUTIONS'}


def probe(env_file,role,warehouse,api_result=None):
    if not all(re.fullmatch('[A-Z][A-Z0-9_]*',value) for value in (role,warehouse)):
        raise ValueError('Role and warehouse must be safe uppercase identifiers')
    sources=set(SOURCES)
    if api_result:
        for obj in api_result['objects']:
            if not re.fullmatch(r'CAFC_DB\.CORE_DEV_CODEX_[A-Z0-9_]+\.[A-Z0-9_]+',obj.upper()):
                raise ValueError('Unexpected traced object')
            table=obj.split('.')[-1].upper()
            if table!='PLAYER_READ_BEFORE_BACKUP':sources.add(table)
    conn=connect(env_file);cursor=conn.cursor()
    result={'role':role,'warehouse':warehouse,'secondary_roles':'disabled','reads':{}}
    try:
        cursor.execute(f'USE ROLE {role}');cursor.execute('USE SECONDARY ROLES NONE');cursor.execute(f'USE WAREHOUSE {warehouse}')
        for table in sorted(sources):
            try:
                cursor.execute(f'SELECT * FROM CAFC_DB.CORE.{table} LIMIT 0')
                result['reads'][table]={'passed':True,'query_id':cursor.sfqid}
            except Exception as exc:
                result['reads'][table]={'passed':False,'query_id':cursor.sfqid,'error':str(exc)}
        try:
            cursor.execute("SELECT CAFC_DB.CORE.NORMALIZE_TEXT_UDF('José')")
            result['search_udf']={'passed':cursor.fetchone()[0]=='jose','query_id':cursor.sfqid}
        except Exception as exc:result['search_udf']={'passed':False,'error':str(exc)}
        result['passed']=all(check['passed'] for check in result['reads'].values()) and result['search_udf']['passed']
        return result
    finally:conn.close()


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--env-file',required=True);p.add_argument('--role',default='APP_ROLE');p.add_argument('--warehouse',default='COMPUTE_WH');p.add_argument('--api-result',type=Path);p.add_argument('--result',type=Path,required=True)
    args=p.parse_args();api=json.loads(args.api_result.read_text()) if args.api_result else None
    result=probe(args.env_file,args.role,args.warehouse,api);args.result.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
    if not result['passed']:raise SystemExit(1)
