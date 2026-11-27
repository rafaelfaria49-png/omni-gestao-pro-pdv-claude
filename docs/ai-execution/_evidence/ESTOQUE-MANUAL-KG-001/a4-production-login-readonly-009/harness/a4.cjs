// ESTOQUE-KG-PRODUCTION-A4-001. This harness has no database/API write phase.
// Passwords are read only from the existing A2/legacy files and passed through
// the child environment, never argv, logs or evidence. Evidence files use wx.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const ROOT = 'C:/Projetos/omni-gestao';
const WORKTREE = ROOT + '/.worktrees/estoque-manual-kg-001';
const BASE = path.resolve(__dirname, '..');
const ATTEMPT = /^[0-9]{2}$/.test(process.argv[3] || '') ? process.argv[3] : null;
const OUT = ATTEMPT ? path.join(BASE, 'attempt-' + ATTEMPT) : BASE;
const PSQL = 'C:/Program Files/PostgreSQL/17/bin/psql.exe';
const KG_FILE = 'C:/Projetos/secrets/neon-production-kg/.env';
const OLD_FILE = 'C:/Projetos/secrets/neon-production.env';
const E = { project: 'dry-mouse-36002471', branch: 'br-muddy-meadow-ac7ah2wl',
  endpoint: 'ep-summer-tooth-acltc6wi', database: 'omnigestao_prod',
  direct: 'ep-summer-tooth-acltc6wi.sa-east-1.aws.neon.tech',
  pooled: 'ep-summer-tooth-acltc6wi-pooler.sa-east-1.aws.neon.tech' };
const VERCEL_ID = 'prj_wjkHKw2jFQfY8regMYtkYXwgavuz';
const SECRET = [];
let haltedForIdentity = false;
const summary = { goal: 'ESTOQUE-KG-PRODUCTION-A4-001', started_at: new Date().toISOString(), phases: {}, failures: [] };
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const read = f => fs.readFileSync(f, 'utf8');
const check = (condition, message) => { if (!condition) throw new Error(message); };
const redact = input => {
  let s = String(input || '');
  for (const value of [...SECRET].filter(Boolean).sort((a,b) => b.length-a.length)) s = s.split(value).join('<redacted>');
  return s.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '<connection-url-redacted>')
    .replace(/Bearer\s+[^\s"'<>]+/gi, 'Bearer <redacted>');
};
function envFile(file) {
  const result = {};
  for (const line of read(file).replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) result[m[1]] = m[2].trim().replace(/^"|"$/g, '');
  }
  for (const value of Object.values(result)) {
    SECRET.push(value);
    if (/^postgres(?:ql)?:/.test(value)) {
      const u = new URL(value);
      SECRET.push(u.password, decodeURIComponent(u.password));
    }
  }
  return result;
}
function save(name, value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n';
  fs.writeFileSync(path.join(OUT, name), redact(text), { flag: 'wx' });
}
function phase(name, data) {
  summary.phases[name] = data;
  save(name + '.json', data);
  console.log(name + ': ' + (data.pass === false ? 'FAIL' : 'PASS'));
}
function localManifest() {
  const entries = {};
  for (const repo of [ROOT, WORKTREE]) {
    const d = spawnSync('git', ['diff', '--binary', 'HEAD'], { cwd: repo, encoding: 'utf8' });
    check(d.status === 0, 'git diff failed'); entries[repo + ':diff'] = sha(d.stdout);
    const modified = spawnSync('git', ['ls-files', '-m', '-z'], { cwd: repo, encoding: 'utf8' });
    check(modified.status === 0, 'git ls-files failed');
    for (const relative of modified.stdout.split('\0').filter(Boolean)) {
      const absolute = path.join(repo, relative);
      entries[absolute] = fs.existsSync(absolute) ? sha(fs.readFileSync(absolute)) : 'absent';
    }
  }
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.resolve(directory, entry.name);
      if (absolute === BASE) continue;
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) entries[absolute] = sha(fs.readFileSync(absolute));
    }
  };
  for (const folder of ['ESTOQUE-MANUAL-KG-001', 'PADARIA-GO-LIVE-FASTTRACK-002'])
    walk(WORKTREE + '/docs/ai-execution/_evidence/' + folder);
  return entries;
}
function connection(raw, role, pooled, password) {
  let u; try { u = new URL(raw); } catch { throw new Error('Invalid existing URL for ' + role); }
  check(u.protocol === 'postgresql:' || u.protocol === 'postgres:', 'Unexpected connection protocol');
  check(u.hostname === (pooled ? E.pooled : E.direct), 'IDENTITY_DIVERGENCE: URL host');
  check(u.pathname === '/' + E.database, 'IDENTITY_DIVERGENCE: URL database');
  check(decodeURIComponent(u.username) === role, 'IDENTITY_DIVERGENCE: URL role');
  check(!u.port || u.port === '5432', 'IDENTITY_DIVERGENCE: URL port');
  check(u.searchParams.get('sslmode') === 'require', 'SSL mode must match A2');
  check(decodeURIComponent(u.password) === password && !!password, 'Existing password mismatch');
  if (pooled && role === 'omni_runtime_v2') check(u.searchParams.get('pgbouncer') === 'true', 'Missing A2 pooling option');
  return { role, pooled, host: u.hostname, password };
}
function guard(role) {
  check(['omni_runtime_v2', 'omni_migrator', 'neondb_owner'].includes(role), 'Unexpected role');
  return `SELECT coalesce(current_setting('neon.project_id', true) = '${E.project}'
    AND current_setting('neon.branch_id', true) = '${E.branch}'
    AND current_setting('neon.endpoint_id', true) = '${E.endpoint}'
    AND current_database() = '${E.database}' AND current_user = '${role}'
    AND session_user = '${role}' AND current_setting('transaction_read_only') = 'on'
    AND NOT pg_is_in_recovery(), false) AS a4_identity_ok \\gset
\\if :a4_identity_ok
SELECT json_build_object('check', 'identity', 'ok', true,
  'project', current_setting('neon.project_id'), 'branch', current_setting('neon.branch_id'),
  'endpoint', current_setting('neon.endpoint_id'), 'database', current_database(),
  'current_user', current_user, 'session_user', session_user,
  'transaction_read_only', current_setting('transaction_read_only'),
  'xid_unassigned', txid_current_if_assigned() IS NULL, 'time', clock_timestamp());
\\else
SELECT json_build_object('check', 'identity', 'ok', false);
ROLLBACK;
\\quit
\\endif
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '2s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
\\conninfo
`;
}
function validateSQL(sql) {
  const plain = sql.replace(/--[^\n]*/g, '').replace(/^\\[^\n]*/gm, '').replace(/\\gset/g, '');
  for (const statement of plain.split(';').map(s => s.trim()).filter(Boolean)) {
    check(/^(SELECT\b|BEGIN\b[^;]*READ ONLY\b|ROLLBACK\b|SET LOCAL (statement_timeout|lock_timeout|idle_in_transaction_session_timeout)\b)/i.test(statement), 'SQL outside A4 read-only allowlist');
  }
  check(!/\b(nextval|setval|dblink|pg_terminate_backend|pg_cancel_backend|pg_notify|lo_export|lo_import|set_config)\s*\(/i.test(plain), 'Unexpected effectful function');
}
function runPsql(label, c, body, official = false) {
  check(!haltedForIdentity, 'Stopped after identity divergence');
  let sql;
  if (official) {
    check(body.includes('BEGIN READ ONLY;') && body.trim().endsWith('ROLLBACK;'), '06 structure changed');
    sql = body.replace('BEGIN READ ONLY;', 'BEGIN READ ONLY;\n' + guard(c.role));
  } else sql = 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n' + guard(c.role) + body + '\nROLLBACK;\n';
  sql += '\n\\echo A4_ROLLBACK_COMPLETED\n';
  validateSQL(sql);
  const childEnv = { ...process.env };
  for (const key of Object.keys(childEnv)) if (/^PG/i.test(key)) delete childEnv[key];
  Object.assign(childEnv, { PGHOST: c.host, PGPORT: '5432', PGUSER: c.role,
    PGPASSWORD: c.password, PGDATABASE: E.database, PGSSLMODE: 'require',
    PGCLIENTENCODING: 'UTF8', PGCONNECT_TIMEOUT: '20', PGAPPNAME: 'kg-a4-' + label });
  if (!c.pooled) childEnv.PGOPTIONS = '-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=2000';
  const start = new Date().toISOString();
  const r = spawnSync(PSQL, ['-X', '-w', '-q', '-A', '-t', '-P', 'pager=off',
    '-v', 'ON_ERROR_STOP=1', '-v', 'old_role=neondb_owner', '-f', '-'], {
    encoding: 'utf8', env: childEnv, input: sql, timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
  const objects = [], textLines = [];
  let jsonBuffer = [];
  for (const line of String(r.stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)) {
    // PostgreSQL json_agg(composite) can emit a JSON value over several lines.
    if (jsonBuffer.length || line.startsWith('{')) {
      jsonBuffer.push(line);
      try { objects.push(JSON.parse(jsonBuffer.join('\n'))); jsonBuffer = []; } catch { /* Continue the same JSON value. */ }
    }
    else if (line !== 'A4_ROLLBACK_COMPLETED') textLines.push(line.replace(/app=.*? n=/g, 'app=<redacted> n='));
  }
  check(jsonBuffer.length === 0, 'Incomplete structured SQL output');
  const identity = objects.find(o => o.check === 'identity');
  if (identity && !identity.ok) {
    haltedForIdentity = true;
    save(label + '-identity-failure.json', { pass: false, identity, further_connections: 'stopped' });
    throw new Error('IDENTITY_DIVERGENCE: server identity; stopped immediately');
  }
  const rollback = String(r.stdout || '').split(/\r?\n/).includes('A4_ROLLBACK_COMPLETED');
  const privateSnapshot = objects.find(o => o.check === 'private_snapshot');
  const publicObjects = objects.filter(o => o.check !== 'private_snapshot');
  const output = { pass: r.status === 0 && !!identity?.ok && rollback,
    label, role: c.role, host: c.host, pooled: c.pooled, database: E.database,
    started_at: start, finished_at: new Date().toISOString(), exit_code: r.status,
    rollback_completed: rollback, client_connection_closed: r.status !== null,
    client_ssl_confirmed: textLines.some(line => /TLSv1\.[23]/i.test(line)),
    client_connection_info: textLines.filter(line => !official || !/^(database=|papel |sessoes |objetos |colunas )/.test(line)),
    checks: publicObjects, ...(official ? { official_06: textLines } : {}),
    ...(r.stderr ? { stderr: redact(r.stderr) } : {}), ...(r.error ? { process_error: r.error.code || 'process error' } : {}) };
  phase(label, output);
  check(output.pass, label + ' failed (see sanitized evidence)');
  return { output, privateSnapshot };
}
const getCheck = (result, name) => result.output.checks.find(c => c.check === name);
function verifyCatalog(result) {
  const roles = getCheck(result, 'roles').rows;
  check(roles.length === 4, 'Missing expected role');
  for (const role of roles.filter(r => r.role !== 'neondb_owner')) {
    check(!role.superuser && !role.bypassrls && !role.createrole && !role.createdb && !role.replication, 'Unexpected privileged role attribute');
    check(role.login === (role.role !== 'omni_owner'), 'Unexpected role login flag');
    check(role.no_role_settings, 'Unexpected role settings');
  }
  const reachable = getCheck(result, 'reachable_roles').rows;
  check(reachable.every(r => r.subject === 'omni_migrator' && r.role === 'omni_owner' && r.member && r.inherited && r.can_set), 'Unexpected reachable role');
  check(reachable.length === 1, 'Expected only migrator -> owner membership');
  const member = getCheck(result, 'memberships').rows.filter(r => r.member === 'omni_migrator');
  check(member.length === 1 && member[0].role === 'omni_owner' && !member[0].admin_option && member[0].inherit_option && member[0].set_option, 'Migrator membership mismatch');
  const db = getCheck(result, 'database_privileges');
  check(db.owner === 'neondb_owner', 'Database ownership changed');
  check(db.rows.every(r => r.connect), 'Expected CONNECT missing');
  check(db.rows.filter(r => r.role !== 'neondb_owner').every(r => !r.create), 'Unexpected CREATE DATABASE privilege');
  const schema = getCheck(result, 'schema_privileges');
  check(schema.runtime_public_usage && !schema.runtime_public_create && schema.runtime_schemas_with_create === 0, 'Runtime schema privilege mismatch');
  const t = getCheck(result, 'runtime_table_grants');
  check(t.tables === 110 && ['select', 'insert', 'update', 'delete'].every(k => t[k] === t.tables), 'Runtime DML grant coverage mismatch');
  check(['missing_dml','truncate','references','trigger','maintain','grant_options','runtime_owned','rls_enabled'].every(k => t[k] === 0), 'Unexpected runtime table privileges or RLS');
  const s = getCheck(result, 'runtime_sequence_grants');
  check(s.sequences === 0 && s.missing_usage_select_update === 0, 'Sequence catalog drift');
  const m = getCheck(result, 'migrator_pre_transfer');
  check(m.owner_member && m.owner_inherited && m.owner_set && !m.stock_select && !m.stock_update && m.omni_owner_public_relations === 0, 'Migrator pre-transfer privileges mismatch');
  const columns = getCheck(result, 'stock_columns').rows;
  check(columns.length === 5 && columns.every(c => c.type === 'integer'), 'Stock columns changed');
  check(result.output.client_ssl_confirmed, 'Client SSL not confirmed by libpq conninfo');
}

async function main() {
  check(process.argv[2] === 'run', 'Only supported phase: run');
  check(!process.argv[3] || ATTEMPT, 'Attempt must be a two-digit evidence suffix');
  fs.mkdirSync(OUT, { recursive: true });
  check(!fs.existsSync(path.join(OUT, 'summary.json')) && !fs.existsSync(path.join(OUT, '00-url-preflight.json')), 'Existing A4 output; refusing to overwrite');
  check(!fs.existsSync(ROOT + '/.aep-active') && !fs.existsSync(WORKTREE + '/.aep-active'), 'AEP activation changed; stop');
  const originalLocal = localManifest();
  const secretFilesBefore = [KG_FILE, OLD_FILE].map(f => ({ file: f, bytes: fs.readFileSync(f), mtime: fs.statSync(f).mtimeMs }));
  const kg = envFile(KG_FILE), old = envFile(OLD_FILE);
  check(/^[A-Za-z0-9_-]{43}$/.test(kg.KG_RUNTIME_V2_PASSWORD || '') && /^[A-Za-z0-9_-]{43}$/.test(kg.KG_MIGRATOR_PASSWORD || ''), 'A2 password format mismatch');
  const rtDirect = connection(kg.KG_PROD_RUNTIME_V2_DIRECT_URL, 'omni_runtime_v2', false, kg.KG_RUNTIME_V2_PASSWORD);
  const rtPooled = connection(kg.KG_PROD_RUNTIME_V2_DATABASE_URL, 'omni_runtime_v2', true, kg.KG_RUNTIME_V2_PASSWORD);
  const migrator = connection(kg.KG_MIGRATOR_DIRECT_URL, 'omni_migrator', false, kg.KG_MIGRATOR_PASSWORD);
  const oldDirectPassword = decodeURIComponent(new URL(old.NEON_PROD_DIRECT_URL).password);
  const oldPoolPassword = decodeURIComponent(new URL(old.NEON_PROD_DATABASE_URL).password);
  const oldDirect = connection(old.NEON_PROD_DIRECT_URL, 'neondb_owner', false, oldDirectPassword);
  const oldPooled = connection(old.NEON_PROD_DATABASE_URL, 'neondb_owner', true, oldPoolPassword);
  check(kg.KG_RUNTIME_V2_PASSWORD !== kg.KG_MIGRATOR_PASSWORD && ![oldDirectPassword, oldPoolPassword].includes(kg.KG_RUNTIME_V2_PASSWORD)
    && ![oldDirectPassword, oldPoolPassword].includes(kg.KG_MIGRATOR_PASSWORD), 'A2 credential isolation mismatch');
  const validation = spawnSync(process.execPath, [WORKTREE + '/docs/ai-execution/_evidence/PADARIA-GO-LIVE-FASTTRACK-002/harness/a2-credenciais.cjs', 'validar'], { encoding: 'utf8', cwd: WORKTREE });
  const validationBaseline = read(WORKTREE + '/docs/ai-execution/_evidence/PADARIA-GO-LIVE-FASTTRACK-002/01-a2-validacao.txt');
  const sameA2 = validation.status === 0 && validation.stdout.replace(/\r\n/g, '\n') === validationBaseline.replace(/\r\n/g, '\n');
  save('00-a2-validation.txt', validation.stdout);
  check(sameA2, 'A2 validation differs from original evidence');
  phase('00-url-preflight', { pass: true, identity: E, credentials_from_a2: true,
    a2_validation: '30/30; identical to A2 evidence', connections: [rtDirect, rtPooled, migrator, oldDirect, oldPooled].map(c => ({ role: c.role, host: c.host, database: E.database, pooled: c.pooled, sslmode: 'require' })),
    no_authentication_yet: true, aep_active: false });

  const tokenFile = process.env.APPDATA + '/xdg.data/com.vercel.cli/auth.json';
  const tokenBytes = fs.readFileSync(tokenFile);
  const token = JSON.parse(tokenBytes.toString('utf8')).token; SECRET.push(token);
  const team = JSON.parse(read(ROOT + '/.vercel/project.json')).orgId;
  async function get(p) {
    const u = new URL('https://api.vercel.com' + p); u.searchParams.set('teamId', team);
    const r = await fetch(u, { method: 'GET', headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(25000) });
    check(r.ok, 'Vercel GET ' + u.pathname + ' HTTP ' + r.status);
    return r.json();
  }
  const a2Time = Date.parse(read(KG_FILE).match(/gerado offline em ([^\s]+)/)?.[1] || '');
  check(Number.isFinite(a2Time), 'Missing A2 creation timestamp');
  async function vercelSnapshot() {
    const project = await get('/v9/projects/omni-gestao-pro');
    check(project.id === VERCEL_ID, 'Vercel project identity mismatch');
    const envs = (await get('/v10/projects/' + VERCEL_ID + '/env?decrypt=false')).envs;
    check(Array.isArray(envs), 'Missing Vercel environment inventory');
    const metadata = envs.map(e => ({ id: e.id, key: e.key, type: e.type,
      target: [...(e.target || [])].sort(), gitBranch: e.gitBranch || null,
      customEnvironmentIds: [...(e.customEnvironmentIds || [])].sort(), createdAt: e.createdAt, updatedAt: e.updatedAt }))
      .sort((a,b) => a.id.localeCompare(b.id));
    const prodDb = metadata.filter(e => ['DATABASE_URL', 'DIRECT_URL'].includes(e.key) && e.target.includes('production'));
    check(prodDb.length === 2 && new Set(prodDb.map(e => e.key)).size === 2, 'Unexpected Production database env inventory');
    check(prodDb.every(e => !e.gitBranch && e.updatedAt < a2Time), 'Production database env changed after A2 creation');
    let deployId = project.targets?.production?.id;
    if (!deployId) {
      const deployments = (await get('/v6/deployments?projectId=' + VERCEL_ID + '&target=production&state=READY&limit=1')).deployments;
      deployId = deployments?.[0]?.uid;
    }
    check(typeof deployId === 'string', 'Cannot identify Production deployment');
    const d = await get('/v13/deployments/' + deployId);
    check(d.projectId === VERCEL_ID && d.target === 'production' && d.readyState === 'READY', 'Unexpected Production deployment identity/state');
    const classifications = [];
    for (const e of envs.filter(e => ['DATABASE_URL', 'DIRECT_URL'].includes(e.key) && (e.target || []).includes('production'))) {
      let c = { key: e.key, readable: false };
      if (typeof e.value === 'string' && /^postgres(?:ql)?:\/\//.test(e.value)) {
        SECRET.push(e.value); const u = new URL(e.value); SECRET.push(u.password, decodeURIComponent(u.password));
        c = { key: e.key, readable: true, role: decodeURIComponent(u.username), database: u.pathname.slice(1), host: u.hostname };
        check(c.role === 'neondb_owner' && c.database === E.database && [E.direct, E.pooled].includes(c.host), 'Production env target differs from old runtime');
      }
      classifications.push(c);
    }
    return { pass: true, read_at: new Date().toISOString(), methods: ['GET'], project: project.name,
      production_database_envs: prodDb,
      production_deployment: { id: d.id, target: d.target, state: d.readyState, created_at: new Date(d.createdAt).toISOString(), git_sha: d.meta?.githubCommitSha || null },
      classification: classifications, production_old_runtime_basis: 'A3/owner baseline + unchanged database env metadata predating creation of A2 credentials; deployment also compared before/after A4',
      production_database_envs_predate_a2: true, production_deployment_predates_a2: d.createdAt < a2Time,
      metadata };
  }
  const readVercel = () => vercelSnapshot().catch(error => ({ pass: false, verification: 'UNVERIFIED_API', error: redact(error.message), methods: ['GET'], credentials_changed: false }));
  const vercelBefore = await readVercel(); phase('01-vercel-before', vercelBefore);
  const catalog = read(path.join(__dirname, 'catalog.sql'));
  const ownerSQL = read(path.join(__dirname, 'owner-snapshot.sql'));
  const pre = runPsql('02-owner-preflight', oldDirect, catalog + '\n' + ownerSQL); verifyCatalog(pre);
  check(getCheck(pre, 'migration_state').kg_records === 0, 'KG migration is already present');
  const runtimeDirect = runPsql('03-runtime-direct', rtDirect, catalog + '\nSELECT json_build_object(\'check\', \'minimal_read\', \'ok\', (SELECT true FROM public.estoque_produtos LIMIT 1));');
  verifyCatalog(runtimeDirect); check(getCheck(runtimeDirect, 'minimal_read')?.ok, 'Runtime minimal read did not return');
  const runtimePooled = runPsql('04-runtime-pooled', rtPooled, catalog + '\nSELECT json_build_object(\'check\', \'minimal_read\', \'ok\', (SELECT true FROM public.estoque_produtos LIMIT 1));');
  verifyCatalog(runtimePooled); check(getCheck(runtimePooled, 'minimal_read')?.ok, 'Pooled runtime minimal read did not return');
  const migratorResult = runPsql('05-migrator-direct', migrator, catalog); verifyCatalog(migratorResult);
  const oldResult = runPsql('06-old-runtime-pooled', oldPooled, catalog + '\nSELECT json_build_object(\'check\', \'minimal_read\', \'ok\', (SELECT true FROM public.estoque_produtos LIMIT 1));');
  verifyCatalog(oldResult); check(getCheck(oldResult, 'minimal_read')?.ok, 'Old runtime read failed');
  const officialSQL = read(WORKTREE + '/docs/padaria/pesagem/rollout/06-verificacao.sql');
  const officialResult = runPsql('07-official-06', oldDirect, officialSQL, true);
  const post = runPsql('08-owner-final', oldDirect, catalog + '\n' + ownerSQL); verifyCatalog(post);
  const vercelAfter = await readVercel(); phase('09-vercel-after', vercelAfter);
  const comparison = { pass: true, stock_balances_and_rows_unchanged: true, sales_rows_unchanged: true,
    cash_session_rows_unchanged: true, migration_history_unchanged: true,
    production_schema_roles_acl_unchanged: pre.privateSnapshot.schema === post.privateSnapshot.schema,
    vercel_all_environment_metadata_unchanged: vercelBefore.pass && vercelAfter.pass ? JSON.stringify(vercelBefore.metadata) === JSON.stringify(vercelAfter.metadata) : 'UNVERIFIED_API',
    vercel_production_deployment_unchanged: vercelBefore.pass && vercelAfter.pass ? JSON.stringify(vercelBefore.production_deployment) === JSON.stringify(vercelAfter.production_deployment) : 'UNVERIFIED_API',
    a2_and_legacy_secret_files_unchanged: secretFilesBefore.every(s => fs.readFileSync(s.file).equals(s.bytes) && fs.statSync(s.file).mtimeMs === s.mtime),
    vercel_token_file_unchanged: fs.readFileSync(tokenFile).equals(tokenBytes),
    existing_wips_and_evidence_unchanged: JSON.stringify(originalLocal) === JSON.stringify(localManifest()),
    compared_data_tables: Object.keys(pre.privateSnapshot.data), private_digests_persisted: false };
  const unequal = Object.keys(pre.privateSnapshot.data).filter(k => pre.privateSnapshot.data[k] !== post.privateSnapshot.data[k]);
  comparison.stock_balances_and_rows_unchanged = !unequal.some(k => ['estoque_produtos', 'produto_depositos', 'movimentacoes_estoque'].includes(k));
  comparison.sales_rows_unchanged = !unequal.includes('vendas');
  comparison.cash_session_rows_unchanged = !unequal.includes('sessoes_caixa');
  comparison.migration_history_unchanged = !unequal.includes('_prisma_migrations');
  comparison.pass = Object.entries(comparison).filter(([k]) => k.endsWith('_unchanged') && !k.startsWith('vercel_')).every(([,v]) => v === true);
  phase('10-final-comparison', comparison);
  check(comparison.pass, 'Before/after comparison differs; no changes attempted; diagnose read-only');
  const allTransactions = [pre, runtimeDirect, runtimePooled, migratorResult, oldResult, officialResult, post];
  check(allTransactions.every(r => r.output.rollback_completed && r.output.client_connection_closed && getCheck(r, 'identity').transaction_read_only === 'on' && getCheck(r, 'identity').xid_unassigned), 'Read-only transaction evidence missing');
  summary.result = { A4: 'PASS', PRODUCTION_IDENTITY: 'PASS', RUNTIME_DIRECT_LOGIN: 'PASS',
    RUNTIME_POOLER_LOGIN: 'PASS', MIGRATOR_DIRECT_LOGIN: 'PASS', RUNTIME_DML_GRANTS: 'PASS',
    RUNTIME_PRIVILEGE_ISOLATION: 'PASS', MIGRATOR_MEMBERSHIP: 'PASS', OLD_RUNTIME_PRESERVED: 'YES',
    READ_ONLY_TRANSACTIONS: 'PASS', STOCK_COLUMNS: 'INTEGER', COMMERCIAL_DATA_WRITES: 0,
    PRODUCTION_SCHEMA_CHANGES: 0, VERCEL_CHANGES: 0, MERGE: 'NO', DEPLOY: 'NO',
    NEXT_GATE: 'Próxima preparação do rollout, mediante autorização separada.' };
  if (!vercelBefore.pass || !vercelAfter.pass) {
    summary.result.A4 = 'FAIL';
    summary.result.A4_DATABASE_CHECKS = 'PASS';
    summary.result.VERCEL_CONFIG_VERIFICATION = 'UNVERIFIED_API; browser supplement required';
    process.exitCode = 1;
  } else check(comparison.vercel_all_environment_metadata_unchanged && comparison.vercel_production_deployment_unchanged, 'Vercel metadata/deployment changed');
  summary.finished_at = new Date().toISOString();
  save('summary.json', summary);
  console.log(JSON.stringify(summary.result, null, 2));
}
main().catch(error => {
  const message = redact((error.message || 'A4 failure') + (error.cause?.code ? ' [' + error.cause.code + ']' : ''));
  summary.failures.push(message); summary.finished_at = new Date().toISOString();
  summary.result = { A4: 'FAIL', failure: message, identity_divergence: haltedForIdentity,
    COMMERCIAL_DATA_WRITES: 0, PRODUCTION_SCHEMA_CHANGES: 0, VERCEL_CHANGES: 0, MERGE: 'NO', DEPLOY: 'NO' };
  try { if (!fs.existsSync(path.join(OUT, 'summary.json'))) save('summary.json', summary); } catch { /* Preserve existing evidence. */ }
  console.error(message); process.exitCode = 1;
});
