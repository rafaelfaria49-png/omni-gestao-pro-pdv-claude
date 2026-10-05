import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma"
import type { ContaReceberTitulo } from "@/generated/prisma"
import { mergeFinanceiroPayload, appendFinanceiroHistorico } from "@/lib/financeiro/contracts/payload"
import { RECEBER_STATUS, normalizeReceberStatus, type ReceberStatusCanon } from "@/lib/financeiro/contracts/status"
import { safeMoney, isOverdueDateString, PAY_EPS } from "@/lib/financeiro/contracts/valores"
import { parseFinanceiroLocalKey } from "@/lib/financeiro/contracts/local-key"

/**
 * Cliente Prisma aceito pelos services de Contas a Receber: o singleton global OU um
 * `Prisma.TransactionClient` recebido de `$transaction`. Permite que a baixa (título +
 * histórico + movimentação + caixa) participe de UMA unidade transacional.
 * Mesmo padrão já usado em `lib/estoque/deposito-core.ts`.
 */
export type ContaReceberDbClient = Prisma.TransactionClient

/** Sem `db`, usa o singleton global — chamadores existentes não mudam. */
function dbOf(db?: ContaReceberDbClient): ContaReceberDbClient {
  return db ?? prisma
}

/**
 * Chaves do `payload` cuja autoridade é do SERVIDOR (livro-razão financeiro).
 *
 * `replacePayload: true` existe para os caminhos legados que sempre reenviam o snapshot
 * INTEIRO do localStorage/import/sync. Esse snapshot pode substituir campos de
 * apresentação, mas nunca apagar o que o servidor gravou: `historico` é a única fonte de
 * `saldoAberto`, e apagá-lo ressuscita dívida já recebida.
 *
 * Exceção deliberada: se o próprio chamador envia a chave no `payloadPatch`, ele é a
 * autoridade sobre ela (ex.: importador que reconstrói o histórico a cada re-importação) —
 * **exceto** quando o servidor já gravou lançamentos naquele título (ver
 * `temLedgerDoServidor`).
 */
export const CONTA_RECEBER_SERVER_OWNED_PAYLOAD_KEYS = [
  "historico",
  "canceladoEm",
  "motivoCancelamento",
  "estornoTituloEm",
  "motivoEstorno",
] as const

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v)
}

/** Título da OS pela chave do adapter (`os-faturamento:{storeId}:{osId}`). */
function ehTituloDaOS(localKey: string | null | undefined): boolean {
  return parseFinanceiroLocalKey(localKey).type === "os_faturamento"
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

/**
 * O servidor já gravou algum lançamento no ledger deste título?
 *
 * `appendFinanceiroHistorico` é o ÚNICO caminho pelo qual o servidor apenda ao
 * `historico`, e ele sempre carimba `at`. Os importadores montam entradas próprias com
 * `data`/`importadoEm` e nunca `at`. Logo, a presença de `at` identifica com segurança um
 * lançamento nascido aqui dentro (PDV, Financeiro, OS) — inclusive nos títulos que já
 * existem em produção, que não têm marcador de origem explícito.
 *
 * A partir do primeiro lançamento do servidor, o ledger daquele título passa a ser dele:
 * re-importar a planilha de origem (que não conhece o pagamento feito no PDV) não pode
 * mais reescrever o histórico nem ressuscitar a dívida.
 */
function temLedgerDoServidor(payload: unknown): boolean {
  const h = asPayloadRecord(payload).historico
  if (!Array.isArray(h)) return false
  return h.some((e) => isRecord(e) && typeof e.at === "string" && e.at.length > 0)
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
  db?: ContaReceberDbClient
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

export async function getContaReceberById(
  storeId: string,
  id: string,
  db?: ContaReceberDbClient,
): Promise<ContaReceberTitulo | null> {
  const sid = safeStr(storeId).trim()
  const tid = safeStr(id).trim()
  if (!sid || !tid) return null
  return dbOf(db).contaReceberTitulo.findFirst({
    where: { id: tid, storeId: sid },
  })
}

export async function getContaReceberByLocalKey(
  storeId: string,
  localKey: string,
  db?: ContaReceberDbClient,
): Promise<ContaReceberTitulo | null> {
  const sid = safeStr(storeId).trim()
  const lk = safeStr(localKey).trim()
  if (!sid || !lk) return null
  return dbOf(db).contaReceberTitulo.findUnique({
    where: { storeId_localKey: { storeId: sid, localKey: lk } },
  })
}

async function findTitulo(
  storeId: string,
  opts: { id?: string; localKey?: string; db?: ContaReceberDbClient },
): Promise<ContaReceberTitulo | null> {
  if (opts.id) {
    const t = await getContaReceberById(storeId, opts.id, opts.db)
    if (t) return t
  }
  if (opts.localKey) return await getContaReceberByLocalKey(storeId, opts.localKey, opts.db)
  return null
}

/**
 * Resolve a linha usada para calcular E gravar uma baixa.
 *
 * Quando o chamador já leu o título para calcular saldo/valor (lote e PDV singular), ele
 * precisa entregar exatamente esse snapshot. Relê-lo aqui abriria uma janela T0 → T1 em
 * que o título poderia mudar, fazendo o CAS proteger uma versão diferente da usada para
 * calcular a movimentação e o caixa.
 */
async function findTituloParaBaixa(
  storeId: string,
  opts: {
    id?: string
    localKey?: string
    tituloSnapshot?: ContaReceberTitulo
    db?: ContaReceberDbClient
  },
): Promise<ContaReceberTitulo | null> {
  const snapshot = opts.tituloSnapshot
  if (!snapshot) return findTitulo(storeId, opts)
  if (snapshot.storeId !== storeId) return null
  if (opts.id && snapshot.id !== opts.id) return null
  if (opts.localKey && snapshot.localKey !== opts.localKey) return null
  return snapshot
}

/**
 * Status canônico quando um snapshot legado reescreve o título (`replacePayload`) sem
 * trazer o próprio livro-razão.
 *
 * 1. Estado terminal do servidor (pago/cancelado/estornado) não é reaberto por um
 *    snapshot antigo — título quitado nunca volta a ser dívida em aberto.
 * 2. O status nunca contradiz o `historico` preservado: com pagamentos gravados,
 *    "pendente" é uma mentira — deriva-se parcial/pago.
 *
 * A guarda é unidirecional: ela impede REABRIR dívida, não impede encerrá-la. Um chamador
 * que peça `cancelado`/`estornado` continua sendo atendido, mesmo com ledger no título.
 */
function canonicalSnapshotStatus(params: {
  existente: string
  payload: Record<string, unknown>
  valor: number
  pedido: ReceberStatusCanon
}): ReceberStatusCanon {
  const atual = normalizeReceberStatus(params.existente)
  if (atual === RECEBER_STATUS.PAGO || atual === RECEBER_STATUS.CANCELADO || atual === RECEBER_STATUS.ESTORNADO) {
    return atual
  }
  if (params.pedido === RECEBER_STATUS.CANCELADO || params.pedido === RECEBER_STATUS.ESTORNADO) {
    return params.pedido
  }
  const pago = sumPagamentosFromHistoricoPayload(params.payload)
  if (params.valor > PAY_EPS && pago + PAY_EPS >= params.valor) return RECEBER_STATUS.PAGO
  if (pago > PAY_EPS) return RECEBER_STATUS.PARCIAL
  return params.pedido
}

// ─── trava do título ─────────────────────────────────────────────────────────
//
// Writers de título que leem a linha para derivar `payload`/`status` (upsert, cancelamento,
// adapter da OS) leem SÓ depois de travá-la, na MESMA transação em que gravam: um pagamento
// (CAS em `updatedAt`, trava do recebimento V3 ou lote) que commite no meio nunca é apagado
// por um snapshot anterior. Sem `db`, abrem uma transação curta própria; com `db` (o `tx` do
// chamador, ex. V3 com a OS e o título já travados), re-travar a mesma linha é no-op e
// nenhuma trava nova entra na ordem do chamador (sem advisory, sem outra tabela).
//
// Título AUSENTE: `FOR UPDATE` sem linha não trava a ausência. A criação usa
// `INSERT … ON CONFLICT DO NOTHING` (`createMany` + `skipDuplicates`): se outra transação
// criou o título no meio, o INSERT espera o commit dela, não grava nada, e o writer volta a
// travar e reler a linha que ela gravou — nunca a sobrescreve com o que montou sem ela.

/** Transação curta dos writers de título (mesmos limites dos writers de pagamento). */
const TX_TITULO_CONTA_RECEBER = { maxWait: 5_000, timeout: 15_000 } as const

/** Releituras após perder a corrida de criação (o INSERT concorrente já commitou). */
const MAX_TENTATIVAS_TITULO = 3

/** Executa `fn` na transação do chamador ou numa transação curta própria. */
export function naTransacaoDoTituloContaReceber<T>(
  db: ContaReceberDbClient | undefined,
  fn: (tx: ContaReceberDbClient) => Promise<T>,
): Promise<T> {
  return db ? fn(db) : prisma.$transaction(fn, TX_TITULO_CONTA_RECEBER)
}

/** `SELECT … FOR UPDATE` do título desta loja (por id OU localKey). `false` = não existe. */
export async function travarTituloContaReceber(
  tx: ContaReceberDbClient,
  storeId: string,
  ref: { id?: string; localKey?: string },
): Promise<boolean> {
  const rows = ref.id
    ? await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "contas_receber_titulos" WHERE "id" = ${ref.id} AND "storeId" = ${storeId} FOR UPDATE
      `
    : await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "contas_receber_titulos" WHERE "storeId" = ${storeId} AND "localKey" = ${ref.localKey ?? ""} FOR UPDATE
      `
  return Array.isArray(rows) && rows.length > 0
}

export type DadosTituloContaReceber = {
  descricao: string
  cliente: string
  valor: number
  vencimento: string
  status: string
  payload: Prisma.InputJsonValue
}

/**
 * Trava o título `(storeId, localKey)`, relê a linha MAIS RECENTE e grava o que `montar`
 * derivar dela — UPDATE da linha travada, ou INSERT se ausente. Criação concorrente: o
 * INSERT não sobrescreve; relê e remonta sobre a linha criada (até `MAX_TENTATIVAS_TITULO`).
 */
export async function gravarTituloContaReceberTravado(p: {
  storeId: string
  localKey: string
  db?: ContaReceberDbClient
  montar: (existente: ContaReceberTitulo | null) => DadosTituloContaReceber
}): Promise<{ row: ContaReceberTitulo; criado: boolean }> {
  return naTransacaoDoTituloContaReceber(p.db, async (tx) => {
    for (let tentativa = 0; tentativa < MAX_TENTATIVAS_TITULO; tentativa++) {
      // Só deriva UPDATE de linha que ESTA transação travou. Trava vazia = ausente, mesmo que
      // uma leitura agora já enxergue o título criado no meio (ainda sem trava): vai para o
      // INSERT sem sobrescrita, que não grava nada, e a próxima volta trava e relê a linha.
      const travado = await travarTituloContaReceber(tx, p.storeId, { localKey: p.localKey })
      const existente = travado ? await getContaReceberByLocalKey(p.storeId, p.localKey, tx) : null
      const data = p.montar(existente)
      if (existente) {
        const row = await tx.contaReceberTitulo.update({ where: { id: existente.id }, data })
        return { row, criado: false }
      }
      const r = await tx.contaReceberTitulo.createMany({
        data: [{ storeId: p.storeId, localKey: p.localKey, ...data }],
        skipDuplicates: true,
      })
      if (r.count === 1) {
        const row = await getContaReceberByLocalKey(p.storeId, p.localKey, tx)
        if (row) return { row, criado: true }
      }
      // Outro writer criou o título no meio: trava e remonta sobre o que ele gravou.
    }
    throw new Error("contas-receber-service: título alterado em paralelo; tente novamente")
  })
}

/**
 * Upsert idempotente por `(storeId, localKey)` — compatível com adapter OS e rota PDV `/api/ops/contas-receber-persist`.
 *
 * Lê o título travado e grava na mesma transação (ver "trava do título"): o snapshot de
 * tela/import nunca é comparado com um ledger antigo nem grava por cima de um pagamento ou
 * de um título criado em paralelo.
 */
export async function upsertContaReceber(input: UpsertContaReceberInput): Promise<ContaReceberTitulo> {
  const storeId = safeStr(input.storeId).trim()
  const localKey = safeStr(input.localKey).trim()
  if (!storeId || !localKey) {
    throw new Error("contas-receber-service: storeId e localKey são obrigatórios")
  }

  const { row } = await gravarTituloContaReceberTravado({
    storeId,
    localKey,
    db: input.db,
    montar: (existing) => montarUpsertContaReceber(input, existing),
  })
  return row
}

function montarUpsertContaReceber(input: UpsertContaReceberInput, existing: ContaReceberTitulo | null): DadosTituloContaReceber {
  let nextPayload: Record<string, unknown>
  const basePayload = existing?.payload as Record<string, unknown> | undefined
  // O chamador só é autoridade sobre o livro-razão se (a) enviar `historico` e (b) o
  // servidor ainda não tiver gravado lançamento nenhum nesse título. Re-importação de
  // planilha continua reescrevendo o histórico que ela mesma criou — mas nunca apaga um
  // pagamento nascido no PDV/Financeiro.
  const ledgerDoChamador =
    !!(input.replacePayload && isRecord(input.payloadPatch) && "historico" in input.payloadPatch) &&
    !temLedgerDoServidor(basePayload)
  if (input.replacePayload && isRecord(input.payloadPatch)) {
    // Compatibilidade com APIs legadas que sempre enviam snapshot completo.
    nextPayload = { ...input.payloadPatch }
    // Canonicalidade: o snapshot do cliente não apaga o que o servidor gravou.
    for (const k of CONTA_RECEBER_SERVER_OWNED_PAYLOAD_KEYS) {
      const cedeAoChamador = k === "historico" ? ledgerDoChamador : k in input.payloadPatch
      if (cedeAoChamador) continue
      const prev = basePayload?.[k]
      if (prev !== undefined) nextPayload[k] = prev
    }
  } else {
    nextPayload = mergeFinanceiroPayload(basePayload, input.payloadPatch)
  }
  if (input.historicoEntrada && Object.keys(input.historicoEntrada).length > 0) {
    nextPayload = appendFinanceiroHistorico(nextPayload, input.historicoEntrada)
  }

  // Título da OS (`os-faturamento:*`): o valor é derivado da OS — só o adapter o regrava, sob
  // a trava OS → título. Um snapshot legado inteiro (tela/sync) pode trazer a linha de antes
  // do faturamento vigente; ele não troca esse valor. Títulos manuais/legados seguem o snapshot.
  const valorDaOS = !!(input.replacePayload && existing && ehTituloDaOS(existing.localKey))
  const valor =
    input.valor !== undefined && !valorDaOS ? safeMoney(input.valor) : safeMoney(existing?.valor ?? 0)
  const descricao = input.descricao !== undefined ? safeStr(input.descricao) : (existing?.descricao ?? "")
  const cliente = input.cliente !== undefined ? safeStr(input.cliente) : (existing?.cliente ?? "")
  const vencimento = input.vencimento !== undefined ? safeStr(input.vencimento) : (existing?.vencimento ?? "")

  const stIn = input.status ?? existing?.status ?? RECEBER_STATUS.PENDENTE
  const statusPedido = normalizeReceberStatus(stIn) ?? RECEBER_STATUS.PENDENTE
  const statusCanon =
    input.replacePayload && existing && !ledgerDoChamador
      ? canonicalSnapshotStatus({ existente: existing.status, payload: nextPayload, valor, pedido: statusPedido })
      : statusPedido

  return {
    descricao,
    cliente,
    valor,
    vencimento,
    status: statusCanon,
    payload: nextPayload as unknown as Prisma.InputJsonValue,
  }
}

/**
 * Cancela o título decidindo sobre a linha TRAVADA e relida na mesma transação (ver "trava
 * do título"): um pagamento que commite no meio nunca é apagado, e as condições financeiras
 * (pago/estornado/recebido) valem sobre o estado mais recente.
 *
 * `exigirSemRecebimento`: recusa (`titulo_com_recebimento`) se o título já tem QUALQUER valor
 * recebido — contrato do cancelamento seguro da OS. `db`: transação do chamador (ex.: a OS já
 * travada antes do título — ordem OS → título).
 */
export async function cancelContaReceber(params: {
  storeId: string
  id?: string
  localKey?: string
  motivo?: string
  userLabel?: string
  exigirSemRecebimento?: boolean
  db?: ContaReceberDbClient
}): Promise<ContaReceberServiceResult<ContaReceberTitulo>> {
  return naTransacaoDoTituloContaReceber(params.db, async (tx) => {
    // Mesma resolução de `findTitulo` (id, senão localKey), cada candidata travada antes de lida.
    let row: ContaReceberTitulo | null = null
    if (params.id && (await travarTituloContaReceber(tx, params.storeId, { id: params.id }))) {
      row = await getContaReceberById(params.storeId, params.id, tx)
    }
    if (!row && params.localKey && (await travarTituloContaReceber(tx, params.storeId, { localKey: params.localKey }))) {
      row = await getContaReceberByLocalKey(params.storeId, params.localKey, tx)
    }
    if (!row) return { ok: false, reason: "not_found" }
    return cancelarTituloTravado(tx, row, params)
  })
}

async function cancelarTituloTravado(
  tx: ContaReceberDbClient,
  row: ContaReceberTitulo,
  params: { motivo?: string; userLabel?: string; exigirSemRecebimento?: boolean },
): Promise<ContaReceberServiceResult<ContaReceberTitulo>> {
  const cur = normalizeReceberStatus(row.status)
  if (cur === RECEBER_STATUS.CANCELADO) return { ok: true, data: row }
  if (cur === RECEBER_STATUS.ESTORNADO) return { ok: false, reason: "titulo_estornado" }
  if (cur === RECEBER_STATUS.PAGO) return { ok: false, reason: "titulo_pago_nao_cancela_aqui" }
  if (params.exigirSemRecebimento && sumPagamentosFromHistoricoPayload(row.payload) > PAY_EPS) {
    return { ok: false, reason: "titulo_com_recebimento" }
  }

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

  const updated = await tx.contaReceberTitulo.update({
    where: { id: row.id },
    data: {
      status: RECEBER_STATUS.CANCELADO,
      payload: withHist as unknown as Prisma.InputJsonValue,
    },
  })
  return { ok: true, data: updated }
}

/**
 * Grava a baixa (ou o estorno) no título.
 *
 * A escrita sempre carrega um **token otimista** (`updatedAt` lido junto com a linha).
 * `status` e `payload` são calculados em JS a partir da leitura de
 * `row`, então um update cego sobrescreve **em silêncio** o que outra transação tenha
 * gravado no intervalo. Nem o Postgres nem o Prisma barram isso — sob READ COMMITTED o
 * segundo `UPDATE` apenas espera o commit do primeiro e então grava valores derivados de
 * um estado que já não existe (*lost update* clássico). Dois recebimentos simultâneos do
 * MESMO título deixariam duas entradas de caixa e um `historico` com um pagamento só.
 * `updatedAt` já existe no schema e é o token indicado pelo design do multitítulo
 * (`AUDITORIA_PDV_RECEBIMENTO_MULTITITULO_DESIGN_001.md` §6).
 *
 * `updateMany` de propósito: devolve contagem em vez de lançar, e não deixa a transação do
 * chamador em estado abortado.
 */
async function gravarBaixaNoTitulo(
  db: ContaReceberDbClient,
  row: ContaReceberTitulo,
  next: { status: ReceberStatusCanon; payload: Record<string, unknown> },
): Promise<ContaReceberServiceResult<ContaReceberTitulo>> {
  const data = {
    status: next.status,
    payload: next.payload as unknown as Prisma.InputJsonValue,
  }

  const res = await db.contaReceberTitulo.updateMany({
    where: { id: row.id, storeId: row.storeId, updatedAt: row.updatedAt },
    data,
  })
  if (res.count !== 1) return { ok: false, reason: "titulo_alterado" }

  const updated = await db.contaReceberTitulo.findFirst({
    where: { id: row.id, storeId: row.storeId },
  })
  if (!updated) return { ok: false, reason: "titulo_alterado" }
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
  formaPagamento?: string
  userLabel?: string
  /** Identidade da operação em LOTE (G2), carimbada no histórico para rastreabilidade. */
  loteId?: string
  /** Snapshot já usado pelo chamador para calcular saldo/valor; também fornece o token CAS. */
  tituloSnapshot?: ContaReceberTitulo
  db?: ContaReceberDbClient
}): Promise<ContaReceberServiceResult<ContaReceberTitulo>> {
  const row = await findTituloParaBaixa(params.storeId, {
    id: params.id,
    localKey: params.localKey,
    tituloSnapshot: params.tituloSnapshot,
    db: params.db,
  })
  if (!row) return { ok: false, reason: "not_found" }

  const cur = normalizeReceberStatus(row.status)
  if (cur === RECEBER_STATUS.CANCELADO || cur === RECEBER_STATUS.ESTORNADO) return { ok: false, reason: "titulo_encerrado" }
  // Título já quitado NÃO é sucesso: devolver `ok:true` fazia o chamador lançar uma nova
  // entrada de caixa sobre uma dívida inexistente. Reusa o código `ja_pago` que
  // `registrarPagamentoParcial` (aqui) e `registrarPagamentoParcialContaPagar` já emitem
  // para a mesma condição. (`liquidarContaPagar` ainda devolve sucesso silencioso nesse
  // caso — mesmo defeito, do outro lado; fora do escopo deste GOAL.)
  if (cur === RECEBER_STATUS.PAGO) return { ok: false, reason: "ja_pago" }

  const aberto = saldoAberto(row)
  if (aberto <= PAY_EPS) return { ok: false, reason: "nada_em_aberto" }

  let merged = asPayloadRecord(row.payload)
  merged = appendFinanceiroHistorico(merged, {
    tipo: "liquidacao",
    valor: aberto,
    observacao: safeStr(params.observacao) || undefined,
    formaPagamento: safeStr(params.formaPagamento).trim() || undefined,
    userLabel: safeStr(params.userLabel) || undefined,
    loteId: safeStr(params.loteId).trim() || undefined,
  })

  return gravarBaixaNoTitulo(
    dbOf(params.db),
    row,
    { status: RECEBER_STATUS.PAGO, payload: merged },
  )
}

export async function registrarPagamentoParcial(params: {
  storeId: string
  id?: string
  localKey?: string
  valorPago: number
  observacao?: string
  formaPagamento?: string
  userLabel?: string
  /** Identidade da operação em LOTE (G2), carimbada no histórico para rastreabilidade. */
  loteId?: string
  /** Snapshot já usado pelo chamador para calcular saldo/valor; também fornece o token CAS. */
  tituloSnapshot?: ContaReceberTitulo
  db?: ContaReceberDbClient
}): Promise<ContaReceberServiceResult<ContaReceberTitulo>> {
  const row = await findTituloParaBaixa(params.storeId, {
    id: params.id,
    localKey: params.localKey,
    tituloSnapshot: params.tituloSnapshot,
    db: params.db,
  })
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
    formaPagamento: safeStr(params.formaPagamento).trim() || undefined,
    userLabel: safeStr(params.userLabel) || undefined,
    loteId: safeStr(params.loteId).trim() || undefined,
  })

  const pago = sumPagamentosFromHistoricoPayload(merged)
  let nextStatus: ReceberStatusCanon = RECEBER_STATUS.PENDENTE
  if (pago + PAY_EPS >= total) nextStatus = RECEBER_STATUS.PAGO
  else if (pago > PAY_EPS) nextStatus = RECEBER_STATUS.PARCIAL

  return gravarBaixaNoTitulo(
    dbOf(params.db),
    row,
    { status: nextStatus, payload: merged },
  )
}

export type EstornoContaReceberModo = "titulo_completo" | "ultimo_pagamento"

export async function estornarContaReceber(params: {
  storeId: string
  id?: string
  localKey?: string
  modo: EstornoContaReceberModo
  motivo?: string
  userLabel?: string
  /** Quando informado, o estorno participa da transação (e das travas) do chamador. */
  db?: ContaReceberDbClient
}): Promise<ContaReceberServiceResult<ContaReceberTitulo>> {
  // Escrita com token otimista (`gravarBaixaNoTitulo`): um update cego apagaria uma baixa
  // gravada por outra transação entre esta leitura e a escrita (lost update).
  const row = await findTitulo(params.storeId, { id: params.id, localKey: params.localKey, db: params.db })
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
    return gravarBaixaNoTitulo(dbOf(params.db), row, { status: RECEBER_STATUS.ESTORNADO, payload: withHist })
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

  return gravarBaixaNoTitulo(dbOf(params.db), row, { status: nextStatus, payload: merged })
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
