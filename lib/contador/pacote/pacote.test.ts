/**
 * Contador HUB · Pacote do Contador (GOAL 008) — testes puros (sem banco/ZIP).
 *
 * Constrói o DTO real via `montarDados` (mesma convenção da suíte do GOAL 006/007) e monta
 * o conteúdo do pacote com `montarConteudoPacote`. Verifica: arquivos esperados, integridade
 * (sha256/bytes do manifesto), ausência de PII/segredo, honestidade (indisponível ≠ 0),
 * CSV seguro (injeção de fórmula) e a guarda anti-vazamento.
 */
import { describe, it, expect } from "vitest"
import { montarDados, type FontesContador } from "@/lib/contador/readers"
import { montarChecklistFechamento } from "@/lib/contador/fechamento"
import { montarConteudoPacote } from "./builder"
import { montarCsv, numero, texto } from "./csv"
import {
  assertPacoteSeguro,
  bytesUtf8,
  neutralizarFormula,
  PacoteInseguroError,
  sha256Hex,
} from "./seguranca"
import type { ArquivoPacote } from "./tipos"

const competencia = { ano: 2026, mes: 6 }
const agora = new Date("2026-07-16T12:00:00.000Z")
const STORE_SENTINELA = "loja-zzz-super-secreta-42"

function fontesCompletas(): FontesContador {
  return {
    vendas: [
      {
        total: 100,
        status: "concluida",
        payload: {
          paymentBreakdown: { pix: 100 },
          discountTotal: 5,
          segredoInterno: "segredo-do-banco",
        },
      },
    ],
    devolucoes: [{ valorTotal: 10 }],
    movimentacoes: [
      { tipo: "entrada", origem: "venda", valor: 50 },
      { tipo: "saida", origem: "pagar", valor: 20 },
    ],
    receber: [{ valor: 30, status: "pendente", vencimento: "2026-06-10" }],
    pagar: [{ valor: 15, status: "pendente", vencimento: "20/06/2026" }],
    sessoes: [{ status: "fechada", saldoFinal: 100, saldoContado: 101 }],
    operacoes: [
      { tipo: "sangria", valor: 5 },
      { tipo: "suprimento", valor: 8 },
    ],
    falhas: [],
  }
}

function montar(fontes: FontesContador = fontesCompletas(), storeId = STORE_SENTINELA) {
  const dados = montarDados(fontes, competencia)
  const checklist = montarChecklistFechamento({ dados, competencia, agora })
  return montarConteudoPacote({ dados, checklist, competencia, agora, storeId })
}

function conteudoDe(pacote: ReturnType<typeof montar>, caminho: string): string {
  const arquivo = pacote.arquivos.find((a) => a.caminho === caminho)
  if (!arquivo) throw new Error(`arquivo ausente: ${caminho}`)
  return arquivo.conteudo
}

describe("Pacote do Contador — estrutura de arquivos", () => {
  it("inclui CSVs, resumo, índice, avisos, placeholders e manifesto", () => {
    const pacote = montar()
    const caminhos = pacote.arquivos.map((a) => a.caminho)
    for (const esperado of [
      "RESUMO.md",
      "AVISOS-E-PENDENCIAS.md",
      "INDICE.md",
      "manifest.json",
      "csv/resumo-competencia.csv",
      "csv/vendas.csv",
      "csv/vendas-formas-pagamento.csv",
      "csv/devolucoes.csv",
      "csv/financeiro.csv",
      "csv/caixa.csv",
      "csv/alertas.csv",
      "csv/fechamento-checklist.csv",
      "documentos/LEIA-ME.md",
      "notas-fiscais-xml/LEIA-ME.md",
    ]) {
      expect(caminhos, `faltou ${esperado}`).toContain(esperado)
    }
  })

  it("o nome do ZIP e o manifesto v1 refletem a competência", () => {
    const pacote = montar()
    expect(pacote.nomeArquivo).toBe("pacote-contador-2026-06.zip")
    expect(pacote.manifesto.versao).toBe(1)
    expect(pacote.manifesto.schema).toBe("omnigestao.contador.pacote")
    expect(pacote.manifesto.competencia).toMatchObject({ ano: 2026, mes: 6, codigo: "2026-06" })
    expect(pacote.manifesto.geradoEm).toBe(agora.toISOString())
  })

  it("os placeholders honestos deixam claro que XML e documentos não entram nesta fase", () => {
    const pacote = montar()
    expect(conteudoDe(pacote, "notas-fiscais-xml/LEIA-ME.md")).toContain("não contém XML")
    expect(conteudoDe(pacote, "notas-fiscais-xml/LEIA-ME.md")).toContain("CONTADOR_FISCAL_READER")
    expect(conteudoDe(pacote, "documentos/LEIA-ME.md")).toContain("não contém anexos")
  })
})

describe("Pacote do Contador — integridade (manifesto v1)", () => {
  it("o manifesto lista sha256 e bytes corretos de cada arquivo (menos o próprio manifest.json)", () => {
    const pacote = montar()
    const listados = pacote.manifesto.arquivos.map((a) => a.caminho)
    // manifest.json é a raiz — não se auto-referencia; INDICE.md e conteúdo estão listados.
    expect(listados).not.toContain("manifest.json")
    expect(listados).toContain("INDICE.md")

    for (const entrada of pacote.manifesto.arquivos) {
      const conteudo = conteudoDe(pacote, entrada.caminho)
      expect(sha256Hex(conteudo), `hash ${entrada.caminho}`).toBe(entrada.sha256)
      expect(bytesUtf8(conteudo), `bytes ${entrada.caminho}`).toBe(entrada.bytes)
    }
    expect(pacote.manifesto.contagem.arquivos).toBe(pacote.arquivos.length - 1)
  })

  it("consolida avisos honestos (XML fora de escopo) no manifesto", () => {
    const avisos = montar().manifesto.avisos.join(" · ")
    expect(avisos).toContain("CONTADOR_FISCAL_READER")
    expect(avisos.toLowerCase()).toContain("não é fechamento oficial")
  })
})

describe("Pacote do Contador — sem PII/segredo", () => {
  it("nenhum arquivo contém storeId, payload bruto nem o segredo do banco", () => {
    const pacote = montar()
    const tudo = pacote.arquivos.map((a) => a.conteudo).join("\n")
    expect(tudo).not.toContain(STORE_SENTINELA)
    expect(tudo).not.toContain("segredo-do-banco")
    expect(tudo).not.toContain('"payload"')
    expect(tudo).not.toContain('"storeId"')
  })
})

describe("Pacote do Contador — honestidade (indisponível nunca vira 0)", () => {
  it("fonte de vendas indisponível gera célula vazia com selo, não zero", () => {
    const fontes = fontesCompletas()
    fontes.falhas = ["vendas"]
    const pacote = montar(fontes)
    const csv = conteudoDe(pacote, "csv/vendas.csv")
    // campo `total` sem valor (célula vazia) e disponibilidade "indisponível".
    expect(csv).toContain("total;;indisponível")
    expect(csv).not.toContain("total;0;")
  })

  it("vendas zero (mês sem movimento) aparece como pendente nos avisos", () => {
    const vazio: FontesContador = {
      vendas: [],
      devolucoes: [],
      movimentacoes: [],
      receber: [],
      pagar: [],
      sessoes: [],
      operacoes: [],
      falhas: [],
    }
    const avisos = conteudoDe(montar(vazio), "AVISOS-E-PENDENCIAS.md")
    expect(avisos).toContain("[pendente]")
    expect(avisos).toContain("Vendas da competência")
  })
})

describe("Pacote do Contador — CSV seguro", () => {
  it("neutraliza injeção de fórmula em células textuais, preservando números negativos", () => {
    const csv = montarCsv(["campo", "valor"], [[texto("=CMD()"), numero(-5.5)]])
    expect(csv).toContain("'=CMD()")
    expect(csv).toContain("-5.5")
    expect(csv).not.toContain("'-5.5")
  })

  it("valor numérico nulo vira célula vazia (nunca 0)", () => {
    const csv = montarCsv(["v"], [[numero(null)]])
    // Linha de dados: apenas a célula vazia após o BOM/cabeçalho.
    expect(csv.split("\r\n")).toContain("")
  })

  it("neutralizarFormula só age em prefixos perigosos", () => {
    expect(neutralizarFormula("=1+1")).toBe("'=1+1")
    expect(neutralizarFormula("+55")).toBe("'+55")
    expect(neutralizarFormula("@x")).toBe("'@x")
    expect(neutralizarFormula("normal")).toBe("normal")
  })
})

describe("Pacote do Contador — guarda anti-vazamento", () => {
  it("assertPacoteSeguro rejeita conteúdo que contém o storeId da loja ativa", () => {
    const arquivos: ArquivoPacote[] = [
      { caminho: "x.csv", categoria: "csv", descricao: "", conteudo: "linha com loja-1 embutida" },
    ]
    expect(() => assertPacoteSeguro(arquivos, { storeId: "loja-1" })).toThrow(PacoteInseguroError)
  })

  it("assertPacoteSeguro aceita conteúdo limpo", () => {
    const arquivos: ArquivoPacote[] = [
      { caminho: "x.csv", categoria: "csv", descricao: "", conteudo: "campo;valor\r\ntotal;100\r\n" },
    ]
    expect(() => assertPacoteSeguro(arquivos, { storeId: "loja-1" })).not.toThrow()
  })
})
