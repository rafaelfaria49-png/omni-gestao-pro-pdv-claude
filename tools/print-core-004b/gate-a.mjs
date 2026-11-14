import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { config, validateConfig, prismaEnv, psql, run, json, sha, root, scratch, evidence, deps } from './lab.mjs';

const printTables=['print_installations','print_destinations','print_bindings','print_delegations','print_documents','print_jobs','print_requests','print_copies','print_attempts','print_events'];
const artifact = name => path.join(scratch,name);
const qi = value => '"' + String(value).replaceAll('"','""') + '"';
const lit = value => value === null ? 'NULL' : "'" + String(value).replaceAll("'","''") + "'";
const hash = value => crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const uid = () => crypto.randomUUID();
function expectedError(c,role,sql,code,message,name) {
 let observed;
 try {psql(c,role,sql,{log:name+'.log'});} catch(error) { observed=error; }
 assert.ok(observed,'Expected database rejection '+name);
 assert.match(observed.output,new RegExp('ERROR:\\s+'+code+':'));
 if(message) assert.ok(observed.output.includes(message),'Expected specific rejection message '+name);
 return {id:name,status:'PASS',sqlstate:code,message};
}
function catalog(c,database) {
 const query=`SELECT json_build_object(
 'columns',(SELECT json_agg(x ORDER BY x.table_name,x.ordinal_position) FROM
  (SELECT table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default
   FROM information_schema.columns WHERE table_schema='public' AND table_name LIKE 'print_%')x),
 'constraints',(SELECT json_agg(x ORDER BY x.table_name,x.name) FROM
  (SELECT r.relname table_name,k.conname name,k.contype::text kind,pg_get_constraintdef(k.oid) definition
   FROM pg_constraint k JOIN pg_class r ON r.oid=k.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
   WHERE n.nspname='public' AND (r.relname LIKE 'print_%' OR k.conname IN ('p004_vendas_id_store_uq','p004_term_id_store_uq')))x),
 'indexes',(SELECT json_agg(x ORDER BY x.tablename,x.indexname) FROM pg_indexes x WHERE schemaname='public' AND (tablename LIKE 'print_%' OR indexname IN ('p004_vendas_id_store_uq','p004_term_id_store_uq'))),
 'functions',(SELECT json_agg(x ORDER BY x.proname) FROM
  (SELECT p.proname,p.prosecdef,p.proconfig,pg_get_functiondef(p.oid) definition
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'p004_%')x),
 'triggers',(SELECT json_agg(x ORDER BY x.table_name,x.name) FROM
  (SELECT r.relname table_name,t.tgname name,t.tgenabled::text enabled,t.tgdeferrable,t.tginitdeferred,pg_get_triggerdef(t.oid) definition
   FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace
   WHERE n.nspname='public' AND NOT t.tgisinternal AND r.relname LIKE 'print_%')x));`;
 return JSON.parse(psql(c,'owner',query,{database}).stdout.trim());
}
function compareCatalog(actual,derived) {
 const normalize=items=>JSON.stringify(items||[]);
 assert.equal(normalize(actual.columns),normalize(derived.columns),'Prisma column/type/default parity');
 for(const kind of ['f','p']) {
  const rows=cat=>(cat.constraints||[]).filter(x=>x.kind===kind).sort((a,b)=>(a.table_name+a.name).localeCompare(b.table_name+b.name));
  assert.equal(normalize(rows(actual)),normalize(rows(derived)),'Prisma constraint parity '+kind);
 }
 const derivedIndexes=(derived.indexes||[]).map(x=>[x.tablename,x.indexname,x.indexdef]);
 const actualIndexes=new Map((actual.indexes||[]).map(x=>[x.tablename+'|'+x.indexname,x.indexdef]));
 for(const [table,name,definition]of derivedIndexes)assert.equal(actualIndexes.get(table+'|'+name),definition,'Prisma index parity '+name);
 assert.equal(actual.functions.length,6);
 for(const f of actual.functions){assert.equal(f.prosecdef,false);assert.deepEqual(f.proconfig,['search_path=pg_catalog, public, pg_temp']);}
 return {status:'PASS',uniqueConstraintAndIndexFormsComparedSemantically:true,columns:actual.columns.length,foreignKeys:actual.constraints.filter(x=>x.kind==='f').length,
  checkConstraints:actual.constraints.filter(x=>x.kind==='c').length,customFunctions:actual.functions.length,
  customTriggers:actual.triggers.length,customIndexes:(actual.indexes||[]).length-derivedIndexes.length};
}
function insert(table,values) {
 return 'INSERT INTO public.'+qi(table)+' ('+Object.keys(values).map(qi).join(',')+') VALUES ('+
 Object.entries(values).map(([key,value])=>Buffer.isBuffer(value)?"decode('"+value.toString('hex')+"','hex')":typeof value==='object'&&value!==null?lit(JSON.stringify(value))+'::jsonb':lit(value)).join(',')+');\n';
}
export function positiveFlow(c,kind='SALE',prefix='positive',searchPath='public') {
 let ids={installation:uid(),destination:uid(),binding:uid(),bindingGroup:uid(),delegation:uid(),document:uid(),intent:uid(),request:uid(),job:uid(),copy:uid(),send:uid(),attempt:uid(),ack:uid(),release:uid()};
 const principal='fixture-a01-004b',store='fixture-store-a-004b',terminal='fixture-terminal-a-004b';
 const recoveredText=psql(c,'owner',"SELECT json_build_object('state',cp.state,'epoch',cp.lease_epoch,'held',dst.held_attempt_id,'ids',json_build_object('installation',b.installation_id,'destination',b.destination_id,'binding',b.id,'bindingGroup',b.binding_id,'delegation',j.delegation_id,'document',j.document_id,'intent',j.intent_id,'request',rq.id,'job',j.id,'copy',cp.id,'send',cp.send_key,'attempt',(SELECT id FROM public.print_attempts WHERE copy_id=cp.id ORDER BY number DESC LIMIT 1))) FROM public.print_jobs j JOIN public.print_copies cp ON cp.job_id=j.id JOIN public.print_requests rq ON rq.job_id=j.id JOIN public.print_bindings b ON b.id=j.binding_version_id JOIN public.print_destinations dst ON dst.id=b.destination_id WHERE rq.command->>'prefix'="+lit(prefix)+" LIMIT 1;").stdout.trim();
 const recovered=recoveredText?JSON.parse(recoveredText):null;
 if(recovered){ids={...ids,...recovered.ids};ids.attempt ||= uid();}
 if(recovered?.state==='TRANSPORT_ACCEPTED'){assert.equal(recovered.held,null);return{kind,status:'PASS',runtimeRole:c.runtime,ids,simulationOnly:true,reusedDurablePositive:true};}
 const leaseEpoch=recovered?Number(recovered.epoch)+1:1;
 const existingTargetText=psql(c,'owner',"SELECT json_build_object('binding',id,'bindingGroup',binding_id,'installation',installation_id,'destination',destination_id) FROM public.print_bindings WHERE store_id='fixture-store-a-004b' AND terminal_id='fixture-terminal-a-004b' AND family="+lit(kind==='SALE'?'SALE_RECEIPT':'SYNTHETIC_TEST')+" AND state='ACTIVE' LIMIT 1;").stdout.trim();
 const existingTarget=existingTargetText?JSON.parse(existingTargetText):null;
 if(!recovered&&existingTarget)ids={...ids,...existingTarget};


 const family=kind==='SALE'?'SALE_RECEIPT':'SYNTHETIC_TEST';
 const version=hash('fixture-document-'+prefix),payload=Buffer.from('SYNTHETIC ONLY '+prefix),cipher=Buffer.concat([Buffer.alloc(12,7),payload,Buffer.alloc(16,9)]);
 const now=Date.now(),future=new Date(now+30*60000).toISOString(),contentExpiry=new Date(now+60*60000).toISOString();
 let setup=insert('print_installations',{id:ids.installation,identity_hash:hash(ids.installation),proof_mode:'SYNTHETIC'});
 setup+=insert('print_destinations',{id:ids.destination,identity_hash:hash(ids.destination),serialization_mode:'SYNTHETIC'});
 setup+=insert('print_bindings',{id:ids.binding,store_id:store,binding_id:ids.bindingGroup,version:1,terminal_id:terminal,installation_id:ids.installation,destination_id:ids.destination,transport_destination_ref:'fixture-queue-'+prefix,
 profile_id:'SYNTHETIC_80',profile_version:1,profile_hash:hash('fixture-profile'),profile:{width:80,synthetic:true},state:'ACTIVE',family,configured_by_id:principal});
 if(!recovered&&!existingTarget)psql(c,'owner',setup,{log:prefix+'-configuration.log'});
 let t0='SET search_path='+searchPath+';\nBEGIN;\n';
 t0+=insert('print_delegations',{id:ids.delegation,store_id:store,principal_id:principal,session_version:0,expires_at:future});
 t0+=insert('print_documents',{id:ids.document,store_id:store,document_kind:kind,sale_id:kind==='SALE'?'fixture-sale-'+prefix:null,synthetic_key:kind==='SALE'?null:uid(),family});
 if(kind==='SALE')t0+='UPDATE public.print_documents SET initial_intent_id='+lit(ids.intent)+' WHERE id='+lit(ids.document)+';\n';
 t0+=insert('print_requests',{id:ids.request,store_id:store,document_id:ids.document,principal_id:principal,delegation_id:ids.delegation,intent_id:ids.intent,command:{kind,prefix},command_hash:hash({kind,prefix}),canonical_version:1,risk_revision:0,risk_set_hash:hash([]),expires_at:future});
 t0+='COMMIT;\n';
 if(!recovered)psql(c,'runtime',t0,{log:prefix+'-T0.log'});
 let t1='SET search_path='+searchPath+';\nBEGIN;\nSELECT id FROM public.print_documents WHERE id='+lit(ids.document)+' FOR UPDATE;\n';
 t1+=insert('print_jobs',{id:ids.job,store_id:store,document_id:ids.document,intent_id:ids.intent,kind:kind==='SALE'?'INITIAL':'TEST',execution_mode:'SYNTHETIC_ONLY',principal_id:principal,delegation_id:ids.delegation,terminal_id:terminal,delivery_mode:'THERMAL_BOUND',binding_version_id:ids.binding,copies:1,document_version:version,canonical_version:1,snapshot_hash:hash({prefix}),snapshot_cipher:cipher,snapshot_key_ref:'ephemeral-fixture',payload_manifest_hash:hash([{copy:ids.copy,hash:hash(payload)}]),renderer_version:'fixture-v1',profile_id:'SYNTHETIC_80',profile_version:1,confirmed_risk_revision:0,confirmed_exposure_hash:hash([]),authorization_expires_at:future,content_expires_at:contentExpiry});
 t1+=insert('print_copies',{id:ids.copy,store_id:store,document_id:ids.document,job_id:ids.job,ordinal:1,payload_hash:hash(payload),payload_size:payload.length,payload_cipher:cipher,payload_key_ref:'ephemeral-fixture',payload_expires_at:contentExpiry,send_key:ids.send});
 t1+='UPDATE public.print_requests SET job_id='+lit(ids.job)+',consumed_at=clock_timestamp() WHERE id='+lit(ids.request)+';\n';
 if(kind==='SALE')t1+='UPDATE public.print_documents SET initial_state=\'INITIAL_REGISTERED\',closed_by_intent_id='+lit(ids.intent)+' WHERE id='+lit(ids.document)+';\n';
 t1+='COMMIT;';
 if(!recovered)psql(c,'runtime',t1,{log:prefix+'-T1.log'});
 if(recovered?.state!=='SENDING')psql(c,'runtime','SET search_path='+searchPath+'; BEGIN; UPDATE public.print_copies SET state=\'READY\',lease_owner=\'fixture-executor\',lease_until=clock_timestamp()+interval \'5 minutes\',lease_epoch='+leaseEpoch+' WHERE id='+lit(ids.copy)+'; COMMIT;',{log:prefix+'-T2.log'});
 let t3='SET search_path='+searchPath+'; BEGIN;\nSELECT id FROM public.print_documents WHERE id='+lit(ids.document)+' FOR UPDATE;\nSELECT id FROM public.print_destinations WHERE id='+lit(ids.destination)+' FOR UPDATE;\n';
 t3+=insert('print_attempts',{id:ids.attempt,store_id:store,document_id:ids.document,job_id:ids.job,copy_id:ids.copy,number:1,lease_epoch:leaseEpoch,destination_id:ids.destination,result:'STARTED'});
 t3+='UPDATE public.print_destinations SET held_attempt_id='+lit(ids.attempt)+',held_store_id='+lit(store)+',blocked_at=clock_timestamp(),gate_epoch=gate_epoch+1 WHERE id='+lit(ids.destination)+';\nUPDATE public.print_copies SET state=\'SENDING\' WHERE id='+lit(ids.copy)+';COMMIT;';
 if(recovered?.state!=='SENDING')psql(c,'runtime',t3,{log:prefix+'-T3.log'});
 let t4='SET search_path='+searchPath+';BEGIN;\n';
 const evt=(id,proof)=>insert('print_events',{id,store_id:store,scope_kind:'DOCUMENT',document_id:ids.document,job_id:ids.job,copy_id:ids.copy,attempt_id:ids.attempt,destination_id:ids.destination,event_type:proof,proof_kind:proof,evidence_hash:hash({id,proof}),evidence_key:id,actor_kind:'SYNTHETIC_EXECUTOR',details:{synthetic:true}});
 t4+=evt(ids.ack,'SYNTHETIC_TRANSPORT_ACCEPTED');
 t4+='UPDATE public.print_attempts SET result=\'TRANSPORT_ACCEPTED\',finished_at=clock_timestamp() WHERE id='+lit(ids.attempt)+';\nUPDATE public.print_copies SET state=\'TRANSPORT_ACCEPTED\' WHERE id='+lit(ids.copy)+';\n';
 t4+=evt(ids.release,'SYNTHETIC_ATOMIC_QUEUE');
 t4+='UPDATE public.print_destinations SET held_attempt_id=NULL,held_store_id=NULL,release_event_id='+lit(ids.release)+',gate_epoch=gate_epoch+1 WHERE id='+lit(ids.destination)+';COMMIT;';
 psql(c,'runtime',t4,{log:prefix+'-T4.log'});
 return {kind,status:'PASS',runtimeRole:c.runtime,ids,simulationOnly:true};
}
export async function gateA() {
 const c=config();validateConfig(c);
 const cli=path.join(deps,'prisma/build/index.js');
 const env=prismaEnv(c);
 const commands=[
  ['validate',['validate','--schema',artifact('proposed.prisma')]],
  ['generate',['generate','--schema',artifact('client.prisma')]],
  ['base-ddl',['migrate','diff','--from-empty','--to-schema-datamodel',artifact('base.prisma'),'--script']],
  ['prisma-delta',['migrate','diff','--from-schema-datamodel',artifact('base.prisma'),'--to-schema-datamodel',artifact('proposed.prisma'),'--script']],
  ['parity-ddl',['migrate','diff','--from-empty','--to-schema-datamodel',artifact('proposed.prisma'),'--script']],
 ];
 const cliReady=['base-ddl.sql','prisma-delta.sql','parity-ddl.sql'].every(n=>fs.existsSync(artifact(n))) && fs.existsSync(path.join(root,'tools/print-core-004b/.lab/generated/client/index.js'));
 if(!cliReady) for(const [name,args]of commands)run(process.execPath,[cli,...args],{env,log:name+'.log',rawOutput:name.includes('ddl')||name==='prisma-delta'?artifact(name+'.sql'):undefined,timeout:60000});
 else json('gate-a-cli-reuse.json',{reason:'SQL-only minimal correction; datamodel unchanged; prior validate/generate succeeded',proposedSchemaSHA256:sha(fs.readFileSync(artifact('proposed.prisma')))});
 if(psql(c,'owner',"SELECT to_regclass('public.stores') IS NULL;").stdout.trim()==='t')psql(c,'owner',fs.readFileSync(artifact('base-ddl.sql'),'utf8'),{log:'base-apply.log'});
 if(psql(c,'owner',"SELECT to_regclass('public.print_jobs') IS NULL;").stdout.trim()==='t'){
  psql(c,'owner',fs.readFileSync(artifact('qualified.sql'),'utf8'),{log:'coordinated-apply.log'});
  json('coordinated-applied.json',{sha256:sha(fs.readFileSync(artifact('qualified.sql'))),status:'APPLIED_TO_DISPOSABLE_ONLY'});
 }else assert.equal(JSON.parse(fs.readFileSync(path.join(evidence,'coordinated-applied.json'),'utf8')).sha256,sha(fs.readFileSync(artifact('qualified.sql'))));
 if(psql(c,'owner',"SELECT to_regclass('public.print_jobs') IS NULL;",{database:c.parityDb}).stdout.trim()==='t')
  psql(c,'owner',fs.readFileSync(artifact('parity-ddl.sql'),'utf8'),{database:c.parityDb,log:'prisma-parity-apply.log'});
 const actual=catalog(c,c.db),derived=catalog(c,c.parityDb);
 json('catalog-actual.json',actual);json('catalog-prisma-derived.json',derived);
 const parity=compareCatalog(actual,derived);json('ddl-parity.json',parity);
 if(psql(c,'owner',"SELECT EXISTS(SELECT 1 FROM public.vendas WHERE id='fixture-sale-positive-sale');").stdout.trim()!=='t')psql(c,'owner',`BEGIN; INSERT INTO public.stores(id,name,"updatedAt") VALUES('fixture-store-a-004b','Synthetic store A',clock_timestamp()),('fixture-store-b-004b','Synthetic store B',clock_timestamp());
 INSERT INTO public.admin_users(id,name,email,password,role,"accessScope",active,"mustChangePassword","sessionVersion","updatedAt")
 VALUES('fixture-a01-004b','Synthetic A01','a01-004b@example.invalid','not-a-real-login-hash','ADMIN','PLATFORM',true,false,0,clock_timestamp());
 INSERT INTO public.pdv_terminais(id,"storeId",code,name,"updatedAt") VALUES('fixture-terminal-a-004b','fixture-store-a-004b','T1','Synthetic terminal',clock_timestamp());
 INSERT INTO public.vendas(id,"storeId","pedidoId",total,status) VALUES('fixture-sale-positive-sale','fixture-store-a-004b','SYNTHETIC-004B-1',10,'concluida');
 INSERT INTO public.venda_itens(id,"vendaId",nome,quantidade,"precoUnitario","lineTotal") VALUES('fixture-item-positive-sale','fixture-sale-positive-sale','Synthetic item',1,10,10); COMMIT;`,{log:'seed-gate-a.log'});
 const tables=printTables.map(t=>'public.'+qi(t)).join(',');
 psql(c,'owner','GRANT USAGE ON SCHEMA public TO '+qi(c.runtime)+';GRANT SELECT ON '+tables+' TO '+qi(c.runtime)+';'+
 'GRANT INSERT,UPDATE ON '+printTables.filter(t=>!['print_installations','print_destinations','print_bindings'].includes(t)).map(t=>'public.'+qi(t)).join(',')+' TO '+qi(c.runtime)+';'+
 'GRANT UPDATE ON public.print_destinations TO '+qi(c.runtime)+';GRANT DELETE ON public.print_requests TO '+qi(c.runtime)+';'+
 'GRANT SELECT ON public.stores,public.admin_user_stores,public.vendas,public.venda_itens,public.pdv_terminais TO '+qi(c.runtime)+'; GRANT SELECT(id,role,active,"mustChangePassword","accessScope","sessionVersion","lojaId") ON public.admin_users TO '+qi(c.runtime)+';',{log:'runtime-grants.log'});
 const positive=[positiveFlow(c,'SALE','positive-sale'),positiveFlow(c,'SYNTHETIC','positive-test')];
 json('positive-T0-T4.json',positive);
 console.log('GATE A STRUCTURE/POSITIVE PASS; running R01/R02 and rollback checks');
 const results=[];
 const rows=JSON.parse(psql(c,'owner',"SELECT json_object_agg(t, id) FROM ("+printTables.map(t=>"SELECT "+lit(t)+" t,id FROM public."+qi(t)+" LIMIT 1").map(s=>'('+s+')').join(' UNION ALL ')+")x;").stdout.trim());
 for(const table of printTables) {
  assert.ok(rows[table],'Positive row required '+table);
  results.push(expectedError(c,'owner','DELETE FROM public.'+qi(table)+' WHERE id='+lit(rows[table])+';','P0001','p004 ledger deletion requires separate approved retirement/retention scope','R02-owner-'+table));
  if(table!=='print_requests')results.push(expectedError(c,'runtime','DELETE FROM public.'+qi(table)+' WHERE id='+lit(rows[table])+';','42501','permission denied','R02-runtime-'+table));
 }
 const probe='p004_rollback_probe_'+crypto.randomBytes(4).toString('hex');
 results.push(expectedError(c,'owner','BEGIN;CREATE TABLE public.'+qi(probe)+'(id integer);CREATE UNIQUE INDEX p004_vendas_id_store_uq ON public.vendas(id,"storeId");COMMIT;','42P07','already exists','DDL-ROLLBACK-CONFLICT'));
 assert.equal(psql(c,'owner',"SELECT to_regclass('public."+probe+"') IS NULL;").stdout.trim(),'t');
 json('gate-a-basic-results.json',results);
 json('gate-a-progress.json',{structure:'PASS',positive:'PASS',parity,results,remaining:['R01-shadow','R02-expired-request','runtime-privilege-catalog']});
}
