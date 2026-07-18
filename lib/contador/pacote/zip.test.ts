/**
 * Contador HUB · Pacote do Contador (GOAL 008 · 008B) — compactação ZIP (jszip).
 *
 * Round-trip (conteúdo intacto), estrutura fixa de 14 caminhos, ausência dos caminhos
 * antigos e de path traversal, e integridade ponta a ponta (hash do manifesto == bytes no ZIP).
 */
import { describe, it, expect } from "vitest"
import JSZip from "jszip"
import { resolvePeriodoUtc } from "@/lib/contador/competencia"
import { montarDados } from "@/lib/contador/readers"
import { montarChecklistFechamento } from "@/lib/contador/fechamento"
import type { ContadorScopeInterno } from "@/lib/contador/scope-core"
import { carregarFontesPacoteComCliente, type PacoteReaderClient } from "./carregar-fontes"
import { montarConteudoPacote } from "./builder"
import { ziparArquivos } from "./zip"
import { sha256Hex } from "./seguranca"
import type { ArquivoPacote } from "./tipos"

const agora = new Date("2026-07-16T12:00:00.000Z")

describe("ziparArquivos", () => {
  it("compacta e o conteúdo dos arquivos volta intacto (acentos, subpastas numeradas)", async () => {
    const arquivos: ArquivoPacote[] = [
      { caminho: "01-VENDAS/vendas.csv", categoria: "csv", fonte: "vendas", descricao: "", conteudo: "olá, çãé — mundo\r\n" },
      { caminho: "manifest.json", categoria: "manifesto", fonte: "manifesto", descricao: "", conteudo: '{"x":1}\n' },
    ]
    const bytes = await ziparArquivos(arquivos, agora)
    expect(bytes).toBeInstanceOf(Uint8Array)
    const zip = await JSZip.loadAsync(bytes)
    expect(await zip.file("01-VENDAS/vendas.csv")!.async("string")).toBe("olá, çãé — mundo\r\n")
    expect(await zip.file("manifest.json")!.async("string")).toBe('{"x":1}\n')
  })
})

describe("Pacote 008B — ZIP com estrutura fixa e integridade", () => {
  const competencia = { ano: 2026, mes: 6 }
  const periodo = resolvePeriodoUtc(competencia)
  const scope = { ok: true, storeId: "loja-1", userId: "u1", permissaoFinanceiro: true } as unknown as ContadorScopeInterno
  const J = (d: string) => new Date(`2026-06-${d}T12:00:00.000Z`)

  const cliente: PacoteReaderClient = {
    venda: {
      findMany: async () => [
        { id: "v1", pedidoId: "VDA-1", total: 100, status: "concluida", at: J("10"), payload: { paymentBreakdown: { pix: 100 } }, itens: [{ id: "i1", inventoryId: "p1", nome: "A", quantidade: 1, precoUnitario: 100, lineTotal: 100 }] },
      ],
    },
    produto: { findMany: async () => [{ id: "p1", sku: "SKU-A", barcode: null }] },
    devolucaoVenda: { findMany: async () => [{ id: "d1", localId: "DEV-1", vendaLocalId: "VDA-1", tipo: "vale_credito", valorTotal: 10, at: J("12") }] },
    movimentacaoFinanceira: { findMany: async () => [{ id: "m1", tipo: "entrada", origem: "venda", valor: 100, createdAt: J("10") }] },
    contaReceberTitulo: { findMany: async () => [{ id: "r1", valor: 30, status: "pendente", vencimento: "2026-06-10" }] },
    contaPagarTitulo: { findMany: async () => [{ id: "pg1", valor: 15, status: "pendente", vencimento: "20/06/2026" }] },
    sessaoCaixa: { findMany: async () => [{ id: "s1", status: "FECHADA", saldoInicial: 100, saldoFinal: 100, saldoContado: 101, abertaEm: J("10"), fechadaEm: J("10") }] },
    caixaOperacao: { findMany: async () => [{ id: "o1", sessaoId: "s1", tipo: "sangria", valor: 5, at: J("10") }] },
  }

  const EXATOS = [
    "00-LEIA-ME/indice.md",
    "00-LEIA-ME/pendencias.md",
    "00-LEIA-ME/resumo.md",
    "01-VENDAS/devolucoes.csv",
    "01-VENDAS/itens.csv",
    "01-VENDAS/vendas.csv",
    "02-FINANCEIRO/contas_pagar.csv",
    "02-FINANCEIRO/contas_receber.csv",
    "02-FINANCEIRO/movimentacoes.csv",
    "03-CAIXA/operacoes.csv",
    "03-CAIXA/sessoes.csv",
    "04-DOCUMENTOS/LEIA-ME.md",
    "05-XML/LEIA-ME.md",
    "manifest.json",
  ]

  async function pacote() {
    const detalhadas = await carregarFontesPacoteComCliente(scope, periodo, competencia, cliente)
    const dados = montarDados(detalhadas.agregado, competencia)
    const checklist = montarChecklistFechamento({ dados, competencia, agora })
    return montarConteudoPacote({ detalhadas, dados, checklist, competencia, agora, storeId: "loja-1", userId: "u1" })
  }

  it("o ZIP contém exatamente os 14 caminhos, sem os antigos nem path traversal", async () => {
    const conteudo = await pacote()
    const bytes = await ziparArquivos(conteudo.arquivos, agora)
    const zip = await JSZip.loadAsync(bytes)
    const nomes = Object.keys(zip.files).filter((n) => !zip.files[n].dir).sort()
    expect(nomes).toEqual([...EXATOS].sort())
    for (const antigo of ["RESUMO.md", "AVISOS-E-PENDENCIAS.md", "csv/vendas.csv", "documentos/LEIA-ME.md", "notas-fiscais-xml/LEIA-ME.md"]) {
      expect(nomes).not.toContain(antigo)
    }
    for (const n of nomes) {
      expect(n.startsWith("/")).toBe(false)
      expect(n).not.toContain("..")
      expect(n).not.toMatch(/^[A-Za-z]:/)
    }
  })

  it("cada arquivo do ZIP tem exatamente o sha256 declarado no manifesto", async () => {
    const conteudo = await pacote()
    const bytes = await ziparArquivos(conteudo.arquivos, agora)
    const zip = await JSZip.loadAsync(bytes)
    for (const entrada of conteudo.manifesto.arquivos) {
      const c = await zip.file(entrada.caminho)!.async("string")
      expect(sha256Hex(c), `hash ${entrada.caminho}`).toBe(entrada.sha256)
    }
  })
})
