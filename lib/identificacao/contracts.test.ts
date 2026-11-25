import { describe, expect, it } from "vitest"
import { DEFAULT_MEDIA, codeKey, internalSchema, jobSchema, mediaSchema, nextPrintState } from "./contracts"
import { identificationEnabled } from "./feature-flags.server"
import { generateInternalCode, requestHash, failure } from "./service"
import { validarGtin, validarGtin14 } from "@/lib/cadastros/gtin"

describe("P03 contratos e gates privados", () => {
  it("gate fechado por padrão e sempre fechado em Production, mesmo com opt-in P02", () => {
    const env = { VESTUARIO_P03_ENABLED: "1", VESTUARIO_P03_STORE_ALLOWLIST: "a, b", VESTUARIO_CATALOG_PRODUCTION_ENABLED: "1" }
    for (const VERCEL_ENV of [undefined, "production", "qa", ""]) expect(identificationEnabled("a", { ...env, VERCEL_ENV })).toBe(false)
    expect(identificationEnabled("a", { ...env, VERCEL_ENV: "preview" })).toBe(true)
    for (const store of ["", " a", "ab", "c"]) expect(identificationEnabled(store, { ...env, VERCEL_ENV: "development" })).toBe(false)
    expect(identificationEnabled("a", { VERCEL_ENV: "development" })).toBe(false)
  })
  it("payload não escolhe loja/identidade e preserva consentimento explícito", () => {
    const payload = { target: { produtoId: "p" }, requestKey: "request-123" }
    expect(internalSchema.parse(payload)).toMatchObject({ target: { varianteId: null }, preservarCodigoExistente: false })
    expect(internalSchema.safeParse({ ...payload, storeId: "b" }).success).toBe(false)
    expect(internalSchema.safeParse({ ...payload, target: { produtoId: "p", storeId: "b" } }).success).toBe(false)
  })
  it("normaliza comparação nova sem fold Unicode nem modificar texto legado", () => {
    expect(codeKey("\t\u00a0abc-v\u000b")).toBe("ABC-V")
    expect(codeKey("áßａｂｃ")).toBe("áßａｂｃ")
    const codes = new Set(Array.from({ length: 1000 }, generateInternalCode))
    expect(codes.size).toBe(1000)
    expect([...codes].every(c => /^OGV-[0-9]{12}$/.test(c))).toBe(true)
  })
  it("hash canônico preserva conteúdo e ordem dos itens", () => {
    expect(requestHash({ b: 2, a: [1, 3] })).toBe(requestHash({ a: [1, 3], b: 2 }))
    expect(requestHash({ a: [1, 3] })).not.toBe(requestHash({ a: [3, 1] }))
    expect(failure(new Error("ECONNRESET"))).toMatchObject({ ok: false, code: "UNKNOWN_RESULT" })
    expect(failure(new Error("55P03 lock timeout"))).toMatchObject({ code: "CONFLICT" })
  })
  it("GTIN14 é separado do scanner legado e não trunca código", () => {
    expect(validarGtin14("10012345000017")).toBe(true)
    expect(validarGtin("10012345000017").valid).toBe(false)
    expect(validarGtin14("00000000000000")).toBe(false)
    expect(validarGtin14("10012345000018")).toBe(false)
  })
  it("mídia e lote têm limites e rejeitam alvo repetido", () => {
    const v = { target: { produtoId: "p" }, quantidade: 100, expectedUpdatedAt: "2026-11-16T00:00:00.000Z" }
    expect(mediaSchema.safeParse({ ...DEFAULT_MEDIA, heightMm: 30, barcodeHeightMm: 20 }).success).toBe(false)
    expect(mediaSchema.safeParse({ ...DEFAULT_MEDIA, heightMm: 30, barcodeHeightMm: 12, showPrice: true }).success).toBe(false)
    expect(mediaSchema.safeParse({ ...DEFAULT_MEDIA, heightMm: 30, barcodeHeightMm: 8, showPrice: true }).success).toBe(true)
    expect(jobSchema.safeParse({ requestKey: "request-123", media: DEFAULT_MEDIA, items: [v, v] }).success).toBe(false)
    expect(jobSchema.safeParse({ requestKey: "request-123", media: DEFAULT_MEDIA, items: Array.from({ length: 6 }, (_, n) => ({ ...v, target: { produtoId: `p${n}` } })) }).success).toBe(false)
    expect(jobSchema.safeParse({ requestKey: "request-123", media: DEFAULT_MEDIA, items: Array.from({ length: 51 }, (_, n) => ({ ...v, quantidade: 1, target: { produtoId: `p${n}` } })) }).success).toBe(false)
    expect(jobSchema.safeParse({ requestKey: "request-123", media: DEFAULT_MEDIA, items: Array.from({ length: 50 }, (_, n) => ({ ...v, quantidade: 10, target: { produtoId: `p${n}` } })) }).success).toBe(true)
    expect(mediaSchema.safeParse({ widthMm: 55, heightMm: 35, marginMm: 2, barcodeHeightMm: 10, showPrice: true }).success).toBe(true)
    expect(mediaSchema.safeParse({ widthMm: 49, heightMm: 35, marginMm: 2, barcodeHeightMm: 10, showPrice: false }).success).toBe(false)
    expect(mediaSchema.safeParse({ widthMm: 111, heightMm: 35, marginMm: 2, barcodeHeightMm: 10, showPrice: false }).success).toBe(false)
  })
  it("ack atrasado nunca substitui confirmação manual ou falha antes do envio", () => {
    expect(nextPrintState("SOLICITADO", "DIALOGO_SOLICITADO")).toBe("RESULTADO_DESCONHECIDO")
    expect(nextPrintState("RESULTADO_DESCONHECIDO", "POPUP_BLOQUEADO")).toBe("RESULTADO_DESCONHECIDO")
    expect(nextPrintState("CONFIRMADO_MANUAL", "DIALOGO_SOLICITADO")).toBe("CONFIRMADO_MANUAL")
    expect(nextPrintState("FALHA_ANTES_ENVIO", "CONFIRMAR_MANUAL")).toBe("FALHA_ANTES_ENVIO")
  })
})
