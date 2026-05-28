/**
 * Teste estático ("lint test") — baseline F-03 proxy.ts.
 *
 * Cobertura: F-03 da AUDITORIA_MULTI_LOJA_PRE_PILOTO_v01.md
 *
 * O bug: proxy.ts:132 usa a string literal `"assistec_active_store"` (underscores),
 * mas o cookie real é `"assistec-active-store"` (hífens), definido em
 * `lib/store-defaults.ts:ASSISTEC_ACTIVE_STORE_COOKIE`.
 *
 * Resultado do bug: `enterpriseStoreCookieRedirect` nunca recebe valor — o redirect
 * de ACL de loja no proxy NUNCA dispara. Usuários restritos a uma loja passam pelo
 * gateway sem verificação.
 *
 * Nota: o contrato isolado de `enterpriseStoreCookieRedirect` está em
 * `lib/auth/proxy-enterprise-dashboard.test.ts`. Este arquivo cobre especificamente
 * que proxy.ts usa o literal errado.
 *
 * Quando o fix for aplicado (proxy.ts importa e usa ASSISTEC_ACTIVE_STORE_COOKIE),
 * os testes de snapshot mudam para expected-passing e o it.fails vira it.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { ASSISTEC_ACTIVE_STORE_COOKIE } from "./store-defaults"

const PROXY_PATH = resolve(__dirname, "../proxy.ts")

function readProxy(): string {
  return readFileSync(PROXY_PATH, "utf8")
}

describe("proxy.ts — cookie name mismatch (F-03)", () => {
  it("ASSISTEC_ACTIVE_STORE_COOKIE usa hífens — contrato canônico", () => {
    expect(ASSISTEC_ACTIVE_STORE_COOKIE).toBe("assistec-active-store")
    expect(ASSISTEC_ACTIVE_STORE_COOKIE).not.toContain("_")
  })

  it("[snapshot atual — bug F-03] proxy.ts contém o literal errado 'assistec_active_store' (underscores)", () => {
    const src = readProxy()
    // Documenta o bug: proxy.ts usa underscores em vez de hífens.
    // Quando o fix for aplicado, este expect falha — remova este teste ou atualize.
    expect(src).toContain("assistec_active_store")
  })

  it("[snapshot atual — bug F-03] proxy.ts NÃO importa ASSISTEC_ACTIVE_STORE_COOKIE", () => {
    const src = readProxy()
    // O proxy não importa a constante — a divergência de nome passou despercebida
    // porque ambos os contextos (onde set e onde get) nunca foram comparados em teste.
    expect(src).not.toContain("ASSISTEC_ACTIVE_STORE_COOKIE")
  })

  /**
   * EXPECTED-FAILING: contrato pós-fix (SPRINT_01_MULTI_LOJA).
   *
   * Após a correção:
   * - proxy.ts importa `ASSISTEC_ACTIVE_STORE_COOKIE` de `@/lib/store-defaults`
   * - Não usa mais a string literal com underscore
   *
   * Quando o fix for aplicado, troque `it.fails(` por `it(`.
   */
  it.fails("[F-03] DEVE: proxy.ts importa ASSISTEC_ACTIVE_STORE_COOKIE e não usa literal com underscore", () => {
    const src = readProxy()
    expect(src).toContain("ASSISTEC_ACTIVE_STORE_COOKIE")
    expect(src).not.toMatch(/"assistec_active_store"/)
    expect(src).not.toMatch(/'assistec_active_store'/)
  })
})
