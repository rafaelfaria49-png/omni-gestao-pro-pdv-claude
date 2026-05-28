/**
 * Testes-baseline: roteamento de webhook WhatsApp por tenant.
 *
 * Cobertura: F-04 da AUDITORIA_MULTI_LOJA_PRE_PILOTO_v01.md
 * - `webhookDefaultStoreId()` cai em LEGACY_PRIMARY_STORE_ID quando env
 *   WHATSAPP_WEBHOOK_STORE_ID não está setada → vazamento cross-tenant
 *   quando 2ª loja conectar WhatsApp.
 *
 * NOTA: o módulo whatsapp-service.ts importa Prisma e cliente Cloud API;
 * carregar o módulo inteiro em Vitest é caro e instável. Aqui replicamos o
 * **contrato** declarado por `webhookDefaultStoreId` e testamos a função-contrato
 * isoladamente. A garantia de que o código de produção segue esse contrato vem
 * do code review humano + grep estático (lint test em
 * `lib/multi-loja-no-hardcoded-fallback.test.ts`).
 *
 * Um teste de integração que carregue o módulo real virá em sprint sucessora
 * com setup de mock de Prisma — fora do escopo S desta sprint de baseline.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { LEGACY_PRIMARY_STORE_ID } from "../store-defaults"

/**
 * Réplica EXATA da função em `lib/whatsapp/whatsapp-service.ts:34-37`.
 * Qualquer mudança aqui DEVE acompanhar mudança no original — o lint test
 * `multi-loja-no-hardcoded-fallback.test.ts` ajuda a detectar divergência via
 * scan estático.
 */
function webhookDefaultStoreIdContract(): string {
  const env = process.env.WHATSAPP_WEBHOOK_STORE_ID?.trim()
  return env && env.length > 0 ? env : LEGACY_PRIMARY_STORE_ID
}

describe("webhookDefaultStoreId (contract replica) — env routing (single-store legado)", () => {
  const originalEnv = process.env.WHATSAPP_WEBHOOK_STORE_ID

  beforeEach(() => {
    delete process.env.WHATSAPP_WEBHOOK_STORE_ID
  })

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.WHATSAPP_WEBHOOK_STORE_ID
    } else {
      process.env.WHATSAPP_WEBHOOK_STORE_ID = originalEnv
    }
  })

  it("retorna o valor da env quando setada", () => {
    process.env.WHATSAPP_WEBHOOK_STORE_ID = "loja-x"
    expect(webhookDefaultStoreIdContract()).toBe("loja-x")
  })

  it("trim do valor da env", () => {
    process.env.WHATSAPP_WEBHOOK_STORE_ID = "  loja-y  "
    expect(webhookDefaultStoreIdContract()).toBe("loja-y")
  })

  it("[snapshot atual — bug DT-07] cai em LEGACY_PRIMARY_STORE_ID quando env ausente", () => {
    delete process.env.WHATSAPP_WEBHOOK_STORE_ID
    expect(webhookDefaultStoreIdContract()).toBe(LEGACY_PRIMARY_STORE_ID)
  })

  it("[snapshot atual] env vazia também cai em LEGACY_PRIMARY_STORE_ID", () => {
    process.env.WHATSAPP_WEBHOOK_STORE_ID = ""
    expect(webhookDefaultStoreIdContract()).toBe(LEGACY_PRIMARY_STORE_ID)
  })

  it("[snapshot atual] env só whitespace cai em LEGACY_PRIMARY_STORE_ID", () => {
    process.env.WHATSAPP_WEBHOOK_STORE_ID = "    "
    expect(webhookDefaultStoreIdContract()).toBe(LEGACY_PRIMARY_STORE_ID)
  })

  /**
   * EXPECTED-FAILING: contrato pós-piloto.
   * Pós SPRINT_NN_MULTI_LOJA (Recomendação #6) o webhook resolve `storeId`
   * via lookup por `phone_number_id`. Sem env e sem lookup → erro explícito.
   */
  it.fails("[F-04] DEVE rejeitar (lançar) quando env ausente — sem fallback silencioso", () => {
    delete process.env.WHATSAPP_WEBHOOK_STORE_ID
    expect(() => webhookDefaultStoreIdContract()).toThrow()
  })
})
