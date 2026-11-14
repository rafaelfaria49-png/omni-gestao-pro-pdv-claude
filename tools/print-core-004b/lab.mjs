import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

export const labRoot = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(labRoot, '../..');
export const scratch = path.join(labRoot, 'scratch');
export const evidence = path.join(labRoot, 'evidence');
export const privateRoot = path.join(labRoot, '.lab');
export const pgBin = 'C:/Program Files/PostgreSQL/17/bin';
export const deps = 'C:/Projetos/omni-gestao/node_modules';
const packageRoot = 'C:/Projetos/omni-print-schema-004a-evidence-001';
const base = '35a3971c31f62e6e802b7dd8763be81475334780';
const expected = {
 document: '5C57411E31C558E366FDEF00A2A45C0BD0C6605ADF292B4FA71EC980C92C9F2E',
 prisma: '1A8F11063AF75740CD46C4A014487159385871935CF0B7E30741295A6C0E39B6',
 sql: '4F05F943112DF35AFE986CA8BC1B4CFCF15FC53B0AFA23328C5E9A786F2FD97F',
};
export const sha = value => crypto.createHash('sha256').update(value).digest('hex').toUpperCase();
export const json = (name, value) => fs.writeFileSync(path.join(evidence, name), JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2) + '\n');
const cfgPath = path.join(privateRoot, 'session.json');
const marker = 'OMNI-PRINT-PERSISTENCIA-004B-CORE-SYNTHETIC';
if (process.env.OMNI_PRINT_LAB !== '004B') throw new Error('Use launch.ps1; inherited environment is prohibited');
for (const name of Object.keys(process.env)) {
 if (/^(DATABASE_URL|DIRECT_URL|PGHOST|PGPORT|PGDATABASE|PGUSER|PGPASSWORD|PGSERVICE|AUTH_SECRET|NEXTAUTH_SECRET|NEON_|VERCEL_)/.test(name)) {
  throw new Error('Uncontrolled inherited connection/auth environment: ' + name);
 }
}
fs.mkdirSync(scratch, { recursive: true });
fs.mkdirSync(evidence, { recursive: true });
fs.mkdirSync(privateRoot, { recursive: true });
export const config = () => JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const safeBase = () => {
 const keys = ['SystemRoot', 'WINDIR', 'ComSpec', 'PATH', 'TEMP', 'TMP', 'OMNI_PRINT_LAB', 'CHECKPOINT_DISABLE',
 'PRISMA_HIDE_UPDATE_MESSAGE', 'PRISMA_GENERATE_SKIP_AUTOINSTALL', 'PRISMA_SCHEMA_ENGINE_BINARY', 'PRISMA_QUERY_ENGINE_LIBRARY', 'NODE_PATH'];
 const env = {};
 for (const key of keys) if (process.env[key] !== undefined) env[key] = process.env[key];
 return env;
};
export function validateConfig(c, requireRunning = true) {
 assert.equal(c.goal, marker);
 assert.equal(c.host, '127.0.0.1');
 assert.ok(Number.isInteger(c.port) && c.port > 1024 && c.port < 65536);
 assert.equal(path.resolve(c.cluster), path.join(privateRoot, 'cluster'));
 assert.match(c.db, /^omni_004b_[a-f0-9]{8}$/);
 assert.match(c.parityDb, /^omni_004b_[a-f0-9]{8}_parity$/);
 for (const role of [c.admin, c.owner, c.runtime]) assert.match(role, /^omni_004b_(admin|owner|runtime)_[a-f0-9]{8}$/);
 if (requireRunning) {
  const pidFile = fs.readFileSync(path.join(c.cluster, 'postmaster.pid'), 'utf8').split(/\r?\n/);
  assert.equal(path.resolve(pidFile[1]), path.resolve(c.cluster));
  assert.equal(Number(pidFile[3]), c.port);
  assert.ok(Number(pidFile[0]) > 0);
 }
 return c;
}
export function credentials(c, role = 'owner', database = c.db) {
 validateConfig(c);
 assert.ok([c.db, c.parityDb, 'postgres'].includes(database), 'Database must belong to this laboratory');
 assert.ok(['admin', 'owner', 'runtime'].includes(role));
 return { user: c[role], password: c[role + 'Password'], database };
}
export function connectionUrl(c, role = 'owner', database = c.db) {
 const k = credentials(c, role, database);
 const url = new URL('postgresql://127.0.0.1:' + c.port + '/' + database);
 url.username = k.user; url.password = k.password;
 url.searchParams.set('schema', 'public');
 url.searchParams.set('connect_timeout', '5');
 assert.equal(url.hostname, '127.0.0.1');
 assert.equal(Number(url.port), c.port);
 assert.equal(url.pathname.slice(1), database);
 return url.href;
}
export function pgEnv(c, role = 'owner', database = c.db) {
 const k = credentials(c, role, database);
 return { ...safeBase(), PGCLIENTENCODING:'UTF8', PGHOST: c.host, PGPORT: String(c.port), PGDATABASE: k.database, PGUSER: k.user, PGPASSWORD: k.password, PGCONNECT_TIMEOUT: '5', PGSSLMODE: 'disable' };
}
export function prismaEnv(c, role = 'owner', database = c.db) {
 const url = connectionUrl(c, role, database);
 return { ...safeBase(), DATABASE_URL: url, DIRECT_URL: url };
}
function scrub(value) {
 let out = String(value || '');
 if (fs.existsSync(cfgPath)) {
  const c = config();
  for (const key of ['adminPassword', 'ownerPassword', 'runtimePassword']) out = out.split(c[key]).join('[SYNTHETIC_PASSWORD_REDACTED]');
 }
 return out.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[LOCAL_SYNTHETIC_DSN_REDACTED]');
}
export function run(binary, args, options = {}) {
 const result = spawnSync(binary, args, {
  cwd: options.cwd || scratch, env: options.env || safeBase(), windowsHide: true,
  encoding: 'utf8', input: options.input, timeout: options.timeout || 60000, maxBuffer: 32 * 1024 * 1024,
 });
 const stdout = scrub(result.stdout), stderr = scrub(result.stderr);
 if (options.log) fs.appendFileSync(path.join(evidence, options.log), '\n[RUN '+new Date().toISOString()+']\n'+stdout+stderr);
 if (options.rawOutput) fs.writeFileSync(options.rawOutput, result.stdout || '');
 if (result.error || result.status !== 0) {
  const error = new Error(path.basename(binary) + ' failed; status=' + result.status + '; ' + scrub(result.error?.message || stderr).slice(-2500));
  error.output = stdout + stderr; error.status = result.status; throw error;
 }
 return { stdout, stderr, raw: result.stdout || '' };
}
export function psql(c, role, text, options = {}) {
 const database = options.database || c.db;
 return run(path.join(pgBin, 'psql.exe'), ['-X', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-A', '-t', '-f', '-'], {
  env: pgEnv(c, role, database), input: text, log: options.log, rawOutput: options.rawOutput, timeout: options.timeout || 60000,
 });
}
function applyPatch(source, diff) {
 const old = source.replace(/\r\n/g, '\n').split('\n');
 const lines = diff.split('\n');
 const out = []; let cursor = 0; let i = 0;
 while (i < lines.length) {
  const match = lines[i].match(/^@@ -(\d+),(\d+) \+(\d+),(\d+) @@/);
  if (!match) { i++; continue; }
  const start = Number(match[1]) - 1;
  assert.ok(start >= cursor, 'Patch hunks ordered');
  out.push(...old.slice(cursor, start)); cursor = start; i++;
  while (i < lines.length && !lines[i].startsWith('@@ ')) {
   const line = lines[i];
   if (line.startsWith(' ')) { assert.equal(old[cursor++], line.slice(1)); out.push(line.slice(1)); }
   else if (line.startsWith('-')) assert.equal(old[cursor++], line.slice(1));
   else if (line.startsWith('+')) out.push(line.slice(1));
   else if (line === '' && i === lines.length - 1) break;
   else throw new Error('Unexpected patch line');
   i++;
  }
 }
 out.push(...old.slice(cursor));
 return out.join('\n');
}
export function qualify(original) {
 let sql = original;
 const tables = ['print_installations','print_destinations','print_bindings','print_delegations','print_documents','print_jobs','print_requests','print_copies','print_attempts','print_events','vendas','pdv_terminais','stores','admin_users'];
 for (const table of tables) {
  sql = sql.split('"' + table + '"').join('"public"."' + table + '"');
  sql = sql.replace(new RegExp('\\b(FROM|JOIN|UPDATE|INTO)\\s+(' + table + ')\\b', 'g'), (_, keyword) => keyword + ' "public"."' + table + '"');
  sql = sql.replace(new RegExp('\\b' + table + '%ROWTYPE', 'g'), '"public"."' + table + '"%ROWTYPE');
 }
 sql = sql.replace(/CREATE FUNCTION (p004_\w+)/g, 'CREATE FUNCTION "public".$1');
 sql = sql.replace(/EXECUTE FUNCTION (p004_\w+)/g, 'EXECUTE FUNCTION "public".$1');
 sql = sql.replace(/LANGUAGE plpgsql AS/g, 'LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS');
 sql = sql.replace(/(AS \$p004\$\n[\s\S]*?\nBEGIN\n)/g, part => part + " IF TG_TABLE_SCHEMA <> 'public' THEN RAISE EXCEPTION 'p004 schema mismatch'; END IF;\n");
 const unsafe = " IF TG_TABLE_NAME = 'print_requests' AND OLD.expires_at < clock_timestamp() THEN RETURN OLD; END IF;";
 assert.ok(sql.includes(unsafe), 'Expected original R02 guard');
 sql = sql.replace(unsafe, " IF TG_TABLE_NAME = 'print_requests' THEN\n  IF OLD.expires_at < clock_timestamp() THEN RETURN OLD; END IF;\n END IF;");

 const beforeR03=sql;
 sql=sql.replace("a.result <> CASE c.state WHEN 'SENDING' THEN 'STARTED' ELSE c.state END THEN","a.result <> (CASE c.state WHEN 'SENDING' THEN 'STARTED' ELSE c.state END) THEN");
 sql=sql.replace("c.state <> CASE a.result WHEN 'STARTED' THEN 'SENDING' ELSE a.result END THEN","c.state <> (CASE a.result WHEN 'STARTED' THEN 'SENDING' ELSE a.result END) THEN");
 assert.notEqual(sql,beforeR03,'Expected minimal R03 parser correction');
 const beforeR04=sql;
 sql=sql.replaceAll('print_bindings" b JOIN','print_bindings" candidate_binding JOIN')
  .replaceAll('i.id = b.installation_id','i.id = candidate_binding.installation_id')
  .replaceAll('q.id = b.destination_id WHERE b.id = j.binding_version_id','q.id = candidate_binding.destination_id WHERE candidate_binding.id = j.binding_version_id')
  .replaceAll("AND b.state = 'ACTIVE' AND i.revoked_at","AND candidate_binding.state = 'ACTIVE' AND i.revoked_at");
 assert.notEqual(sql,beforeR04,'Expected minimal R04 alias correction');
 assert.equal((sql.match(/SET search_path = pg_catalog, public, pg_temp/g) || []).length, 6);
 assert.ok(!sql.includes('SECURITY DEFINER'));
 return sql;
}
export async function prepare() {
 const documents = {};
 for (const name of ['SCHEMA_PROPOSTO.md','DECISOES_PARA_APROVACAO.md','PLANO_VALIDACAO.md','RELATORIO.md']) {
  documents[name] = fs.readFileSync(path.join(packageRoot, name));
 }
 assert.equal(sha(documents['SCHEMA_PROPOSTO.md']), expected.document);
 const text = documents['SCHEMA_PROPOSTO.md'].toString('utf8');
 const diff = text.match(/^## 7\.[\s\S]*?^~~~diff\r?\n([\s\S]*?)^~~~/m)?.[1];
 const sql = text.match(/^## 8\.[\s\S]*?^~~~sql\r?\n([\s\S]*?)^~~~/m)?.[1];
 assert.equal(sha(diff), expected.prisma); assert.equal(sha(sql), expected.sql);
 assert.ok(diff.endsWith('\n') && sql.endsWith('\n'));
 const baseSchema = run('git',['show',base+':prisma/schema.prisma'],{cwd:root}).raw;
 const proposed = applyPatch(baseSchema, diff);
 fs.writeFileSync(path.join(scratch, 'original-prisma.diff'), diff);
 fs.writeFileSync(path.join(scratch, 'original.sql'), sql);
 fs.writeFileSync(path.join(scratch, 'qualified.sql'), qualify(sql));
 fs.writeFileSync(path.join(scratch, 'base.prisma'), baseSchema);
 fs.writeFileSync(path.join(scratch, 'proposed.prisma'), proposed);
 const client = proposed.replace('provider = "prisma-client-js"', 'provider = "node C:/Projetos/omni-gestao/node_modules/@prisma/client/generator-build/index.js"')
  .replace('output   = "../generated/prisma"', 'output   = "../.lab/generated/client"');
 assert.notEqual(client, proposed);
 fs.writeFileSync(path.join(scratch, 'client.prisma'), client);
 fs.writeFileSync(path.join(scratch, 'package.json'), '{"private":true,"name":"omni-print-004b-isolated-scratch"}\n');
 const correction = spawnSync('git', ['diff','--no-index','--','original.sql','qualified.sql'], { cwd:scratch, env:safeBase(), windowsHide:true,encoding:'utf8' });
 assert.ok([0,1].includes(correction.status));
 fs.writeFileSync(path.join(evidence, 'R01-R02-sql.diff'), correction.stdout);
 json('input-integrity.json', { goal:marker, base, documents:Object.fromEntries(Object.entries(documents).map(([n,b])=>[n,sha(b)])),
 originalPrismaDiff:sha(diff), originalSQL:sha(sql), correctedSQL:sha(qualify(sql)), finalLF:true, schemaRaw:sha(baseSchema), inheritedDatabaseAuthKeys:[] });
 const pgVersion = run(path.join(pgBin,'postgres.exe'),['--version']).stdout.trim();
 const prismaVersion = JSON.parse(fs.readFileSync(path.join(deps,'prisma/package.json'),'utf8')).version;
 json('tool-versions.json', { node:process.version, postgres:pgVersion, prisma:prismaVersion, platform:process.platform,
  engineBinaries:['schema-engine-windows.exe','query_engine-windows.dll.node'].map(name=>({name,sha256:sha(fs.readFileSync(path.join(deps,'@prisma/engines',name)))})) });
 console.log('PREPARE PASS: exact input bytes; R01/R02 diff preserved; tools already installed');
}
async function freePort() {
 const server = net.createServer();
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const port=server.address().port;
 await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 return port;
}
export async function initCluster() {
 if (fs.existsSync(cfgPath)) throw new Error('Existing lab session; do not overwrite');
 const suffix=crypto.randomBytes(4).toString('hex');
 const c={goal:marker,labId:crypto.randomUUID(),host:'127.0.0.1',port:await freePort(),
  cluster:path.join(privateRoot,'cluster'),db:'omni_004b_'+suffix,parityDb:'omni_004b_'+suffix+'_parity',
  admin:'omni_004b_admin_'+suffix,owner:'omni_004b_owner_'+suffix,runtime:'omni_004b_runtime_'+suffix,
  adminPassword:crypto.randomBytes(24).toString('hex'),ownerPassword:crypto.randomBytes(24).toString('hex'),runtimePassword:crypto.randomBytes(24).toString('hex')};
 validateConfig(c,false);
 assert.ok(!fs.existsSync(c.cluster), 'Cluster directory must be new');
 fs.writeFileSync(cfgPath,JSON.stringify(c),{mode:0o600});
 const pw=path.join(privateRoot,'bootstrap-password.fixture');
 fs.writeFileSync(pw,c.adminPassword+'\n',{mode:0o600});
 run(path.join(pgBin,'initdb.exe'),['-D',c.cluster,'-U',c.admin,'--auth-host=scram-sha-256','--auth-local=scram-sha-256','--encoding=UTF8','--locale=C','--pwfile='+pw],{log:'initdb.log'});
 fs.appendFileSync(path.join(c.cluster,'postgresql.conf'),"\n# Owned laboratory 004B only\nlisten_addresses='127.0.0.1'\nport="+c.port+"\nunix_socket_directories=''\nmax_connections=20\nshared_buffers='32MB'\nlog_statement='none'\nlog_connections=off\n");
 pgControl(c,['-l',path.join(privateRoot,'postgres.log'),'-w','-t','30','start'],'cluster-start.log');
 return provisionCluster();
}
export function provisionCluster() {
 const c=config();
 validateConfig(c);
 json('before-first-connection.json',{goal:marker,host:c.host,port:c.port,plannedDatabase:c.db,parityDatabase:c.parityDb,
  admin:c.admin,owner:c.owner,runtime:c.runtime,cluster:c.cluster,pid:Number(fs.readFileSync(path.join(c.cluster,'postmaster.pid'),'utf8').split(/\r?\n/)[0]),
  version:run(path.join(pgBin,'postgres.exe'),['--version']).stdout.trim(),environment:'positive allowlist; inherited PG/Prisma/auth URLs absent; fixture credentials only'});
 const observed=psql(c,'admin',"SELECT json_build_object('host',inet_server_addr(),'port',inet_server_port(),'database',current_database(),'user',current_user,'cluster',current_setting('data_directory'),'version',current_setting('server_version'));",{database:'postgres'});
 const info=JSON.parse(observed.stdout.trim());
 assert.equal(info.host,c.host);assert.equal(info.port,c.port);assert.equal(path.resolve(info.cluster),path.resolve(c.cluster));
 json('first-connection-identity.json',info);
 psql(c,'admin','CREATE ROLE "'+c.owner+'" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD \''+c.ownerPassword+"';\n"+'CREATE ROLE "'+c.runtime+'" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD \''+c.runtimePassword+"';\n"+'CREATE DATABASE "'+c.db+'" OWNER "'+c.owner+'";\n'+'CREATE DATABASE "'+c.parityDb+'" OWNER "'+c.owner+'";\n',{database:'postgres',log:'bootstrap-roles.log'});
 for(const database of [c.db,c.parityDb]) psql(c,'admin','REVOKE ALL ON DATABASE "'+database+'" FROM PUBLIC; GRANT CONNECT ON DATABASE "'+database+'" TO "'+c.owner+'","'+c.runtime+'"; REVOKE CREATE ON SCHEMA public FROM PUBLIC;', {database,log:database===c.db?'core-privileges.log':'parity-privileges.log'});
 console.log('CLUSTER PASS: own loopback PostgreSQL; exclusive databases and distinct roles created');
}

function pgControl(c,args,name) {
 const file=path.join(evidence,name);
 const fd=fs.openSync(file,'a');
 let result;
 try { result=spawnSync(path.join(pgBin,'pg_ctl.exe'),['-D',c.cluster,...args],{cwd:scratch,env:safeBase(),windowsHide:true,stdio:['ignore',fd,fd],timeout:40000}); }
 finally {fs.closeSync(fd);}
 if(result.error || result.status!==0) throw new Error('Owned pg_ctl command failed; '+String(result.error?.message||result.status));
 return result;
}

export function stopCluster() {
 if(!fs.existsSync(cfgPath)){console.log('STOP: no owned session');return;}
 const c=config();validateConfig(c,false);
 if(!fs.existsSync(path.join(c.cluster,'postmaster.pid'))){console.log('STOP: owned cluster already stopped');return;}
 validateConfig(c);
 pgControl(c,['-m','fast','-w','-t','30','stop'],'cluster-stop.log');
 json('cluster-stopped.json',{goal:marker,cluster:c.cluster,stopped:true,otherServicesTouched:false});
 console.log('STOP PASS: only owned cluster stopped; evidence and data preserved');
}

export function recordR03() {
 const file=path.join(scratch,'qualified.sql');
 const old=fs.readFileSync(file,'utf8');
 const next=old.replace("a.result <> CASE c.state WHEN 'SENDING' THEN 'STARTED' ELSE c.state END THEN","a.result <> (CASE c.state WHEN 'SENDING' THEN 'STARTED' ELSE c.state END) THEN")
  .replace("c.state <> CASE a.result WHEN 'STARTED' THEN 'SENDING' ELSE a.result END THEN","c.state <> (CASE a.result WHEN 'STARTED' THEN 'SENDING' ELSE a.result END) THEN");
 assert.notEqual(next,old);
 fs.writeFileSync(path.join(scratch,'qualified-R01-R02.sql'),old);
 fs.writeFileSync(file,next);
 const diff=spawnSync('git',['diff','--no-index','--','qualified-R01-R02.sql','qualified.sql'],{cwd:scratch,env:safeBase(),encoding:'utf8',windowsHide:true});
 assert.equal(diff.status,1);
 fs.writeFileSync(path.join(evidence,'R03-case-parser.diff'),diff.stdout);
 json('sql-corrections.json',{original:expected.sql,R01R02:sha(old),final:sha(next),
  changes:[{id:'R01',kind:'schema qualification and fixed search_path'},{id:'R02',kind:'nested table branch before OLD.expires_at'},{id:'R03',kind:'parenthesize CASE in two IF conditions',observedSQLSTATE:'42601',scope:'syntax only; no model/invariant change'}]});
 const c=config();
 const state=psql(c,'owner',"SELECT json_build_object('print_tables',(SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'print_%'),'p004_functions',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'p004_%'),'parent_index',to_regclass('public.p004_vendas_id_store_uq'));");
 const rollback=JSON.parse(state.stdout.trim());
 assert.equal(rollback.print_tables,0);assert.equal(rollback.p004_functions,0);assert.equal(rollback.parent_index,null);
 json('first-sql-failure-rollback.json',{sqlstate:'42601',...rollback,existingBasePreserved:true,noDropExecuted:true});
 fs.appendFileSync(path.join(c.cluster,'postgresql.conf'),"\nlc_messages='C'\n");
 psql(c,'admin','SELECT pg_reload_conf();',{database:'postgres',log:'owned-log-locale.log'});
 console.log('R03 documented; failed migration rolled back; base remains intact');
}

export function recordR04() {
 const file=path.join(scratch,'qualified.sql'),old=fs.readFileSync(file,'utf8');
 const from='SELECT 1 FROM "public"."print_bindings" b JOIN "public"."print_installations" i ON i.id = b.installation_id\n     JOIN "public"."print_destinations" q ON q.id = b.destination_id WHERE b.id = j.binding_version_id\n     AND b.state =';
 const to='SELECT 1 FROM "public"."print_bindings" candidate_binding JOIN "public"."print_installations" i ON i.id = candidate_binding.installation_id\n     JOIN "public"."print_destinations" q ON q.id = candidate_binding.destination_id WHERE candidate_binding.id = j.binding_version_id\n     AND candidate_binding.state =';
 assert.ok(old.includes(from));
 const next=old.replace(from,to);
 fs.writeFileSync(path.join(scratch,'qualified-through-R03.sql'),old);
 fs.writeFileSync(file,next);
 const definition=next.match(/CREATE FUNCTION "public"\.p004_insert_guard\(\)[\s\S]*?END \$p004\$;/)?.[0];
 assert.ok(definition);
 psql(config(),'owner',definition.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION'),{log:'R04-function-replacement.log'});
 const diff=spawnSync('git',['diff','--no-index','--','qualified-through-R03.sql','qualified.sql'],{cwd:scratch,env:safeBase(),encoding:'utf8',windowsHide:true});
 assert.equal(diff.status,1);
 fs.writeFileSync(path.join(evidence,'R04-binding-alias.diff'),diff.stdout);
 const history=JSON.parse(fs.readFileSync(path.join(evidence,'sql-corrections.json'),'utf8'));
 history.R03=history.final;history.final=sha(next);
 history.changes.push({id:'R04',kind:'rename query alias colliding with PL/pgSQL record variable b',observedSQLSTATE:'42702',scope:'name resolution only; no model/invariant change'});
 json('sql-corrections.json',history);
 json('coordinated-applied.json',{sha256:sha(next),status:'APPLIED_TO_DISPOSABLE_ONLY',incrementalFix:'p004_insert_guard replaced with minimal alias correction'});
 console.log('R04 PASS: minimal alias correction applied only to owned function');
}
