import { describe, expect, it } from "vitest"
import { randomBytes } from "node:crypto"
import type { PdvReceiptInput } from "@/lib/escpos"
import { APPROVED_RELEASE, directPrintRuntimeFromEnv } from "./activation"
import { PrintCrypto, safeText } from "./codec"
import { renderReceipt, validateEscPos } from "./renderer"
import { summarizeCopies } from "./status"

const input: PdvReceiptInput = {
  nomeFantasia: "Padaria São João — Pães & Cia", cnpj: "11.111.111/0001-11", enderecoLinha: "Av. Brasil, 100, Goiânia, GO",
  receiptFooter: "Obrigado pela preferência! Trocas somente com este comprovante em até 7 dias.",
  numeroVenda: "VDA-2026-000123", operador: "Ana", clienteNome: "Conceição", dataHora: "02/11/2026 10:00",
  pagamentos: [{ label: "Dinheiro", valor: 20 }, { label: "Cartão Crédito", valor: 9.9 }], cashTendered: 50, troco: 30,
  itens: [{ name: "Pão francês", quantity: 10, unitPrice: 0.99, lineTotal: 9.9 }, { name: "Café açúcar orgânico", quantity: 1, unitPrice: 20, lineTotal: 20 }],
  subtotal: 29.9, taxes: 0, discount: 0, total: 29.9,
}
const latin1 = (b: Uint8Array) => Buffer.from(b).toString("latin1")
const textLines = (b: Uint8Array) => latin1(b).split("\n").filter(l => !/[\x1b\x1d]/.test(l))

describe("renderer ESC/POS não fiscal 58/80 mm", () => {
  it("80 mm: aviso não fiscal, itens, valores, pagamentos, troco, acentos em CP1252 e corte final", () => {
    const b = renderReceipt(input, "THERMAL_80", "completo", { kind: "INITIAL", ordinal: 1, count: 1 })
    const t = latin1(b)
    for (const s of ["NÃO É DOCUMENTO FISCAL", "NÃO SUBSTITUI NFC-e OU NF-e", "10x Pão francês", "Café açúcar orgânico", "Valor final pago: R$", "Dinheiro: R$", "Cartão Crédito: R$", "Troco: R$", "VDA-2026-000123"])
      expect(t).toContain(s)
    expect(b.includes(0xe3) && b.includes(0xe7) && b.includes(0xc9)).toBe(true) // ã ç É as single WPC1252 bytes
    expect(Array.from(b.slice(0, 5))).toEqual([0x1b, 0x40, 0x1b, 0x74, 16]) // ESC @ + ESC t 16
    expect(Array.from(b.slice(-3))).toEqual([0x1d, 0x56, 0x00]) // full cut
    expect(Math.max(...textLines(b).map(l => l.length))).toBeLessThanOrEqual(48)
  })
  it("58 mm: nenhuma linha passa de 32 colunas (rodapé longo é quebrado)", () => {
    const b = renderReceipt(input, "THERMAL_58", "completo", { kind: "INITIAL", ordinal: 1, count: 1 })
    expect(Math.max(...textLines(b).map(l => l.length))).toBeLessThanOrEqual(32)
    expect(latin1(b)).toContain("Obrigado pela preferência!")
  })
  it("P06: duas renderizações independentes com as mesmas entradas são idênticas byte a byte; via/ordinal mudam os bytes", () => {
    const a = renderReceipt(input, "THERMAL_80", "completo", { kind: "INITIAL", ordinal: 1, count: 2 })
    const b = renderReceipt(structuredClone(input), "THERMAL_80", "completo", { kind: "INITIAL", ordinal: 1, count: 2 })
    expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).toBe(0)
    const c = renderReceipt(input, "THERMAL_80", "completo", { kind: "INITIAL", ordinal: 2, count: 2 })
    expect(Buffer.compare(Buffer.from(a), Buffer.from(c))).not.toBe(0)
    expect(latin1(renderReceipt(input, "THERMAL_80", "completo", { kind: "REPRINT", ordinal: 1, count: 1 }))).toContain("SEGUNDA VIA - REIMPRESSAO 1/1")
  })
  it("P09/I24: nenhuma via (inicial, segunda via) contém pulso de gaveta; validador recusa ESC p, DLE, GS (, NUL e falta de corte", () => {
    for (const kind of ["INITIAL", "REPRINT"] as const) {
      const b = Buffer.from(renderReceipt(input, "THERMAL_80", "completo", { kind, ordinal: 1, count: 1 }))
      expect(b.includes(Buffer.from([0x1b, 0x70]))).toBe(false)
    }
    const cut = [0x1d, 0x56, 0x00]
    for (const bad of [[0x1b, 0x70, 0, 25, 250, ...cut], [0x10, 0x14, 1, 0, 1, ...cut], [0x1d, 0x28, 0x4c, ...cut], [0x41, 0x00, ...cut], [0x41, 0x0a]])
      expect(() => validateEscPos(Uint8Array.from(bad))).toThrow()
    expect(() => validateEscPos(Uint8Array.from([0x41, 0x0a, ...cut]))).not.toThrow()
  })
  it("P03: ESC/GS/DLE/C0/C1/DEL e bidi viram caractere inerte antes do ESC/POS", () => {
    const hostile = safeText("A\u001b\u0001\u0019\u001d\u0010\u0014\u007f\u0085\u202eB")
    expect(hostile).toBe("A" + "\ufffd".repeat(9) + "B")
    expect(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e]/.test(hostile)).toBe(false)
    const b = renderReceipt({ ...input, itens: [{ name: hostile, quantity: 1, unitPrice: 1, lineTotal: 1 }] }, "THERMAL_80", "completo", { kind: "INITIAL", ordinal: 1, count: 1 })
    expect(() => validateEscPos(b)).not.toThrow()
  })
  it("perfil desconhecido é recusado", () => {
    expect(() => renderReceipt(input, "A4", "completo", { kind: "INITIAL", ordinal: 1, count: 1 })).toThrow("THERMAL_PROFILE_UNSUPPORTED")
  })
})

describe("visão do job (P07/I22)", () => {
  const meta = { jobId: "j", saleId: "s", kind: "INITIAL" as const, terminalId: "t", replay: false, printerName: "P", agentOnline: true, authorizationOpen: true }
  const row = (ordinal: number, state: string, extra: Record<string, unknown> = {}) => ({ ordinal, state, retry_suppressed_by_job_id: null, has_payload: true,
    payload_expires_at: new Date(Date.now() + 60_000), lease_until: new Date(Date.now() + 10_000), attempts: 1, reason: null, ...extra })
  it("ACCEPT + UNKNOWN → PARTIAL, preserva as duas vias e não oferece retry da incerta", () => {
    const v = summarizeCopies(meta, [row(1, "SPOOLER_ACCEPTED"), row(2, "UNKNOWN")])
    expect(v.phase).toBe("PARTIAL")
    expect(v.copies.map(c => [c.phase, c.canRetry])).toEqual([["IN_PRINTER_QUEUE", false], ["UNCERTAIN", false]])
    expect(v.canRetry).toBe(false)
    expect(v.physicalPrintConfirmed).toBe(false)
  })
  it("ACCEPT + NO_EFFECT → retry somente da via comprovadamente não enviada; suprimida ou payload expirado não reenvia", () => {
    const v = summarizeCopies(meta, [row(1, "SPOOLER_ACCEPTED"), row(2, "PRE_SEND_FAILED", { reason: "PRINTER_OFFLINE" })])
    expect(v.copies[1]).toMatchObject({ canRetry: true, label: "Não enviado: impressora desligada ou desconectada" })
    expect(summarizeCopies(meta, [row(1, "PRE_SEND_FAILED", { retry_suppressed_by_job_id: "x" })]).canRetry).toBe(false)
    expect(summarizeCopies(meta, [row(1, "PRE_SEND_FAILED", { payload_expires_at: new Date(Date.now() - 1) })]).canRetry).toBe(false)
    expect(summarizeCopies({ ...meta, authorizationOpen: false }, [row(1, "PRE_SEND_FAILED")]).canRetry).toBe(false)
  })
  it("READY com lease vencido = não enviado (nenhuma tentativa) e pode tentar de novo; nenhum rótulo afirma papel impresso", () => {
    const v = summarizeCopies(meta, [row(1, "READY", { lease_until: new Date(Date.now() - 1), attempts: 0 })])
    expect(v.copies[0]).toMatchObject({ phase: "NOT_SENT", canRetry: true })
    for (const s of ["READY", "SENDING", "SPOOLER_ACCEPTED", "PRE_SEND_FAILED", "UNKNOWN", "CANCELLED", "EXPIRED"])
      expect(summarizeCopies(meta, [row(1, s)]).copies[0].label).not.toMatch(/\bimpresso\b|imprimiu|papel saiu/i)
  })
})

describe("gate de ativação (D02–D05)", () => {
  const keys = { OMNI_PRINT_CONTENT_KEY: randomBytes(32).toString("base64url"), OMNI_PRINT_SIGNING_KEY: randomBytes(32).toString("base64url") }
  it("desligado por padrão; variável de ambiente sozinha não abre produção enquanto não houver release aprovada", () => {
    expect(APPROVED_RELEASE).toBeNull()
    expect(directPrintRuntimeFromEnv({}).enabled).toBe(false)
    expect(directPrintRuntimeFromEnv({ NODE_ENV: "production", OMNI_PRINT_DIRECT_ENABLED: "1", OMNI_PRINT_DIRECT_RELEASE: "OMNI-PRINT-004C-CANDIDATE-1", ...keys }).enabled).toBe(false)
    expect(directPrintRuntimeFromEnv({ NODE_ENV: "production", OMNI_PRINT_DIRECT_LAB: "1", ...keys }).enabled).toBe(false)
  })
  it("laboratório fora de produção exige chaves explícitas e distintas", () => {
    expect(directPrintRuntimeFromEnv({ NODE_ENV: "development", OMNI_PRINT_DIRECT_LAB: "1" })).toEqual({ enabled: false, reason: "PRINT_KEYS_REQUIRED" })
    expect(directPrintRuntimeFromEnv({ NODE_ENV: "development", OMNI_PRINT_DIRECT_LAB: "1", OMNI_PRINT_CONTENT_KEY: keys.OMNI_PRINT_CONTENT_KEY, OMNI_PRINT_SIGNING_KEY: keys.OMNI_PRINT_CONTENT_KEY }).enabled).toBe(false)
    expect(directPrintRuntimeFromEnv({ NODE_ENV: "development", OMNI_PRINT_DIRECT_LAB: "1", ...keys }).enabled).toBe(true)
  })
  it("conteúdo selado com AAD de escopo; token assinado adulterado é recusado", () => {
    const c = new PrintCrypto(randomBytes(32), randomBytes(32))
    const sealed = c.seal(Buffer.from("abc"), "payload:a")
    expect(c.open(sealed, "payload:a").toString()).toBe("abc")
    expect(() => c.open(sealed, "payload:b")).toThrow("CONTENT_UNAVAILABLE")
    const t = c.sign("risk-consent-v1", { a: 1 })
    expect(c.verify("risk-consent-v1", t)).toEqual({ a: 1 })
    expect(() => c.verify("risk-consent-v1", t.slice(0, -2) + "xx")).toThrow("INVALID_PROOF")
    expect(() => c.verify("other-domain", t)).toThrow("INVALID_PROOF")
  })
})
