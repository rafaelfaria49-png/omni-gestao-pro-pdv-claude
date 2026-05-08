import { prisma } from "@/lib/prisma"
import type { Prisma, ContaPagarTitulo } from "@/generated/prisma"
import { FINANCEIRO_ORIGEM } from "@/lib/financeiro/contracts/origem"
import {
  buildContaPagarPayload,
  mergeFinanceiroPayload,
  appendFinanceiroHistorico,
} from "@/lib/financeiro/contracts/payload"
import { PAGAR_STATUS, normalizePagarStatus, type PagarStatusCanon } from "@/lib/financeiro/contracts/status"
import {
  safeMoney,
  calculatePaidRemaining,
  isOverdueDateString,
} from "@/lib/financeiro/contracts/valores"

const PAY_EPS = 0.009

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v)
}

function safeStr(v: unknown): string {
  return typeof v === "string" ? v : ""
}

function safeNum(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0
}

function asPayloadRecord(payload: unknown): Record<string, unknown> {
  return isRecord(payload) ? payload : {}
}

function pickLocalKeyFromLegacyPayload(payloadPatch: Record<string, unknown> | null | undefined): string {
  if (!isRecord(payloadPatch)) return ""
  const lk = safeStr(payloadPatch.localKey) || safeStr(payloadPatch.id)
  return lk.trim()
}

/** Soma líquida de pagamentos/liquidações no `payload.historico`. */
export function sumPagamentosFromHistoricoPayloadContaPagar(payload: unknown): number {
  const h = asPayloadRecord(payload).historico
  if (!Array.isArray(h)) return 0
  let s = 0
  for (const e of h) {
    if (!isRecord(e)) continue
    const t = String(e.tipo ?? "").toLowerCase()
    const v = safeNum(e.valor)
    if (t === "pagamento" || t === "liquidacao") s += v
    if (t === "estorno_pagamento") s -= v
  }
  return safeMoney(s)
}

export type ContaPagarServiceResult<T> = { ok: true; data: T } | { ok: false; reason: string }

export type UpsertContaPagarInput = {
  storeId: string
  /** `localKey` é obrigatório nos fluxos oficiais; para compatibilidade, pode vir via `payloadPatch.localKey` / `payloadPatch.id`. */
  localKey?: string
  descricao?: string
  valor?: number
  vencimento?: string
  status?: string
  numeroDocumento?: string
  fornecedorId?: string | null
  fornecedorNome?: string
  payloadPatch?: Record<string, unknown>
  historicoEntrada?: Record<string, unknown>
  /** Quando true, substitui o `payload` em vez de fazer merge profundo (compat legado). */
  replacePayload?: boolean
}

export type ContaPagarSummary = {
  quantidade: number
  totalAberto: number
  totalVencido: number
  totalPago: number
  totalParcial: number
  porStatus: Partial<Record<PagarStatusCanon, number>>
}

export type ContaPagarAuditItem = {
  id: string
  storeId: string
  localKey: string
  status: PagarStatusCanon | null
  valor: number
  pago: number
  restante: number
  vencido: boolean
  fornecedorId?: string
  fornecedorNome?: string
  numeroDocumento: string
  vencimento: string
  descricao: string
}

export async function listContasPagarByStore(storeId: string): Promise<ContaPagarTitulo[]> {
  const sid = safeStr(storeId).trim()
  if (!sid) return []
  return prisma.contaPagarTitulo.findMany({
    where: { storeId: sid },
    orderBy: { updatedAt: "desc" },
  })
}

export async function getContaPagarById(storeId: string, id: string): Promise<ContaPagarTitulo | null> {
  const sid = safeStr(storeId).trim()
  const tid = safeStr(id).trim()
  if (!sid || !tid) return null
  return prisma.contaPagarTitulo.findFirst({ where: { id: tid, storeId: sid } })
}

export async function getContaPagarByLocalKey(storeId: string, localKey: string): Promise<ContaPagarTitulo | null> {
  const sid = safeStr(storeId).trim()
  const lk = safeStr(localKey).trim()
  if (!sid || !lk) return null
  return prisma.contaPagarTitulo.findUnique({
    where: { storeId_localKey: { storeId: sid, localKey: lk } },
  })
}

async function findTitulo(
  storeId: string,
  opts: { id?: string; localKey?: string },
): Promise<ContaPagarTitulo | null> {
  if (opts.id) {
    const t = await getContaPagarById(storeId, opts.id)
    if (t) return t
  }
  if (opts.localKey) return await getContaPagarByLocalKey(storeId, opts.localKey)
  return null
}

function saldoAberto(row: ContaPagarTitulo): { pago: number; restante: number } {
  const statusCanon = normalizePagarStatus(row.status)
  if (
    statusCanon === PAGAR_STATUS.PAGO ||
    statusCanon === PAGAR_STATUS.CANCELADO ||
    statusCanon === PAGAR_STATUS.ESTORNADO
  ) {
    return { pago: safeMoney(row.valor), restante: 0 }
  }
  const pago = sumPagamentosFromHistoricoPayloadContaPagar(row.payload)
  return calculatePaidRemaining(row.valor, pago)
}

function ensureFornecedorAndDocumentoInPayload(opts: {
  payload: Record<string, unknown>
  fornecedorId?: string | null
  fornecedorNome?: string
  numeroDocumento?: string
}): Record<string, unknown> {
  const patch = buildContaPagarPayload({
    origem: FINANCEIRO_ORIGEM.MANUAL,
    fornecedorId: opts.fornecedorId ?? undefined,
    fornecedorNome: (opts.fornecedorNome ?? "").trim() || undefined,
    numeroDocumento: (opts.numeroDocumento ?? "").trim() || undefined,
  })
  return mergeFinanceiroPayload(opts.payload, patch)
}

/** Upsert idempotente por `(storeId, localKey)`; não deleta títulos. */
export async function upsertContaPagar(input: UpsertContaPagarInput): Promise<ContaPagarTitulo> {
  const storeId = safeStr(input.storeId).trim()
  const localKey = (safeStr(input.localKey).trim() || pickLocalKeyFromLegacyPayload(input.payloadPatch)).trim()
  if (!storeId || !localKey) {
    throw new Error("contas-pagar-service: storeId e localKey são obrigatórios (localKey pode vir via payloadPatch)")
  }

  const existing = await prisma.contaPagarTitulo.findUnique({
    where: { storeId_localKey: { storeId, localKey } },
    select: { id: true, payload: true, descricao: true, valor: true, vencimento: true, status: true, numeroDocumento: true },
  })

  let nextPayload: Record<string, unknown>
  const basePayload = existing?.payload as Record<string, unknown> | undefined
  if (input.replacePayload && isRecord(input.payloadPatch)) nextPayload = { ...input.payloadPatch }
  else nextPayload = mergeFinanceiroPayload(basePayload, input.payloadPatch)

  nextPayload = ensureFornecedorAndDocumentoInPayload({
    payload: nextPayload,
    fornecedorId: input.fornecedorId,
    fornecedorNome: input.fornecedorNome,
    numeroDocumento: input.numeroDocumento,
  })

  if (input.historicoEntrada && Object.keys(input.historicoEntrada).length > 0) {
    nextPayload = appendFinanceiroHistorico(nextPayload, input.historicoEntrada)
  }

  const descricao = input.descricao !== undefined ? safeStr(input.descricao) : (existing?.descricao ?? "")
  const valor = input.valor !== undefined ? safeMoney(input.valor) : safeMoney(existing?.valor ?? 0)
  const vencimento = input.vencimento !== undefined ? safeStr(input.vencimento) : (existing?.vencimento ?? "")
  const numeroDocumento =
    input.numeroDocumento !== undefined ? safeStr(input.numeroDocumento) : (existing?.numeroDocumento ?? "")

  const stIn = input.status ?? existing?.status ?? PAGAR_STATUS.PENDENTE
  const statusCanon = normalizePagarStatus(stIn) ?? PAGAR_STATUS.PENDENTE

  const data: Prisma.ContaPagarTituloUncheckedCreateInput & Prisma.ContaPagarTituloUncheckedUpdateInput = {
    storeId,
    localKey,
    fornecedorId: input.fornecedorId ?? undefined,
    descricao,
    valor,
    vencimento,
    status: statusCanon,
    numeroDocumento,
    payload: nextPayload as unknown as Prisma.InputJsonValue,
  }

  return prisma.contaPagarTitulo.upsert({
    where: { storeId_localKey: { storeId, localKey } },
    create: data,
    update: data,
  })
}

export async function cancelContaPagar(params: {
  storeId: string
  id?: string
  localKey?: string
  motivo?: string
  userLabel?: string
}): Promise<ContaPagarServiceResult<ContaPagarTitulo>> {
  const row = await findTitulo(params.storeId, { id: params.id, localKey: params.localKey })
  if (!row) return { ok: false, reason: "not_found" }

  const cur = normalizePagarStatus(row.status)
  if (cur === PAGAR_STATUS.CANCELADO) return { ok: true, data: row }
  if (cur === PAGAR_STATUS.ESTORNADO) return { ok: false, reason: "titulo_estornado" }
  if (cur === PAGAR_STATUS.PAGO) return { ok: false, reason: "titulo_pago_nao_cancela_aqui" }

  const base = asPayloadRecord(row.payload)
  let merged = mergeFinanceiroPayload(base, {
    status: PAGAR_STATUS.CANCELADO,
    canceladoEm: new Date().toISOString(),
    ...(safeStr(params.motivo) ? { motivoCancelamento: safeStr(params.motivo) } : {}),
  })
  merged = appendFinanceiroHistorico(merged, {
    tipo: "cancelamento",
    userLabel: safeStr(params.userLabel) || undefined,
    motivo: safeStr(params.motivo) || undefined,
  })

  const updated = await prisma.contaPagarTitulo.update({
    where: { id: row.id },
    data: { status: PAGAR_STATUS.CANCELADO, payload: merged as unknown as Prisma.InputJsonValue },
  })
  return { ok: true, data: updated }
}

export async function liquidarContaPagar(params: {
  storeId: string
  id?: string
  localKey?: string
  observacao?: string
  userLabel?: string
}): Promise<ContaPagarServiceResult<ContaPagarTitulo>> {
  const row = await findTitulo(params.storeId, { id: params.id, localKey: params.localKey })
  if (!row) return { ok: false, reason: "not_found" }

  const cur = normalizePagarStatus(row.status)
  if (cur === PAGAR_STATUS.CANCELADO || cur === PAGAR_STATUS.ESTORNADO) return { ok: false, reason: "titulo_encerrado" }
  if (cur === PAGAR_STATUS.PAGO) return { ok: true, data: row }

  const { restante } = saldoAberto(row)
  if (restante <= PAY_EPS) return { ok: false, reason: "nada_em_aberto" }

  let merged = asPayloadRecord(row.payload)
  merged = appendFinanceiroHistorico(merged, {
    tipo: "liquidacao",
    valor: restante,
    observacao: safeStr(params.observacao) || undefined,
    userLabel: safeStr(params.userLabel) || undefined,
  })

  const updated = await prisma.contaPagarTitulo.update({
    where: { id: row.id },
    data: { status: PAGAR_STATUS.PAGO, payload: merged as unknown as Prisma.InputJsonValue },
  })
  return { ok: true, data: updated }
}

export async function registrarPagamentoParcialContaPagar(params: {
  storeId: string
  id?: string
  localKey?: string
  valorPago: number
  observacao?: string
  userLabel?: string
}): Promise<ContaPagarServiceResult<ContaPagarTitulo>> {
  const row = await findTitulo(params.storeId, { id: params.id, localKey: params.localKey })
  if (!row) return { ok: false, reason: "not_found" }

  const cur = normalizePagarStatus(row.status)
  if (cur === PAGAR_STATUS.CANCELADO || cur === PAGAR_STATUS.ESTORNADO) return { ok: false, reason: "titulo_encerrado" }
  if (cur === PAGAR_STATUS.PAGO) return { ok: false, reason: "ja_pago" }

  const vp = safeMoney(params.valorPago)
  if (!(vp > PAY_EPS)) return { ok: false, reason: "valor_invalido" }

  const { restante: abertoAntes, total } = (() => {
    const paid = sumPagamentosFromHistoricoPayloadContaPagar(row.payload)
    return calculatePaidRemaining(row.valor, paid)
  })()
  if (vp > abertoAntes + PAY_EPS) return { ok: false, reason: "valor_maior_que_aberto" }

  let merged = asPayloadRecord(row.payload)
  merged = appendFinanceiroHistorico(merged, {
    tipo: "pagamento",
    valor: vp,
    observacao: safeStr(params.observacao) || undefined,
    userLabel: safeStr(params.userLabel) || undefined,
  })

  const pago = sumPagamentosFromHistoricoPayloadContaPagar(merged)
  let nextStatus: PagarStatusCanon = PAGAR_STATUS.PENDENTE
  if (pago + PAY_EPS >= safeMoney(total)) nextStatus = PAGAR_STATUS.PAGO
  else if (pago > PAY_EPS) nextStatus = PAGAR_STATUS.PARCIAL

  const updated = await prisma.contaPagarTitulo.update({
    where: { id: row.id },
    data: { status: nextStatus, payload: merged as unknown as Prisma.InputJsonValue },
  })
  return { ok: true, data: updated }
}

export type EstornoContaPagarModo = "titulo_completo" | "ultimo_pagamento"

export async function estornarContaPagar(params: {
  storeId: string
  id?: string
  localKey?: string
  modo: EstornoContaPagarModo
  motivo?: string
  userLabel?: string
}): Promise<ContaPagarServiceResult<ContaPagarTitulo>> {
  const row = await findTitulo(params.storeId, { id: params.id, localKey: params.localKey })
  if (!row) return { ok: false, reason: "not_found" }

  const cur = normalizePagarStatus(row.status)
  if (cur === PAGAR_STATUS.CANCELADO) return { ok: false, reason: "titulo_cancelado" }
  if (cur === PAGAR_STATUS.ESTORNADO) return { ok: true, data: row }

  const base = asPayloadRecord(row.payload)
  const h = base.historico
  const arr = Array.isArray(h) ? [...h] : []

  if (params.modo === "titulo_completo") {
    let merged = mergeFinanceiroPayload(base, {
      estornoTituloEm: new Date().toISOString(),
      ...(safeStr(params.motivo) ? { motivoEstorno: safeStr(params.motivo) } : {}),
    })
    merged = appendFinanceiroHistorico(merged, {
      tipo: "estorno_titulo",
      motivo: safeStr(params.motivo) || undefined,
      userLabel: safeStr(params.userLabel) || undefined,
    })
    const updated = await prisma.contaPagarTitulo.update({
      where: { id: row.id },
      data: { status: PAGAR_STATUS.ESTORNADO, payload: merged as unknown as Prisma.InputJsonValue },
    })
    return { ok: true, data: updated }
  }

  let lastIdx = -1
  let lastValor = 0
  for (let i = arr.length - 1; i >= 0; i--) {
    const e = arr[i]
    if (!isRecord(e)) continue
    const t = String(e.tipo ?? "").toLowerCase()
    if (t === "pagamento" || t === "liquidacao") {
      lastIdx = i
      lastValor = safeNum(e.valor)
      break
    }
  }
  if (lastIdx < 0 || !(lastValor > PAY_EPS)) return { ok: false, reason: "sem_pagamento_para_estornar" }

  const merged = appendFinanceiroHistorico(base, {
    tipo: "estorno_pagamento",
    valor: lastValor,
    refHistoricoIndex: lastIdx,
    motivo: safeStr(params.motivo) || undefined,
    userLabel: safeStr(params.userLabel) || undefined,
  })

  const pago = sumPagamentosFromHistoricoPayloadContaPagar(merged)
  const total = safeMoney(row.valor)
  let nextStatus: PagarStatusCanon = PAGAR_STATUS.PENDENTE
  if (pago > PAY_EPS && pago + PAY_EPS < total) nextStatus = PAGAR_STATUS.PARCIAL
  else if (pago + PAY_EPS >= total) nextStatus = PAGAR_STATUS.PAGO
  else nextStatus = PAGAR_STATUS.PENDENTE

  const updated = await prisma.contaPagarTitulo.update({
    where: { id: row.id },
    data: { status: nextStatus, payload: merged as unknown as Prisma.InputJsonValue },
  })
  return { ok: true, data: updated }
}

export function buildContaPagarSummary(titulos: ContaPagarTitulo[]): ContaPagarSummary {
  const porStatus: Partial<Record<PagarStatusCanon, number>> = {}
  let totalAberto = 0
  let totalVencido = 0
  let totalPago = 0
  let totalParcial = 0

  for (const row of titulos) {
    const c = normalizePagarStatus(row.status) ?? PAGAR_STATUS.PENDENTE
    porStatus[c] = (porStatus[c] ?? 0) + 1

    const v = safeMoney(row.valor)
    const { pago, restante } = saldoAberto(row)

    if (c === PAGAR_STATUS.PAGO) {
      totalPago = safeMoney(totalPago + v)
    }
    if (c === PAGAR_STATUS.PARCIAL) {
      totalParcial = safeMoney(totalParcial + pago)
    }

    if (c === PAGAR_STATUS.PENDENTE || c === PAGAR_STATUS.PARCIAL || c === PAGAR_STATUS.VENCIDO) {
      totalAberto = safeMoney(totalAberto + restante)
    }

    const vencidoCanon = c === PAGAR_STATUS.VENCIDO
    const overdue =
      (c === PAGAR_STATUS.PENDENTE || c === PAGAR_STATUS.PARCIAL) && isOverdueDateString(row.vencimento)
    if (restante > PAY_EPS && (vencidoCanon || overdue)) {
      totalVencido = safeMoney(totalVencido + restante)
    }
  }

  return { quantidade: titulos.length, totalAberto, totalVencido, totalPago, totalParcial, porStatus }
}

export function buildContaPagarAuditTrail(titulos: ContaPagarTitulo[]): ContaPagarAuditItem[] {
  const out: ContaPagarAuditItem[] = []
  for (const row of titulos) {
    const statusCanon = normalizePagarStatus(row.status)
    const pago = sumPagamentosFromHistoricoPayloadContaPagar(row.payload)
    const { restante } = calculatePaidRemaining(row.valor, pago)
    const vencido =
      restante > PAY_EPS &&
      ((statusCanon === PAGAR_STATUS.VENCIDO) ||
        statusCanon === PAGAR_STATUS.PENDENTE ||
        statusCanon === PAGAR_STATUS.PARCIAL) &&
      isOverdueDateString(row.vencimento)

    const payload = asPayloadRecord(row.payload)
    out.push({
      id: row.id,
      storeId: row.storeId,
      localKey: row.localKey ?? row.id,
      status: statusCanon,
      valor: safeMoney(row.valor),
      pago,
      restante,
      vencido,
      fornecedorId: safeStr(payload.fornecedorId) || (row.fornecedorId ?? undefined),
      fornecedorNome: safeStr(payload.fornecedorNome) || undefined,
      numeroDocumento: safeStr(row.numeroDocumento),
      vencimento: safeStr(row.vencimento),
      descricao: safeStr(row.descricao),
    })
  }
  return out
}

