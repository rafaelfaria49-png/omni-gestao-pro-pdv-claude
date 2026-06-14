/**
 * INVENTARIO_ASSISTIDO_V1 — Fase 5. Testes das funções PURAS de exportação.
 */
import { describe, expect, it } from "vitest"
import {
  construirPlanilhasInventario,
  montarCsv,
  nomeArquivoExport,
  type RelatorioExportInput,
} from "./inventario-export"

const rel: RelatorioExportInput = {
  encontrados: [
    { nome: "Boneca", sku: "BON", codigo: "789", estoqueSistema: 5, quantidadeContada: 5, diferenca: 0, ajusteAplicado: false },
    { nome: "Carrinho", sku: null, codigo: "555", estoqueSistema: 3, quantidadeContada: 1, diferenca: -2, ajusteAplicado: true },
  ],
  divergencias: [
    { nome: "Carrinho", sku: null, codigo: "555", estoqueSistema: 3, quantidadeContada: 1, diferenca: -2, ajusteAplicado: true },
  ],
  reconciliacao: [
    { codigoBipado: "9999", quantidadeContada: 2, ultimoBipeEm: "2026-06-14T10:00:00.000Z", classificacao: "localizado" },
  ],
  naoBipados: [
    { nome: "Pião", sku: "PIA", codigo: "111", estoqueSistema: 7, ajusteAplicado: false },
  ],
}

describe("construirPlanilhasInventario", () => {
  it("cria 4 abas A/B/C/D na ordem certa", () => {
    const abas = construirPlanilhasInventario(rel)
    expect(abas.map((a) => a.nome)).toEqual([
      "A - Conferidos",
      "B - Divergências",
      "C - Reconciliação",
      "D - Não encontrados",
    ])
  })
  it("aba A tem cabeçalho + 1 linha por conferido", () => {
    const [a] = construirPlanilhasInventario(rel)
    expect(a.linhas[0]).toEqual(["Produto", "SKU", "Código", "Estoque sistema", "Contado", "Diferença", "Ajustado"])
    expect(a.linhas).toHaveLength(3) // header + 2
    expect(a.linhas[2]).toEqual(["Carrinho", "", "555", 3, 1, -2, "Sim"])
  })
  it("aba C usa classificação e data", () => {
    const c = construirPlanilhasInventario(rel)[2]
    expect(c.linhas[1]).toEqual(["9999", 2, "2026-06-14T10:00:00.000Z", "localizado"])
  })
  it("aba D marca zerado por ausência", () => {
    const d = construirPlanilhasInventario(rel)[3]
    expect(d.linhas[1]).toEqual(["Pião", "PIA", "111", 7, "Não"])
  })
})

describe("montarCsv", () => {
  it("inclui título de cada aba e separa por ;", () => {
    const csv = montarCsv(construirPlanilhasInventario(rel))
    expect(csv).toContain("# A - Conferidos")
    expect(csv).toContain("# B - Divergências")
    expect(csv).toContain("# C - Reconciliação")
    expect(csv).toContain("# D - Não encontrados")
    expect(csv).toContain("Produto;SKU;Código")
  })
  it("escapa campos com separador/aspas", () => {
    const csv = montarCsv([{ nome: "X", linhas: [["a;b", 'diz "oi"']] }])
    expect(csv).toContain('"a;b"')
    expect(csv).toContain('"diz ""oi"""')
  })
})

describe("nomeArquivoExport", () => {
  it("slug a partir do nome (sem acento/espaço) + extensão", () => {
    expect(nomeArquivoExport({ id: "s1", nome: "Contagem Geral — Junho" }, "xlsx")).toBe("inventario-contagem-geral-junho.xlsx")
    expect(nomeArquivoExport({ id: "s1", nome: "Inventário Físico" }, "csv")).toBe("inventario-inventario-fisico.csv")
  })
  it("usa o id quando sem nome", () => {
    expect(nomeArquivoExport({ id: "abc123", nome: null }, "csv")).toBe("inventario-abc123.csv")
  })
})
