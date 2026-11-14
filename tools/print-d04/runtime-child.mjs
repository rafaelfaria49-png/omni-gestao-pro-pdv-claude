// Synthetic process-crash harness. Never creates a real printer/spooler.
import { Agent } from '../omni-print-agent/agent.mjs'
import { FakeSpooler } from '../omni-print-agent/spooler-fake.mjs'
import { durableRecord } from '../omni-print-agent/runtime.mjs'
import { createHash } from 'node:crypto'
const [journalFile, paperFile] = process.argv.slice(2)
const spooler = new FakeSpooler()
const submit = spooler.submit.bind(spooler)
spooler.submit = async (...args) => { durableRecord(paperFile, { synthetic: true, handedToSpooler: true }); return submit(...args) }
const agent = await Agent.create({ serverUrl: 'http://127.0.0.1:1', token: 'synthetic', journalFile, spooler,
  hooks: { afterSubmitBeforeJournal: () => process.kill(process.pid, 'SIGKILL') } })
process.on('message', async m => {
  if (m.cmd === 'crash') {
    const bytes = Buffer.from([65,10,29,86,0])
    await agent.handle({ sendKey: 'synthetic-key', attemptId: 'synthetic-attempt', printerName: 'POS-80 (simulada)', documentLabel: 'synthetic',
      payloadBase64: bytes.toString('base64'), payloadHash: createHash('sha256').update(bytes).digest('hex') })
  }
  if (m.cmd === 'stop') { await agent.releaseLock(); process.exit(0) }
})
process.send({ ready: true })
