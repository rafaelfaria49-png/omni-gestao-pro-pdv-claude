/**
 * Conciliação Financeira — comparação entre saldo do sistema e saldo informado por carteira.
 *
 * Regras:
 *  - status "conciliado" quando diferença = 0
 *  - status "divergente" quando diferença ≠ 0
 *  - mantém histórico completo (não deleta registros)
 */

import { prisma } from "@/lib/prisma"
import { safeMoney } from "@/lib/financeiro/contracts/valores"
import type { Prisma } from "@/generated/prisma"
import { registrarAuditoriaFinanceira } from "./auditoria-financeira-service"

// ─── tipos públicos ───────────────────────────────────────────────────────────

export type StatusConciliacao = "pendente" | "conciliado" | "divergente"

export type ConciliacaoPublica = {
  id: string
  storeId: string
  carteiraId: string
  carteiraNome: string
  dataReferencia: string
  saldoSistema: number
  saldoInformado: number
  diferenca: number
  status: StatusConciliacao
  observacao: string | null
  conciliadoPor: string | null
  conciliadoEm: string | null
  createdAt: string
  updatedAt: string
}

export type CriarConciliacaoInput = {
  storeId: string
  carteiraId: string
  dataReferencia?: string
  saldoInformado: number
  observacao?: string
  conciliadoPor?: string
}

export type ResumoConciliacao = {
  total: number
  conciliadas: number
  divergentes: number
  pendentes: number
  totalDivergencia: number
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function toPublica(row: {
  id: string
  storeId: string
  carteiraId: string
  carteira: { nome: string }
  dataReferencia: string
  saldoSistema: number
  saldoInformado: number
  diferenca: number
  status: string
  observacao: string | null
  conciliadoPor: string | null
  conciliadoEm: Date | null
  createdAt: Date
  updatedAt: Date
}): ConciliacaoPublica {
  return {
    id: row.id,
    storeId: row.storeId,
    carteiraId: row.carteiraId,
    carteiraNome: row.carteira.nome,
    dataReferencia: row.dataReferencia,
    saldoSistema: row.saldoSistema,
    saldoInformado: row.saldoInformado,
    diferenca: row.diferenca,
    status: row.status as StatusConciliacao,
    observacao: row.observacao,
    conciliadoPor: row.conciliadoPor,
    conciliadoEm: row.conciliadoEm?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

const CONCILIACAO_SELECT = {
  id: true, storeId: true, carteiraId: true,
  carteira: { select: { nome: true } },
  dataReferencia: true, saldoSistema: true, saldoInformado: true,
  diferenca: true, status: true, observacao: true,
  conciliadoPor: true, conciliadoEm: true, createdAt: true, updatedAt: true,
} as const

// ─── listarConciliacoes ───────────────────────────────────────────────────────

export async function listarConciliacoes(
  storeId: string,
  status?: StatusConciliacao,
): Promise<ConciliacaoPublica[]> {
  const where: Prisma.ConciliacaoFinanceiraWhereInput = { storeId }
  if (status) where.status = status

  const rows = await prisma.conciliacaoFinanceira.findMany({
    where,
    select: CONCILIACAO_SELECT,
    orderBy: [{ dataReferencia: "desc" }, { createdAt: "desc" }],
    take: 100,
  })
  return rows.map(toPublica)
}

// ─── criarConciliacao ─────────────────────────────────────────────────────────
/**
 * Cria uma conciliação para uma carteira, comparando saldoAtual do sistema
 * com o saldoInformado pelo operador.
 */
export async function criarConciliacao(
  input: CriarConciliacaoInput,
): Promise<ConciliacaoPublica> {
  const carteira = await prisma.carteiraFinanceira.findFirst({
    where: { id: input.carteiraId, storeId: input.storeId },
    select: { id: true, nome: true, saldoAtual: true },
  })
  if (!carteira) throw new Error(`Carteira não encontrada: ${input.carteiraId}`)

  const saldoSistema = safeMoney(carteira.saldoAtual)
  const saldoInformado = safeMoney(input.saldoInformado)
  const diferenca = safeMoney(saldoInformado - saldoSistema)
  const status: StatusConciliacao = diferenca === 0 ? "conciliado" : "divergente"
  const dataReferencia = input.dataReferencia ?? today()

  const row = await prisma.conciliacaoFinanceira.create({
    data: {
      storeId: input.storeId,
      carteiraId: input.carteiraId,
      dataReferencia,
      saldoSistema,
      saldoInformado,
      diferenca,
      status,
      observacao: input.observacao ?? null,
      conciliadoPor: input.conciliadoPor ?? null,
      conciliadoEm: new Date(),
    },
    select: CONCILIACAO_SELECT,
  })

  await registrarAuditoriaFinanceira({
    storeId: input.storeId,
    entidade: "conciliacao",
    entidadeId: row.id,
    acao: "conciliar",
    depois: { carteiraId: input.carteiraId, saldoSistema, saldoInformado, diferenca, status },
    usuarioNome: input.conciliadoPor,
  })

  return toPublica(row)
}

// ─── conciliarCarteira (alias de criarConciliacao com semântica explícita) ────

export async function conciliarCarteira(
  storeId: string,
  carteiraId: string,
  saldoInformado: number,
  opts: { observacao?: string; conciliadoPor?: string; dataReferencia?: string } = {},
): Promise<ConciliacaoPublica> {
  return criarConciliacao({ storeId, carteiraId, saldoInformado, ...opts })
}

// ─── marcarDivergente ─────────────────────────────────────────────────────────

export async function marcarDivergente(
  id: string,
  storeId: string,
  observacao?: string,
): Promise<ConciliacaoPublica> {
  const row = await prisma.conciliacaoFinanceira.update({
    where: { id },
    data: { status: "divergente", observacao: observacao ?? null },
    select: CONCILIACAO_SELECT,
  })

  await registrarAuditoriaFinanceira({
    storeId,
    entidade: "conciliacao",
    entidadeId: id,
    acao: "editar",
    depois: { status: "divergente", observacao },
  })

  return toPublica(row)
}

// ─── getResumoConciliacao ─────────────────────────────────────────────────────

export async function getResumoConciliacao(storeId: string): Promise<ResumoConciliacao> {
  const [total, conciliadas, divergentes] = await Promise.all([
    prisma.conciliacaoFinanceira.count({ where: { storeId } }),
    prisma.conciliacaoFinanceira.count({ where: { storeId, status: "conciliado" } }),
    prisma.conciliacaoFinanceira.count({ where: { storeId, status: "divergente" } }),
  ])

  const divAgg = await prisma.conciliacaoFinanceira.aggregate({
    where: { storeId, status: "divergente" },
    _sum: { diferenca: true },
  })

  return {
    total,
    conciliadas,
    divergentes,
    pendentes: total - conciliadas - divergentes,
    totalDivergencia: safeMoney(Math.abs(divAgg._sum.diferenca ?? 0)),
  }
}
