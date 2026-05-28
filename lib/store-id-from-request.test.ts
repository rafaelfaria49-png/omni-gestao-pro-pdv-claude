/**
 * Testes-baseline pré-piloto SPRINT_01_MULTI_LOJA.
 *
 * Cobertura: F-01 da AUDITORIA_MULTI_LOJA_PRE_PILOTO_v01.md
 * - storeIdFromAssistecRequestForRead retorna fallback silencioso "loja-1" (DT-03)
 * - storeIdFromAssistecRequestForWrite retorna null sem header/query (correto)
 * - resolução respeita ordem header → query → cookie
 *
 * Os testes marcados como `it.fails` são **expected-failing** intencionais —
 * documentam o bug atual (fallback silencioso) que SPRINT_01_MULTI_LOJA deve eliminar.
 * Quando o fix for aplicado, esses `it.fails` viram `it` normais.
 */
import { describe, expect, it } from "vitest"
import {
  storeIdFromAssistecRequestForRead,
  storeIdFromAssistecRequestForWrite,
} from "./store-id-from-request"
import { LEGACY_PRIMARY_STORE_ID } from "./store-defaults"

const URL_BASE = "https://omni.test/api/x"

function makeReq(opts: {
  header?: string | null
  query?: Record<string, string>
  cookie?: string | null
}): Request {
  const u = new URL(URL_BASE)
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) u.searchParams.set(k, v)
  }
  const headers = new Headers()
  if (opts.header !== undefined && opts.header !== null) {
    headers.set("x-assistec-loja-id", opts.header)
  }
  if (opts.cookie !== undefined && opts.cookie !== null) {
    headers.set("cookie", opts.cookie)
  }
  return new Request(u.toString(), { method: "GET", headers })
}

describe("storeIdFromAssistecRequestForRead — ordem de resolução", () => {
  it("usa header x-assistec-loja-id quando presente", () => {
    const req = makeReq({ header: "loja-a" })
    expect(storeIdFromAssistecRequestForRead(req)).toBe("loja-a")
  })

  it("usa query storeId quando header ausente", () => {
    const req = makeReq({ query: { storeId: "loja-b" } })
    expect(storeIdFromAssistecRequestForRead(req)).toBe("loja-b")
  })

  it("usa query lojaId quando header e storeId ausentes", () => {
    const req = makeReq({ query: { lojaId: "loja-c" } })
    expect(storeIdFromAssistecRequestForRead(req)).toBe("loja-c")
  })

  it("usa cookie assistec-active-store quando header e query ausentes", () => {
    const req = makeReq({ cookie: "assistec-active-store=loja-d" })
    expect(storeIdFromAssistecRequestForRead(req)).toBe("loja-d")
  })

  it("header tem precedência sobre query e cookie", () => {
    const req = makeReq({
      header: "loja-header",
      query: { storeId: "loja-query" },
      cookie: "assistec-active-store=loja-cookie",
    })
    expect(storeIdFromAssistecRequestForRead(req)).toBe("loja-header")
  })

  it("query tem precedência sobre cookie", () => {
    const req = makeReq({
      query: { storeId: "loja-query" },
      cookie: "assistec-active-store=loja-cookie",
    })
    expect(storeIdFromAssistecRequestForRead(req)).toBe("loja-query")
  })

  it("decodifica cookie URL-encoded", () => {
    const encoded = encodeURIComponent("loja com espaço")
    const req = makeReq({ cookie: `assistec-active-store=${encoded}` })
    expect(storeIdFromAssistecRequestForRead(req)).toBe("loja com espaço")
  })

  it("trim do header funciona", () => {
    const req = makeReq({ header: "  loja-z  " })
    expect(storeIdFromAssistecRequestForRead(req)).toBe("loja-z")
  })
})

describe("storeIdFromAssistecRequestForRead — fallback silencioso (DT-03)", () => {
  /**
   * EXPECTED-FAILING: documenta F-01 da auditoria.
   * Comportamento atual: silenciosamente cai em "loja-1" — vetor de vazamento cross-tenant.
   * Comportamento esperado (pós-piloto): retornar `null` ou lançar; rota chamadora decide 400/403.
   *
   * Quando SPRINT_01_MULTI_LOJA mergeada, troque `it.fails(` por `it(`.
   */
  it.fails("[F-01] DEVE retornar null quando header, query e cookie estão ausentes", () => {
    const req = makeReq({})
    // Atualmente retorna "loja-1" (LEGACY_PRIMARY_STORE_ID). Bug a corrigir.
    expect(storeIdFromAssistecRequestForRead(req) as unknown).toBeNull()
  })

  it.fails("[F-01] DEVE retornar null quando header e query são strings vazias", () => {
    const req = makeReq({ header: "", query: { storeId: "" } })
    expect(storeIdFromAssistecRequestForRead(req) as unknown).toBeNull()
  })

  it.fails("[F-01] DEVE retornar null quando cookie tem chave mas valor vazio", () => {
    const req = makeReq({ cookie: "assistec-active-store=" })
    expect(storeIdFromAssistecRequestForRead(req) as unknown).toBeNull()
  })

  it("[snapshot atual] hoje retorna LEGACY_PRIMARY_STORE_ID sem contexto — DOCUMENTA o bug", () => {
    // Este teste passa hoje. Quando o fix for aplicado, ele falha — sinal de remover.
    const req = makeReq({})
    expect(storeIdFromAssistecRequestForRead(req)).toBe(LEGACY_PRIMARY_STORE_ID)
    expect(LEGACY_PRIMARY_STORE_ID).toBe("loja-1")
  })
})

describe("storeIdFromAssistecRequestForWrite — exige unidade explícita", () => {
  it("retorna null quando header e query ausentes (sem fallback — correto)", () => {
    const req = makeReq({})
    expect(storeIdFromAssistecRequestForWrite(req)).toBeNull()
  })

  it("retorna null quando apenas cookie presente (CSRF guard)", () => {
    const req = makeReq({ cookie: "assistec-active-store=loja-x" })
    expect(storeIdFromAssistecRequestForWrite(req)).toBeNull()
  })

  it("retorna null para strings vazias", () => {
    const req = makeReq({ header: "   ", query: { storeId: "   " } })
    expect(storeIdFromAssistecRequestForWrite(req)).toBeNull()
  })

  it("aceita header válido", () => {
    const req = makeReq({ header: "loja-a" })
    expect(storeIdFromAssistecRequestForWrite(req)).toBe("loja-a")
  })

  it("aceita query storeId quando header ausente", () => {
    const req = makeReq({ query: { storeId: "loja-b" } })
    expect(storeIdFromAssistecRequestForWrite(req)).toBe("loja-b")
  })

  it("aceita query lojaId quando header e storeId ausentes", () => {
    const req = makeReq({ query: { lojaId: "loja-c" } })
    expect(storeIdFromAssistecRequestForWrite(req)).toBe("loja-c")
  })

  it("header tem precedência sobre query", () => {
    const req = makeReq({ header: "loja-a", query: { storeId: "loja-b" } })
    expect(storeIdFromAssistecRequestForWrite(req)).toBe("loja-a")
  })

  it("ignora cookie totalmente em mutações", () => {
    const req = makeReq({
      header: "loja-real",
      cookie: "assistec-active-store=loja-cookie-malicioso",
    })
    expect(storeIdFromAssistecRequestForWrite(req)).toBe("loja-real")
  })
})
