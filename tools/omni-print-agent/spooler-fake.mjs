// Simulated Windows spooler + thermal printer for software validation WITHOUT hardware.
// It reproduces the transport answers the real adapter produces (not found, offline, paused, paper out,
// service down, StartDoc refusal, partial write, hang before/after submission). Nothing here is paper.
export class FakeSpooler {
  constructor(printers = [{ name: "POS-80 (simulada)" }]) {
    this.kind = "SIMULATED"
    this.printers = new Map(printers.map(p => [p.name, { online: true, paused: false, error: false, paperOut: false, portKind: "USB", ...p }]))
    this.serviceUp = true
    this.faults = [] // consumed by the next submit/status: TIMEOUT_BEFORE | OPEN_FAIL | START_DOC_FAIL | WRITE_FAIL | TIMEOUT_AFTER
    this.spooled = [] // { printer, bytes, docName, spoolJobId, simulatedOutput: boolean }
    this.resets = 0
    this.nextJob = 100
    this.hangs = []
  }
  hang() { return new Promise((_, reject) => this.hangs.push(reject)) }
  /** Simulated host kill; resolves true once nothing can write anymore (killConfirmed=false simulates a stuck host). */
  async reset() { this.resets++; for (const r of this.hangs.splice(0)) r(Object.assign(new Error("HOST_KILLED"), { phase: "KILLED" })); return this.killConfirmed !== false }
  async listPrinters() {
    if (!this.serviceUp) throw Object.assign(new Error("RPC 1722"), { reason: "SPOOLER_UNAVAILABLE" })
    return [...this.printers].map(([name, p]) => ({ name, online: p.online && !p.paused && !p.error && !p.paperOut, status: p.online ? (p.paused ? "PAUSED" : p.paperOut ? "PAPER_OUT" : p.error ? "ERROR" : "IDLE") : "OFFLINE", isDefault: false, portKind: p.portKind }))
  }
  async status(name) {
    if (this.faults[0] === "TIMEOUT_BEFORE") { this.faults.shift(); return this.hang() }
    if (!this.serviceUp) return { exists: false, serviceUp: false }
    const p = this.printers.get(name)
    if (!p) return { exists: false, serviceUp: true }
    return { exists: true, serviceUp: true, online: p.online, paused: p.paused, error: p.error, paperOut: p.paperOut }
  }
  async submit(name, bytes, docName) {
    const fault = this.faults.shift()
    if (!this.serviceUp) throw Object.assign(new Error("RPC 1722"), { phase: "BEFORE", reason: "SPOOLER_UNAVAILABLE" })
    if (fault === "OPEN_FAIL") throw Object.assign(new Error("OpenPrinter 1801"), { phase: "BEFORE", reason: "OPEN_FAILED" })
    if (fault === "START_DOC_FAIL") throw Object.assign(new Error("StartDocPrinter 5"), { phase: "BEFORE", reason: "START_DOC_FAILED" })
    if (fault === "SLOW_SUBMIT") await new Promise(r => setTimeout(r, 1500))
    const p = this.printers.get(name)
    if (!p) throw Object.assign(new Error("OpenPrinter 1801"), { phase: "BEFORE", reason: "OPEN_FAILED" })
    const spoolJobId = String(this.nextJob++)
    if (fault === "WRITE_FAIL") {
      this.spooled.push({ printer: name, bytes: bytes.slice(0, Math.floor(bytes.length / 2)), docName, spoolJobId, simulatedOutput: p.online, partial: true })
      throw Object.assign(new Error("WritePrinter 1167"), { phase: "AFTER", reason: "WRITE_FAILED" })
    }
    this.spooled.push({ printer: name, bytes: Uint8Array.from(bytes), docName, spoolJobId, simulatedOutput: p.online && !p.paused && !p.error && !p.paperOut })
    if (fault === "TIMEOUT_AFTER") return this.hang()
    return { spoolJobId }
  }
  /** Count of simulated paper outputs per printer (simulation only — never reported as physical print). */
  simulatedOutputs(name) { return this.spooled.filter(j => j.printer === name && j.simulatedOutput && !j.partial).length }
}
