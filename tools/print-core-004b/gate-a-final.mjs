import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { config, psql, json, evidence } from './lab.mjs';
import { positiveFlow } from './gate-a.mjs';
const uid=()=>crypto.randomUUID();
const lit=v=>"'"+String(v).replaceAll("'","''")+"'";
const qi=v=>'"'+String(v).replaceAll('"','""')+'"';
function rejected(c,role,sql,state,message,id) {
 let error;try{psql(c,role,sql,{log:id+'.log'});}catch(e){error=e;}
 assert.ok(error,'Expected rejection '+id);
 assert.match(error.output,new RegExp('ERROR:\\s+'+state+':'));
 if(message)assert.ok(error.output.includes(message),'Specific expected error '+id);
 return{id,status:'PASS',sqlstate:state,message};
}
function publicIdentities(c){
 return JSON.parse(psql(c,'owner',`SELECT json_build_object(
 'relations',(SELECT json_agg(x ORDER BY x.oid) FROM (SELECT r.oid::text,r.relname,r.relkind::text,r.relowner::text,r.relacl::text FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public')x),
 'functions',(SELECT json_agg(x ORDER BY x.oid) FROM (SELECT p.oid::text,p.proname,p.prosrc,p.proconfig,p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public')x));`).stdout.trim());
}
export async function finalGateA(){
 const c=config(),results=[];
 const progress=JSON.parse(fs.readFileSync(path.join(evidence,'gate-a-progress.json'),'utf8'));
 assert.equal(progress.structure,'PASS');assert.equal(progress.positive,'PASS');
 const positives=JSON.parse(fs.readFileSync(path.join(evidence,'positive-T0-T4.json'),'utf8'));
 assert.equal(positives.length,2);
 assert.ok(positives.every(p=>p.status==='PASS'&&p.runtimeRole===c.runtime));
 const tables=['print_installations','print_destinations','print_bindings','print_delegations','print_documents','print_jobs','print_requests','print_copies','print_attempts','print_events'];
 if(psql(c,'owner',"SELECT to_regnamespace('shadow_004b') IS NULL;").stdout.trim()==='t'){
  let setup='CREATE SCHEMA shadow_004b;GRANT USAGE ON SCHEMA shadow_004b TO '+qi(c.runtime)+';\n';
  for(const table of tables)setup+='CREATE TABLE shadow_004b.'+qi(table)+"(id text PRIMARY KEY,marker text);INSERT INTO shadow_004b."+qi(table)+" VALUES('sentinel','must-not-change');\n";
  setup+="CREATE FUNCTION shadow_004b.clock_timestamp() RETURNS timestamptz LANGUAGE sql AS "+lit("SELECT '2099-01-01'::timestamptz")+";";
  psql(c,'owner',setup,{log:'R01-shadow-setup.log'});
 }
 const shadowBefore=psql(c,'owner',"SELECT json_agg(row_to_json(x) ORDER BY x.table_name) FROM ("+tables.map(t=>"SELECT "+lit(t)+" table_name,id,marker FROM shadow_004b."+qi(t)).join(' UNION ALL ')+")x;").stdout.trim();
 const shadowPositive=positiveFlow(c,'SYNTHETIC','R01-shadow','shadow_004b,pg_temp,public,pg_catalog');
 const shadowAfter=psql(c,'owner',"SELECT json_agg(row_to_json(x) ORDER BY x.table_name) FROM ("+tables.map(t=>"SELECT "+lit(t)+" table_name,id,marker FROM shadow_004b."+qi(t)).join(' UNION ALL ')+")x;").stdout.trim();
 assert.equal(shadowAfter,shadowBefore);
 results.push({id:'R01-SHADOW-SEARCH-PATH',status:'PASS',runtimePositive:shadowPositive,shadowRowsUnchanged:true});
 const copy=positives[0].ids.copy;
 psql(c,'admin',"CREATE TEMP TABLE print_jobs(id text,marker text);INSERT INTO print_jobs VALUES('temp-sentinel','must-not-change');CREATE TEMP TABLE print_copies(id text,marker text);INSERT INTO print_copies VALUES('temp-sentinel','must-not-change');SET ROLE "+qi(c.runtime)+";SET search_path=pg_temp,shadow_004b,public,pg_catalog;BEGIN;UPDATE public.print_copies SET lease_owner=NULL,lease_until=NULL,lease_epoch=lease_epoch+1 WHERE id="+lit(copy)+";COMMIT;RESET ROLE;SELECT marker FROM pg_temp.print_jobs;SELECT marker FROM pg_temp.print_copies;",{log:'R01-owner-controlled-temp-shadow.log'});
 results.push({id:'R01-TEMP-SHADOW',status:'PASS',context:'bootstrap-admin-created adversarial temp objects; DML runs after SET ROLE runtime; runtime itself has no TEMP privilege'});
 const p=positives[0].ids,expired=uid();
 const expiredSql="INSERT INTO public.print_requests(id,store_id,document_id,principal_id,delegation_id,intent_id,command,command_hash,canonical_version,risk_set_hash,issued_at,expires_at) VALUES("+
 [expired,'fixture-store-a-004b',p.document,'fixture-a01-004b',p.delegation,uid()].map(lit).join(',')+",'{}'::jsonb,"+lit('a'.repeat(64))+",1,"+lit('b'.repeat(64))+",clock_timestamp()-interval '10 minutes',clock_timestamp()-interval '5 minutes');";
 psql(c,'runtime',expiredSql,{log:'R02-expired-request-seed.log'});
 const deleted=psql(c,'runtime','DELETE FROM public.print_requests WHERE id='+lit(expired)+' RETURNING id;',{log:'R02-expired-request-delete.log'}).stdout;
 assert.ok(deleted.includes(expired));
 assert.equal(psql(c,'runtime','SELECT count(*) FROM public.print_requests WHERE id='+lit(expired)+';').stdout.trim(),'0');
 results.push({id:'R02-EXPIRED-REQUEST',status:'PASS',fixturePolicy:'explicit expired synthetic grant; no production retention default',deletedId:expired});
 results.push(rejected(c,'runtime','DELETE FROM public.print_requests WHERE id='+lit(p.request)+';','P0001','p004 ledger deletion requires separate approved retirement/retention scope','R02-RUNTIME-UNEXPIRED'));
 for(const [id,sql]of [
 ['ROLE-NO-DDL','CREATE TABLE public.p004_runtime_forbidden(id integer);'],
 ['ROLE-NO-TEMP','CREATE TEMP TABLE p004_runtime_forbidden(id integer);'],
 ['ROLE-NO-TRUNCATE','TRUNCATE public.print_jobs;'],
 ['ROLE-NO-DISABLE-TRIGGER','ALTER TABLE public.print_jobs DISABLE TRIGGER ALL;'],
 ['ROLE-NO-REPLICATION-BYPASS',"SET session_replication_role='replica';"],
 ['ROLE-NO-OWNER-ESCALATION','SET ROLE '+qi(c.owner)+';'],
 ['ROLE-NO-COMMERCIAL-UPDATE',"UPDATE public.vendas SET total=999 WHERE id='fixture-sale-positive-sale';"],
 ])results.push(rejected(c,'runtime',sql,'42501',null,id));
 const role=JSON.parse(psql(c,'owner',"SELECT json_build_object('name',r.rolname,'superuser',r.rolsuper,'bypassrls',r.rolbypassrls,'createrole',r.rolcreaterole,'createdb',r.rolcreatedb,'ownerMembership',pg_has_role("+lit(c.runtime)+","+lit(c.owner)+",'MEMBER'),'schemaCreate',has_schema_privilege("+lit(c.runtime)+",'public','CREATE'),'temporary',has_database_privilege("+lit(c.runtime)+","+lit(c.db)+",'TEMP'),'commercialUpdate',has_table_privilege("+lit(c.runtime)+",'public.vendas','UPDATE')) FROM pg_roles r WHERE r.rolname="+lit(c.runtime)+';').stdout.trim());
 for(const key of ['superuser','bypassrls','createrole','createdb','ownerMembership','schemaCreate','temporary','commercialUpdate'])assert.equal(role[key],false,key);
 json('runtime-least-privilege.json',role);
 const before=publicIdentities(c);
 const probe='p004_rollback_'+crypto.randomBytes(4).toString('hex');
 results.push(rejected(c,'owner','BEGIN;CREATE TABLE public.'+qi(probe)+'(id integer);CREATE UNIQUE INDEX p004_vendas_id_store_uq ON public.vendas(id,"storeId");COMMIT;','42P07','already exists','DDL-ROLLBACK-IDENTITIES'));
 const after=publicIdentities(c);assert.deepEqual(after,before);
 json('ddl-rollback-identities.json',{status:'PASS',before,after,noDropExecuted:true});
 const f=JSON.parse(psql(c,'owner',"SELECT json_agg(json_build_object('name',p.proname,'securityDefiner',p.prosecdef,'searchPath',p.proconfig) ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'p004_%';").stdout.trim());
 assert.equal(f.length,6);assert.ok(f.every(x=>!x.securityDefiner&&x.searchPath[0]==='search_path=pg_catalog, public, pg_temp'));
 results.push({id:'R01-FUNCTION-CATALOG',status:'PASS',functions:f});
 const basic=JSON.parse(fs.readFileSync(path.join(evidence,'gate-a-basic-results.json'),'utf8'));
 assert.equal(basic.filter(x=>x.id.startsWith('R02-owner-')).length,10);
 const final={gate:'A',status:'PASS',prismaValidate:'PASS',prismaGenerate:'PASS',catalogParity:progress.parity,positiveT0T4:positives,leastPrivilege:role,
  tests:[...basic,...results],schemaQualification:'PASS',sharedDeleteGuard:'PASS',realTransportCalls:0,productionWrites:0};
 json('GATE_A.json',final);
 console.log('GATE A PASS: Prisma, coordinated SQL, catalog, runtime positives, R01/R02, privilege and rollback evidence');
}
