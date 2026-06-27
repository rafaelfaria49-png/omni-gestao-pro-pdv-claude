/**
 * INVENTARIO_INTELIGENTE_V01 — Testes do núcleo PURO de conciliação dinâmica.
 *
 * Cobre os 12 cenários do GOAL (sem Prisma/IO):
 *  1. produto contado sem movimentação;
 *  2. produto contado com venda após a contagem;
 *  3. produto contado com OS após a contagem;
 *  4. produto contado com entrada após a contagem;
 *  5. divergência real após considerar as movimentações;
 *  6. produto com estoque positivo não bipado entra em "não encontrado";
 *  7. (apply) zerar não encontrado → ver inventario-conciliacao.aplicar nos testes de ação;
 *     aqui cobrimos a SIMULAÇÃO do zerar (delta = −estoque, impacto);
 *  8. simulação não altera estoque (funções puras — não há side effect);
 *  9/10. (aplicar / dupla aplicação) → idempotência fica na camada de ação (flags F4);
 * 11. inventário de vários dias (movimentações em datas diferentes do início);
 * 12. contagens em horários diferentes por produto (countedAt por item).
 */
import { describe, expect, it } from "vitest"
import {
  GRUPO_CONCILIACAO,
  MESES_SUSPEITO_PADRAO,
  somarMovimentacoesApos,
  classificarEncontrado,
  isSuspeitoAntigo,
  conciliarEncontrado,
  montarConciliacao,
  consolidarContagensConc,
  simularAplicacaoConciliacao,
  saldoAplicavel,
  type ProdutoConc,
  type ContagemConc,
  type MovimentoEstoqueConc,
} from "./inventario-conciliacao"

const T0 = "2026-06-01T10:00:00.000Z" // contagem
const T1 = "2026-06-03T15:00:00.000Z" // depois (venda/OS/entrada)
const T2 = "2026-06-05T09:00:00.000Z" // ainda depois
const ANTES = "2026-05-30T10:00:00.000Z" // antes da contagem

const prod = (over: Partial<ProdutoConc> & { id: string }): ProdutoConc => ({
  nome: `Produto ${over.id}`,
  sku: null,
  estoqueAtual: 0,
  precoCusto: 0,
  precoVenda: 0,
  ...over,
})

const cont = (produtoId: string, qtd: number, em: string = T0): ContagemConc => ({
  produtoId,
  quantidadeContada: qtd,
  contadoEm: em,
})

const mov = (produtoId: string, quantidade: number, em: string): MovimentoEstoqueConc => ({
  produtoId,
  quantidade,
  em,
})

// ─── somarMovimentacoesApos ──────────────────────────────────────────────────

describe("somarMovimentacoesApos", () => {
  it("soma só o que ocorreu ESTRITAMENTE após a contagem", () => {
    const movs = [mov("p1", -3, T1), mov("p1", +2, T2), mov("p1", -1, ANTES)]
    expect(somarMovimentacoesApos(movs, T0)).toBe(-1) // -3 +2 (ignora a de ANTES)
  })
  it("movimentação no instante exato da contagem não conta", () => {
    expect(somarMovimentacoesApos([mov("p1", -5, T0)], T0)).toBe(0)
  })
  it("sem movimentações → 0", () => {
    expect(somarMovimentacoesApos([], T0)).toBe(0)
  })
})

// ─── classificarEncontrado ────────────────────────────────────────────────────

describe("classificarEncontrado", () => {
  it("sem movimentação e sem divergência → OK", () => {
    expect(classificarEncontrado(0, 0)).toBe(GRUPO_CONCILIACAO.OK)
  })
  it("com movimentação mas conciliado → COM_MOVIMENTACAO", () => {
    expect(classificarEncontrado(-3, 0)).toBe(GRUPO_CONCILIACAO.COM_MOVIMENTACAO)
  })
  it("divergência real ≠ 0 → COM_DIVERGENCIA (mesmo com movimentação)", () => {
    expect(classificarEncontrado(-3, 2)).toBe(GRUPO_CONCILIACAO.COM_DIVERGENCIA)
    expect(classificarEncontrado(0, -1)).toBe(GRUPO_CONCILIACAO.COM_DIVERGENCIA)
  })
})

// ─── conciliarEncontrado (cenários 1–5, 11) ────────────────────────────────────

describe("conciliarEncontrado", () => {
  it("1) contado sem movimentação e sistema bate → OK, divergência 0", () => {
    const r = conciliarEncontrado({
      produto: prod({ id: "p1", estoqueAtual: 10 }),
      contagem: cont("p1", 10),
      movs: [],
    })
    expect(r.movimentacaoPosContagem).toBe(0)
    expect(r.saldoEsperadoHoje).toBe(10)
    expect(r.divergenciaReal).toBe(0)
    expect(r.grupo).toBe(GRUPO_CONCILIACAO.OK)
  })

  it("2) contou 10, vendeu 3 (PDV) depois, sistema em 7 → conciliado (com movimentação)", () => {
    const r = conciliarEncontrado({
      produto: prod({ id: "p1", estoqueAtual: 7 }),
      contagem: cont("p1", 10),
      movs: [mov("p1", -3, T1)],
    })
    expect(r.saldoEsperadoHoje).toBe(7)
    expect(r.divergenciaReal).toBe(0)
    expect(r.grupo).toBe(GRUPO_CONCILIACAO.COM_MOVIMENTACAO)
  })

  it("3) contou 5, OS consumiu 2 depois, sistema em 3 → conciliado", () => {
    const r = conciliarEncontrado({
      produto: prod({ id: "p1", estoqueAtual: 3 }),
      contagem: cont("p1", 5),
      movs: [mov("p1", -2, T1)],
    })
    expect(r.saldoEsperadoHoje).toBe(3)
    expect(r.divergenciaReal).toBe(0)
    expect(r.grupo).toBe(GRUPO_CONCILIACAO.COM_MOVIMENTACAO)
  })

  it("4) contou 4, entrada de 6 depois, sistema em 10 → conciliado", () => {
    const r = conciliarEncontrado({
      produto: prod({ id: "p1", estoqueAtual: 10 }),
      contagem: cont("p1", 4),
      movs: [mov("p1", +6, T1)],
    })
    expect(r.saldoEsperadoHoje).toBe(10)
    expect(r.divergenciaReal).toBe(0)
    expect(r.grupo).toBe(GRUPO_CONCILIACAO.COM_MOVIMENTACAO)
  })

  it("5) divergência REAL mesmo considerando as movimentações", () => {
    // contou 10, vendeu 3 → esperado 7, mas sistema só tem 5 → faltam 2 no sistema.
    const r = conciliarEncontrado({
      produto: prod({ id: "p1", estoqueAtual: 5 }),
      contagem: cont("p1", 10),
      movs: [mov("p1", -3, T1)],
    })
    expect(r.saldoEsperadoHoje).toBe(7)
    expect(r.divergenciaReal).toBe(2) // esperado − atual
    expect(r.grupo).toBe(GRUPO_CONCILIACAO.COM_DIVERGENCIA)
  })

  it("11) inventário de vários dias: várias movimentações em datas distintas", () => {
    const r = conciliarEncontrado({
      produto: prod({ id: "p1", estoqueAtual: 9 }),
      contagem: cont("p1", 10, T0),
      movs: [mov("p1", -3, T1), mov("p1", +2, T2), mov("p1", -1, ANTES)],
    })
    // só T1 e T2 contam: 10 −3 +2 = 9 ; sistema 9 → conciliado
    expect(r.movimentacaoPosContagem).toBe(-1)
    expect(r.saldoEsperadoHoje).toBe(9)
    expect(r.divergenciaReal).toBe(0)
    expect(r.grupo).toBe(GRUPO_CONCILIACAO.COM_MOVIMENTACAO)
  })

  it("ignora movimentação anterior à contagem (não projeta o passado)", () => {
    const r = conciliarEncontrado({
      produto: prod({ id: "p1", estoqueAtual: 10 }),
      contagem: cont("p1", 10, T1),
      movs: [mov("p1", -5, T0)], // antes do countedAt deste item
    })
    expect(r.movimentacaoPosContagem).toBe(0)
    expect(r.divergenciaReal).toBe(0)
  })
})

// ─── isSuspeitoAntigo (cenário 6 sub-classificação) ─────────────────────────────

describe("isSuspeitoAntigo", () => {
  const agora = "2026-06-22T12:00:00.000Z"
  it("nunca movimentou → suspeito", () => {
    expect(isSuspeitoAntigo(null, agora)).toBe(true)
  })
  it("última movimentação dentro da janela → não suspeito", () => {
    expect(isSuspeitoAntigo("2026-06-01T00:00:00.000Z", agora, MESES_SUSPEITO_PADRAO)).toBe(false)
  })
  it("última movimentação muito antiga → suspeito", () => {
    expect(isSuspeitoAntigo("2025-01-01T00:00:00.000Z", agora, MESES_SUSPEITO_PADRAO)).toBe(true)
  })
})

// ─── montarConciliacao (cenários 6, 12) ────────────────────────────────────────

describe("montarConciliacao", () => {
  it("6) produto com estoque positivo não bipado entra em 'não encontrado'", () => {
    const r = montarConciliacao({
      contagens: [cont("p1", 10)],
      produtos: [
        prod({ id: "p1", estoqueAtual: 10 }),
        prod({ id: "p2", estoqueAtual: 4, precoCusto: 2, precoVenda: 5 }), // não bipado, estoque>0
        prod({ id: "p3", estoqueAtual: 0 }), // não bipado mas estoque 0 → fora
      ],
      movimentacoes: [],
      ultimaMovPorProduto: { p2: "2026-06-10T00:00:00.000Z" },
      agora: "2026-06-22T12:00:00.000Z",
    })
    expect(r.totais.contados).toBe(1)
    expect(r.naoEncontrados).toHaveLength(1)
    expect(r.naoEncontrados[0].produtoId).toBe("p2")
    expect(r.naoEncontrados[0].grupo).toBe(GRUPO_CONCILIACAO.NAO_ENCONTRADO)
    expect(r.naoEncontrados[0].impactoCusto).toBe(8) // 4 × 2
    expect(r.naoEncontrados[0].impactoVenda).toBe(20) // 4 × 5
  })

  it("não encontrado sem movimentação recente → suspeito antigo", () => {
    const r = montarConciliacao({
      contagens: [],
      produtos: [prod({ id: "p9", estoqueAtual: 3 })],
      movimentacoes: [],
      ultimaMovPorProduto: { p9: "2024-01-01T00:00:00.000Z" },
      agora: "2026-06-22T12:00:00.000Z",
    })
    expect(r.naoEncontrados[0].grupo).toBe(GRUPO_CONCILIACAO.SUSPEITO_ANTIGO)
    expect(r.totais.suspeitosAntigos).toBe(1)
  })

  it("12) contagens em horários diferentes por produto: cada item usa seu próprio countedAt", () => {
    const r = montarConciliacao({
      contagens: [
        cont("p1", 10, T0), // contado no dia 01
        cont("p2", 8, T2), // contado no dia 05
      ],
      produtos: [
        prod({ id: "p1", estoqueAtual: 7 }),
        prod({ id: "p2", estoqueAtual: 8 }),
      ],
      movimentacoes: [
        mov("p1", -3, T1), // dia 03: depois da contagem de p1 → conta
        mov("p2", -3, T1), // dia 03: ANTES da contagem de p2 (dia 05) → NÃO conta
      ],
      agora: T2,
    })
    const p1 = r.itens.find((i) => i.produtoId === "p1")!
    const p2 = r.itens.find((i) => i.produtoId === "p2")!
    expect(p1.saldoEsperadoHoje).toBe(7) // 10 −3
    expect(p1.divergenciaReal).toBe(0)
    expect(p2.movimentacaoPosContagem).toBe(0) // a venda foi antes da contagem dele
    expect(p2.saldoEsperadoHoje).toBe(8)
    expect(p2.divergenciaReal).toBe(0)
  })

  it("produto fora do catálogo não entra na conciliação de saldo", () => {
    const r = montarConciliacao({
      contagens: [cont("fantasma", 5)],
      produtos: [],
      movimentacoes: [],
    })
    expect(r.itens).toHaveLength(0)
    expect(r.totais.contados).toBe(0)
  })

  it("totais agregam os grupos corretamente", () => {
    const r = montarConciliacao({
      contagens: [cont("p1", 10), cont("p2", 5, T0), cont("p3", 2, T0)],
      produtos: [
        prod({ id: "p1", estoqueAtual: 10 }), // OK
        prod({ id: "p2", estoqueAtual: 2 }), // vendeu 3 → esperado 2 → conciliado
        prod({ id: "p3", estoqueAtual: 4 }), // divergência
        prod({ id: "p4", estoqueAtual: 1, precoCusto: 10, precoVenda: 25 }), // não encontrado
      ],
      movimentacoes: [mov("p2", -3, T1)],
      ultimaMovPorProduto: { p4: "2026-06-20T00:00:00.000Z" },
      agora: "2026-06-22T12:00:00.000Z",
    })
    expect(r.totais.ok).toBe(1)
    expect(r.totais.comMovimentacao).toBe(1)
    expect(r.totais.comDivergencia).toBe(1)
    expect(r.totais.naoEncontrados).toBe(1)
    expect(r.totais.unidadesContadas).toBe(17)
    expect(r.totais.impactoCustoNaoEncontrados).toBe(10)
    expect(r.totais.impactoVendaNaoEncontrados).toBe(25)
  })
})

// ─── simularAplicacaoConciliacao (cenários 7, 8) ───────────────────────────────

describe("simularAplicacaoConciliacao", () => {
  it("saldoAplicavel nunca é negativo", () => {
    expect(saldoAplicavel(7)).toBe(7)
    expect(saldoAplicavel(-3)).toBe(0)
  })

  it("8) é PURA: chamar não altera as entradas (sem side effect)", () => {
    const divergencias = [
      conciliarEncontrado({ produto: prod({ id: "p1", estoqueAtual: 5 }), contagem: cont("p1", 7), movs: [] }),
    ]
    const snapshot = JSON.stringify(divergencias)
    simularAplicacaoConciliacao({ divergencias, naoEncontrados: [] })
    expect(JSON.stringify(divergencias)).toBe(snapshot)
  })

  it("divergência positiva (sistema fica maior) soma unidades adicionadas e impacto", () => {
    // esperado 7, sistema 5 → delta +2
    const d = conciliarEncontrado({
      produto: prod({ id: "p1", estoqueAtual: 5, precoCusto: 10, precoVenda: 30 }),
      contagem: cont("p1", 7),
      movs: [],
    })
    const s = simularAplicacaoConciliacao({ divergencias: [d], naoEncontrados: [] })
    expect(s.produtosAlterados).toBe(1)
    expect(s.divergenciasPositivas).toBe(1)
    expect(s.unidadesAdicionadas).toBe(2)
    expect(s.custoImpactado).toBe(20)
    expect(s.vendaImpactado).toBe(60)
  })

  it("7) zerar não encontrados: delta = −estoque, baixa de valor", () => {
    const r = montarConciliacao({
      contagens: [],
      produtos: [prod({ id: "p1", estoqueAtual: 4, precoCusto: 10, precoVenda: 25 })],
      movimentacoes: [],
      ultimaMovPorProduto: { p1: "2026-06-20T00:00:00.000Z" },
      agora: "2026-06-22T12:00:00.000Z",
    })
    const s = simularAplicacaoConciliacao({ divergencias: [], naoEncontrados: r.naoEncontrados })
    expect(s.produtosZerados).toBe(1)
    expect(s.produtosAlterados).toBe(1)
    expect(s.unidadesBaixadas).toBe(4)
    expect(s.divergenciasNegativas).toBe(1)
    expect(s.custoImpactado).toBe(-40)
    expect(s.vendaImpactado).toBe(-100)
  })

  it("divergência com delta 0 não conta como alteração", () => {
    const d = conciliarEncontrado({
      produto: prod({ id: "p1", estoqueAtual: 7 }),
      contagem: cont("p1", 7),
      movs: [],
    })
    const s = simularAplicacaoConciliacao({ divergencias: [d], naoEncontrados: [] })
    expect(s.produtosAlterados).toBe(0)
  })
})

// ─── Dedup: mesmo produto contado por códigos diferentes (barcode/SKU/alias) ─────
describe("consolidarContagensConc", () => {
  it("soma quantidades do mesmo produto e usa a observação MAIS RECENTE", () => {
    const out = consolidarContagensConc([cont("p1", 6, T0), cont("p1", 4, T2), cont("p2", 5, T1)])
    expect(out).toHaveLength(2)
    const p1 = out.find((c) => c.produtoId === "p1")!
    expect(p1.quantidadeContada).toBe(10) // 6 + 4
    expect(p1.contadoEm).toBe(T2) // marco temporal = mais recente
    expect(out.find((c) => c.produtoId === "p2")!.quantidadeContada).toBe(5)
  })

  it("lista vazia → vazio; item único passa intacto", () => {
    expect(consolidarContagensConc([])).toEqual([])
    expect(consolidarContagensConc([cont("p1", 3, T0)])).toEqual([
      { produtoId: "p1", quantidadeContada: 3, contadoEm: T0 },
    ])
  })
})

describe("montarConciliacao — consolidação por produto (códigos diferentes)", () => {
  it("produto bipado por 2 códigos vira UM item conciliado (quantidade somada, sem divergência falsa)", () => {
    const r = montarConciliacao({
      contagens: [cont("p1", 6, T0), cont("p1", 4, T0)], // mesmo produto, 2 códigos
      produtos: [prod({ id: "p1", estoqueAtual: 10 })],
      movimentacoes: [],
    })
    expect(r.itens).toHaveLength(1) // NÃO duplica
    expect(r.totais.contados).toBe(1)
    const i = r.itens[0]
    expect(i.quantidadeContada).toBe(10) // 6 + 4
    expect(i.saldoEsperadoHoje).toBe(10)
    expect(i.divergenciaReal).toBe(0)
    expect(i.grupo).toBe(GRUPO_CONCILIACAO.OK)
    expect(r.totais.unidadesContadas).toBe(10)
  })

  it("divergência real é medida sobre o TOTAL consolidado, não por linha", () => {
    const r = montarConciliacao({
      contagens: [cont("p1", 3, T0), cont("p1", 2, T0)], // total contado = 5
      produtos: [prod({ id: "p1", estoqueAtual: 8 })], // sistema 8 → falta 3
      movimentacoes: [],
    })
    expect(r.itens).toHaveLength(1)
    expect(r.itens[0].saldoEsperadoHoje).toBe(5)
    expect(r.itens[0].divergenciaReal).toBe(-3) // 5 − 8
    expect(r.totais.comDivergencia).toBe(1)
  })
})
