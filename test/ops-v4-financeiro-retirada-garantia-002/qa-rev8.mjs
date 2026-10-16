// Runner de evidências R8: QA local verificado, logs separados e servidor próprio.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
const root = path.resolve(import.meta.dirname, '../..');
const require = createRequire(path.join(root, 'package.json'));
const mode = process.argv[2], args = process.argv.slice(3);
const frozen = args.includes('--frozen'), base = args.includes('--base');
const cwd = mode === 'red' ? 'C:/Projetos/omni-gestao-ops-v4-frg-002-rev8-red' : base ? 'C:/Projetos/omni-gestao-ops-v4-frg-002-base' : root;
const option = key => args.find(v => v.startsWith(key + '='))?.slice(key.length + 1);
const groups = {
  frg: { db: 'ops_v4_frg_qa_002', bootstrap: 'test/ops-v4-financeiro-retirada-garantia-001/qa-bootstrap.mjs', specs: ['e2e/specs/ops-v4-financeiro-retirada-garantia-002.spec.ts'] },
  frg001: { db: 'ops_v4_frg_qa_002', bootstrap: 'test/ops-v4-financeiro-retirada-garantia-001/qa-bootstrap.mjs', specs: ['e2e/specs/ops-v4-financeiro-retirada-garantia-001.spec.ts'] },
  fluxo006: { db: 'ops_v4_fluxo_006_qa_frg', bootstrap: 'test/ops-v4-fluxo-curto-006/qa-bootstrap.mjs', specs: ['e2e/specs/operacoes-v4-fluxo-curto-006.spec.ts'] },
  fluxo007: { db: 'ops_v4_fluxo_007_qa_frg' },
  misto: { db: 'ops_v3_misto_qa_frg', bootstrap: 'test/ops-v3-recebimento-misto/qa-bootstrap.mjs', specs: ['e2e/specs/ops-v4-recebimento-misto-paridade-001.spec.ts', 'e2e/specs/ops-v3-recebimento-misto-001.spec.ts', 'e2e/specs/ops-recebimento-misto-p1-hardening-001.spec.ts'] },
  datas: { db: 'ops_datas_qa_frg', bootstrap: 'test/ops-datas-retroativas-001/qa-bootstrap.mjs', specs: ['e2e/specs/ops-datas-retroativas-001.spec.ts'] },
};
const entry = groups[option('--group') ?? 'frg']; assert(entry, 'Grupo QA desconhecido');
const local = require('dotenv').parse(fs.readFileSync(path.join(root, '.env')));
const url = new URL(local.DATABASE_URL);
assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '45708'); assert.equal(url.pathname, '/ops_v4_frg_qa_002'); assert.equal(local.DATABASE_URL, local.DIRECT_URL); assert(local.PLAYWRIGHT_E2E_EMAIL?.endsWith('.test'));
url.pathname = '/' + entry.db;
const env = { ...process.env, ...local, DATABASE_URL: url.href, DIRECT_URL: url.href, OPS_V4_FRG_TEST_DATABASE_URL: url.href, OPS_V4_FLUXO_CURTO_TEST_DATABASE_URL: url.href, OPS_V3_MISTO_TEST_DATABASE_URL: url.href, OPS_DATAS_TEST_DATABASE_URL: url.href, VERCEL_ENV: 'development', NODE_OPTIONS: '--max-old-space-size=6144', NEXTAUTH_URL: 'http://127.0.0.1:3071', AUTH_URL: 'http://127.0.0.1:3071', PLAYWRIGHT_BASE_URL: 'http://127.0.0.1:3071', PLAYWRIGHT_E2E_SKIP_WEBSERVER: '1' };
const dir = path.join(root, 'docs/execution-tracks/ops-v4-financeiro-retirada-garantia', frozen ? 'review-rev8' : '_closed/reports/rev8'); fs.mkdirSync(dir, { recursive: true });
function git(a) { const r = spawnSync('git', a, { cwd, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); }
const sha = git(['rev-parse', 'HEAD']);
if (mode === 'red') { assert.equal(sha, 'cd69780c81b3bc159cd5f0810daabc98aae06a34'); assert.equal(git(['diff', '--', 'lib', 'components']), ''); }
// Processo separado: liberar a DLL Prisma antes de prisma generate no build Windows.
const probeSource = `const {PrismaClient}=require(process.argv[1]);const p=new PrismaClient({datasourceUrl:process.env.DATABASE_URL});(async()=>{try{const [t]=await p.$queryRawUnsafe('SELECT current_database() AS db, inet_server_addr()::text AS host, inet_server_port() AS port');console.log(JSON.stringify(t));}finally{await p.$disconnect()}})().catch(e=>{console.error(e.message);process.exitCode=1});`;
const probeResult = spawnSync(process.execPath, ['-e', probeSource, path.join(root, 'generated/prisma')], { cwd, env, encoding: 'utf8', windowsHide: true });
assert.equal(probeResult.status, 0, probeResult.stderr);
const target = JSON.parse(probeResult.stdout.trim());
assert.equal(target.db, entry.db); assert.equal(target.host, '127.0.0.1/32'); assert.equal(target.port, 45708);
console.log('QA confirmado: ' + JSON.stringify(target) + ' SHA=' + sha);
const sourceHashes = {};
for (const p of ['lib/operacoes-v3/elegibilidade-comercial.ts', 'lib/operacoes-v3/pdv-servico-actions.ts', 'components/operacoes-v3/hooks/use-pdv-servico-v3.ts', 'components/operacoes-v3/pages/PdvServicoV3.tsx', 'components/operacoes-v4-preview/parts/ReceberPagamentoV4.tsx']) sourceHashes[p] = fs.existsSync(path.join(cwd, p)) ? crypto.createHash('sha256').update(fs.readFileSync(path.join(cwd, p))).digest('hex') : null;
const vitest = path.join(root, 'node_modules/vitest/vitest.mjs'), config = 'test/ops-v4-financeiro-retirada-garantia-002/vitest.config.ts';
let command, name, shell = false;
const serverMode = ['e2e', 'ratified', 'check', 'close'].includes(mode);
let active;
if (['ratified', 'check', 'close'].includes(mode)) { active = JSON.parse(fs.readFileSync(path.join(root, '.aep-active'))); assert.equal(active.track, 'ops-v4-financeiro-retirada-garantia'); assert.equal(base, false); }
if (mode === 'red') { command = [vitest, 'run', '--config', config, 'test/ops-v4-financeiro-retirada-garantia-002/recebimento-elegivel.pg.test.ts', 'test/ops-v4-financeiro-retirada-garantia-002/motivo-recusa.test.tsx', '-t', 'R8']; name = 'red-R8-cd69780'; }
else if (mode === 'focused') { command = [vitest, 'run', '--config', config, '-t', 'R8']; name = 'focused-R8'; }
else if (mode === 'dedicated') { command = [vitest, 'run', '--config', config]; name = 'dedicated'; }
else if (mode === 'build') { command = ['scripts/vercel-build.mjs']; name = 'build'; }
else if (mode === 'run') { const sep = args.indexOf('--'); assert(sep >= 0); command = args.slice(sep + 1); name = args[0]; }
else if (mode === 'e2e') { assert(entry.specs); command = [path.join(root, 'node_modules/@playwright/test/cli.js'), 'test', ...entry.specs, '--retries=0', '--workers=1', ...(option('--grep') ? ['--grep', option('--grep')] : [])]; name = 'e2e-' + (option('--group') ?? 'frg'); }
else if (mode === 'ratified') { command = active.test_command; shell = true; name = 'ratified'; }
else if (mode === 'check' || mode === 'close') { command = ['scripts/track.mjs', mode, active.track]; name = 'aep-' + mode + '-attempt' + active.attempt; }
else throw Error('Modo QA desconhecido');
name = option('--name') ?? ((base ? 'base-' : 'candidate-') + name); assert(/^[a-z0-9-]+$/i.test(name));
if (fs.existsSync(path.join(dir, name + '.json'))) name += '-' + Date.now();
async function run(cmd, suffix, shellMode = false) {
  const started = new Date().toISOString();
  const child = shellMode ? spawn(cmd, { cwd, env, shell: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }) : spawn(process.execPath, cmd, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', c => { stdout += c; process.stdout.write(c); }); child.stderr.on('data', c => { stderr += c; process.stderr.write(c); });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  const prefix = path.join(dir, name + suffix);
  fs.writeFileSync(prefix + '.stdout.log', stdout); fs.writeFileSync(prefix + '.stderr.log', stderr);
  fs.writeFileSync(prefix + '.json', JSON.stringify({ sha, cwd, executable: shellMode ? process.env.ComSpec : process.execPath, command: cmd, shell: shellMode, start: started, end: new Date().toISOString(), exitCode: code, target, sourceHashes, expectedRed: mode === 'red', attempt: active?.attempt, test_command: active?.test_command }, null, 2) + '\n');
  return code ?? 1;
}
let server;
if (serverMode) {
  const probe = net.createServer(); await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(3071, '127.0.0.1', resolve); }); await new Promise(resolve => probe.close(resolve));
  assert(entry.bootstrap); const boot = await run([entry.bootstrap], '-bootstrap'); if (boot !== 0) process.exit(boot);
  server = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'start', '-p', '3071', '-H', '127.0.0.1'], { cwd, env: { ...env, NODE_ENV: 'production' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '', readyResolve, readyReject;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  server.stdout.on('data', c => { out += c; if (out.includes('Ready in')) readyResolve(); }); server.stderr.on('data', c => { err += c; });
  server.once('error', readyReject); server.once('exit', code => readyReject(Error('Servidor QA encerrou: ' + code)));
  try { await ready; console.log('Servidor próprio pronto PID=' + server.pid); process.exitCode = await run(command, '', shell); }
  finally { server.kill(); fs.writeFileSync(path.join(dir, name + '-server.stdout.log'), out); fs.writeFileSync(path.join(dir, name + '-server.stderr.log'), err); }
} else process.exitCode = await run(command, '', shell);
if (mode !== 'close') assert.equal(git(['rev-parse', 'HEAD']), sha, 'SHA mudou durante a prova');
