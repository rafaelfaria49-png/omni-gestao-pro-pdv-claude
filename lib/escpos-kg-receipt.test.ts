// @vitest-environment jsdom
import { createElement } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { buildPdvReceiptEscPos, formatReceiptQuantity, type PdvReceiptInput } from "@/lib/escpos"
import { mapVendaDetalheToCupom } from "@/lib/vendas/venda-cupom-mapper"
import type { VendaDetalhe } from "@/lib/vendas/venda-detalhe-contract"
import { defaultPdvImpressaoConfig } from "@/lib/pdv-impressao-config"

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/lib/store-settings-provider", () => ({ useStoreSettings: () => ({ impressaoConfig: defaultPdvImpressaoConfig() }) }))

afterEach(cleanup)

const nb = (s: string) => s.replace(/ /g, " ")

describe("comprovante não fiscal com venda por peso", () => {
  it.each([[0.001, "0,001 kg"], [0.125, "0,125 kg"], [0.35, "0,350 kg"], [1.25, "1,250 kg"], [2.35, "2,350 kg"], [9.999, "9,999 kg"]])("formata %s como %s; UN mantém o legado", (q, text) => {
    expect(formatReceiptQuantity(q, "KG")).toBe(text)
    expect(formatReceiptQuantity(2)).toBe("2x")
  })

  it("ESC/POS imprime peso, preço por kg e total da linha; UN segue idêntico", () => {
    const input: PdvReceiptInput = {
      nomeFantasia: "Padaria sintética", cnpj: "", subtotal: 13, taxes: 0, discount: 0, total: 13, dataHora: "2026-11-06T12:00:00Z",
      itens: [
        { name: "Queijo", quantity: 0.35, unitPrice: 20, lineTotal: 7, quantityUnit: "KG" },
        { name: "Pão", quantity: 2, unitPrice: 3, lineTotal: 6 },
      ],
    }
    const text = nb(new TextDecoder("windows-1252").decode(buildPdvReceiptEscPos(input)))
    expect(text).toContain("0,350 kg Queijo")
    expect(text).toContain("R$ 20,00/kg = R$ 7,00")
    expect(text).toContain("2x Pão")
    expect(text).not.toMatch(/0\.35x/)
  })

  it("Histórico/Conferência: o mapeador leva a unidade KG até o cupom exibido", async () => {
    const { CupomNaoFiscal } = await import("@/components/dashboard/vendas/cupom-nao-fiscal")
    const detalhe = {
      id: "VDA-KG-1", at: "2026-11-06T12:00:00Z", total: 7, desconto: 0, status: "concluida",
      itens: [{ nome: "Queijo", quantidade: 0.35, quantityUnit: "KG", precoUnitario: 20, lineTotal: 7 }],
      pagamentos: [{ label: "Dinheiro", valor: 7 }],
    } as unknown as VendaDetalhe
    const cupom = mapVendaDetalheToCupom(detalhe, { nome: "Padaria sintética" } as never)
    expect(cupom.itens[0]).toMatchObject({ quantidade: 0.35, quantityUnit: "KG", precoUnitario: 20, lineTotal: 7 })
    render(createElement(CupomNaoFiscal, { isOpen: true, onClose: () => undefined, data: cupom }))
    expect(nb(screen.getByText(/0,350 kg/).textContent ?? "")).toContain("0,350 kg R$ 20,00/kg")
  })
})
