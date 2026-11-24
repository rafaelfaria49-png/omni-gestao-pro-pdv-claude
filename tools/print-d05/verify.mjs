/** Reuse the approved regression. Local Windows installation/cross-user changes are excluded; CI D04 owns those. */
import { steps as regression } from '../print-d03/verify.mjs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { root } from './readiness.mjs'

const runId = new Date().toISOString().replaceAll(/[:.]/g, '-')
const out = path.join(root, 'docs/print-004c-e2e/evidence/d05', runId)
const steps = [
  ['d05-tests', ['--test', 'tools/print-d05/readiness.test.mjs', 'tools/print-d05/isolation.test.mjs']],
  ['d05-plan', ['tools/print-d05/readiness.mjs', 'check']],
  ...regression.map(([name, args, env]) => [name, args, name === 'two-agents-pg' ? { ...env, PRINT_EVIDENCE_FILE: path.join(out, 'two-agents.jsonl') } : env]),
  ['recovery', ['node_modules/vitest/vitest.mjs', 'run', 'tools/print-d04/recovery.test.ts', 'tools/print-d04/verify-artifact.test.ts', '--maxWorkers=1']],
  ['package', ['tools/print-d04/package.mjs', 'tools/print-d05/.artifacts']],
  ['package-integrity', ['tools/print-d05/readiness.mjs', 'package', 'tools/print-d05/.artifacts/omni-print-agent-0.2.0-d04.zip', 'tools/print-d05/.artifacts/omni-print-agent']],
  ['d05-eslint', ['node_modules/eslint/bin/eslint.js', 'tools/print-d05', 'tools/print-004c-e2e/manifest.mjs', 'tools/print-004c-e2e/matrix-80.mjs', '--ignore-pattern', 'tools/print-d05/.artifacts/**']],
  ...(process.platform === 'win32' ? [['powershell-parse', { command: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', 'tools/print-d04/parse-powershell.ps1'] }]] : []),
]
const selected = process.argv.slice(2)
if (selected.some(s => !steps.some(([name]) => name === s))) throw new Error('UNKNOWN_VERIFICATION_STEP')
mkdirSync(out, { recursive: true })
const git = args => spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).stdout.trim()
const summary = { goal: 'OMNI-PRINT-D05-HOMOLOGACAO-FISICA-END-TO-END-001', runId, at: new Date().toISOString(),
  sourceCommit: git(['rev-parse', 'HEAD']), workingTreeChanged: git(['status', '--porcelain']).length > 0, node: process.version,
  platform: process.platform, productionAccess: false, productionWrites: 0, windowsPhysicalInstallation: false, physicalHomologation: 'PENDING', steps: [] }
for (const [name, spec, extra] of steps) {
  if (selected.length && !selected.includes(name)) continue
  const started = Date.now(), command = Array.isArray(spec) ? process.execPath : spec.command, args = Array.isArray(spec) ? spec : spec.args
  const r = spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 1_200_000, maxBuffer: 64 << 20,
    env: { ...process.env, PATH: path.dirname(process.execPath) + path.delimiter + process.env.PATH,
      DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/isolated', DIRECT_URL: 'postgresql://test:test@127.0.0.1:1/isolated',
      MIGRATION_AUTHORITY_ENABLED: 'false', VERCEL: '0', VERCEL_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1',
      AUTH_SECRET: 'synthetic-d05-build-only', AUTH_TRUST_HOST: 'true', NEXTAUTH_URL: 'http://localhost:3000',
      OMNI_PRINT_DIRECT_ENABLED: '0', OMNI_PRINT_DIRECT_LAB: '0', OMNI_PRINT_RETENTION_ENABLED: '0',
      FORCE_COLOR: '0', NO_COLOR: '1', ...extra } })
  const log = ((r.stdout ?? '') + (r.stderr ?? '')).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/[\t ]+$/gm, '').replace(/\r\n/g, '\n') + `\nexit=${r.status}\n`
  writeFileSync(path.join(out, name + '.log'), log)
  const status = r.status === 0 && !r.error && !r.signal ? 'PASS' : 'FAIL'
  summary.steps.push({ step: name, status, exit: r.status, signal: r.signal ?? null, processError: r.error?.code ?? null,
    seconds: Math.round((Date.now() - started) / 1000), sha256: createHash('sha256').update(log).digest('hex') })
  writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
  console.log(`${name}: ${status} (${Math.round((Date.now() - started) / 1000)}s)`)
}
process.exitCode = summary.steps.length > 0 && summary.steps.every(s => s.status === 'PASS') ? 0 : 1
