// Bounded restart budget survives supervisor crashes and logons. Fatal/revoked/intentional stops latch.
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { acquireLease, durableRecord } from './runtime.mjs'
import { checkRuntime, saveNewJson } from './lifecycle.mjs'
export function restartDecision({ exit, signal, halted, starts, now = Date.now(), windowMs = 900_000, maxStarts = 4 }) {
  if (halted || exit === 0 || exit === 65) return 'STOP'
  return starts.filter(t => t >= now - windowMs).length >= maxStarts ? 'EXHAUSTED' : signal || exit !== 0 ? 'RETRY' : 'STOP'
}
export async function supervise({ dataDir, launch, delay = ms => new Promise(r => setTimeout(r, ms)), now = Date.now }) {
  const lease = await acquireLease(path.join(dataDir, 'supervisor'))
  const halt = path.join(dataDir, 'halt.json'), ledger = path.join(dataDir, 'restarts.jsonl')
  try {
    while (!existsSync(halt)) {
      const starts = existsSync(ledger) ? readFileSync(ledger, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l).at) : []
      if (starts.filter(t => t >= now() - 900_000).length >= 4) { saveNewJson(halt, { reason: 'RESTART_BUDGET_EXHAUSTED' }); break }
      durableRecord(ledger, { at: now() })
      const result = await launch()
      const decision = restartDecision({ ...result, halted: existsSync(halt), starts: [...starts, now()], now: now() })
      if (decision !== 'RETRY') {
        if (!existsSync(halt)) saveNewJson(halt, { reason: decision === 'EXHAUSTED' ? 'RESTART_BUDGET_EXHAUSTED' : result.exit === 65 ? 'FATAL' : 'INTENTIONAL' })
        break
      }
      await delay(5000)
    }
  } finally { await lease.release() }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkRuntime()
  const dataDir = process.argv[process.argv.indexOf('--data-dir') + 1]
  if (!path.isAbsolute(dataDir || '')) throw new Error('DATA_DIR_REQUIRED')
  const agent = fileURLToPath(new URL('./agent.mjs', import.meta.url))
  supervise({ dataDir, launch: () => new Promise(resolve => {
    const child = spawn(process.execPath, [agent, 'run', '--data-dir', dataDir], { windowsHide: true, stdio: 'inherit' })
    child.once('error', () => resolve({ exit: 65, signal: null }))
    child.once('exit', (exit, signal) => resolve({ exit, signal }))
  }) }).catch(() => { console.error('SUPERVISOR_FATAL'); process.exitCode = 65 })
}
