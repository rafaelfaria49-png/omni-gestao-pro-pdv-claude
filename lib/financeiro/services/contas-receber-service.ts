import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma"
import type { ContaReceberTitulo } from "@/generated/prisma"
import { mergeFinanceiroPayload, appendFinanceiroHistorico } from "@/lib/financeiro/contracts/payload"
import { RECEBER_STATUS, normalizeReceberStatus, type ReceberStatusCanon } from "@/lib/financeiro/contracts/status"
import { safeMoney, isOverdueDateString } from "@/lib/financeiro/contracts/valores"

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

/** Soma líquida de pagamentos/liquidações registrados no `historico` do payload. */
export function sumPagamentosFromHistoricoPayload(payload: unknown): number {
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

export type ContaReceberServiceResult<T> = { ok: true; data: T } | { ok: false; reason: string }

export type UpsertContaReceberInput = {
  storeId: string
  localKey: string
  descricao?: string
  cliente?: string
  valor?: number
  vencimento?: string
  status?: string
  /** Mesclado com payload existente; não use para substituir `historico` inteiro — prefira `historicoEntrada`. */
  payloadPatch?: Record<string, unknown>
  historicoEntrada?: Record<string, unknown>
  /** Quando true, substitui o `payload` em vez de fazer merge profundo. Útil para caminhos legados (PDV/import). */
  replacePayload?: boolean
}

export type ContaReceberSummary = {
  quantidade: number
  totalAberto: number
  totalVencido: number
  totalPago: number
  totalParcial: number
  porStatus: Partial<Record<ReceberStatusCanon, number>>
}

export async function listContasReceberByStore(storeId: string): Promise<ContaReceberTitulo[]> {
  const sid = safeStr(storeId).trim()
  if (!sid) return []
  return prisma.contaReceberTitulo.findMany({
    where: { storeId: sid },
    orderBy: { updatedAt: "desc" },
  })
}

export async function getContaReceberById(storeId: string, id: string): Promise<ContaReceberTitulo | null> {
  const sid = safeStr(storeId).trim()
  const tid = safeStr(id).trim()
  if (!sid || !tid) return null
  return prisma.contaReceberTitulo.findFirst({
    where: { id: tid, storeId: sid },
  })
}

export async function getContaReceberByLocalKey(storeId: string, localKey: string): Promise<ContaReceberTitulo | null> {
  const sid = safeStr(storeId).trim()
  const lk = safeStr(localKey).trim()
  if (!sid || !lk) return null
  return prisma.contaReceberTitulo.findUnique({
    where: { storeId_localKey: { storeId: sid, localKey: lk } },
  })
}

async function findTitulo(
  storeId: string,
  opts: { id?: string; localKey?: string },
): Promise<ContaReceberTitulo | null> {
  if (opts.id) {
    const t = await getContaReceberById(storeId, opts.id)
    if (t) return t
  }
  if (opts.localKey) return await getContaReceberByLocalKey(storeId, opts.localKey)
  return null
}

/**
 * Upsert idempotente por `(storeId, localKey)` — compatível com adapter OS e rota PDV `/api/ops/contas-receber-persist`.
 */
export async function upsertContaReceber(input: UpsertContaReceberInput): Promise<ContaReceberTitulo> {
  const storeId = safeStr(input.storeId).trim()
  const localKey = safeStr(input.localKey).trim()
  if (!storeId || !localKey) {
    throw new Error("contas-receber-service: storeId e localKey são obrigatórios")
  }

  const existing = await prisma.contaReceberTitulo.findUnique({
    where: { storeId_localKey: { storeId, localKey } },
  })

  let nextPayload: Record<string, unknown>
  const basePayload = existing?.payload as Record<string, unknown> | undefined
  if (input.replacePayload && isRecord(input.payloadPatch)) {
    // Compatibilidade com APIs legadas que sempre enviam snapshot completo.
    nextPayload = { ...input.payloadPatch }
  } else {
    nextPayload = mergeFinanceiroPayload(basePayload, input.payloadPatch)
  }
  if (input.historicoEntrada && Object.keys(input.historicoEntrada).length > 0) {
    nextPayload = appendFinanceiroHistorico(nextPayload, input.historicoEntrada)
  }

  const valor =
    input.valor !== undefined ? safeMoney(input.valor) : safeMoney(existing?.valor ?? 0)
  const descricao = input.descricao !== undefined ? safeStr(input.descricao) : (existing?.descricao ?? "")
  const cliente = input.cliente !== undefined ? safeStr(input.cliente) : (existing?.cliente ?? "")
  const vencimento = input.vencimento !== undefined ? safeStr(input.vencimento) : (existing?.vencimento ?? "")

  const stIn = input.status ?? existing?.status ?? RECEBER_STATUS.PENDENTE
  const statusCanon = normalizeReceberStatus(stIn) ?? RECEBER_STATUS.PENDENTE

  const data = {
    descricao,
    cliente,
    valor,
    vencimento,
    status: statusCanon,
    payload: nextPayload as unknown as Prisma.InputJsonValue,
  }

  return prisma.contaReceberTitulo.upsert({
    where: { storeId_localKey: { storeId, localKey } },
    create: {
      storeId,
      localKey,
      ...data,
    },
    update: data,
  })
}

export async function cancelContaReceber(params: {
  storeId: string
  id?: string
  localKey?: string
  motivo?: string
  userLabel?: string
}): Promise<ContaReceberServiceResult<ContaReceberTitulo>> {
  const row = await findTitulo(params.storeId, { id: params.id, localKey: params.localKey })
  if (!row) return { ok: false, reason: "not_found" }

  const cur = normalizeReceberStatus(row.status)
  if (cur === RECEBER_STATUS.CANCELADO) return { ok: true, data: row }
  if (cur === RECEBER_STATUS.ESTORNADO) return { ok: false, reason: "titulo_estornado" }
  if (cur === RECEBER_STATUS.PAGO) return { ok: false, reason: "titulo_pago_nao_cancela_aqui" }

  const base = asPayloadRecord(row.payload)
  const merged = mergeFinanceiroPayload(base, {
    status: RECEBER_STATUS.CANCELADO,
    canceladoEm: new Date().toISOString(),
    ...(safeStr(params.motivo) ? { motivoCancelamento: safeStr(params.motivo) } : {}),
  })
  const withHist = appendFinanceiroHistorico(merged, {
    tipo: "cancelamento",
    userLabel: safeStr(params.userLabel) || undefined,
    motivo: safeStr(params.motivo) || undefined,
  })

  const updated = await prisma.contaReceberTitulo.update({
    where: { id: row.id },
    data: {
      status: RECEBER_STATUS.CANCELADO,
      payload: withHist as unknown as Prisma.InputJsonValue,
    },
  })
  return { ok: true, data: updated }
}

function saldoAberto(row: ContaReceberTitulo): number {
  const v = safeMoney(row.valor)
  const st = normalizeReceberStatus(row.status)
  if (st === RECEBER_STATUS.PAGO || st === RECEBER_STATUS.CANCELADO || st === RECEBER_STATUS.ESTORNADO) return 0
  const pago = sumPagamentosFromHistoricoPayload(row.payload)
  return safeMoney(Math.max(0, v - pago))
}

export async function liquidarContaReceber(params: {
  storeId: string
  id?: string
  localKey?: string
  observacao?: string
  userLabel?: string
}): Promise<ContaReceberServiceResult<ContaReceberTitulo>> {
  const row = await findTitulo(params.storeId, { id: params.id, localKey: params.localKey })
  if (!row) return { ok: false, reason: "not_found" }

  const cur = normalizeReceberStatus(row.status)
  if (cur === RECEBER_STATUS.CANCELADO || cur === RECEBER_STATUS.ESTORNADO) return { ok: false, reason: "titulo_encerrado" }
  if (cur === RECEBER_STATUS.PAGO) return { ok: true, data: row }

  const aberto = saldoAberto(row)
  if (aberto <= PAY_EPS) return { ok: false, reason: "nada_em_aberto" }

  let merged = asPayloadRecord(row.payload)
  merged = appendFinanceiroHistorico(merged, {
    tipo: "liquidacao",
    valor: aberto,
    observacao: safeStr(params.observacao) || undefined,
    userLabel: safeStr(params.userLabel) || undefined,
  })

  const updated = await prisma.contaReceberTitulo.update({
    where: { id: row.id },
    data: {
      status: RECEBER_STATUS.PAGO,
      payload: merged as unknown as Prisma.InputJsonValue,
    },
  })
  return { ok: true, data: updated }
}

export async function registrarPagamentoParcial(params: {
  storeId: string
  id?: string
  localKey?: string
  valorPago: number
  observacao?: string
  userLabel?: string
}): Promise<ContaReceberServiceResult<ContaReceberTitulo>> {
  const row = await findTitulo(params.storeId, { id: params.id, localKey: params.localKey })
  if (!row) return { ok: false, reason: "not_found" }

  const cur = normalizeReceberStatus(row.status)
  if (cur === RECEBER_STATUS.CANCELADO || cur === RECEBER_STATUS.ESTORNADO) return { ok: false, reason: "titulo_encerrado" }
  if (cur === RECEBER_STATUS.PAGO) return { ok: false, reason: "ja_pago" }

  const vp = safeMoney(params.valorPago)
  if (!(vp > PAY_EPS)) return { ok: false, reason: "valor_invalido" }

  const total = safeMoney(row.valor)
  const abertoAntes = saldoAberto(row)
  if (vp > abertoAntes + PAY_EPS) return { ok: false, reason: "valor_maior_que_aberto" }

  let merged = asPayloadRecord(row.payload)
  merged = appendFinanceiroHistorico(merged, {
    tipo: "pagamento",
    valor: vp,
    observacao: safeStr(params.observacao) || undefined,
    userLabel: safeStr(params.userLabel) || undefined,
  })

  const pago = sumPagamentosFromHistoricoPayload(merged)
  let nextStatus: ReceberStatusCanon = RECEBER_STATUS.PENDENTE
  if (pago + PAY_EPS >= total) nextStatus = RECEBER_STATUS.PAGO
  else if (pago > PAY_EPS) nextStatus = RECEBER_STATUS.PARCIAL

  const updated = await prisma.contaReceberTitulo.update({
    where: { id: row.id },
    data: {
      status: nextStatus,
      payload: merged as unknown as Prisma.InputJsonValue,
    },
  })
  return { ok: true, data: updated }
}

export type EstornoContaReceberModo = "titulo_completo" | "ultimo_pagamento"

export async function estornarContaReceber(params: {
  storeId: string
  id?: string
  localKey?: string
  modo: EstornoContaReceberModo
  motivo?: string
  userLabel?: string
}): Promise<ContaReceberServiceResult<ContaReceberTitulo>> {
  const row = await findTitulo(params.storeId, { id: params.id, localKey: params.localKey })
  if (!row) return { ok: false, reason: "not_found" }

  const cur = normalizeReceberStatus(row.status)
  if (cur === RECEBER_STATUS.CANCELADO) return { ok: false, reason: "titulo_cancelado" }
  if (cur === RECEBER_STATUS.ESTORNADO) return { ok: true, data: row }

  const base = asPayloadRecord(row.payload)
  const h = base.historico
  const arr = Array.isArray(h) ? [...h] : []

  if (params.modo === "titulo_completo") {
    const merged = mergeFinanceiroPayload(base, {
      estornoTituloEm: new Date().toISOString(),
      ...(safeStr(params.motivo) ? { motivoEstorno: safeStr(params.motivo) } : {}),
    })
    const withHist = appendFinanceiroHistorico(merged, {
      tipo: "estorno_titulo",
      motivo: safeStr(params.motivo) || undefined,
      userLabel: safeStr(params.userLabel) || undefined,
    })
    const updated = await prisma.contaReceberTitulo.update({
      where: { id: row.id },
      data: {
        status: RECEBER_STATUS.ESTORNADO,
        payload: withHist as unknown as Prisma.InputJsonValue,
      },
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
  if (lastIdx < 0 || !(lastValor > PAY_EPS)) {
    return { ok: false, reason: "sem_pagamento_para_estornar" }
  }

  const merged = appendFinanceiroHistorico(base, {
    tipo: "estorno_pagamento",
    valor: lastValor,
    refHistoricoIndex: lastIdx,
    motivo: safeStr(params.motivo) || undefined,
    userLabel: safeStr(params.userLabel) || undefined,
  })

  const pago = sumPagamentosFromHistoricoPayload(merged)
  const total = safeMoney(row.valor)
  let nextStatus: ReceberStatusCanon = RECEBER_STATUS.PENDENTE
  if (pago > PAY_EPS && pago + PAY_EPS < total) nextStatus = RECEBER_STATUS.PARCIAL
  else if (pago + PAY_EPS >= total) nextStatus = RECEBER_STATUS.PAGO
  else nextStatus = RECEBER_STATUS.PENDENTE

  const updated = await prisma.contaReceberTitulo.update({
    where: { id: row.id },
    data: {
      status: nextStatus,
      payload: merged as unknown as Prisma.InputJsonValue,
    },
  })
  return { ok: true, data: updated }
}

export type ContaReceberAuditItem = {
  id: string
  storeId: string
  localKey: string
  status: ReceberStatusCanon | null
  valor: number
  saldoAberto: number
  vencido: boolean
  cliente: string
  vencimento: string
}

/** Trilha leve para relatórios/auditoria (não persiste nada). */
export function buildContaReceberAuditTrail(titulos: ContaReceberTitulo[]): ContaReceberAuditItem[] {
  const out: ContaReceberAuditItem[] = []
  for (const row of titulos) {
    const statusCanon = normalizeReceberStatus(row.status)
    const aberto = saldoAberto(row)
    const vencido =
      aberto > PAY_EPS &&
      ((statusCanon === RECEBER_STATUS.VENCIDO) ||
        statusCanon === RECEBER_STATUS.PENDENTE ||
        statusCanon === RECEBER_STATUS.PARCIAL) &&
      isOverdueDateString(row.vencimento)
    out.push({
      id: row.id,
      storeId: row.storeId,
      localKey: row.localKey ?? row.id,
      status: statusCanon,
      valor: safeMoney(row.valor),
      saldoAberto: aberto,
      vencido,
      cliente: safeStr(row.cliente),
      vencimento: safeStr(row.vencimento),
    })
  }
  return out
}

export function buildContaReceberSummary(titulos: ContaReceberTitulo[]): ContaReceberSummary {
  const porStatus: Partial<Record<ReceberStatusCanon, number>> = {}
  let totalAberto = 0
  let totalVencido = 0
  let totalPago = 0
  let totalParcial = 0

  for (const row of titulos) {
    const c = normalizeReceberStatus(row.status) ?? RECEBER_STATUS.PENDENTE
    porStatus[c] = (porStatus[c] ?? 0) + 1

    const v = safeMoney(row.valor)
    const aberto = saldoAberto(row)

    if (c === RECEBER_STATUS.PAGO) {
      totalPago = safeMoney(totalPago + v)
    }
    if (c === RECEBER_STATUS.PARCIAL) {
      const pago = sumPagamentosFromHistoricoPayload(row.payload)
      totalParcial = safeMoney(totalParcial + pago)
    }

    if (c === RECEBER_STATUS.PENDENTE || c === RECEBER_STATUS.PARCIAL || c === RECEBER_STATUS.VENCIDO) {
      totalAberto = safeMoney(totalAberto + aberto)
    }

    const vencidoCanon = c === RECEBER_STATUS.VENCIDO
    const overdue =
      (c === RECEBER_STATUS.PENDENTE || c === RECEBER_STATUS.PARCIAL) && isOverdueDateString(row.vencimento)
    if (aberto > PAY_EPS && (vencidoCanon || overdue)) {
      totalVencido = safeMoney(totalVencido + aberto)
    }
  }

  return {
    quantidade: titulos.length,
    totalAberto,
    totalVencido,
    totalPago,
    totalParcial,
    porStatus,
  }
}
