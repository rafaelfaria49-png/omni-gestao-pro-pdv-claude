import { describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"
import { resolvePeriodoUtc } from "@/lib/contador/competencia"
import { avaliarAcessoContador, type ContadorScopeInterno } from "@/lib/contador/scope-core"
import {
  carregarFontesComCliente,
  montarDados,
  type ContadorReaderClient,
  type FonteContador,
  type FontesContador,
} from "./index"

const competencia = { ano: 2026, mes: 6 }

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

function scopeValido(
  storeId = "loja-a",
  storeAccess: "all" | "restricted" = "restricted",
): ContadorScopeInterno {
  const session = {
    user: {
      id: "user-reader-test",
      role: "ADMIN",
      storeAccess,
      allowedStoreIds: storeAccess === "restricted" ? [storeId] : [],
    },
    expires: "2999-01-01",
  } as unknown as Session
  const scope = avaliarAcessoContador(session, storeId)
  if (!scope.ok) throw new Error(`scope de teste inválido: ${scope.motivo}`)
  return scope as ContadorScopeInterno
}

function clienteVazio(): ContadorReaderClient {
  const findMany = () => vi.fn(async (_args: Record<string, unknown>) => [])
  return {
    venda: { findMany: findMany() },
    devolucaoVenda: { findMany: findMany() },
    movimentacaoFinanceira: { findMany: findMany() },
    contaReceberTitulo: { findMany: findMany() },
    contaPagarTitulo: { findMany: findMany() },
    sessaoCaixa: { findMany: findMany() },
    caixaOperacao: { findMany: findMany() },
  }
}

function primeiraChamada(findMany: (args: Record<string, unknown>) => Promise<unknown[]>) {
  return vi.mocked(findMany).mock.calls[0]?.[0] as {
    where: Record<string, unknown>
    select: Record<string, boolean>
  }
}

describe("montarDados", () => {
  it("líquido = vendas.total − devoluções.total (subtração única)", () => {
    const fontes: FontesContador = {
      ...vazio,
      vendas: [{ total: 300, status: "concluida", payload: { paymentBreakdown: { dinheiro: 300 } } }],
      devolucoes: [{ valorTotal: 50 }],
    }
    const dto = montarDados(fontes, competencia)
    expect(dto.vendas.total.valor).toBe(300)
    expect(dto.devolucoes.total.valor).toBe(50)
    expect(dto.liquidoCompetencia.valor).toBe(250)
  })

  it("fiscal é sempre indisponível nesta fase", () => {
    const dto = montarDados(vazio, competencia)
    expect(dto.fiscal.disponibilidade).toBe("indisponivel")
    expect(dto.fiscal.valor).toBeNull()
    expect(dto.alertas.some((a) => a.titulo.includes("fiscal"))).toBe(true)
  })

  it("uma fonte com falha fica indisponível sem apagar as fontes saudáveis", () => {
    const dto = montarDados(
      {
        ...vazio,
        vendas: [{ total: 100, status: "concluida", payload: { paymentBreakdown: { pix: 100 } } }],
        falhas: ["movimentacoes"],
      },
      competencia,
    )
    expect(dto.vendas.total).toMatchObject({ valor: 100, disponibilidade: "real" })
    expect(dto.financeiro.entradasRealizadas).toMatchObject({ valor: null, disponibilidade: "indisponivel" })
    expect(dto.financeiro.titulosReceberAberto.disponibilidade).toBe("real")
    expect(dto.alertas.some((a) => a.titulo.includes("MovimentacaoFinanceira"))).toBe(true)
  })

  it("falha em Venda ou DevolucaoVenda torna o líquido indisponível, nunca zero", () => {
    const dto = montarDados({ ...vazio, falhas: ["devolucoes"] }, competencia)
    expect(dto.liquidoCompetencia).toMatchObject({ valor: null, disponibilidade: "indisponivel" })
    expect(dto.vendas.total.disponibilidade).toBe("real")
  })
})

describe("carregarFontesComCliente (fronteiras Prisma)", () => {
  it("aplica scope validado e intervalo UTC semiaberto exato em todas as fontes temporais", async () => {
    const db = clienteVazio()
    const periodo = resolvePeriodoUtc(competencia)
    await carregarFontesComCliente(scopeValido(), periodo, db)

    const temporais = [
      [db.venda.findMany, "at"],
      [db.devolucaoVenda.findMany, "at"],
      [db.movimentacaoFinanceira.findMany, "createdAt"],
      [db.sessaoCaixa.findMany, "abertaEm"],
      [db.caixaOperacao.findMany, "at"],
    ] as const

    for (const [findMany, campo] of temporais) {
      const chamada = primeiraChamada(findMany)
      expect(chamada.where.storeId).toBe("loja-a")
      expect(chamada.where[campo]).toEqual({ gte: periodo.inicio, lt: periodo.fimExclusivo })
      expect(chamada.where[campo]).not.toHaveProperty("lte")
    }
    expect(primeiraChamada(db.contaReceberTitulo.findMany).where).toEqual({ storeId: "loja-a" })
    expect(primeiraChamada(db.contaPagarTitulo.findMany).where).toEqual({ storeId: "loja-a" })
  })

  it("dados A/B com scope A consultam e retornam somente a loja A", async () => {
    const vendasDb = [
      { storeId: "loja-a", total: 10, status: "concluida", payload: { paymentBreakdown: { pix: 10 } } },
      { storeId: "loja-b", total: 999, status: "concluida", payload: { paymentBreakdown: { pix: 999 } } },
    ]
    const db = clienteVazio()
    db.venda.findMany = vi.fn(async (args: Record<string, unknown>) => {
      const where = args.where as { storeId: string }
      return vendasDb
        .filter((row) => row.storeId === where.storeId)
        .map(({ total, status, payload }) => ({ total, status, payload }))
    })

    const fontes = await carregarFontesComCliente(scopeValido("loja-a"), resolvePeriodoUtc(competencia), db)
    expect(fontes.vendas).toEqual([
      { total: 10, status: "concluida", payload: { paymentBreakdown: { pix: 10 } } },
    ])
    for (const delegate of [
      db.venda,
      db.devolucaoVenda,
      db.movimentacaoFinanceira,
      db.contaReceberTitulo,
      db.contaPagarTitulo,
      db.sessaoCaixa,
      db.caixaOperacao,
    ]) {
      expect(primeiraChamada(delegate.findMany).where.storeId).toBe("loja-a")
    }
  })

  it("rejeição de uma consulta não cancela as outras e registra só a fonte afetada", async () => {
    const db = clienteVazio()
    db.venda.findMany = vi.fn(async () => [
      { total: 25, status: "concluida", payload: { paymentBreakdown: { dinheiro: 25 } } },
    ])
    db.movimentacaoFinanceira.findMany = vi.fn(async () => {
      throw new Error("detalhe interno que não deve vazar")
    })

    const fontes = await carregarFontesComCliente(scopeValido(), resolvePeriodoUtc(competencia), db)
    expect(fontes.vendas).toHaveLength(1)
    expect(fontes.falhas).toEqual(["movimentacoes"])
    expect(JSON.stringify(montarDados(fontes, competencia))).not.toContain("detalhe interno")
  })
})

type DelegateContador = keyof ContadorReaderClient

function substituirFindMany(
  db: ContadorReaderClient,
  delegate: DelegateContador,
  fn: (args: Record<string, unknown>) => Promise<unknown[]>,
) {
  ;(db[delegate] as { findMany: (args: Record<string, unknown>) => Promise<unknown[]> }).findMany = vi.fn(fn)
}

const CASOS_CROSS_STORE: readonly {
  nome: string
  delegate: DelegateContador
  fonte: Exclude<FonteContador, never>
  rows: readonly { storeId: string; dado: unknown }[]
  esperado: unknown
}[] = [
  {
    nome: "Venda",
    delegate: "venda",
    fonte: "vendas",
    rows: [
      { storeId: "loja-a", dado: { total: 11, status: "concluida", payload: { paymentBreakdown: { pix: 11 } } } },
      { storeId: "loja-b", dado: { total: 911, status: "concluida", payload: { paymentBreakdown: { pix: 911 } } } },
    ],
    esperado: { total: 11, status: "concluida", payload: { paymentBreakdown: { pix: 11 } } },
  },
  {
    nome: "DevolucaoVenda",
    delegate: "devolucaoVenda",
    fonte: "devolucoes",
    rows: [
      { storeId: "loja-a", dado: { valorTotal: 12 } },
      { storeId: "loja-b", dado: { valorTotal: 912 } },
    ],
    esperado: { valorTotal: 12 },
  },
  {
    nome: "MovimentacaoFinanceira",
    delegate: "movimentacaoFinanceira",
    fonte: "movimentacoes",
    rows: [
      { storeId: "loja-a", dado: { tipo: "entrada", origem: "venda", valor: 13 } },
      { storeId: "loja-b", dado: { tipo: "entrada", origem: "venda", valor: 913 } },
    ],
    esperado: { tipo: "entrada", origem: "venda", valor: 13 },
  },
  {
    nome: "ContaReceberTitulo",
    delegate: "contaReceberTitulo",
    fonte: "receber",
    rows: [
      { storeId: "loja-a", dado: { valor: 14, status: "pendente", vencimento: "2026-06-14" } },
      { storeId: "loja-b", dado: { valor: 914, status: "pendente", vencimento: "2026-06-14" } },
    ],
    esperado: { valor: 14, status: "pendente", vencimento: "2026-06-14" },
  },
  {
    nome: "ContaPagarTitulo",
    delegate: "contaPagarTitulo",
    fonte: "pagar",
    rows: [
      { storeId: "loja-a", dado: { valor: 15, status: "pendente", vencimento: "2026-06-15" } },
      { storeId: "loja-b", dado: { valor: 915, status: "pendente", vencimento: "2026-06-15" } },
    ],
    esperado: { valor: 15, status: "pendente", vencimento: "2026-06-15" },
  },
  {
    nome: "SessaoCaixa",
    delegate: "sessaoCaixa",
    fonte: "sessoes",
    rows: [
      { storeId: "loja-a", dado: { status: "fechada", saldoFinal: 16, saldoContado: 17 } },
      { storeId: "loja-b", dado: { status: "aberta", saldoFinal: 916, saldoContado: 917 } },
    ],
    esperado: { status: "fechada", saldoFinal: 16, saldoContado: 17 },
  },
  {
    nome: "CaixaOperacao",
    delegate: "caixaOperacao",
    fonte: "operacoes",
    rows: [
      { storeId: "loja-a", dado: { tipo: "sangria", valor: 18 } },
      { storeId: "loja-b", dado: { tipo: "suprimento", valor: 918 } },
    ],
    esperado: { tipo: "sangria", valor: 18 },
  },
]

describe("isolamento cross-store A/B por query", () => {
  it.each(CASOS_CROSS_STORE)("$nome retorna somente a fixture da loja A", async (caso) => {
    const db = clienteVazio()
    substituirFindMany(db, caso.delegate, async (args) => {
      const storeId = (args.where as { storeId: string }).storeId
      return caso.rows.filter((row) => row.storeId === storeId).map((row) => row.dado)
    })

    const fontes = await carregarFontesComCliente(scopeValido("loja-a"), resolvePeriodoUtc(competencia), db)
    expect(fontes[caso.fonte]).toEqual([caso.esperado])
    expect(primeiraChamada(db[caso.delegate].findMany).where.storeId).toBe("loja-a")
  })
})

const CASOS_TEMPORAIS: readonly {
  nome: string
  delegate: DelegateContador
  fonte: "vendas" | "devolucoes" | "movimentacoes" | "sessoes" | "operacoes"
  campo: "at" | "createdAt" | "abertaEm"
  dado: (marcador: number) => unknown
}[] = [
  { nome: "Venda.at", delegate: "venda", fonte: "vendas", campo: "at", dado: (n) => ({ total: n, status: "concluida", payload: null }) },
  { nome: "DevolucaoVenda.at", delegate: "devolucaoVenda", fonte: "devolucoes", campo: "at", dado: (n) => ({ valorTotal: n }) },
  { nome: "MovimentacaoFinanceira.createdAt", delegate: "movimentacaoFinanceira", fonte: "movimentacoes", campo: "createdAt", dado: (n) => ({ tipo: "entrada", origem: "venda", valor: n }) },
  { nome: "SessaoCaixa.abertaEm", delegate: "sessaoCaixa", fonte: "sessoes", campo: "abertaEm", dado: (n) => ({ status: "fechada", saldoFinal: n, saldoContado: n }) },
  { nome: "CaixaOperacao.at", delegate: "caixaOperacao", fonte: "operacoes", campo: "at", dado: (n) => ({ tipo: "sangria", valor: n }) },
]

describe("fronteiras temporais semiabertas por query", () => {
  it.each(CASOS_TEMPORAIS)("$nome inclui inicio/fim-1 e exclui inicio-1/fim", async (caso) => {
    const periodo = resolvePeriodoUtc(competencia)
    const eventos = [
      { instante: new Date(periodo.inicio.getTime() - 1), dado: caso.dado(1) },
      { instante: periodo.inicio, dado: caso.dado(2) },
      { instante: new Date(periodo.fimExclusivo.getTime() - 1), dado: caso.dado(3) },
      { instante: periodo.fimExclusivo, dado: caso.dado(4) },
    ]
    const db = clienteVazio()
    substituirFindMany(db, caso.delegate, async (args) => {
      const where = args.where as Record<string, unknown>
      const faixa = where[caso.campo] as { gte: Date; lt: Date }
      return eventos
        .filter((evento) => evento.instante >= faixa.gte && evento.instante < faixa.lt)
        .map((evento) => evento.dado)
    })

    const fontes = await carregarFontesComCliente(scopeValido(), periodo, db)
    expect(fontes[caso.fonte]).toEqual([caso.dado(2), caso.dado(3)])
    expect(primeiraChamada(db[caso.delegate].findMany).where[caso.campo]).toEqual({
      gte: periodo.inicio,
      lt: periodo.fimExclusivo,
    })
  })
})

const CASOS_FALHA: readonly {
  nome: string
  delegate: DelegateContador
  fonte: FonteContador
  disponibilidade: (dto: ReturnType<typeof montarDados>) => string
}[] = [
  { nome: "Venda", delegate: "venda", fonte: "vendas", disponibilidade: (d) => d.vendas.total.disponibilidade },
  { nome: "DevolucaoVenda", delegate: "devolucaoVenda", fonte: "devolucoes", disponibilidade: (d) => d.devolucoes.total.disponibilidade },
  { nome: "MovimentacaoFinanceira", delegate: "movimentacaoFinanceira", fonte: "movimentacoes", disponibilidade: (d) => d.financeiro.entradasRealizadas.disponibilidade },
  { nome: "ContaReceberTitulo", delegate: "contaReceberTitulo", fonte: "receber", disponibilidade: (d) => d.financeiro.titulosReceberAberto.disponibilidade },
  { nome: "ContaPagarTitulo", delegate: "contaPagarTitulo", fonte: "pagar", disponibilidade: (d) => d.financeiro.titulosPagarAberto.disponibilidade },
  { nome: "SessaoCaixa", delegate: "sessaoCaixa", fonte: "sessoes", disponibilidade: (d) => d.caixa.sessoes.disponibilidade },
  { nome: "CaixaOperacao", delegate: "caixaOperacao", fonte: "operacoes", disponibilidade: (d) => d.caixa.sangriasTotal.disponibilidade },
]

describe("falha parcial isolada por fonte", () => {
  it.each(CASOS_FALHA)("$nome falha sem cancelar as outras seis fontes", async (caso) => {
    const db = clienteVazio()
    substituirFindMany(db, caso.delegate, async () => {
      throw new Error(`segredo interno ${caso.nome}`)
    })

    const fontes = await carregarFontesComCliente(scopeValido(), resolvePeriodoUtc(competencia), db)
    const dto = montarDados(fontes, competencia)
    expect(fontes.falhas).toEqual([caso.fonte])
    expect(caso.disponibilidade(dto)).toBe("indisponivel")
    if (caso.fonte === "vendas") expect(dto.financeiro.entradasRealizadas.disponibilidade).toBe("real")
    else expect(dto.vendas.total.disponibilidade).toBe("real")
    expect(JSON.stringify(dto)).not.toContain("segredo interno")
  })
})
