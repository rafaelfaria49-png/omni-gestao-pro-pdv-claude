import { leituraEmpresaWhere } from "@/lib/gastos/read-scope"
import { prisma } from "@/lib/prisma"
import { dadosFinanceirosEmpresa, emTransacaoFinanceira, limparOwnershipSnapshot, manterReferenciaSnapshot, referenciaSnapshotEmpresa, type FinanceiroDb, type SnapshotVinculoAviso } from "@/lib/gastos/financeiro-scope"
import type { Prisma, ContaPagarTitulo } from "@/generated/prisma"
import { centavosLegadosExatos } from "@/lib/gastos/pagamentos"
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
import { pagamentosAtivosDoHistorico } from "@/lib/financeiro/services/contas-receber-service"

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

/** Projeção de compatibilidade; fatos estruturados já foram gravados no mesmo tx.
 * Nunca aceita histórico do request nem substitui um evento anterior.
 */
export async function projetarPagamentoEstruturadoContaPagar(db: FinanceiroDb, row: ContaPagarTitulo, event: {
  pagamentoId: string; operacaoId: string; movimentoId: string; valorCentavos: bigint;
  estorno: boolean; pagoEm: Date; motivo?: string
}, pagoLiquidoCentavos: bigint) {
  const total = centavosLegadosExatos(row.valor)
  const status = pagoLiquidoCentavos === total ? "pago" : pagoLiquidoCentavos > BigInt(0) ? "parcial" : "pendente"
  const payload = appendFinanceiroHistorico(asPayloadRecord(row.payload), {
    tipo: event.estorno ? "estorno_pagamento" : "pagamento", valor: Number(event.valorCentavos) / 100,
    pagamentoId: event.pagamentoId, operacaoId: event.operacaoId, movimentoId: event.movimentoId,
    dataPagamento: event.pagoEm.toISOString(), ...(event.motivo ? { motivo: event.motivo } : {}),
  })
  const cas = await db.contaPagarTitulo.updateMany({ where: { id: row.id, versaoFinanceira: row.versaoFinanceira },
    data: { status, payload: payload as Prisma.InputJsonObject, versaoFinanceira: { increment: 1 } } })
  if (cas.count !== 1) throw new Error("Conflito de versão financeira")
}

export type ContaPagarServiceResult<T> = { ok: true; data: T } | { ok: false; reason: string }

export type UpsertContaPagarInput = {
  storeId: string
  db?: FinanceiroDb
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
  onWarning?: (aviso: SnapshotVinculoAviso) => void
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
    where: leituraEmpresaWhere(sid, { storeId: sid }),
    orderBy: { updatedAt: "desc" },
  })
}

export async function getContaPagarById(storeId: string, id: string, db: FinanceiroDb = prisma): Promise<ContaPagarTitulo | null> {
  const sid = safeStr(storeId).trim()
  const tid = safeStr(id).trim()
  if (!sid || !tid) return null
  return db.contaPagarTitulo.findFirst({ where: leituraEmpresaWhere(sid, { id: tid, storeId: sid }) })
}

export async function getContaPagarByLocalKey(storeId: string, localKey: string, db: FinanceiroDb = prisma): Promise<ContaPagarTitulo | null> {
  const sid = safeStr(storeId).trim()
  const lk = safeStr(localKey).trim()
  if (!sid || !lk) return null
  return db.contaPagarTitulo.findUnique({
    where: { ...leituraEmpresaWhere(sid, {}), storeId_localKey: { storeId: sid, localKey: lk } },
  })
}

/** Cliente da transação do chamador (travas + escrita atômica com a movimentação). */
export type ContaPagarDbClient = Prisma.TransactionClient

async function findTitulo(
  storeId: string,
  opts: { id?: string; localKey?: string },
  db: FinanceiroDb,
): Promise<ContaPagarTitulo | null> {
  // Ler o ledger somente após adquirir a trava, na transação que fará a escrita.
  if (opts.id) await db.$queryRaw`SELECT "id" FROM "contas_pagar_titulos" WHERE "id" = ${opts.id} AND "storeId" = ${storeId} FOR UPDATE`
  else await db.$queryRaw`SELECT "id" FROM "contas_pagar_titulos" WHERE "localKey" = ${opts.localKey ?? ""} AND "storeId" = ${storeId} FOR UPDATE`
  if (opts.id) {
    const t = await getContaPagarById(storeId, opts.id, db)
    if (t) return t.ativo === false ? null : t
  }
  if (opts.localKey) {
    if (opts.id) await db.$queryRaw`SELECT "id" FROM "contas_pagar_titulos" WHERE "localKey" = ${opts.localKey} AND "storeId" = ${storeId} FOR UPDATE`
    const t = await getContaPagarByLocalKey(storeId, opts.localKey, db)
    return t?.ativo === false ? null : t
  }
  return null
}

/**
 * Trava a linha do título (`SELECT … FOR UPDATE`) dentro da transação do chamador: pagamento
 * e estorno do MESMO título passam a ser serializados. Devolve o id, ou null se não existe.
 */
export async function travarTituloContaPagar(
  db: ContaPagarDbClient,
  storeId: string,
  ref: { id?: string; localKey?: string },
): Promise<string | null> {
  const sid = safeStr(storeId).trim()
  const id = safeStr(ref.id).trim()
  const lk = safeStr(ref.localKey).trim()
  if (!sid || (!id && !lk)) return null
  const rows = id
    ? await db.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "contas_pagar_titulos" WHERE "id" = ${id} AND "storeId" = ${sid} FOR UPDATE`
    : await db.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "contas_pagar_titulos" WHERE "storeId" = ${sid} AND "localKey" = ${lk} FOR UPDATE`
  return rows[0]?.id ?? null
}

/**
 * Escrita com token otimista (`updatedAt` lido): um `update` cego apagaria um pagamento ou
 * estorno gravado por outra requisição entre a leitura e a escrita (lost update).
 */
async function gravarComToken(
  db: ContaPagarDbClient | typeof prisma,
  row: ContaPagarTitulo,
  data: { status: string; payload: Record<string, unknown>; escopo?: Record<string, unknown> },
): Promise<ContaPagarServiceResult<ContaPagarTitulo>> {
  // Reconciliação G002: o escopo EMPRESA (perfil/precisão) entra na MESMA escrita com token.
  const res = await db.contaPagarTitulo.updateMany({
    where: { id: row.id, storeId: row.storeId, updatedAt: row.updatedAt },
    // Reconciliação G004: a escrita legada (#397) também avança versaoFinanceira — o CAS do motor
    // atômico (projetarPagamentoEstruturadoContaPagar) nunca aceita um token anterior a ela.
    data: { ...(data.escopo ?? {}), status: data.status, payload: data.payload as unknown as Prisma.InputJsonValue, versaoFinanceira: { increment: 1 } },
  })
  if (res.count !== 1) return { ok: false, reason: "titulo_alterado" }
  const updated = await db.contaPagarTitulo.findFirst({ where: { id: row.id, storeId: row.storeId } })
  return updated ? { ok: true, data: updated } : { ok: false, reason: "titulo_alterado" }
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

  return emTransacaoFinanceira(input.db, async (tx) => {
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "contas_pagar_titulos" WHERE "storeId" = ${storeId} AND "localKey" = ${localKey} FOR UPDATE`
      const existing = locked.length ? await getContaPagarByLocalKey(storeId, localKey, tx) : null
      if (existing?.ativo === false) throw new Error("contas-pagar-service: título indisponível")
      const base = asPayloadRecord(existing?.payload)
      const historico = Array.isArray(base.historico) ? base.historico : []
      const ledgerServidor = historico.some((e) => isRecord(e) && typeof e.at === "string" && e.at.length > 0)
      const patch = limparOwnershipSnapshot(input.payloadPatch)
      let nextPayload = input.replacePayload ? patch : mergeFinanceiroPayload(base, patch)
      if (ledgerServidor || input.replacePayload) {
        for (const key of ["historico", "canceladoEm", "motivoCancelamento", "estornoTituloEm", "motivoEstorno"]) {
          if (base[key] !== undefined && (ledgerServidor || !(key in patch))) nextPayload[key] = base[key]
        }
      }
      const carteiraId = await referenciaSnapshotEmpresa(tx, storeId, "carteiraId", patch.carteiraId,
        existing?.carteiraId ?? null, ledgerServidor, input.onWarning)
      const fornecedorId = await referenciaSnapshotEmpresa(tx, storeId, "fornecedorId", input.fornecedorId,
        existing?.fornecedorId ?? null, ledgerServidor, input.onWarning)
      nextPayload = ensureFornecedorAndDocumentoInPayload({ payload: nextPayload,
        fornecedorId, fornecedorNome: input.fornecedorNome, numeroDocumento: input.numeroDocumento })
      manterReferenciaSnapshot(nextPayload, "carteiraId", carteiraId, base, ledgerServidor)
      manterReferenciaSnapshot(nextPayload, "fornecedorId", fornecedorId, base, ledgerServidor)
      if (input.historicoEntrada && Object.keys(input.historicoEntrada).length) {
        nextPayload = appendFinanceiroHistorico(nextPayload, input.historicoEntrada)
      }
      const valor = input.replacePayload && ledgerServidor && existing ? existing.valor : (input.valor ?? existing?.valor ?? 0)
      let status = normalizePagarStatus(input.status ?? existing?.status) ?? PAGAR_STATUS.PENDENTE
      if (existing && input.replacePayload) {
        const anterior = normalizePagarStatus(existing.status)
        if (anterior === PAGAR_STATUS.PAGO || anterior === PAGAR_STATUS.CANCELADO || anterior === PAGAR_STATUS.ESTORNADO) status = anterior
        else if (ledgerServidor) {
          const pago = sumPagamentosFromHistoricoPayloadContaPagar(nextPayload)
          status = pago + PAY_EPS >= valor ? PAGAR_STATUS.PAGO : pago > PAY_EPS ? PAGAR_STATUS.PARCIAL : status
        }
      }
      const scope = await dadosFinanceirosEmpresa(tx, storeId, valor,
        carteiraId === existing?.carteiraId ? { carteiraHistoricaId: carteiraId } : { carteiraId })
      const data = { storeId, localKey, ...scope, carteiraId,
        fornecedorId,
        descricao: input.descricao !== undefined ? safeStr(input.descricao) : existing?.descricao ?? "",
        valor, vencimento: input.vencimento !== undefined ? safeStr(input.vencimento) : existing?.vencimento ?? "",
        numeroDocumento: input.numeroDocumento !== undefined ? safeStr(input.numeroDocumento) : existing?.numeroDocumento ?? "",
        status, payload: limparOwnershipSnapshot(nextPayload, base) as Prisma.InputJsonValue }
      if (existing) return tx.contaPagarTitulo.update({ where: { id: existing.id }, data })
      const created = await tx.contaPagarTitulo.createMany({ data: [data], skipDuplicates: true })
      if (created.count) {
        const row = await getContaPagarByLocalKey(storeId, localKey, tx)
        if (row) return row
      }
    }
    throw new Error("contas-pagar-service: título alterado em paralelo; tente novamente")
  })
}

export async function cancelContaPagar(params: {
  storeId: string
  db?: FinanceiroDb
  id?: string
  localKey?: string
  motivo?: string
  userLabel?: string
}): Promise<ContaPagarServiceResult<ContaPagarTitulo>> {
  return emTransacaoFinanceira<ContaPagarServiceResult<ContaPagarTitulo>>(params.db, async (tx) => {
  const row = await findTitulo(params.storeId, { id: params.id, localKey: params.localKey }, tx)
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

  return gravarComToken(tx, row, { status: PAGAR_STATUS.CANCELADO, payload: merged,
    escopo: await dadosFinanceirosEmpresa(tx, params.storeId, row.valor, { carteiraHistoricaId: row.carteiraId }) })
  })
}

export async function liquidarContaPagar(params: {
  storeId: string
  id?: string
  localKey?: string
  observacao?: string
  userLabel?: string
  /** Quando informado, participa da transação (e das travas) do chamador. */
  db?: ContaPagarDbClient
}): Promise<ContaPagarServiceResult<ContaPagarTitulo>> {
  return emTransacaoFinanceira<ContaPagarServiceResult<ContaPagarTitulo>>(params.db, async (tx) => {
  const row = await findTitulo(params.storeId, { id: params.id, localKey: params.localKey }, tx)
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

  return gravarComToken(tx, row, { status: PAGAR_STATUS.PAGO, payload: merged,
    escopo: await dadosFinanceirosEmpresa(tx, params.storeId, row.valor, { carteiraHistoricaId: row.carteiraId }) })
  })
}

export async function registrarPagamentoParcialContaPagar(params: {
  storeId: string
  id?: string
  localKey?: string
  valorPago: number
  observacao?: string
  userLabel?: string
  db?: ContaPagarDbClient
}): Promise<ContaPagarServiceResult<ContaPagarTitulo>> {
  return emTransacaoFinanceira<ContaPagarServiceResult<ContaPagarTitulo>>(params.db, async (tx) => {
  const row = await findTitulo(params.storeId, { id: params.id, localKey: params.localKey }, tx)
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

  return gravarComToken(tx, row, { status: nextStatus, payload: merged,
    escopo: await dadosFinanceirosEmpresa(tx, params.storeId, row.valor, { carteiraHistoricaId: row.carteiraId }) })
  })
}

export type EstornoContaPagarModo = "titulo_completo" | "ultimo_pagamento"

export async function estornarContaPagar(params: {
  storeId: string
  id?: string
  localKey?: string
  modo: EstornoContaPagarModo
  motivo?: string
  userLabel?: string
  /**
   * `ultimo_pagamento`: estorna EXATAMENTE este pagamento (índice no `historico`) em vez do
   * último ativo. Já estornado ⇒ `pagamento_ja_estornado`, sem escrita.
   */
  pagamentoIndex?: number
  db?: ContaPagarDbClient
}): Promise<ContaPagarServiceResult<ContaPagarTitulo>> {
  return emTransacaoFinanceira<ContaPagarServiceResult<ContaPagarTitulo>>(params.db, async (tx) => {
  const row = await findTitulo(params.storeId, { id: params.id, localKey: params.localKey }, tx)
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
    return gravarComToken(tx, row, { status: PAGAR_STATUS.ESTORNADO, payload: merged,
      escopo: await dadosFinanceirosEmpresa(tx, params.storeId, row.valor, { carteiraHistoricaId: row.carteiraId }) })
  }

  // Identidade do pagamento = índice no `historico` (mesmo contrato do Contas a Receber,
  // `pagamentosAtivosDoHistorico`). Antes o alvo era o último `pagamento` do array MESMO já
  // estornado: dois estornos seguidos revertiam o mesmo pagamento duas vezes.
  const ledger = pagamentosAtivosDoHistorico(arr)
  if (ledger.ambiguo) return { ok: false, reason: "historico_ambiguo" }
  let alvo: { index: number; valor: number } | undefined
  if (params.pagamentoIndex !== undefined) {
    if (ledger.estornados.has(params.pagamentoIndex)) return { ok: false, reason: "pagamento_ja_estornado" }
    alvo = ledger.ativos.find((a) => a.index === params.pagamentoIndex)
    if (!alvo) return { ok: false, reason: "pagamento_nao_encontrado" }
  } else {
    alvo = ledger.ativos[ledger.ativos.length - 1]
  }
  if (!alvo) return { ok: false, reason: "sem_pagamento_para_estornar" }
  const lastIdx = alvo.index
  const lastValor = alvo.valor

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

  return gravarComToken(tx, row, { status: nextStatus, payload: merged,
    escopo: await dadosFinanceirosEmpresa(tx, params.storeId, row.valor, { carteiraHistoricaId: row.carteiraId }) })
  })
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
    if (!row.storeId) throw new Error("Contrato empresarial de auditoria exige loja.")
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

