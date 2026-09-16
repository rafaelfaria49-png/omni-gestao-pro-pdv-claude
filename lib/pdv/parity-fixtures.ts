/**
 * Fixtures de paridade N5-A — dados por superfície oficial.
 *
 * Fonte: audit canônico `docs/pdv/PDV_PARITY_SUITE_N5_AUDIT_001.md` (§A, §D)
 * + código vivo em HEAD. Fixture = contrato declarativo da borda; os testes
 * `parity-*.test.ts` consomem esta tabela em vez de copiar o mesmo teste 4x.
 *
 * N5-A é FUNDAÇÃO: nada aqui muda comportamento; divergências do audit são
 * registradas (campo `auditRefs`), nunca corrigidas.
 */

import { OFFICIAL_PDV_SURFACE_IDS } from "@/lib/pdv/surface-ids"
import type { OfficialPdvSurfaceId } from "@/lib/pdv/surface-ids"

/** pdvType legado gravado em `HeldSale.pdvType` por superfície (audit A.1 #12). */
export type OfficialHoldPdvType = "classic" | "assistencia" | "supermercado" | "venda-completa"

export type SurfaceFixture = {
  surfaceId: OfficialPdvSurfaceId
  /** Componente da borda (relativo à raiz) — usado pelos drift guards estáticos. */
  componentPath: string
  /** Valor gravado em `HeldSale.pdvType` ao salvar venda em espera. */
  holdPdvType: OfficialHoldPdvType
  /** Props de gate que a superfície passa ao PaymentModal (audit A.1 #09/#10/#08, §F-01). */
  paymentModalWiring: {
    discountsEnabledKey: "pdv.discounts"
    storeCreditEnabledKey: "pdv.customerStoreCredit"
    allowMultiplePaymentsKey: "pdv.multiplePayments"
  }
  /**
   * Mutex de finalização (`claimSaleFinalizeLock`) existe SÓ na Venda Completa.
   * GAP-P2-06: evidência registrada para N5-B — não é defeito confirmado e
   * NÃO deve ser "corrigido" aqui.
   */
  hasFinalizeMutex: boolean
  auditRefs: string[]
}

/**
 * Chaves de capability com default parity nas 4 oficiais (matriz N4,
 * `capability-support-matrix.ts`): supportedBy = ALL_OFFICIAL + defaultEnabled
 * = true. O contrato N5-A congela isso por superfície.
 */
export const PAYMENT_PARITY_CAPABILITY_KEYS = [
  "sales.paymentMethods",
  "pdv.multiplePayments",
  "pdv.customerStoreCredit",
  "pdv.discounts",
] as const

/** Chaves de runtime usadas pelas bordas (holds/busca de cliente). */
export const BORDER_RUNTIME_CAPABILITY_KEYS = ["pdv.heldSales", "pdv.customerSearch"] as const

export const OFFICIAL_SURFACE_FIXTURES: readonly SurfaceFixture[] = [
  {
    surfaceId: "classic",
    componentPath: "components/dashboard/vendas/pdv-classic.tsx",
    holdPdvType: "classic",
    paymentModalWiring: {
      discountsEnabledKey: "pdv.discounts",
      storeCreditEnabledKey: "pdv.customerStoreCredit",
      allowMultiplePaymentsKey: "pdv.multiplePayments",
    },
    hasFinalizeMutex: false,
    auditRefs: ["A.1", "A.2#18-20", "A.3", "D-01"],
  },
  {
    surfaceId: "assistencia",
    componentPath: "components/dashboard/vendas/pdv-assistencia-enterprise.tsx",
    holdPdvType: "assistencia",
    paymentModalWiring: {
      discountsEnabledKey: "pdv.discounts",
      storeCreditEnabledKey: "pdv.customerStoreCredit",
      allowMultiplePaymentsKey: "pdv.multiplePayments",
    },
    hasFinalizeMutex: false,
    auditRefs: ["A.1", "A.2#15", "A.3", "D-01", "B-01"],
  },
  {
    surfaceId: "supermercado",
    componentPath: "components/dashboard/vendas/pdv-supermercado.tsx",
    holdPdvType: "supermercado",
    paymentModalWiring: {
      discountsEnabledKey: "pdv.discounts",
      storeCreditEnabledKey: "pdv.customerStoreCredit",
      allowMultiplePaymentsKey: "pdv.multiplePayments",
    },
    hasFinalizeMutex: false,
    auditRefs: ["A.1", "A.3", "D-01"],
  },
  {
    surfaceId: "venda-completa",
    componentPath: "components/dashboard/vendas/venda-completa-enterprise.tsx",
    holdPdvType: "venda-completa",
    paymentModalWiring: {
      discountsEnabledKey: "pdv.discounts",
      storeCreditEnabledKey: "pdv.customerStoreCredit",
      allowMultiplePaymentsKey: "pdv.multiplePayments",
    },
    hasFinalizeMutex: true,
    auditRefs: ["A.1", "A.3", "D-01", "B-04", "B-05", "GAP-P2-06"],
  },
] as const

export function fixtureFor(surfaceId: OfficialPdvSurfaceId): SurfaceFixture {
  const fixture = OFFICIAL_SURFACE_FIXTURES.find((f) => f.surfaceId === surfaceId)
  if (!fixture) throw new Error(`Fixture ausente para a superfície "${surfaceId}".`)
  return fixture
}

/** Garantia estrutural: fixtures cobrem exatamente o conjunto oficial. */
export function fixturesCoverOfficialSurfaces(): boolean {
  const fixtureIds = OFFICIAL_SURFACE_FIXTURES.map((f) => f.surfaceId)
  return (
    fixtureIds.length === OFFICIAL_PDV_SURFACE_IDS.length &&
    OFFICIAL_PDV_SURFACE_IDS.every((id) => fixtureIds.includes(id))
  )
}
