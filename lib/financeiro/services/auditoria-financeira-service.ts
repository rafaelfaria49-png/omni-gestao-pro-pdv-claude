/**
 * Auditoria Financeira — log append-only de operações no módulo financeiro.
 *
 * INVARIANTES:
 *  - Nunca lança exceção para o caller — falha silenciosa (não bloqueia fluxo principal)
 *  - Registros são imutáveis: nunca update/delete
 *  - `antes` e `depois` são JSON snapshots opcionais
 */

import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma"

// ─── tipos públicos ───────────────────────────────────────────────────────────

export type EntidadeAuditoria =
  | "movimentacao"
  | "receber"
  | "pagar"
  | "carteira"
  | "dre"
  | "fechamento"
  | "conciliacao"

export type AcaoAuditoria =
  | "criar"
  | "editar"
  | "excluir"
  | "liquidar"
  | "estornar"
  | "fechar"
  | "reabrir"
  | "conciliar"
  | "transferir"
  | "cancelar"

export type RegistrarAuditoriaInput = {
  storeId: string
  entidade: EntidadeAuditoria
  entidadeId?: string
  acao: AcaoAuditoria
  antes?: unknown
  depois?: unknown
  usuarioId?: string
  usuarioNome?: string
  ip?: string
  userAgent?: string
}

export type AuditoriaPublica = {
  id: string
  storeId: string
  entidade: string
  entidadeId: string | null
  acao: string
  antes: unknown
  depois: unknown
  usuarioId: string | null
  usuarioNome: string | null
  ip: string | null
  createdAt: string
}

export type ListarAuditoriaFilters = {
  entidade?: EntidadeAuditoria
  entidadeId?: string
  acao?: AcaoAuditoria
  dataInicial?: string
  dataFinal?: string
  take?: number
  skip?: number
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function toPublica(row: {
  id: string
  storeId: string
  entidade: string
  entidadeId: string | null
  acao: string
  antes: Prisma.JsonValue
  depois: Prisma.JsonValue
  usuarioId: string | null
  usuarioNome: string | null
  ip: string | null
  createdAt: Date
}): AuditoriaPublica {
  return {
    id: row.id,
    storeId: row.storeId,
    entidade: row.entidade,
    entidadeId: row.entidadeId,
    acao: row.acao,
    antes: row.antes,
    depois: row.depois,
    usuarioId: row.usuarioId,
    usuarioNome: row.usuarioNome,
    ip: row.ip,
    createdAt: row.createdAt.toISOString(),
  }
}

// ─── registrarAuditoriaFinanceira ─────────────────────────────────────────────
/**
 * Registra um evento de auditoria. Nunca lança — falha silenciosa.
 */
export async function registrarAuditoriaFinanceira(
  input: RegistrarAuditoriaInput,
): Promise<void> {
  try {
    await prisma.auditoriaFinanceira.create({
      data: {
        storeId: input.storeId,
        entidade: input.entidade,
        entidadeId: input.entidadeId ?? null,
        acao: input.acao,
        antes: (input.antes !== undefined ? input.antes : undefined) as Prisma.InputJsonValue | undefined,
        depois: (input.depois !== undefined ? input.depois : undefined) as Prisma.InputJsonValue | undefined,
        usuarioId: input.usuarioId ?? null,
        usuarioNome: input.usuarioNome ?? null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      },
    })
  } catch (e) {
    console.warn("[auditoria] Falha ao registrar auditoria (silenciosa):", e)
  }
}

// ─── listarAuditoriaFinanceira ────────────────────────────────────────────────

export async function listarAuditoriaFinanceira(
  storeId: string,
  filters: ListarAuditoriaFilters = {},
): Promise<{ items: AuditoriaPublica[]; total: number }> {
  const where: Prisma.AuditoriaFinanceiraWhereInput = { storeId }

  if (filters.entidade) where.entidade = filters.entidade
  if (filters.entidadeId) where.entidadeId = filters.entidadeId
  if (filters.acao) where.acao = filters.acao
  if (filters.dataInicial || filters.dataFinal) {
    where.createdAt = {}
    if (filters.dataInicial) where.createdAt.gte = new Date(filters.dataInicial)
    if (filters.dataFinal) where.createdAt.lte = new Date(filters.dataFinal + "T23:59:59.999Z")
  }

  const take = Math.min(filters.take ?? 50, 200)
  const skip = filters.skip ?? 0

  const [items, total] = await Promise.all([
    prisma.auditoriaFinanceira.findMany({
      where,
      select: {
        id: true, storeId: true, entidade: true, entidadeId: true,
        acao: true, antes: true, depois: true, usuarioId: true,
        usuarioNome: true, ip: true, createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    }),
    prisma.auditoriaFinanceira.count({ where }),
  ])

  return { items: items.map(toPublica), total }
}

// ─── getAuditoriaPorEntidade ──────────────────────────────────────────────────

export async function getAuditoriaPorEntidade(
  storeId: string,
  entidade: EntidadeAuditoria,
  entidadeId: string,
): Promise<AuditoriaPublica[]> {
  const rows = await prisma.auditoriaFinanceira.findMany({
    where: { storeId, entidade, entidadeId },
    select: {
      id: true, storeId: true, entidade: true, entidadeId: true,
      acao: true, antes: true, depois: true, usuarioId: true,
      usuarioNome: true, ip: true, createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  })
  return rows.map(toPublica)
}
