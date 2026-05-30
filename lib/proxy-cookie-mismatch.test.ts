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
 * Fix aplicado em SPRINT_MULTI_LOJA-S-002: proxy.ts importa e usa
 * ASSISTEC_ACTIVE_STORE_COOKIE; o literal com underscore foi eliminado.
 * Os snapshots do bug foram convertidos para o contrato pós-fix.
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

  it("[pós-fix F-03] proxy.ts NÃO contém mais o literal errado 'assistec_active_store' (underscores)", () => {
    const src = readProxy()
    expect(src).not.toMatch(/"assistec_active_store"/)
    expect(src).not.toMatch(/'assistec_active_store'/)
  })

  it("[pós-fix F-03] proxy.ts importa e usa ASSISTEC_ACTIVE_STORE_COOKIE", () => {
    const src = readProxy()
    // O proxy passou a importar a constante canônica — fim da divergência de naming.
    expect(src).toContain("ASSISTEC_ACTIVE_STORE_COOKIE")
  })

  /**
   * Contrato pós-fix consolidado (SPRINT_MULTI_LOJA-S-002):
   * - proxy.ts importa `ASSISTEC_ACTIVE_STORE_COOKIE` de `@/lib/store-defaults`
   * - Não usa mais a string literal com underscore
   */
  it("[F-03] proxy.ts importa ASSISTEC_ACTIVE_STORE_COOKIE e não usa literal com underscore", () => {
    const src = readProxy()
    expect(src).toContain("ASSISTEC_ACTIVE_STORE_COOKIE")
    expect(src).not.toMatch(/"assistec_active_store"/)
    expect(src).not.toMatch(/'assistec_active_store'/)
  })
})
