// Owned PostgreSQL 17 cluster, loopback only. Never reads app .env or secrets.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, ...Array(6).fill('..'));
const OUT = path.resolve(__dirname, '..');
const SCRATCH = path.join(OUT, '.scratch');
const DATA = path.join(SCRATCH, 'pg17-data');
const STATE = path.join(SCRATCH, 'state.json');
const BIN = 'C:/Program Files/PostgreSQL/17/bin';
const ADMIN = 'a6_synthetic_admin';
const quote = x => "'" + String(x).replace(/'/g,"''") + "'";
function assert(ok, why) { if (!ok) throw Error(why); }
function cleanEnv(extra = {}) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/^PG|DATABASE_URL|DIRECT_URL|PRISMA_/i.test(k)) delete env[k];
  return { ...env, LC_ALL: 'C', LANG: 'C', PGCLIENTENCODING: 'UTF8', ...extra };
}
function exe(name, args, options = {}) {
  const r = spawnSync(path.join(BIN, name + '.exe'), args,
    { encoding:'utf8', windowsHide:true, timeout:60000, maxBuffer:16*1024*1024, env:cleanEnv(), ...options });
  return r;
}
function state() {
  const s = JSON.parse(fs.readFileSync(STATE, 'utf8'));
  assert(s.owner === 'ESTOQUE-KG-PRODUCTION-A6-GUARD-REVIEW-001' && s.host === '127.0.0.1' && s.admin === ADMIN,
    'Not the owned A6 synthetic cluster');
  assert(s.data === DATA && path.resolve(s.data).startsWith(path.resolve(OUT) + path.sep), 'Cluster path outside A6 evidence');
  assert(Number.isInteger(s.port) && s.port > 1024 && s.port < 65536, 'Invalid local port');
  return s;
}
function environment(db = 'postgres') {
  const s = state();
  assert(db === 'postgres' || /^a6_[a-z0-9_]+$/.test(db), 'Only disposable A6 database names allowed');
  return cleanEnv({PGHOST:s.host,PGPORT:String(s.port),PGUSER:ADMIN,PGDATABASE:db,PGSSLMODE:'disable',
    PGCONNECT_TIMEOUT:'5',PGAPPNAME:'a6-synthetic-only'});
}
function guard(db) {
  const s = state();
  const data = DATA.replaceAll('\\','/').toLowerCase();
  return `SELECT 1 / CASE WHEN current_database() = ${quote(db)}
    AND inet_server_addr() = '127.0.0.1'::inet AND inet_server_port() = ${s.port}
    AND current_user = '${ADMIN}' AND current_setting('server_version_num')::int BETWEEN 170000 AND 179999
    AND lower(replace(current_setting('data_directory'), chr(92), '/')) = ${quote(data)}
    AND current_setting('neon.project_id', true) IS NULL THEN 1 ELSE 0 END AS a6_local_guard \\gset\n`;
}
function psql(db, sql, options = {}) {
  const r = exe('psql', ['-X','-w','-q','-A','-t','-P','pager=off','-v','ON_ERROR_STOP=1',
    '-v','VERBOSITY='+ (options.verbose ? 'verbose' : 'sqlstate'), ...(options.single ? ['-1'] : []), '-f','-'],
    {env:environment(db),input:guard(db)+sql,timeout:options.timeout || 60000});
  return {ok:r.status===0,status:r.status,out:r.stdout||'',err:r.stderr||'',process_error:r.error?.code||null};
}
function must(db, sql, options) {
  const r = psql(db, sql, options);
  assert(r.ok, 'Local SQL failed: ' + r.err.trim()); return r.out.trim();
}
function url(db) {
  const s = state(); environment(db);
  return `postgresql://${ADMIN}@127.0.0.1:${s.port}/${db}?schema=public&connection_limit=2&connect_timeout=5`;
}
async function start() {
  assert(!fs.existsSync(STATE) && !fs.existsSync(DATA), 'Refusing to overwrite/reuse a cluster');
  fs.mkdirSync(SCRATCH,{recursive:true});
  const version = exe('postgres',['--version']); assert(/17\./.test(version.stdout),'PostgreSQL 17 required');
  const port = await new Promise((resolve,reject) => { const server=net.createServer(); server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>{const p=server.address().port; server.close(e=>e?reject(e):resolve(p));}); });
  const init = exe('initdb',['-D',DATA,'-U',ADMIN,'--auth-local=trust','--auth-host=trust','--encoding=UTF8','--locale=C']);
  assert(init.status===0,'Local initdb failed: '+init.stderr);
  const s = {owner:'ESTOQUE-KG-PRODUCTION-A6-GUARD-REVIEW-001',host:'127.0.0.1',port,admin:ADMIN,data:DATA,created_at:new Date().toISOString()};
  fs.writeFileSync(STATE,JSON.stringify(s,null,2)+'\n',{flag:'wx'});
  const started = exe('pg_ctl',['-D',DATA,'-l',path.join(SCRATCH,'postgres.log'),'-o',
    `-h 127.0.0.1 -p ${port} -c shared_buffers=16MB -c max_connections=20 -c max_wal_size=64MB -c min_wal_size=32MB -c log_min_messages=warning`,'-w','-t','30','start']);
  assert(started.status===0,'Local PostgreSQL start failed: '+started.stderr);
  return verify();
}
function verify() {
  state();
  const identity = JSON.parse(must('postgres',`SELECT json_build_object('server_version',current_setting('server_version'),
    'server_port',inet_server_port(),'local',inet_server_addr()='127.0.0.1'::inet,
    'data_directory_matches',lower(replace(current_setting('data_directory'),chr(92),'/'))=${quote(DATA.replaceAll('\\','/').toLowerCase())},
    'no_neon_project',current_setting('neon.project_id',true) IS NULL);`));
  if (must('postgres',"SELECT count(*) FROM pg_roles WHERE rolname='omni_owner';") === '0')
    must('postgres', 'CREATE ROLE omni_owner NOLOGIN;');
  if (!fs.existsSync(path.join(OUT,'01-local-cluster.json')))
    fs.writeFileSync(path.join(OUT,'01-local-cluster.json'),JSON.stringify({...identity,synthetic_only:true,external_connections:0},null,2)+'\n',{flag:'wx'});
  return identity;
}
function createDb(name) {
  environment(name); assert(name !== 'postgres','Tests need their own database');
  must('postgres',`CREATE DATABASE "${name}" OWNER omni_owner;`);
}
function resume() {
  const s=state();
  const status=exe('pg_ctl',['-D',DATA,'status']);
  if(status.status!==0) {
    const r=exe('pg_ctl',['-D',DATA,'-l',path.join(SCRATCH,'postgres.log'),'-o',
      `-h 127.0.0.1 -p ${s.port} -c shared_buffers=16MB -c max_connections=20 -c max_wal_size=64MB -c min_wal_size=32MB -c log_min_messages=warning`,'-w','-t','30','start']);
    assert(r.status===0,'Owned cluster restart failed: '+r.stderr);
  }
  return verify();
}
function stop() {
  state(); // Checks the exact owned absolute data path before pg_ctl.
  const r=exe('pg_ctl',['-D',DATA,'-m','fast','-w','-t','30','stop']);
  assert(r.status===0,'Stopping owned local cluster failed: '+r.stderr);
  fs.writeFileSync(path.join(SCRATCH,'stopped-'+Date.now()+'.json'),JSON.stringify({stopped_at:new Date().toISOString(),owned_cluster_only:true})+'\n',{flag:'wx'});
  return {owned_cluster_stopped:true};
}
module.exports={ROOT,OUT,SCRATCH,BIN,ADMIN,cleanEnv,state,environment,guard,psql,must,url,createDb,start,resume,verify,stop};
if(require.main===module) (async()=>{
  if(process.argv[2]==='start') console.log(JSON.stringify(await start(),null,2));
  else if(process.argv[2]==='verify') console.log(JSON.stringify(verify(),null,2));
  else if(process.argv[2]==='stop') console.log(JSON.stringify(stop(),null,2));
  else throw Error('Only start/stop supported');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
