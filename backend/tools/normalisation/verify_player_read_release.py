"""Read-only API parity and latency rehearsal against a corrected CORE clone."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import statistics
import sys
import time
from queue import Queue
from connection import connect, isolated_schema

sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
import main
import canonical_players
from fastapi.testclient import TestClient


class ReadCursor:
    def __init__(self, raw, trace, context):
        self.raw=raw;self.trace=trace;self.context=context
    def __getattr__(self,name):return getattr(self.raw,name)
    def __enter__(self):return self
    def __exit__(self,*args):self.raw.close()
    def execute(self,sql,params=None,**kwargs):
        clean=re.sub(r"'([^']|'')*'|/\*.*?\*/|--[^\n]*",'',sql,flags=re.S)
        if not re.match(r'^\s*(SELECT|WITH|SHOW|DESC(?:RIBE)?)\b',clean,re.I) or re.search(
            r'\b(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|CALL|COPY|PUT)\b',clean,re.I):
            self.trace.append({'seconds':0,'query_id':None,'context':dict(self.context),
                               'objects':[],'error':'Read rehearsal refused a mutation'})
            raise RuntimeError('Read rehearsal refused a mutation')
        started=time.perf_counter()
        try:
            self.raw.execute(sql,params,**kwargs)
            self.trace.append({'seconds':round(time.perf_counter()-started,4),'query_id':self.raw.sfqid,
                               'context':dict(self.context),
                               'objects':sorted(set(re.findall(r'CAFC_DB\.[A-Z0-9_]+\.[A-Z0-9_]+',sql,re.I))),
                               'error':None})
        except Exception as exc:
            self.trace.append({'seconds':round(time.perf_counter()-started,4),'query_id':self.raw.sfqid,
                               'context':dict(self.context),
                               'objects':sorted(set(re.findall(r'CAFC_DB\.[A-Z0-9_]+\.[A-Z0-9_]+',sql,re.I))),
                               'error':str(exc)})
            raise
        return self


class ReadConnection:
    def __init__(self,raw,pool,trace,context):self.raw=raw;self.pool=pool;self.trace=trace;self.context=context
    def cursor(self):return ReadCursor(self.raw.cursor(),self.trace,self.context)
    def close(self):
        if self.raw is not None:self.pool.put(self.raw);self.raw=None
    def rollback(self):pass


def run(env_file,name):
    schema=isolated_schema(name)
    raw=connect(env_file);cursor=raw.cursor();cursor.execute(f'USE SCHEMA {schema}')
    canonical_players.validate(cursor,schema)
    cursor.execute(f'SELECT COUNT(*) FROM {canonical_players.projection(schema)}')
    result={'schema':schema,'player_rows':int(cursor.fetchone()[0]),'benchmarks':{},'api_cases':[],
            'sql_errors':[],'objects':[]}
    old=f'{schema}.PLAYER_READ_BEFORE_BACKUP';native=canonical_players.projection(schema)
    cursor.execute(f'''SELECT COUNT(*) FROM (SELECT * FROM {native} MINUS
        SELECT * FROM {old} WHERE CAFC_PLAYER_ID NOT IN (1354027,1282585,1365024,1350827,1299064))''')
    result['unexpected_native_rows']=int(cursor.fetchone()[0])
    cursor.execute(f'''SELECT COUNT(*) FROM (SELECT * FROM {old}
        WHERE CAFC_PLAYER_ID NOT IN (1354027,1282585,1365024,1350827,1299064) MINUS SELECT * FROM {native})''')
    result['unexpected_missing_rows']=int(cursor.fetchone()[0])
    # Freeze all data except the reviewed five-row difference; use real representative records.
    cursor.execute(f'''SELECT sr.ID,sr.PLAYER_ID,sr.USER_ID,p.CAFC_PLAYER_ID,p.PLAYERNAME,p.SQUADNAME,p.POSITION
        FROM {schema}.SCOUT_REPORTS sr JOIN {native} p ON sr.PLAYER_ID=p.PLAYERID
        WHERE p.SQUADNAME IS NOT NULL AND p.POSITION IS NOT NULL ORDER BY sr.ID DESC LIMIT 1''')
    report_id,external,owner,canonical,player_name,team,position=cursor.fetchone()
    cursor.execute(f"SELECT CAFC_PLAYER_ID FROM {native} WHERE DATA_SOURCE='internal' ORDER BY CAFC_PLAYER_ID LIMIT 1")
    internal=int(cursor.fetchone()[0])
    cursor.execute(f'SELECT LIST_ID FROM {schema}.PLAYER_LIST_ITEMS GROUP BY LIST_ID ORDER BY COUNT(*) DESC LIMIT 1')
    list_id=int(cursor.fetchone()[0])
    lookup=int(external);search=player_name.split()[0]
    benchmark_queries={
        'detail':('SELECT PLAYERID,CAFC_PLAYER_ID,PLAYERNAME,SQUADNAME,POSITION FROM {players} WHERE PLAYERID=%s',(lookup,)),
        'search':('SELECT PLAYERID,CAFC_PLAYER_ID,PLAYERNAME FROM {players} WHERE NORMALIZE_TEXT_UDF(PLAYERNAME) ILIKE %s ORDER BY PLAYERNAME LIMIT 11',('%'+main.normalize_text(search)+'%',)),
        'report_join':(f'SELECT sr.ID,p.PLAYERNAME FROM {schema}.SCOUT_REPORTS sr LEFT JOIN {{players}} p ON sr.PLAYER_ID=p.PLAYERID WHERE sr.PLAYER_ID=%s ORDER BY sr.ID',(lookup,)),
        'list_join':(f'SELECT i.ID,p.PLAYERNAME FROM {schema}.PLAYER_LIST_ITEMS i LEFT JOIN {{players}} p ON (i.PLAYER_ID=p.PLAYERID OR i.CAFC_PLAYER_ID=p.CAFC_PLAYER_ID) WHERE i.LIST_ID=%s',(list_id,)),
    }
    for cached in [False,True]:
        cursor.execute(f'ALTER SESSION SET USE_CACHED_RESULT={str(cached).upper()}')
        for label,(sql,params) in benchmark_queries.items():
            for mode,target in [('snapshot',old),('native',native)]:
                samples=[];counts=[];query_ids=[]
                for _ in range(3):
                    started=time.perf_counter();cursor.execute(sql.format(players=target),params)
                    counts.append(len(cursor.fetchall()));samples.append(round(time.perf_counter()-started,4));query_ids.append(cursor.sfqid)
                result['benchmarks'][f'{label}_{mode}_{"cached" if cached else "uncached"}']={
                    'seconds':samples,'median_seconds':statistics.median(samples),'row_counts':counts,'query_ids':query_ids}
    cursor.execute('ALTER SESSION SET USE_CACHED_RESULT=FALSE')
    pool=Queue(maxsize=3);pool.put(raw);trace=[];context={}
    def borrow():
        # Flow-history schema refreshes borrow while its first connection is open.
        if pool.empty():
            extra=connect(env_file);c=extra.cursor();c.execute(f'USE SCHEMA {schema}');c.execute('ALTER SESSION SET USE_CACHED_RESULT=FALSE');pool.put(extra)
        return ReadConnection(pool.get(timeout=10),pool,trace,context)
    original_core=main.core_table;original_read=main.read_table;original_borrow=main.get_snowflake_connection
    original_cache=main.TABLE_SCHEMA_CACHE.copy();original_globals={k:getattr(main,k) for k in ['CANONICAL_DB','WRITE_DB','CORE_DB_SCHEMA','WRITES_TO_CORE','NATIVE_PLAYER_READS']}
    actor={'role':'admin','id':int(owner)};mode={'native':False}
    main.core_table=lambda table:schema+'.'+table
    main.read_table=lambda table:(native if mode['native'] else old) if table.lower() in {'players','players_base'} else schema+'.'+table
    main.get_snowflake_connection=borrow
    main.CANONICAL_DB='CAFC_DB';main.WRITE_DB='CAFC_DB';main.CORE_DB_SCHEMA=name;main.WRITES_TO_CORE=True
    main.app.dependency_overrides[main.get_current_user]=lambda:main.User(id=actor['id'],username='release-read-test',role=actor['role'])
    with raw.cursor() as c:
        for table in ['players','scout_reports','player_information','player_notes','player_list_items','player_stage_history','player_recommendations','agent_profiles','status_history','users']:
            main.TABLE_SCHEMA_CACHE[table]=main.describe_read_columns(c,table)
    cases=[
        ('search','admin','/players/search',{'query':search}),
        ('detail_external','admin',f'/players/by-cafc-id/{int(canonical)}',{}),
        ('detail_internal','admin',f'/players/by-cafc-id/{internal}',{}),
        ('profile_external','admin',f'/players/external_{lookup}/profile',{}),
        ('profile_internal','admin',f'/players/internal_{internal}/profile',{}),
        ('profile_scout','scout',f'/players/external_{lookup}/profile',{}),
        ('profile_loan','loan_manager',f'/players/external_{lookup}/profile',{}),
        ('profile_intel','intel_reviewer',f'/players/external_{lookup}/profile',{}),
        ('flow','admin',f'/players/external_{lookup}/flow-history',{}),
        ('player_report_feed','admin',f'/players/external_{lookup}/scout-reports',{}),
        ('scout_detail','admin',f'/scout_reports/details/{int(report_id)}',{}),
        ('scout_rendered','admin',f'/scout_reports/{int(report_id)}',{}),
        ('scout_feed','admin','/scout_reports/all',{'player_name':player_name}),
        ('filtered_players','admin','/players/all',{'search':search,'team':team,'position':position}),
        ('list_detail','admin',f'/player-lists/{list_id}',{}),
        ('list_detail_flags','admin',f'/player-lists/{list_id}',{'include_flags':True,'include_archived':True}),
        ('list_memberships','admin',f'/players/external_{lookup}/lists',{}),
        ('agent_search','agent','/agents/player-search',{'query':search}),
        ('leagues','admin','/leagues',{}),
        ('lists_with_competition','admin','/player-lists/all-with-details',{'competition':'Championship'}),
    ]
    client=TestClient(main.app)
    try:
        for label,role,url,params in cases:
            actor['role']=role;responses=[];timings=[];statuses=[]
            for value in [False,True]:
                mode['native']=value;main.NATIVE_PLAYER_READS=value
                context.update(case=label,mode='native' if value else 'snapshot')
                main._data_cache.clear();main._cache_expiry.clear()
                started=time.perf_counter();response=client.get(url,params=params);timings.append(round(time.perf_counter()-started,4))
                statuses.append(response.status_code);responses.append(response.json())
            same=responses[0]==responses[1]
            # Save digests rather than confidential report/intel bodies.
            digests=[hashlib.sha256(json.dumps(r,sort_keys=True,default=str).encode()).hexdigest() for r in responses]
            result['api_cases'].append({'case':label,'role':role,'statuses':statuses,'identical':same,'seconds':timings,'sha256':digests,
                                       'errors':[r.get('detail') if isinstance(r,dict) and status>=400 else None for r,status in zip(responses,statuses)]})
        # Compare the complete current recommendation result, including lifecycle fields.
        feeds=[]
        for value in [False,True]:
            mode['native']=value;main.NATIVE_PLAYER_READS=value
            context.update(case='full_recommendation_feed',mode='native' if value else 'snapshot')
            connection=borrow()
            try:
                c=connection.cursor();c.execute(main.build_recommendation_select())
                feeds.append(sorted(json.dumps(list(row),default=str) for row in c.fetchall()))
            finally:
                connection.close()
        result['recommendation_feed']={'counts':[len(feed) for feed in feeds],
            'identical':feeds[0]==feeds[1],
            'sha256':[hashlib.sha256(json.dumps(feed).encode()).hexdigest() for feed in feeds]}
    finally:
        client.close();main.app.dependency_overrides.pop(main.get_current_user,None)
        main.core_table=original_core;main.read_table=original_read;main.get_snowflake_connection=original_borrow
        main.TABLE_SCHEMA_CACHE.clear();main.TABLE_SCHEMA_CACHE.update(original_cache)
        for key,value in original_globals.items():setattr(main,key,value)
        while not pool.empty():pool.get().close()
    result['sql_errors']=[t for t in trace if t['error']]
    result['objects']=sorted(set(obj for t in trace for obj in t['objects']))
    result['queries_executed']=len(trace)
    result['passed']=result['recommendation_feed']['identical'] and not result['sql_errors'] and not result['unexpected_native_rows'] and not result['unexpected_missing_rows'] and all(c['identical'] and c['statuses']==[200,200] for c in result['api_cases'])
    return result


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--env-file',required=True);p.add_argument('--schema',required=True);p.add_argument('--result',type=Path,required=True)
    args=p.parse_args();result=run(args.env_file,args.schema);args.result.write_text(json.dumps(result,indent=2,default=str)+'\n')
    print(json.dumps({'players':result['player_rows'],'api_cases':result['api_cases'],'sql_errors':result['sql_errors']},indent=2))
    if not result['passed']:sys.exit(1)
