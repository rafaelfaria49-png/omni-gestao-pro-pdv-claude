/**
 * N5-A F-01 — Contrato das props de gate do PaymentModal por superfície.
 *
 * Fonte: audit `docs/pdv/PDV_PARITY_SUITE_N5_AUDIT_001.md` (A.1 #08/#09/#10,
 * §F-01, GAP-P2-02, GAP-P2-03).
 *
 * Prova:
 * 1. Default parity — as 4 chaves de pagamento resolvem enabled=true por
 *    default nas 4 superfícies oficiais (matriz N4).
 * 2. Override=false — desliga a capability com source="override" (runtime N4).
 * 3. Wiring real — cada superfície passa exatamente as props de gate ao
 *    PaymentModal a partir de `pdvCapabilities.isEnabled(...)` (drift guard
 *    estático; nada aqui muda o wiring).
 * 4. Defaults do modal — paridade pré-N4 preservada (true nos 3 gates).
 * 5. N5-B1 R2 — GAP-P2-02 CORRIGIDO: as 4 superfícies oficiais consomem
 *    `meta.creditDoc` via `resolveCreditAttribution` (helper compartilhado).
 *    GAP-P2-03 CORRIGIDO: gates de pagamento fail-closed AUDÍVEL (feedback com
 *    cooldown) + controles visíveis desabilitados quando apropriado.
 */
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { PAYMENT_PARITY_CAPABILITY_KEYS, BORDER_RUNTIME_CAPABILITY_KEYS, OFFICIAL_SURFACE_FIXTURES, fixtureFor } from "./parity-fixtures"
import { resolveCapability } from "./resolve-capability"
import type { CapabilityOverridesV1 } from "./capability-types"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")

function read(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8")
}

const MODAL = "components/dashboard/vendas/payment-modal.tsx"

describe("F-01 — default parity das capabilities de pagamento", () => {
  it("fixtures cobrem exatamente as 4 superfícies oficiais", () => {
    expect(OFFICIAL_SURFACE_FIXTURES).toHaveLength(4)
    expect(fixtureFor("classic").surfaceId).toBe("classic")
  })

  for (const fixture of OFFICIAL_SURFACE_FIXTURES) {
    it(`${fixture.surfaceId}: 4 chaves de pagamento habilitadas por default`, () => {
      for (const key of PAYMENT_PARITY_CAPABILITY_KEYS) {
        const resolved = resolveCapability({ surfaceId: fixture.surfaceId, capabilityKey: key })
        expect(resolved.supported, `${fixture.surfaceId}/${key} suportada`).toBe(true)
        expect(resolved.enabled, `${fixture.surfaceId}/${key} default ligado`).toBe(true)
        expect(resolved.source).toBe("default")
      }
    })

    it(`${fixture.surfaceId}: override=false desliga cada chave (sem elevar unsupported)`, () => {
      for (const key of PAYMENT_PARITY_CAPABILITY_KEYS) {
        const resolved = resolveCapability({
          surfaceId: fixture.surfaceId,
          capabilityKey: key,
          overrides: { [key]: false } as CapabilityOverridesV1,
        })
        expect(resolved.enabled, `${fixture.surfaceId}/${key} override=false`).toBe(false)
        expect(resolved.source).toBe("override")
      }
    })
  }

  it("capabilities fora das 4 chaves continuam não suportadas em toda superfície (U-01/U-02)", () => {
    for (const fixture of OFFICIAL_SURFACE_FIXTURES) {
      for (const key of ["pdv.filmLookup", "pdv.osLookup"]) {
        const resolved = resolveCapability({ surfaceId: fixture.surfaceId, capabilityKey: key })
        expect(resolved.supported, `${fixture.surfaceId}/${key} unsupported_by_design`).toBe(false)
        expect(resolved.enabled).toBe(false)
      }
    }
  })

  it("chaves de runtime de borda (heldSales/customerSearch) têm default parity nas 4", () => {
    for (const fixture of OFFICIAL_SURFACE_FIXTURES) {
      for (const key of BORDER_RUNTIME_CAPABILITY_KEYS) {
        const resolved = resolveCapability({ surfaceId: fixture.surfaceId, capabilityKey: key })
        expect(resolved.supported, `${fixture.surfaceId}/${key}`).toBe(true)
        expect(resolved.enabled, `${fixture.surfaceId}/${key} default ligado`).toBe(true)
      }
    }
  })

  it("B-04 (SURFACE_SPECIFIC): Venda Completa exige cliente; demais tratam como opcional", () => {
    const completa = read(fixtureFor("venda-completa").componentPath)
    expect(completa).toContain("Cliente obrigatório")
    // Diferença intencional preservada: NÃO é gap e NÃO deve ser 'corrigida'.
  })
})

describe("F-01 — wiring real das props do PaymentModal (drift guard estático)", () => {
  it("PaymentModal declara os 3 gates com default true (paridade pré-N4)", () => {
    const source = read(MODAL)
    expect(source).toContain("discountsEnabled?: boolean")
    expect(source).toContain("storeCreditEnabled?: boolean")
    expect(source).toContain("allowMultiplePayments?: boolean")
    expect(source).toContain("discountsEnabled = true")
    expect(source).toContain("storeCreditEnabled = true")
    expect(source).toContain("allowMultiplePayments = true")
  })

  it("modal filtra credito_vale com storeCreditEnabled=false e formas não-múltiplas no split", () => {
    const source = read(MODAL)
    expect(source).toContain('f.id !== "credito_vale"')
    expect(source).toContain("permitirNoMultiplo")
  })

  for (const fixture of OFFICIAL_SURFACE_FIXTURES) {
    it(`${fixture.surfaceId}: props de gate derivam de pdvCapabilities.isEnabled`, () => {
      const source = read(fixture.componentPath)
      expect(source).toContain("discountsEnabled={discountsEnabled}")
      expect(source).toContain("storeCreditEnabled={storeCreditEnabled}")
      expect(source).toContain("allowMultiplePayments={")
      expect(source).toContain('const discountsEnabled = pdvCapabilities.isEnabled("pdv.discounts")')
      expect(source).toContain('const storeCreditEnabled = pdvCapabilities.isEnabled("pdv.customerStoreCredit")')
      expect(source).toContain('"pdv.multiplePayments")')
    })

    it(`${fixture.surfaceId}: usa usePdvCapabilities com surfaceId próprio (D-01)`, () => {
      const source = read(fixture.componentPath)
      expect(source).toContain(`usePdvCapabilities("${fixture.surfaceId}")`)
    })
  }
})

describe("F-01 — R2: creditDoc consumido em TODAS as superfícies oficiais (GAP-P2-02 corrigido)", () => {
  const ATTRIB = "resolveCreditAttribution"

  it("modal declara o contrato: creditDoc é meta do onConfirm + requireExplicitResult disponível", () => {
    const source = read(MODAL)
    expect(source).toContain("creditDoc?: string")
    expect(source).toContain("requireExplicitResult?: boolean")
  })

  for (const fixture of OFFICIAL_SURFACE_FIXTURES) {
    it(`${fixture.surfaceId}: consome meta.creditDoc via helper compartilhado (seed local + doc da venda)`, () => {
      const source = read(fixture.componentPath)
      expect(source, `${fixture.surfaceId}: resolve a atribuição pelo helper`).toContain(ATTRIB)
      expect(source, `${fixture.surfaceId}: semeia saldo local do titular`).toContain("sincronizarCreditoLocal")
      // Sem cross-store/saldo fora da autoridade: o helper não recebe storeId
      // e a superfície não altera ledger por conta própria.
      expect(source, `${fixture.surfaceId}: seed condicionado ao retorno do helper`).toContain("seedLocalCredit")
    })
  }

  it("precedência do cliente selecionado: clienteId só vai quando a venda é DELE", () => {
    for (const fixture of OFFICIAL_SURFACE_FIXTURES) {
      const source = read(fixture.componentPath)
      expect(
        source,
        `${fixture.surfaceId}: clienteId condicionado a belongsToSelectedCustomer`,
      ).toContain("belongsToSelectedCustomer")
    }
  })
})

describe("F-01 — R2: gates de pagamento fail-closed AUDÍVEL (GAP-P2-03 corrigido)", () => {
  it("modal: adicionar 2ª forma com allowMultiplePayments=false produz feedback (sem retorno silencioso)", () => {
    const source = read(MODAL)
    const addFn = source.slice(source.indexOf("const handleAddPayment"), source.indexOf("useEffect(() => {\n    if (!isOpen || !instantPayIntent) return"))
    expect(addFn).toContain("!allowMultiplePayments && payments.length > 0")
    expect(addFn, "feedback audível no gate do modal").toContain('notifyBlocked("pdv.multiplePayments"')
  })

  it("Classic: openPaymentFlow audível nos dois gates (F1/F10/F12 cobertos)", () => {
    const classic = read(fixtureFor("classic").componentPath)
    const openFlow = classic.slice(classic.indexOf("const openPaymentFlow"), classic.indexOf("const openShellShortcut"))
    expect(openFlow).toContain('notifyBlocked("sales.paymentMethods"')
    expect(openFlow).toContain('notifyBlocked("pdv.multiplePayments"')
  })

  it("Assistência: gates audíveis + botões de forma desabilitados com paymentMethods off", () => {
    const assist = read(fixtureFor("assistencia").componentPath)
    expect(assist).toContain('notifyBlocked("sales.paymentMethods"')
    expect(assist).toContain('notifyBlocked("pdv.multiplePayments"')
    expect(assist, "controle visível desabilitado quando apropriado").toContain(
      "discountOverTotal || !payMethodsEnabled",
    )
  })

  it("Supermercado: openPaymentModal/openMultipayModal audíveis + botões rápidos desabilitados", () => {
    const superSrc = read(fixtureFor("supermercado").componentPath)
    expect(superSrc).toContain('notifyBlocked("sales.paymentMethods"')
    expect(superSrc).toContain('notifyBlocked("pdv.multiplePayments"')
    expect(superSrc, "controle visível desabilitado quando apropriado").toContain("disabled={!payMethodsEnabled}")
  })

  it("Venda Completa: finalizar audível com paymentMethods off (F1/botão pelo mesmo handler)", () => {
    const completa = read(fixtureFor("venda-completa").componentPath)
    expect(completa).toContain('notifyBlocked("sales.paymentMethods"')
    expect(completa).toContain("const payMethodsEnabled = pdvCapabilities.isEnabled(\"sales.paymentMethods\")")
  })
})
