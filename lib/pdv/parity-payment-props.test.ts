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
 * 5. Gaps N5-B1 corrigidos: GAP-P2-02 (fallback creditDoc via contrato
 *    compartilhado `resolveSaleCreditHolder` no Classic/Super/VC) e GAP-P2-03
 *    (fail-closed audível: toast com cooldown + entries desabilitados/ocultos).
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
  const MODAL = "components/dashboard/vendas/payment-modal.tsx"

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

describe("F-01 — GAP-P2-02=FIXED (fallback creditDoc uniforme via helper)", () => {
  it("Classic, Super e VC resolvem o titular via resolveSaleCreditHolder (meta?.creditDoc)", () => {
    for (const surfaceId of ["classic", "supermercado", "venda-completa"] as const) {
      const source = read(fixtureFor(surfaceId).componentPath)
      expect(source, `${surfaceId}: usa o contrato compartilhado`).toContain("resolveSaleCreditHolder({")
      expect(source, `${surfaceId}: lê meta?.creditDoc`).toContain("meta?.creditDoc")
      expect(source, `${surfaceId}: semeia saldo local`).toContain("sincronizarCreditoLocal(")
      expect(source, `${surfaceId}: respeita customerStoreCredit`).toContain("storeCreditEnabled")
    }
  })

  it("cliente selecionado mantém precedência fora do vale; sem invenção de cliente", () => {
    const helper = read("lib/pdv/sale-credit-holder.ts")
    expect(helper).toContain("selectedCpf")
    expect(helper).toContain("seedLocal: null")
    expect(helper).toContain("normalizeDocDigits")
    expect(helper).not.toContain("loja-1")
  })
})

describe("F-01 — GAP-P2-03=FIXED (fail-closed audível, sem botão quebrado)", () => {
  it("GAP-P2-03=FIXED: Classic bloqueia com feedback (sem silêncio)", () => {
    const classic = read(fixtureFor("classic").componentPath)
    const openFlow = classic.slice(classic.indexOf("const openPaymentFlow"), classic.indexOf("const openShellShortcut"))
    expect(openFlow).toContain('!pdvCapabilities.isEnabled("sales.paymentMethods")')
    expect(openFlow).toContain('multiple && !pdvCapabilities.isEnabled("pdv.multiplePayments")')
    expect(openFlow).toContain("return false")
    // O GAP era o silêncio: agora há feedback com cooldown entre o gate e o return.
    const gateBlock = openFlow.slice(0, openFlow.indexOf("if (!validateBeforeOpenPayment())"))
    expect(gateBlock, "feedback audível no bloqueio").toContain("notifyPaymentCapabilityBlocked(")
  })

  it("GAP-P2-03=FIXED: Assistência, Super e VC emitem feedback no bloqueio", () => {
    for (const surfaceId of ["assistencia", "supermercado", "venda-completa"] as const) {
      const source = read(fixtureFor(surfaceId).componentPath)
      expect(source, `${surfaceId}: gate paymentMethods presente`).toContain('isEnabled("sales.paymentMethods")')
      expect(source, `${surfaceId}: feedback no bloqueio`).toContain('notifyPaymentCapabilityBlocked("sales.paymentMethods")')
    }
    const assist = read(fixtureFor("assistencia").componentPath)
    expect(assist).toContain('notifyPaymentCapabilityBlocked("pdv.multiplePayments")')
    const superSrc = read(fixtureFor("supermercado").componentPath)
    expect(superSrc).toContain('notifyPaymentCapabilityBlocked("pdv.multiplePayments")')
  })

  it("GAP-P2-03=FIXED: entries de pagamento disabled/ocultos com capability off", () => {
    // Assistência: grid desabilita (incl. Múltiplo individual).
    const assist = read(fixtureFor("assistencia").componentPath)
    expect(assist).toContain("|| !paymentMethodsEnabled || (m.id === \"multiplo\" && !multiplePaymentsEnabled)")
    // Supermercado: quick buttons desabilitados; Múltiplo já era oculto quando off.
    const superSrc = read(fixtureFor("supermercado").componentPath)
    expect(superSrc).toContain("disabled={!paymentMethodsEnabled}")
    expect(superSrc).toContain('pdvCapabilities.isEnabled("pdv.multiplePayments") ? (')
    // Venda Completa: Finalizar desabilita via canFinalize; sem F12 (só modal).
    const completa = read(fixtureFor("venda-completa").componentPath)
    expect(completa).toContain("caixa.isOpen && paymentMethodsEnabled")
    // Modal compartilhado: split some quando allowMultiplePayments=false.
    const modal = read("components/dashboard/vendas/payment-modal.tsx")
    expect(modal).toContain("multipayHint && allowMultiplePayments && faltaPagar")
  })

  it("GAP-P2-03=FIXED: copy compartilhada com cooldown (sem toast em render)", () => {
    const helper = read("lib/pdv/capability-blocked-feedback.ts")
    expect(helper).toContain("BLOCKED_PAYMENT_CAPABILITY_COPY")
    expect(helper).toContain("shouldNotifyBlockedCapability")
    for (const surfaceId of ["classic", "assistencia", "supermercado", "venda-completa"] as const) {
      const source = read(fixtureFor(surfaceId).componentPath)
      expect(source, `${surfaceId}: cooldown anti-spam`).toContain("shouldNotifyBlockedCapability(")
      expect(source, `${surfaceId}: ref de cooldown`).toContain("blockedCapabilityToastAt")
    }
  })
})
