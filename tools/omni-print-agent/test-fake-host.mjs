// Test double of the PowerShell host (same JSON-lines protocol). printer "HANG" never answers; "THROW" fails at host level.
import { createInterface } from "node:readline"

const out = (o) => process.stdout.write(JSON.stringify(o) + "\n")
createInterface({ input: process.stdin }).on("line", (line) => {
  const req = JSON.parse(line)
  if (req.printer === "HANG") return
  if (req.op === "status") return out({ id: req.id, ok: true, status: { exists: true, serviceUp: true, online: true, paused: false, error: false, paperOut: false }, pid: process.pid })
  if (req.op === "send") return req.printer === "THROW" ? out({ id: req.id, ok: false, error: "boom" }) : out({ id: req.id, ok: true, result: "OK:" + process.pid })
  if (req.op === "list") return out({ id: req.id, ok: true, printers: [{ name: "Fake", online: true, status: "3", isDefault: false, portKind: "USB" }] })
  out({ id: req.id, ok: false, error: "UNKNOWN_OP" })
})
