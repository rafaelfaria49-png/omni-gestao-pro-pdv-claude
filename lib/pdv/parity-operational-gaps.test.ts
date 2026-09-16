/**
 * N5-B1 — Unit tests dos helpers puros de paridade operacional.
 *
 * - `sale-credit-holder` (GAP-P2-02): titular do crédito/vale;
 * - `weight-unit-price` (GAP-P2-05): preço efetivo por peso;
 * - `capability-blocked-feedback` (GAP-P2-03): copy + cooldown do fail-closed audível.
 */
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { resolveSaleCreditHolder } from "./sale-credit-holder"
import { effectiveWeightUnitPrice } from "./weight-unit-price"
import {
  BLOCKED_CAPABILITY_TOAST_COOLDOWN_MS,
  BLOCKED_PAYMENT_CAPABILITY_COPY,
  shouldNotifyBlockedCapability,
} from "./capability-blocked-feedback"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")

function read(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8")
}

describe("GAP-P2-02 — resolveSaleCreditHolder", () => {
  const VALE = [{ type: "credito_vale" }]
  const DINHEIRO = [{ type: "dinheiro" }]

  it("sem vale localizado: cliente selecionado tem precedência, sem semente local", () => {
    const r = resolveSaleCreditHolder({
      payments: DINHEIRO,
      selectedCpf: "123",
      selectedName: "Ana",
      storeCreditEnabled: true,
    })
    expect(r.cpf).toBe("123")
    expect(r.nome).toBe("Ana")
    expect(r.seedLocal).toBeNull()
  })

  it("vale localizado + usado: associa o documento localizado e pede semente local", () => {
    const r = resolveSaleCreditHolder({
      payments: VALE,
      creditDoc: "987.654.321-00",
      creditNome: "Beto",
      creditSaldo: 50,
      selectedCpf: "123",
      selectedName: "Ana",
      storeCreditEnabled: true,
    })
    expect(r.cpf).toBe("98765432100")
    expect(r.nome).toBe("Beto")
    expect(r.seedLocal).toEqual({ doc: "98765432100", nome: "Beto", saldo: 50 })
  })

  it("vale localizado mas NÃO usado: mantém o cliente selecionado", () => {
    const r = resolveSaleCreditHolder({
      payments: DINHEIRO,
      creditDoc: "98765432100",
      creditNome: "Beto",
      creditSaldo: 50,
      selectedCpf: "123",
      selectedName: "Ana",
      storeCreditEnabled: true,
    })
    expect(r.cpf).toBe("123")
    expect(r.seedLocal).toBeNull()
  })

  it("capability desabilitada: nunca resolve via documento", () => {
    const r = resolveSaleCreditHolder({
      payments: VALE,
      creditDoc: "98765432100",
      creditNome: "Beto",
      creditSaldo: 50,
      selectedCpf: "123",
      selectedName: "Ana",
      storeCreditEnabled: false,
    })
    expect(r.cpf).toBe("123")
    expect(r.seedLocal).toBeNull()
  })

  it("sem cliente e sem vale: não inventa titular", () => {
    const r = resolveSaleCreditHolder({
      payments: DINHEIRO,
      storeCreditEnabled: true,
    })
    expect(r.cpf).toBeUndefined()
    expect(r.nome).toBeUndefined()
    expect(r.seedLocal).toBeNull()
  })
})

describe("GAP-P2-05 — effectiveWeightUnitPrice", () => {
  it("aceita preço por kg válido (inclui fração)", () => {
    expect(effectiveWeightUnitPrice(12.5, 10)).toBe(12.5)
  })

  it("cai para price quando precoPorKg é nulo", () => {
    expect(effectiveWeightUnitPrice(null, 9.9)).toBe(9.9)
    expect(effectiveWeightUnitPrice(undefined, 9.9)).toBe(9.9)
  })

  it("rejeita zero, negativo, NaN e ausente (nunca vira linha R$0)", () => {
    expect(effectiveWeightUnitPrice(0, 10)).toBeNull()
    expect(effectiveWeightUnitPrice(-3, 10)).toBeNull()
    expect(effectiveWeightUnitPrice(NaN, 10)).toBeNull()
    expect(effectiveWeightUnitPrice(null, 0)).toBeNull()
    expect(effectiveWeightUnitPrice(null, null)).toBeNull()
    expect(effectiveWeightUnitPrice(undefined, undefined)).toBeNull()
    expect(effectiveWeightUnitPrice(null, Number.NaN)).toBeNull()
  })
})

describe("GAP-P2-03 — fail-closed audível", () => {
  it("copy compartilhada existe para as 2 capabilities (sem entitlement novo)", () => {
    expect(BLOCKED_PAYMENT_CAPABILITY_COPY["sales.paymentMethods"].title).toContain("indisponível")
    expect(BLOCKED_PAYMENT_CAPABILITY_COPY["pdv.multiplePayments"].title).toContain("múltiplo")
    for (const copy of Object.values(BLOCKED_PAYMENT_CAPABILITY_COPY)) {
      expect(copy.description.length).toBeGreaterThan(10)
    }
  })

  it("cooldown barra toast repetido de tecla/race e libera após a janela", () => {
    expect(shouldNotifyBlockedCapability(Number.NaN, 1000)).toBe(true)
    // Ref zerado (nunca notificou) diante de relógio real: libera.
    expect(shouldNotifyBlockedCapability(0, 1_700_000_000_000)).toBe(true)
    expect(shouldNotifyBlockedCapability(1000, 1000 + BLOCKED_CAPABILITY_TOAST_COOLDOWN_MS - 1)).toBe(false)
    expect(shouldNotifyBlockedCapability(1000, 1000 + BLOCKED_CAPABILITY_TOAST_COOLDOWN_MS)).toBe(true)
  })
})

describe("N5-B1 — wiring estático dos fixes nas superfícies", () => {
  it("GAP-P2-05: Super valida preço efetivo ANTES de adicionar a linha por peso", () => {
    const source = read("components/dashboard/vendas/pdv-supermercado.tsx")
    expect(source).toContain("effectiveWeightUnitPrice(weightProduct.precoPorKg, weightProduct.price)")
    const guardIdx = source.indexOf("if (pKg === null) {")
    expect(guardIdx).toBeGreaterThan(-1)
    const guard = source.slice(guardIdx, guardIdx + 500)
    expect(guard).toContain("Preço por kg inválido")
    expect(guard).toContain("return")
    // O diálogo permanece aberto (sem setWeightDialogOpen(false) no bloqueio).
    expect(guard).not.toContain("setWeightDialogOpen(false)")
  })

  it("GAP-P2-02: Super e VC associam cpfDaVenda/nomeDaVenda na venda e no cupom", () => {
    const superSrc = read("components/dashboard/vendas/pdv-supermercado.tsx")
    expect(superSrc).toContain("const cpfDaVenda = creditHolder.cpf")
    expect(superSrc).toContain("customerCpf: cpfDaVenda")
    expect(superSrc).toContain("clienteCpf: cpfDaVenda")
    const vc = read("components/dashboard/vendas/venda-completa-enterprise.tsx")
    expect(vc).toContain("const cpfDaVenda = creditHolder.cpf")
    expect(vc).toContain("customerCpf: cpfDaVenda")
    expect(vc).toContain("clienteCpf: cpfDaVenda")
  })

  it("GAP-P1-01: VC não tem mais reset parcial inline", () => {
    const vc = read("components/dashboard/vendas/venda-completa-enterprise.tsx")
    expect(vc.split("function resetFreshSaleState()").length - 1).toBe(1)
    expect(vc).toContain("setShowClearSaleConfirm(true)")
  })
})
