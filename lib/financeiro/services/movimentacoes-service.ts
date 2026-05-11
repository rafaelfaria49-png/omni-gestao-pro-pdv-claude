/**
 * Service de MovimentacaoFinanceira — persistência real no Prisma.
 *
 * Invariantes:
 *  - `tipo`  ∈ {"entrada", "saida"}
 *  - `valor` sempre > 0 (o sentido financeiro fica em `tipo`)
 *  - `storeId` obrigatório; falha explícita se ausente
 *  - Deleção é hard-delete pois movimentações avulsas/manuais não têm impacto
 *    em outros registros. Movimentações derivadas (origine "os", "venda" etc.)
 *    devem ser canceladas pelo fluxo do sistema que as criou.
 */

import { prisma } from "@/lib/prisma"
import type { MovimentacaoFinanceira, Prisma } from "@/generated/prisma"

// ─── tipos públicos ───────────────────────────────────────────────────────────

export type MovTipo = "entrada" | "saida"

export const MOV_ORIGENS = ["os", "venda", "manual", "pagar", "receber"] as const
export type MovOrigem = (typeof MOV_ORIGENS)[number] | string

export type CreateMovimentacaoInput = {
  storeId: string
  tipo: MovTipo
  descricao: string
  valor: number
  origem?: MovOrigem
  referenciaId?: string
}

export type ListMovimentacoesFilters = {
  tipo?: MovTipo
  origem?: string
  referenciaId?: string
  dataInicial?: Date | string
  dataFinal?: Date | string
  q?: string
  take?: number
  skip?: number
}

export type ResumoMovimentacoes = {
  totalEntradas: number
  totalSaidas: number
  saldo: number
  count: number
}

// ─── helpers internos ─────────────────────────────────────────────────────────

function safeStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : ""
}

function safeMoney(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0"))
  return Number.isFinite(n) ? Math.abs(Math.round(n * 100) / 100) : 0
}

function assertStoreId(storeId: string | undefined | null): string {
  const sid = safeStr(storeId)
  if (!sid) throw new Error("movimentacoes-service: storeId é obrigatório")
  return sid
}

function assertTipo(tipo: string | undefined | null): MovTipo {
  if (tipo !== "entrada" && tipo !== "saida") {
    throw new Error(`movimentacoes-service: tipo inválido "${tipo}". Use "entrada" ou "saida".`)
  }
  return tipo
}

function toDate(d: Date | string | undefined): Date | undefined {
  if (!d) return undefined
  const dt = typeof d === "string" ? new Date(d) : d
  return Number.isNaN(dt.getTime()) ? undefined : dt
}

// ─── funções exportadas ───────────────────────────────────────────────────────

/**
 * Lista movimentações de uma loja com filtros opcionais.
 */
export async function listMovimentacoes(
  storeId: string,
  filters: ListMovimentacoesFilters = {},
): Promise<MovimentacaoFinanceira[]> {
  const sid = assertStoreId(storeId)

  const where: Prisma.MovimentacaoFinanceiraWhereInput = { storeId: sid }

  if (filters.tipo) where.tipo = assertTipo(filters.tipo)
  if (filters.origem) where.origem = safeStr(filters.origem)
  if (filters.referenciaId) where.referenciaId = safeStr(filters.referenciaId)
  if (filters.q) {
    where.descricao = { contains: safeStr(filters.q), mode: "insensitive" }
  }
  if (filters.dataInicial || filters.dataFinal) {
    const gte = toDate(filters.dataInicial)
    const lte = toDate(filters.dataFinal)
    where.createdAt = {
      ...(gte ? { gte } : {}),
      ...(lte ? { lte } : {}),
    }
  }

  return prisma.movimentacaoFinanceira.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: typeof filters.take === "number" ? Math.min(filters.take, 1000) : 200,
    skip: typeof filters.skip === "number" ? Math.max(0, filters.skip) : 0,
  })
}

/**
 * Cria uma movimentação financeira genérica.
 */
export async function createMovimentacao(
  input: CreateMovimentacaoInput,
): Promise<MovimentacaoFinanceira> {
  const storeId = assertStoreId(input.storeId)
  const tipo = assertTipo(input.tipo)
  const valor = safeMoney(input.valor)
  if (!(valor > 0)) throw new Error("movimentacoes-service: valor deve ser > 0")
  const descricao = safeStr(input.descricao)
  if (!descricao) throw new Error("movimentacoes-service: descricao é obrigatória")

  return prisma.movimentacaoFinanceira.create({
    data: {
      storeId,
      tipo,
      valor,
      descricao,
      origem: safeStr(input.origem) || "manual",
      referenciaId: safeStr(input.referenciaId) || null,
    },
  })
}

/**
 * Atalho para criar uma entrada (receita).
 */
export async function createEntrada(
  input: Omit<CreateMovimentacaoInput, "tipo">,
): Promise<MovimentacaoFinanceira> {
  return createMovimentacao({ ...input, tipo: "entrada" })
}

/**
 * Atalho para criar uma saída (despesa).
 */
export async function createSaida(
  input: Omit<CreateMovimentacaoInput, "tipo">,
): Promise<MovimentacaoFinanceira> {
  return createMovimentacao({ ...input, tipo: "saida" })
}

/**
 * Remove uma movimentação manual por id + storeId (multi-tenant).
 * Lança se não encontrada ou se pertencer a outra loja.
 */
export async function deleteMovimentacao(id: string, storeId: string): Promise<void> {
  const sid = assertStoreId(storeId)
  const tid = safeStr(id)
  if (!tid) throw new Error("movimentacoes-service: id é obrigatório")

  const existing = await prisma.movimentacaoFinanceira.findFirst({
    where: { id: tid, storeId: sid },
    select: { id: true },
  })
  if (!existing) {
    throw new Error(`movimentacoes-service: movimentação "${tid}" não encontrada para storeId "${sid}"`)
  }

  await prisma.movimentacaoFinanceira.delete({ where: { id: tid } })
}

/**
 * Resumo agregado de entradas, saídas e saldo para um período.
 */
export async function getResumoMovimentacoes(
  storeId: string,
  range?: { dataInicial?: Date | string; dataFinal?: Date | string },
): Promise<ResumoMovimentacoes> {
  const sid = assertStoreId(storeId)

  const dateFilter: Prisma.MovimentacaoFinanceiraWhereInput["createdAt"] = {}
  const gte = toDate(range?.dataInicial)
  const lte = toDate(range?.dataFinal)
  if (gte) dateFilter.gte = gte
  if (lte) dateFilter.lte = lte

  const baseWhere: Prisma.MovimentacaoFinanceiraWhereInput = {
    storeId: sid,
    ...(gte || lte ? { createdAt: dateFilter } : {}),
  }

  const [entradas, saidas, count] = await prisma.$transaction([
    prisma.movimentacaoFinanceira.aggregate({
      where: { ...baseWhere, tipo: "entrada" },
      _sum: { valor: true },
    }),
    prisma.movimentacaoFinanceira.aggregate({
      where: { ...baseWhere, tipo: "saida" },
      _sum: { valor: true },
    }),
    prisma.movimentacaoFinanceira.count({ where: baseWhere }),
  ])

  const totalEntradas = Math.round((entradas._sum.valor ?? 0) * 100) / 100
  const totalSaidas = Math.round((saidas._sum.valor ?? 0) * 100) / 100

  return {
    totalEntradas,
    totalSaidas,
    saldo: Math.round((totalEntradas - totalSaidas) * 100) / 100,
    count,
  }
}
