import path from 'node:path'
import { acquireLease } from './runtime.mjs'
const dir = process.argv[2]
if (!path.isAbsolute(dir || '')) throw new Error('DATA_DIR_REQUIRED')
const deadline = Date.now() + 90_000
for (;;) {
  let supervisor, journal
  try {
    supervisor = await acquireLease(path.join(dir, 'supervisor'))
    journal = await acquireLease(path.join(dir, 'journal.jsonl'))
    await journal.release(); await supervisor.release()
    console.log('DRAINED_HOSTS_CLOSED'); break
  } catch (e) {
    if (journal) await journal.release()
    if (supervisor) await supervisor.release()
    if (e.message !== 'AGENT_ALREADY_RUNNING' || Date.now() > deadline) { console.error('DRAIN_UNPROVEN'); process.exitCode = 65; break }
    await new Promise(r => setTimeout(r, 500))
  }
}
