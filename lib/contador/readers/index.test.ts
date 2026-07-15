import { describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"
import { resolvePeriodoUtc } from "@/lib/contador/competencia"
import { avaliarEscopoContador, type ContadorScopeInterno } from "@/lib/contador/scope-core"
import {
  carregarFontesComCliente,
  montarDados,
  type ContadorReaderClient,
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
      role: "ADMIN",
      storeAccess,
      allowedStoreIds: storeAccess === "restricted" ? [storeId] : [],
    },
    expires: "2999-01-01",
  } as unknown as Session
  const scope = avaliarEscopoContador(session, storeId)
  if (!scope.ok) throw new Error(`scope de teste inválido: ${scope.motivo}`)
  return scope
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
