import { describe, expect, it } from "vitest"
import { mkdtempSync, appendFileSync } from "node:fs"
import { createHash } from "node:crypto"
import os from "node:os"
import path from "node:path"
import { Journal, PHASE } from "./journal.mjs"
import { normalizeServerUrl, validateEscPos } from "./protocol.mjs"
import { FakeSpooler } from "./spooler-fake.mjs"
import { Agent } from "./agent.mjs"
import { validateEscPos as serverValidate } from "@/lib/printing/direct/renderer"

const tmp = () => path.join(mkdtempSync(path.join(os.tmpdir(), "p004c-agent-")), "journal.jsonl")
const K = "11111111-1111-4111-8111-111111111111", A1 = "22222222-2222-4222-8222-222222222222", A2 = "33333333-3333-4333-8333-333333333333"

describe("diário do agente", () => {
  it("SUBMITTING sem conclusão vira UNKNOWN no reinício; linha final rasgada é ignorada", () => {
    const f = tmp()
    new Journal(f).append({ sendKey: K, attemptId: A1, phase: PHASE.SUBMITTING })
    appendFileSync(f, '{"sendKey":"torn')
    const j = new Journal(f)
    j.recover()
    expect(j.get(K)).toMatchObject({ phase: PHASE.UNKNOWN, reason: "AGENT_RESTARTED" })
    expect(j.outcomeOf(j.get(K))).toMatchObject({ result: "UNKNOWN", release: true })
    expect(j.unreported().map((e: { sendKey: string }) => e.sendKey)).toEqual([K])
  })
  it("P3-1 linha interrompida seguida de novo registro: o registro novo sobrevive ao recarregamento", () => {
    const f = tmp()
    new Journal(f).append({ sendKey: K, attemptId: A1, phase: PHASE.SUBMITTING })
    appendFileSync(f, '{"sendKey":"torn')
    new Journal(f).append({ sendKey: K, attemptId: A1, phase: PHASE.ACCEPTED, spoolJobId: "9" })
    expect(new Journal(f).get(K)).toMatchObject({ phase: PHASE.ACCEPTED, spoolJobId: "9" })
  })
  it("P2-1 consulta do servidor sobre resultado conhecido o torna pendente de novo (reenvio do relatório)", () => {
    const j = new Journal(tmp())
    j.append({ sendKey: K, attemptId: A1, phase: PHASE.UNKNOWN, reason: "TIMEOUT_AFTER_SUBMIT", release: false })
    j.append({ sendKey: K, attemptId: A1, phase: PHASE.REPORTED })
    expect(j.unreported()).toEqual([])
    expect(j.outcomeOf(j.get(K))).toMatchObject({ result: "UNKNOWN", release: false })
    j.markUnreported(K)
    expect(j.unreported().map((e: { sendKey: string }) => e.sendKey)).toEqual([K])
  })
  it("REPORTED persiste; nova tentativa só depois de NO_EFFECT comprovado", () => {
    const f = tmp(), j = new Journal(f)
    j.append({ sendKey: K, attemptId: A1, phase: PHASE.NO_EFFECT, reason: "PRINTER_OFFLINE" })
    j.append({ sendKey: K, attemptId: A1, phase: PHASE.REPORTED })
    expect(new Journal(f).get(K)).toMatchObject({ phase: PHASE.NO_EFFECT, reported: true, attemptId: A1 })
    expect(new Journal(f).unreported()).toEqual([])
  })
})

describe("protocolo", () => {
  it("URL do servidor: https obrigatório (loopback http só para laboratório), sem credenciais/consulta", () => {
    expect(normalizeServerUrl("https://omni.example.com/")).toBe("https://omni.example.com")
    expect(normalizeServerUrl("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000")
    for (const bad of ["http://omni.example.com", "https://u:p@omni.example.com", "https://omni.example.com/?x=1", "file:///c:/x"]) expect(() => normalizeServerUrl(bad)).toThrow()
  })
  it("validador ESC/POS do agente concorda com o do servidor", () => {
    const cut = [0x1d, 0x56, 0x00]
    const cases = [[0x41, 0x0a, ...cut], [0x1b, 0x40, 0x1b, 0x74, 16, 0x41, ...cut], [0x1b, 0x70, 0, 1, 1, ...cut], [0x10, 0x14, ...cut], [0x41], [0x1b, 0x64, 3, ...cut], [0x1b, 0x64, 200, ...cut]]
    for (const c of cases) {
      const b = Uint8Array.from(c)
      let server = true
      try { serverValidate(b) } catch { server = false }
      expect(validateEscPos(b)).toBe(server)
    }
  })
})

describe("agente com spooler simulado (sem servidor)", { timeout: 30_000 }, () => {
  const dispatch = (bytes: number[], extra: Record<string, unknown> = {}) => {
    const payload = Buffer.from(bytes)
    return { attemptId: A1, sendKey: K, printerName: "POS-80 (simulada)", documentLabel: "t", payloadBase64: payload.toString("base64"),
      payloadHash: createHash("sha256").update(payload).digest("hex"), ...extra }
  }
  const ok = [0x41, 0x0a, 0x1d, 0x56, 0x00]
  it("mesma sendKey reentregue nunca chega duas vezes ao spooler", async () => {
    const sp = new FakeSpooler()
    const agent = new Agent({ serverUrl: "http://127.0.0.1:1", token: "x", journalFile: tmp(), spooler: sp })
    await agent.handle(dispatch(ok)); await agent.handle(dispatch(ok)); await agent.handle(dispatch(ok, { attemptId: A2 }))
    expect(sp.spooled.length).toBe(1)
  })
  it("impressora pausada/sem papel/erro → NO_EFFECT sem tocar o spooler", async () => {
    for (const [flag, reason] of [["paused", "PRINTER_PAUSED"], ["paperOut", "PAPER_OUT"], ["error", "PRINTER_ERROR"]] as const) {
      const sp = new FakeSpooler(); sp.printers.get("POS-80 (simulada)")![flag] = true
      const agent = new Agent({ serverUrl: "http://127.0.0.1:1", token: "x", journalFile: tmp(), spooler: sp })
      await agent.handle(dispatch(ok))
      expect(sp.spooled.length).toBe(0)
      expect(agent.journal.get(K)).toMatchObject({ phase: PHASE.NO_EFFECT, reason })
    }
  })
  it("despacho sem orçamento de lease (ou valor inválido) nunca chega ao spooler", async () => {
    for (const lease of [10_000, Number.NaN]) {
      const sp = new FakeSpooler()
      const agent = new Agent({ serverUrl: "http://127.0.0.1:1", token: "x", journalFile: tmp(), spooler: sp, submitTimeoutMs: 20_000 })
      await agent.handle(dispatch(ok, { leaseRemainingMs: lease }))
      expect(sp.spooled.length).toBe(0)
      expect(agent.journal.get(K)).toMatchObject({ phase: PHASE.NO_EFFECT, reason: "TIMEOUT_BEFORE_SUBMIT" })
    }
  })
  it("consulta de tentativa mais nova que o diário gera TOMBSTONE próprio (não reenvia a antiga)", async () => {
    const sp = new FakeSpooler()
    const agent = new Agent({ serverUrl: "http://127.0.0.1:1", token: "x", journalFile: tmp(), spooler: sp })
    await agent.handle(dispatch(ok, { printerName: "Outra" })) // A1 NO_EFFECT
    await agent.answerQuery({ attemptId: A2, sendKey: K })
    expect(agent.journal.get(K)).toMatchObject({ phase: PHASE.TOMBSTONE, attemptId: A2, reason: "NOT_FOUND_IN_JOURNAL" })
    expect(sp.spooled.length).toBe(0)
  })
  it("impressora inexistente no computador → NO_EFFECT PRINTER_NOT_FOUND", async () => {
    const sp = new FakeSpooler()
    const agent = new Agent({ serverUrl: "http://127.0.0.1:1", token: "x", journalFile: tmp(), spooler: sp })
    await agent.handle(dispatch(ok, { printerName: "Outra" }))
    expect(agent.journal.get(K)).toMatchObject({ phase: PHASE.NO_EFFECT, reason: "PRINTER_NOT_FOUND" })
  })
})
