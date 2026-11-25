/**
 * Fechamento Financeiro — congela o estado financeiro de um dia ou mês.
 *
 * Regras:
 *  - Não permite fechar um período já fechado (sem reabrir antes)
 *  - Reabertura exige motivo explícito
 *  - Snapshot dos saldos é gravado no momento do fechamento
 *  - verificarPeriodoFechado: retorna true se a data está dentro de um período fechado
 */

import { gestorMoneyAtivo } from "@/lib/gastos/ativacao"
import { leituraEmpresaWhere } from "@/lib/gastos/read-scope"
import { prisma } from "@/lib/prisma"
import { safeMoney } from "@/lib/financeiro/contracts/valores"
import type { FechamentoFinanceiro, Prisma } from "@/generated/prisma"
import type { FinanceiroDb } from "@/lib/gastos/financeiro-scope"
import { travarCompetenciaFinanceira } from "@/lib/gastos/periodo"
import { diaSaoPaulo } from "@/lib/gastos/operacao-schema"
import { getDREMensal } from "./dre-service"

// ─── tipos públicos ───────────────────────────────────────────────────────────

export type TipoFechamento = "diario" | "mensal"
export type StatusFechamento = "fechado" | "reaberto"

export type FechamentoPublico = {
  id: string
  storeId: string
  tipo: TipoFechamento
  dataReferencia: string
  mes: number
  ano: number
  status: StatusFechamento
  saldoSistema: number
  saldoInformado: number | null
  diferenca: number
  observacao: string | null
  fechadoPor: string | null
  reabertoPor: string | null
  fechadoEm: string | null
  reabertoEm: string | null
  snapshotDRE: unknown
  createdAt: string
  updatedAt: string
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function toPublico(f: FechamentoFinanceiro): FechamentoPublico {
  return {
    id: f.id,
    storeId: f.storeId,
    tipo: f.tipo as TipoFechamento,
    dataReferencia: f.dataReferencia,
    mes: f.mes,
    ano: f.ano,
    status: f.status as StatusFechamento,
    saldoSistema: f.saldoSistema,
    saldoInformado: f.saldoInformado ?? null,
    diferenca: f.diferenca,
    observacao: f.observacao ?? null,
    fechadoPor: f.fechadoPor ?? null,
    reabertoPor: f.reabertoPor ?? null,
    fechadoEm: f.fechadoEm?.toISOString() ?? null,
    reabertoEm: f.reabertoEm?.toISOString() ?? null,
    snapshotDRE: f.snapshotDRE,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  }
}

function dateToDataRef(d: Date): string {
  // Ativação controlada: desligado, a chave do dia é a da main (UTC), para não mudar a chave de
  // fechamentos já gravados perto da meia-noite; ligado, o dia civil de São Paulo (G004/G005).
  return gestorMoneyAtivo() ? diaSaoPaulo(d.toISOString()) : d.toISOString().slice(0, 10)
}

function primeiroDiaMes(mes: number, ano: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}-01`
}

async function getSaldoAtualStore(storeId: string, db: FinanceiroDb): Promise<number> {
  const agg = await db.movimentacaoFinanceira.aggregate({
    where: leituraEmpresaWhere(storeId, { storeId }),
    _sum: { valor: true },
  })
  // Não temos tipo aqui — recalcular manualmente
  const entradas = await db.movimentacaoFinanceira.aggregate({
    where: leituraEmpresaWhere(storeId, { storeId, tipo: "entrada" }),
    _sum: { valor: true },
  })
  const saidas = await db.movimentacaoFinanceira.aggregate({
    where: leituraEmpresaWhere(storeId, { storeId, tipo: "saida" }),
    _sum: { valor: true },
  })
  void agg
  return safeMoney((entradas._sum.valor ?? 0) - (saidas._sum.valor ?? 0))
}

// ─── listarFechamentos ────────────────────────────────────────────────────────

export async function listarFechamentos(
  storeId: string,
  tipo?: TipoFechamento,
): Promise<FechamentoPublico[]> {
  const where: Prisma.FechamentoFinanceiroWhereInput = { storeId }
  if (tipo) where.tipo = tipo

  const rows = await prisma.fechamentoFinanceiro.findMany({
    where,
    orderBy: [{ dataReferencia: "desc" }],
    take: 50,
  })
  return rows.map(toPublico)
}

// ─── verificarPeriodoFechado ──────────────────────────────────────────────────
/**
 * Retorna true se a data informada cair dentro de um fechamento ativo (status = "fechado").
 * Verifica fechamento diário exato e fechamento mensal do mês/ano.
 */
export async function verificarPeriodoFechado(
  storeId: string,
  data: Date | string,
): Promise<{ fechado: boolean; fechamento?: FechamentoPublico }> {
  const d = typeof data === "string" ? data.slice(0, 10) : dateToDataRef(data)
  const [ano, mes] = d.split("-").map(Number)
  const mesRef = primeiroDiaMes(mes, ano)

  const fechamento = await prisma.fechamentoFinanceiro.findFirst({
    where: {
      storeId,
      status: "fechado",
      OR: [
        { tipo: "diario", dataReferencia: d },
        { tipo: "mensal", dataReferencia: mesRef },
      ],
    },
    orderBy: { createdAt: "desc" },
  })

  if (!fechamento) return { fechado: false }
  return { fechado: true, fechamento: toPublico(fechamento) }
}

// ─── fecharDia ────────────────────────────────────────────────────────────────

export async function fecharDia(
  storeId: string,
  data?: Date | string,
  opts: { observacao?: string; fechadoPor?: string; saldoInformado?: number } = {},
): Promise<FechamentoPublico> {
  const d = data
    ? (typeof data === "string" ? data.slice(0, 10) : dateToDataRef(data))
    : dateToDataRef(new Date())

  const [ano, mes] = d.split("-").map(Number)

  return prisma.$transaction(async tx => {
    await travarCompetenciaFinanceira(tx, storeId, d.slice(0, 7))

  const existente = await tx.fechamentoFinanceiro.findFirst({
    where: { storeId, tipo: "diario", dataReferencia: d, status: "fechado" },
  })
  if (existente) {
    throw new Error(`Dia ${d} já está fechado. Reabra o fechamento antes de fechar novamente.`)
  }

  const saldoSistema = await getSaldoAtualStore(storeId, tx)
  const saldoInformado = opts.saldoInformado !== undefined ? safeMoney(opts.saldoInformado) : null
  const diferenca = saldoInformado !== null ? safeMoney(saldoInformado - saldoSistema) : 0

  const row = await tx.fechamentoFinanceiro.upsert({
    where: { fechamento_store_tipo_data: { storeId, tipo: "diario", dataReferencia: d } },
    create: {
      storeId, tipo: "diario", dataReferencia: d, mes, ano,
      status: "fechado", saldoSistema, saldoInformado, diferenca,
      observacao: opts.observacao ?? null,
      fechadoPor: opts.fechadoPor ?? null,
      fechadoEm: new Date(),
    },
    update: {
      status: "fechado", saldoSistema, saldoInformado, diferenca,
      observacao: opts.observacao ?? null,
      fechadoPor: opts.fechadoPor ?? null,
      fechadoEm: new Date(),
      reabertoEm: null, reabertoPor: null,
    },
  })

  await tx.auditoriaFinanceira.create({ data: {
    storeId,
    entidade: "fechamento",
    entidadeId: row.id,
    acao: "fechar",
    // Detalhes do fechamento não são dados pessoais: a trilha da main é preservada.
    depois: { tipo: "diario", dataReferencia: d, saldoSistema, diferenca },
    usuarioNome: opts.fechadoPor,
  } })

  return toPublico(row)
  }, { maxWait: 5000, timeout: 20000 })
}

// ─── fecharMes ────────────────────────────────────────────────────────────────

export async function fecharMes(
  storeId: string,
  mes: number,
  ano: number,
  opts: { observacao?: string; fechadoPor?: string; saldoInformado?: number } = {},
): Promise<FechamentoPublico> {
  const dataReferencia = primeiroDiaMes(mes, ano)

  return prisma.$transaction(async tx => {
    await travarCompetenciaFinanceira(tx, storeId, dataReferencia.slice(0, 7))

  const existente = await tx.fechamentoFinanceiro.findFirst({
    where: { storeId, tipo: "mensal", dataReferencia, status: "fechado" },
  })
  if (existente) {
    const label = `${String(mes).padStart(2, "0")}/${ano}`
    throw new Error(`Mês ${label} já está fechado. Reabra o fechamento antes de fechar novamente.`)
  }

  const saldoSistema = await getSaldoAtualStore(storeId, tx)
  const saldoInformado = opts.saldoInformado !== undefined ? safeMoney(opts.saldoInformado) : null
  const diferenca = saldoInformado !== null ? safeMoney(saldoInformado - saldoSistema) : 0

  // Snapshot do DRE do mês
  // Como na main, o snapshot do DRE é opcional: uma falha nele não impede o fechamento.
  let snapshotDRE: unknown = null
  try {
    snapshotDRE = await getDREMensal(storeId, mes, ano, tx)
  } catch {
    // DRE snapshot é opcional
  }

  const row = await tx.fechamentoFinanceiro.upsert({
    where: { fechamento_store_tipo_data: { storeId, tipo: "mensal", dataReferencia } },
    create: {
      storeId, tipo: "mensal", dataReferencia, mes, ano,
      status: "fechado", saldoSistema, saldoInformado, diferenca,
      observacao: opts.observacao ?? null,
      snapshotDRE: snapshotDRE as Prisma.InputJsonValue | null ?? undefined,
      fechadoPor: opts.fechadoPor ?? null,
      fechadoEm: new Date(),
    },
    update: {
      status: "fechado", saldoSistema, saldoInformado, diferenca,
      observacao: opts.observacao ?? null,
      snapshotDRE: snapshotDRE as Prisma.InputJsonValue | null ?? undefined,
      fechadoPor: opts.fechadoPor ?? null,
      fechadoEm: new Date(),
      reabertoEm: null, reabertoPor: null,
    },
  })

  await tx.auditoriaFinanceira.create({ data: {
    storeId,
    entidade: "fechamento",
    entidadeId: row.id,
    acao: "fechar",
    depois: { tipo: "mensal", mes, ano, saldoSistema, diferenca },
    usuarioNome: opts.fechadoPor,
  } })

  return toPublico(row)
  }, { maxWait: 5000, timeout: 20000 })
}

// ─── reabrirFechamento ────────────────────────────────────────────────────────

export async function reabrirFechamento(
  id: string,
  storeId: string,
  motivo: string,
  reabertoPor?: string,
): Promise<FechamentoPublico> {
  if (!motivo?.trim()) {
    throw new Error("Motivo de reabertura é obrigatório.")
  }

  const base = await prisma.fechamentoFinanceiro.findFirst({
    where: { id, storeId },
  })
  if (!base) throw new Error("Fechamento não encontrado.")
  return prisma.$transaction(async tx => {
  await travarCompetenciaFinanceira(tx, storeId, base.dataReferencia.slice(0, 7))
  const existente = await tx.fechamentoFinanceiro.findFirst({ where: { id, storeId } })
  if (!existente) throw new Error("Fechamento não encontrado.")
  if (existente.status === "reaberto") {
    throw new Error("Fechamento já está reaberto.")
  }

  const row = await tx.fechamentoFinanceiro.update({
    where: { id },
    data: {
      status: "reaberto",
      observacao: motivo.trim(),
      reabertoPor: reabertoPor ?? null,
      reabertoEm: new Date(),
    },
  })

  await tx.auditoriaFinanceira.create({ data: {
    storeId,
    entidade: "fechamento",
    entidadeId: id,
    acao: "reabrir",
    antes: { status: "fechado" },
    depois: { status: "reaberto", motivo },
    usuarioNome: reabertoPor,
  } })

  return toPublico(row)
  }, { maxWait: 5000, timeout: 20000 })
}
