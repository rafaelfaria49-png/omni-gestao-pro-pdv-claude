/**
 * D01-A1 — as duas telas de reimpressão (Histórico de vendas e Conferência do caixa) entregam a loja ao diálogo do cupom,
 * que só então pode usar o registro de impressões. Sem esta ligação a reimpressão voltaria a sair sem registro e sem marca.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const read = (rel: string) => readFileSync(path.resolve(__dirname, "../../..", rel), "utf8")

describe("reimpressão registrada (D01-A1) · ligação das telas", () => {
  it("Histórico de vendas passa a loja ao CupomNaoFiscal", () => {
    expect(read("components/dashboard/vendas/vendas-arquivo-geral.tsx")).toMatch(/<CupomNaoFiscal[\s\S]{0,200}reprintStoreId=\{storeId\}/)
  })
  it("Conferência do caixa passa a loja ao CupomNaoFiscal", () => {
    expect(read("components/dashboard/caixa/conferencia-caixa.tsx")).toMatch(/<CupomNaoFiscal[\s\S]{0,200}reprintStoreId=\{storeId\}/)
  })
  it("o diálogo só usa o registro com loja, id da venda e impressão direta ligada; o fluxo antigo continua para os demais", () => {
    const src = read("components/dashboard/vendas/cupom-nao-fiscal.tsx")
    expect(src).toMatch(/registered = !!reprintStoreId && !!data\.vendaId && impressaoConfig\.impressaoDireta && !autoPrint/)
    expect(src).toMatch(/\{!registered && <Button/)
    expect(src).toMatch(/\{!registered && printError &&/)
  })
  it("Venda Completa (outros PDVs) não recebe a reimpressão registrada", () => {
    for (const f of ["components/dashboard/vendas/venda-completa-enterprise.tsx", "components/dashboard/vendas/pdv-venda-completa-enterprise.tsx"])
      expect(read(f)).not.toMatch(/reprintStoreId/)
  })
})
