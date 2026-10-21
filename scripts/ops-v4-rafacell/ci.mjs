import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import { focused, lint } from './contracts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const evidence = path.join(root, 'import/ops-v4-rafacell-ci');
const disabled = 'postgresql://disabled:disabled@127.0.0.1:1/rafacell_ci_disabled?connect_timeout=1';

export function assertDisposableDatabase(env) {
  const raw = env.OPS_V4_PREPUBLISH_TEST_DATABASE_URL;
  if (env.OPS_V4_RAFACELL_DISPOSABLE !== '1' || !raw || raw !== env.DATABASE_URL || raw !== env.DIRECT_URL) {
    throw new Error('RAFACELL_CI_REQUIRES_THREE_IDENTICAL_DISPOSABLE_URLS');
  }
  const url = new URL(raw);
  if (!['postgresql:', 'postgres:'].includes(url.protocol) || url.hostname !== '127.0.0.1' ||
      !/^\/ops_v4_prepub003_[a-f0-9]{10}$/.test(url.pathname) || url.username !== 'rafacell_ci' ||
      !url.password || !/^\d+$/.test(url.port) || Number(url.port) < 1024 || url.hash ||
      [...url.searchParams].some(([key, value]) => key !== 'schema' || value !== 'public')) {
    throw new Error('RAFACELL_CI_REFUSES_NONEXCLUSIVE_DATABASE');
  }
  return raw;
}

function isolatedEnv(database = disabled) {
  const env = {};
  // Never inherit provider keys, Vercel authority, database credentials or .env values.
  for (const [key, value] of Object.entries(process.env)) {
    if (/^(PATH|PATHEXT|SystemRoot|WINDIR|COMSPEC|SYSTEMDRIVE|APPDATA|LOCALAPPDATA|USERPROFILE|HOME|TEMP|TMP|TMPDIR|LANG|LC_ALL|CI|GITHUB_ACTIONS)$/i.test(key)) env[key] = value;
  }
  return { ...env, DATABASE_URL: database, DIRECT_URL: database,
    OPS_V4_PREPUBLISH_TEST_DATABASE_URL: database, OPS_V4_FLUXO_CURTO_TEST_DATABASE_URL: database,
    OPS_V4_RAFACELL_DISPOSABLE: database === disabled ? '0' : '1',
    AUTH_SECRET: 'rafacell-ci-synthetic-no-production-authority',
    NEXTAUTH_SECRET: 'rafacell-ci-synthetic-no-production-authority', AUTH_TRUST_HOST: 'true',
    NEXTAUTH_URL: 'http://127.0.0.1:3000', AUTH_URL: 'http://127.0.0.1:3000',
    VERCEL: '0', VERCEL_ENV: 'development', MIGRATION_AUTHORITY_ENABLED: 'false',
    NEXT_TELEMETRY_DISABLED: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1', CHECKPOINT_DISABLE: '1',
    RAYON_NUM_THREADS: '1', UV_THREADPOOL_SIZE: '2',
    NODE_OPTIONS: `--max-old-space-size=4096 --require="${path.join(root, 'scripts/ops-v4-rafacell/block-network.cjs').replaceAll('\\', '/')}"`,
  };
}

function assertNoEnvFiles(cwd) {
  const privateFiles = fs.readdirSync(cwd).filter(p => /^\.env(?:\..*)?$/.test(p) && p !== '.env.example');
  if (privateFiles.length) throw new Error('RAFACELL_CI_REFUSES_ENV_FILES');
}

function save(name, data) { fs.writeFileSync(path.join(evidence, `${name}.json`), JSON.stringify(data, null, 2) + '\n'); }
function summary(line) {
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, line + '\n');
}
function run(label, args, { cwd = root, env = isolatedEnv() } = {}) {
  assertNoEnvFiles(cwd);
  const tempRoot = path.join(root, 'import/ops-v4-rafacell-ci-temp');
  fs.mkdirSync(tempRoot, { recursive: true });
  const temp = fs.mkdtempSync(path.join(tempRoot, `${label}-`));
  // SDKs must not discover real credentials in the local user's home/profile.
  env = { ...env, HOME: temp, USERPROFILE: temp, TEMP: temp, TMP: temp, TMPDIR: temp };
  const log = fs.openSync(path.join(evidence, `${label}.log`), 'w');
  const startedAt = new Date().toISOString();
  console.log(`${label}: started`);
  let result;
  try { result = spawnSync(process.execPath, args, { cwd, env, stdio: ['ignore', log, log], windowsHide: true, timeout: 20 * 60_000 }); }
  finally { fs.closeSync(log); }
  const exit = result.error ? 1 : result.status ?? 1;
  save(`${label}-process`, { startedAt, endedAt: new Date().toISOString(), exit, signal: result.signal, error: result.error?.code });
  if (exit) console.error(fs.readFileSync(path.join(evidence, `${label}.log`), 'utf8').slice(-5000));
  return exit;
}
function vitest(label, args, options = {}) {
  const report = path.join(evidence, `${label}.json`);
  fs.rmSync(report, { force: true });
  const exit = run(label, [path.join(root, 'node_modules/vitest/vitest.mjs'), 'run', ...args,
    '--maxWorkers=1', '--testTimeout=30000', '--hookTimeout=30000', '--reporter=default', '--reporter=json', `--outputFile=${report}`], options);
  if (!fs.existsSync(report)) throw new Error(`${label}: MISSING_TEST_REPORT`);
  const data = JSON.parse(fs.readFileSync(report, 'utf8'));
  summary(`${label}: ${data.numPassedTests}/${data.numTotalTests}; failures=${data.numFailedTests}; exit=${exit}`);
  return { exit, data };
}

export function failures(report, cwd) {
  return report.testResults.flatMap(file => file.assertionResults.filter(a => a.status === 'failed').map(a => ({
    file: path.relative(cwd, file.name).replaceAll('\\', '/'), name: a.fullName,
  })));
}
export function compareFailures(base, head) {
  const key = item => `${item.file}::${item.name}`;
  const baseKeys = new Set(base.map(key)), headKeys = new Set(head.map(key));
  return { historical: head.filter(item => baseKeys.has(key(item))),
    newFailures: head.filter(item => !baseKeys.has(key(item))),
    resolved: base.filter(item => !headKeys.has(key(item))) };
}

export function inspectCoverage(base, head) {
  const key = item => `${item.file}::${item.name}`;
  const passed = new Set(head.filter(a => a.status === 'passed').map(key));
  const failed = new Set(head.filter(a => a.status === 'failed').map(key));
  const covered = new Set(head.filter(a => a.status === 'passed' || a.status === 'failed').map(key));
  return {
    resolved: base.filter(a => a.status === 'failed' && passed.has(key(a)) && !failed.has(key(a))).map(({ file, name }) => ({ file, name })),
    removedOrSkipped: base.filter(a => (a.status === 'passed' || a.status === 'failed') && !covered.has(key(a))),
  };
}

export function resolveComparisonBase(value, revParse) {
  const sha = value === 'origin/main' ? revParse('refs/remotes/origin/main') : value;
  if (!/^[a-f0-9]{40}$/.test(sha ?? '')) throw new Error('RAFACELL_CI_REQUIRES_EXPLICIT_BASE_SHA');
  return sha;
}

async function materializeSchema() {
  const database = assertDisposableDatabase(process.env);
  const env = isolatedEnv(database);
  assertNoEnvFiles(root);
  // Refuse an existing schema BEFORE DDL. This is the fresh CI service, never migrate deploy/seed/reset.
  const { PrismaClient } = await import('../../generated/prisma/index.js');
  const db = new PrismaClient({ datasourceUrl: database });
  try {
    const [{ count }] = await db.$queryRaw`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'`;
    if (count !== 0) throw new Error('RAFACELL_CI_DATABASE_MUST_BE_EMPTY_BEFORE_DDL');
  } finally { await db.$disconnect(); }
  if (run('schema-disposable', ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], { env })) return 1;
  save('postgres-isolation', { loopback: true, freshDatabase: true, schemaChanged: false, migrations: false, seeds: false, realTransport: false });
  return 0;
}

async function assertDatabaseReady(database) {
  const { PrismaClient } = await import('../../generated/prisma/index.js');
  const db = new PrismaClient({ datasourceUrl: database });
  try {
    const [state] = await db.$queryRaw`SELECT current_database() AS name,
      EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ordens_servico') AS ready`;
    if (state.name !== new URL(database).pathname.slice(1) || !state.ready) throw new Error('RAFACELL_CI_SCHEMA_NOT_READY');
  } finally { await db.$disconnect(); }
}

async function postgres() {
  const database = assertDisposableDatabase(process.env);
  await assertDatabaseReady(database);
  return vitest('postgres', ['--config', 'test/ops-v4-rafacell-prepublish-003/vitest.config.ts'], { env: isolatedEnv(database) }).exit;
}

async function regression(baseSha) {
  const database = assertDisposableDatabase(process.env);
  await assertDatabaseReady(database);
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  baseSha = resolveComparisonBase(baseSha, ref => git('rev-parse', ref).trim());
  summary(`Base da comparação: ${baseSha}; HEAD: ${git('rev-parse', 'HEAD').trim()}.`);
  // Reuse dependencies only when both contracts are identical; otherwise fail visibly.
  for (const file of ['prisma/schema.prisma', 'package-lock.json', 'package.json']) {
    if (git('show', `${baseSha}:${file}`).replaceAll('\r\n', '\n') !== fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n')) {
      throw new Error(`RAFACELL_CI_BASELINE_REQUIRES_SEPARATE_DEPENDENCIES: ${file}`);
    }
  }
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rafacell-ci-base-'));
  const archive = path.join(baseDir, 'base.tar');
  execFileSync('git', ['archive', '--format=tar', `--output=${archive}`, baseSha], { cwd: root, windowsHide: true });
  execFileSync('tar', ['-xf', archive, '-C', baseDir], { windowsHide: true });
  fs.unlinkSync(archive);
  for (const dir of ['node_modules', 'generated']) fs.symlinkSync(path.join(root, dir), path.join(baseDir, dir), process.platform === 'win32' ? 'junction' : 'dir');
  const env = isolatedEnv(process.env.DATABASE_URL);
  const args = ['lib/operacoes-v3', 'lib/operacoes-v4', 'components/operacoes-v4-preview'];
  const baseline = vitest('regression-base', args, { cwd: baseDir, env });
  const head = vitest('regression-head', args, { env });
  const baseFailures = failures(baseline.data, baseDir), headFailures = failures(head.data, root);
  const key = item => `${item.file}::${item.name}`;
  const assertions = (report, cwd) => report.testResults.flatMap(f => f.assertionResults.map(a => ({ file: path.relative(cwd, f.name).replaceAll('\\', '/'), name: a.fullName, status: a.status })));
  const baseAssertions = assertions(baseline.data, baseDir), headAssertions = assertions(head.data, root);
  const coverage = inspectCoverage(baseAssertions, headAssertions);
  const delta = compareFailures(baseFailures, headFailures);
  const known = new Set(JSON.parse(fs.readFileSync(path.join(root, 'scripts/ops-v4-rafacell/historical-failures.json'), 'utf8')).failures.map(key));
  const historicalCoverage = inspectCoverage(baseAssertions.filter(a => known.has(key(a))), headAssertions);
  const failedSuites = (report, cwd) => report.testResults.filter(f => f.status === 'failed' && !f.assertionResults.some(a => a.status === 'failed')).map(f => path.relative(cwd, f.name));
  const comparison = { baseSha, headSha: git('rev-parse', 'HEAD').trim(),
    baseline: { exit: baseline.exit, total: baseline.data.numTotalTests, failed: baseline.data.numFailedTests, failedSuites: failedSuites(baseline.data, baseDir) },
    head: { exit: head.exit, total: head.data.numTotalTests, failed: head.data.numFailedTests, failedSuites: failedSuites(head.data, root) },
    historical: delta.historical.filter(item => known.has(key(item))),
    unexpectedBaseFailures: baseFailures.filter(item => !known.has(key(item))),
    newFailures: delta.newFailures,
    ...coverage,
    removedOrSkippedHistorical: historicalCoverage.removedOrSkipped,
    lostTestCount: head.data.numTotalTests < baseline.data.numTotalTests,
    increasedSkips: head.data.numPendingTests > baseline.data.numPendingTests,
  };
  save('regression-comparison', comparison);
  summary(`Regressão: históricas conhecidas=${comparison.historical.length}; novas=${comparison.newFailures.length}; base inesperada=${comparison.unexpectedBaseFailures.length}; resolvidas com PASS=${comparison.resolved.length}; históricas removidas/puladas=${comparison.removedOrSkippedHistorical.length}.`);
  summary(`Assertivas antigas substituídas/renomeadas: ${comparison.removedOrSkipped.length - comparison.removedOrSkippedHistorical.length}; identidades completas preservadas no relatório para revisão.`);
  for (const item of comparison.newFailures) summary(`REGRESSÃO NOVA: ${item.file} — ${item.name}`);
  for (const item of comparison.historical) summary(`FALHA HISTÓRICA (continua falhando): ${item.file} — ${item.name}`);
  for (const item of comparison.unexpectedBaseFailures) summary(`FALHA INESPERADA NA BASE (não é uma das 16 históricas): ${item.file} — ${item.name}`);
  // Historical failures remain a real red check. Never skip, xfail, continue-on-error or accept exit 1 as green.
  return head.exit || comparison.newFailures.length || comparison.unexpectedBaseFailures.length ||
    comparison.baseline.failedSuites.length || comparison.head.failedSuites.length || comparison.removedOrSkippedHistorical.length ||
    comparison.lostTestCount || comparison.increasedSkips || (baseline.exit && !baseFailures.length) ? 1 : 0;
}

export async function main(mode, arg) {
  fs.mkdirSync(evidence, { recursive: true });
  assertNoEnvFiles(root);
  if (mode === 'focused') return vitest('focused', focused).exit;
  if (mode === 'ui') {
    const a = vitest('ui-envio', ['--config', 'test/ops-v4-orcamento-envio-real-status-001/vitest.config.ts']);
    const b = vitest('ui-rafacell', ['--config', 'test/ops-v4-rafacell-precificacao-001/vitest.config.ts']);
    return a.exit || b.exit;
  }
  if (mode === 'lint') {
    const sources = run('lint', ['node_modules/eslint/bin/eslint.js', ...lint]);
    const runner = run('lint-runner', ['node_modules/eslint/bin/eslint.js', '--no-config-lookup', '--no-ignore', '--config', 'scripts/ops-v4-rafacell/eslint.config.mjs', 'scripts/ops-v4-rafacell/']);
    return sources || runner;
  }
  if (mode === 'typecheck') return run('typecheck', ['node_modules/typescript/lib/tsc.js', '--noEmit', '--incremental', 'false']);
  if (mode === 'build') {
    const exit = run('build', ['scripts/vercel-build.mjs'], { env: { ...isolatedEnv(), OPS_V4_RAFACELL_PUBLIC_FONTS: '1' } });
    const log = fs.readFileSync(path.join(evidence, 'build.log'), 'utf8');
    if (!log.includes('MIGRATION_SKIPPED') || /MIGRATION_(RUN|SUCCEEDED)/.test(log)) throw new Error('RAFACELL_CI_BUILD_MIGRATION_GUARD_FAILED');
    return exit;
  }
  if (mode === 'schema') return materializeSchema();
  if (mode === 'postgres') return postgres();
  if (mode === 'regression') return regression(arg);
  throw new Error('RAFACELL_CI_UNKNOWN_MODE');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv[2], process.argv[3]).then(code => { process.exitCode = code; }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
