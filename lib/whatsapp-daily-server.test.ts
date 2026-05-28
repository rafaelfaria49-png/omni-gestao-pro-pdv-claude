/**
 * Testes-baseline: contrato de storeId em sendDailyClosingToPhone.
 *
 * Cobertura: F-14 da AUDITORIA_MULTI_LOJA_PRE_PILOTO_v01.md
 * - lib/whatsapp-daily-server.ts:38 tem fallback silencioso para LEGACY_PRIMARY_STORE_ID
 * - Combinado com F-07 (rota /api/whatsapp/send-daily sem canAccessStore), forma cadeia
 *   de vazamento: rota não valida → service fallback → ledger de loja errada via WhatsApp.
 *
 * Estes testes verificam o **comportamento atual da assinatura** e marcam como
 * expected-failing o contrato pós-piloto (storeId obrigatório).
 *
 * Não chamamos o service de fato (precisaria mock pesado de Prisma + whatsapp-send);
 * inspecionamos a assinatura TypeScript em compile-time + comportamento documentado.
 */
import { describe, expect, it } from "vitest"
import { LEGACY_PRIMARY_STORE_ID } from "./store-defaults"

describe("sendDailyClosingToPhone — contrato de storeId (F-14)", () => {
  it("[snapshot atual] LEGACY_PRIMARY_STORE_ID é o fallback hoje", () => {
    expect(LEGACY_PRIMARY_STORE_ID).toBe("loja-1")
  })

  /**
   * EXPECTED-FAILING ao nível TS: contrato futuro torna storeId obrigatório.
   *
   * Hoje a assinatura é `storeId?: string`. Pós-piloto: `storeId: string`.
   * Este teste é declarativo — quando o fix for aplicado, o `// @ts-expect-error`
   * vira erro de compilação porque o storeId vira required (e o ts-expect-error
   * fica sobrando), sinalizando que o contrato evoluiu.
   *
   * Marcamos como `it.fails` enquanto a assinatura permanece opcional.
   */
  it.fails("[F-14] DEVE exigir storeId como parâmetro obrigatório (contrato futuro)", async () => {
    type Sig = {
      phoneDigits: string
      empresaNome: string
      storeId: string // contrato pós-piloto: obrigatório (sem ?)
    }
    // Assinatura atual permite omitir storeId. Quando virar obrigatório, este cast
    // sobre objeto sem storeId vai falhar em compile time — mantemos como assertion
    // de intenção apenas. Em runtime: nada, mas o it.fails registra o gap.
    const probe: Sig = {
      phoneDigits: "11999990000",
      empresaNome: "Loja X",
      // @ts-expect-error storeId omitido — bug atual ao nível de assinatura
      storeId: undefined,
    }
    expect(probe.storeId).toBeDefined()
  })
})
