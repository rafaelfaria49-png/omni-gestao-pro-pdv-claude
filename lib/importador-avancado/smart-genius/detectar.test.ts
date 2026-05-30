// ============================================================
// Testes do detector Smart Genius — inclui testes NEGATIVOS obrigatórios
// (Gestão Clique e Smart Produtos NÃO podem casar).
// ============================================================

import { describe, it, expect } from "vitest"
import { detectarSmartLayout } from "./detectar"

// Amostras reais (estrutura fiel aos .xls de migração).
const GRADE_CLIENTES: unknown[][] = [
  [null, null, null, null, null, "Listagem de Clientes", null, null, "Data de Emissão: ", null, "29/05/2026"],
  ["Codigo", null, null, null, null, null, "Telefone", null, null, "Cidade", null],
  [null, "Nome", null, null, null, null, null, null, null, null, null],
  [28, "ADRIANA CRISTINA DOS SANTOS DE", null, null, null, null, "(41)99560-9896", null, null, "Taguaí", null],
  [46, "ADRIANA CRISTINA MARTINS", null, null, null, null, null, null, null, null, null],
]

const GRADE_CONTAS: unknown[][] = [
  ["Listagem de Contas a Receber", null, null, null, null, null, null, null, null, null, null, null, null, "Data de Emissão: ", "29/05/2026"],
  ["Código:", null, "Nome:", "Telefone:", null, "Ult. Pag:", "Menor Venc:", "Atraso:", null, "Em atraso:", "A vencer:", null, "Total:", "Reaj:", "Tot. Reaj:"],
  [46, null, "ADRIANA CRISTINA MARTINS", "(14)9961-05798", null, null, "21/04/2025", 403, null, 199.9, 0, null, 199.9, 51.97, 251.87],
]

describe("detectarSmartLayout — positivos", () => {
  it("detecta Smart Clientes com cabeçalho em 2 linhas", () => {
    const d = detectarSmartLayout(GRADE_CLIENTES, "RELATORIO DE CLIENTES CADASTRADOS.xls")
    expect(d).not.toBeNull()
    expect(d!.layout).toBe("smart_clientes")
    expect(d!.headerRow).toBe(1)
    expect(d!.headerRowExtra).toBe(2) // "Nome" caiu na linha seguinte
  })

  it("detecta Smart Contas a Receber (banner na linha 0, header na 1)", () => {
    const d = detectarSmartLayout(GRADE_CONTAS, "RELATORIO DE CONTAS Á RECEBER.xls")
    expect(d).not.toBeNull()
    expect(d!.layout).toBe("smart_contas_receber")
    expect(d!.headerRow).toBe(1)
    expect(d!.headerRowExtra).toBeNull()
  })
})

describe("detectarSmartLayout — negativos (regressão: NÃO casar)", () => {
  it("não casa Gestão Clique (cabeçalho na linha 0, sem banner Listagem)", () => {
    const gc: unknown[][] = [
      ["Código", "Código de barra", "Grupo", "Produto", "Valor de custo", "Estoque atual", "Valor Varejo", "Código NCM"],
      ["10", "7891234567890", "BEBIDAS", "AGUA MINERAL", "1,20", "50", "2,50", "22011000"],
    ]
    expect(detectarSmartLayout(gc, "produtos.xlsx")).toBeNull()
  })

  it("não casa Smart Genius Produtos (sem banner Listagem de Clientes/Contas)", () => {
    const sgProd: unknown[][] = [
      ["Codigo", "Produto", "Unid.", "Custo R$", "Venda R$", "Estoque", "Lucro %"],
      ["1", "PARAFUSO", "UN", "0,50", "1,00", "100", "50"],
    ]
    expect(detectarSmartLayout(sgProd, "RELATORIO DE PRODUTOS.xls")).toBeNull()
  })

  it("não casa relatório genérico GestãoClick com 'Relatório de…'", () => {
    const generico: unknown[][] = [
      ["Relatório de Vendas", null, null, "Data: 01/01/2026"],
      ["Nº do pedido", "Cliente", "Total do pedido"],
      ["131", "FULANO", "100,00"],
    ]
    expect(detectarSmartLayout(generico, "vendas.xls")).toBeNull()
  })

  it("retorna null para grade vazia", () => {
    expect(detectarSmartLayout([], "x.xls")).toBeNull()
    expect(detectarSmartLayout([[null, null]], "x.xls")).toBeNull()
  })
})
