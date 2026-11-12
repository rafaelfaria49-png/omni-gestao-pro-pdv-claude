// Separate OS process running the REAL agent loop against a SIMULATED spooler (Playwright / multi-process harness).
// argv: <serverUrl> <journalFile> [paperFile] ; token arrives via IPC (never argv/env). Control over IPC:
// {cmd:"start",token} {cmd:"state"} {cmd:"printer",name,patch} {cmd:"stop"}
// paperFile: every byte stream handed to the simulated spooler is recorded (fsync) BEFORE the call returns, so even a
// process killed right after submitting leaves evidence of what reached the "printer".
import { closeSync, fsyncSync, openSync, writeSync } from "node:fs"
import { Agent } from "../omni-print-agent/agent.mjs"
import { FakeSpooler } from "../omni-print-agent/spooler-fake.mjs"

const [serverUrl, journalFile, paperFile] = process.argv.slice(2)
const spooler = new FakeSpooler([{ name: "POS-80 (simulada)" }])
if (paperFile) {
  const submit = spooler.submit.bind(spooler)
  spooler.submit = async (name, bytes, doc) => {
    const sale = /Venda: (\S+)/.exec(Buffer.from(bytes).toString("latin1"))?.[1] ?? null
    const fd = openSync(paperFile, "a")
    try { writeSync(fd, JSON.stringify({ pid: process.pid, sale, doc }) + "\n"); fsyncSync(fd) } finally { closeSync(fd) }
    // Test-only crash barrier: bytes crossed the simulated submit boundary, with SUBMITTING already fsync'ed.
    // Block the child after IPC flush so an overloaded parent cannot miss a 1.5s timer window. No real adapter uses this.
    if (spooler.faults[0] === "HOLD_SUBMIT_FOR_KILL") {
      spooler.faults.shift()
      await new Promise(resolve => process.send({ event: "SUBMIT_BARRIER_ENTERED", pid: process.pid, sale, doc }, () => {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60_000)
        resolve()
      }))
    }
    return submit(name, bytes, doc)
  }
}
let agent = null, loop = null
process.on("message", async (m) => {
  if (m.cmd === "start") {
    try {
      agent = await Agent.create({ serverUrl, token: m.token, spooler, journalFile, statusTimeoutMs: 500, submitTimeoutMs: 2500, minSendBudgetMs: 3000 })
      loop = agent.run({ pollMs: 200, heartbeatMs: 1000 })
      process.send({ id: m.id, ok: true, pid: process.pid })
    } catch (e) { process.send({ id: m.id, ok: false, error: String(e?.message ?? e) }) }
  } else if (m.cmd === "state") {
    process.send({ id: m.id, ok: true, spooled: spooler.spooled.map(j => ({ printer: j.printer, spoolJobId: j.spoolJobId, bytes: Buffer.from(j.bytes).toString("base64") })) })
  } else if (m.cmd === "printer") {
    Object.assign(spooler.printers.get(m.name), m.patch)
    process.send({ id: m.id, ok: true })
  } else if (m.cmd === "fault") {
    spooler.faults.push(m.fault)
    process.send({ id: m.id, ok: true })
  } else if (m.cmd === "stop") {
    agent?.stop(); await loop; agent = null
    process.send({ id: m.id, ok: true })
  }
})
process.send({ ready: true })
