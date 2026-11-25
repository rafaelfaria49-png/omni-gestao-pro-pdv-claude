/**
 * Service de MovimentacaoFinanceira — persistência real no Prisma.
 *
 * Invariantes:
 *  - `tipo`  ∈ {"entrada", "saida"}
 *  - `valor` sempre > 0 (o sentido financeiro fica em `tipo`)
 *  - `storeId` obrigatório; falha explícita se ausente
 *  - Idempotência via (storeId, referenciaId, tipo, origem) para ops derivadas
 */

import { leituraEmpresaWhere } from "@/lib/gastos/read-scope"
import { createHash } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { dadosFinanceirosEmpresa, emTransacaoFinanceira, FinanceiroScopeError, precisaoLegada, registroFinanceiroDaEmpresa, resolverPerfilEmpresa } from "@/lib/gastos/financeiro-scope"
import type { ContaPagarTitulo, ContaReceberTitulo, MovimentacaoFinanceira, Prisma } from "@/generated/prisma"
import { recalcularSaldoCarteira } from "@/lib/financeiro/services/carteiras-service"
import { normalizePagarStatus, normalizeReceberStatus } from "@/lib/financeiro/contracts/status"
import type { FinanceiroContextoAutorizado } from "@/lib/gastos/types"
import { storeDoContexto, type FinanceiroDb } from "@/lib/gastos/financeiro-scope"

/** Apenas dentro da aplicação G004, após locks/validações; usa o ledger do HUB. */
export async function criarMovimentoOperacaoGasto(tx: FinanceiroDb, ctx: FinanceiroContextoAutorizado, p: {
  id: string; operacaoId: string; carteiraId: string; valor: bigint; pagoEm: Date; formaPagamento: string;
  estorno: boolean; descricao: string; tituloId?: string; categoriaId?: string; compensaMovimentacaoId?: string
}) {
  return tx.movimentacaoFinanceira.create({ data: {
    id: p.id, perfilId: ctx.perfilId, storeId: storeDoContexto(ctx), operacaoFinanceiraId: p.operacaoId,
    tipo: p.estorno ? "entrada" : "saida", origem: p.estorno ? "estorno_pagar" : "pagar",
    referenciaId: p.tituloId ?? p.operacaoId, pagarTituloId: p.estorno ? null : p.tituloId ?? null,
    categoriaId: p.estorno ? null : p.categoriaId ?? null, descricao: p.descricao,
    carteiraId: p.carteiraId, valor: Number(p.valor) / 100, valorCentavos: p.valor.toString(), precisaoStatus: "CENTAVOS",
    formaPagamento: p.formaPagamento, ocorridoEm: p.pagoEm,
    compensaMovimentacaoId: p.compensaMovimentacaoId ?? null,
  } })
}

// ─── tipos públicos ───────────────────────────────────────────────────────────

export type MovTipo = "entrada" | "saida"

/**
 * Cliente Prisma aceito: o singleton global OU um `Prisma.TransactionClient`. Sem `db`,
 * o comportamento é o de sempre — chamadores existentes não mudam.
 */
export type MovimentacoesDbClient = Prisma.TransactionClient

function dbOf(db?: MovimentacoesDbClient): MovimentacoesDbClient {
  return db ?? prisma
}

export const MOV_ORIGENS = ["os", "venda", "manual", "pagar", "receber", "estorno_receber", "estorno_pagar"] as const
export type MovOrigem = (typeof MOV_ORIGENS)[number] | string

export type CreateMovimentacaoInput = {
  db?: MovimentacoesDbClient
  storeId: string
  tipo: MovTipo
  descricao: string
  valor: number
  origem?: MovOrigem
  referenciaId?: string
  /** Quando informado, atualiza saldo da carteira após o lançamento. */
  carteiraId?: string | null
  /** Data contábil do lançamento (sobrescreve `createdAt` na criação). */
  createdAt?: Date
}

export type CreateFromTituloMeta = {
  /** Se fornecido, usa como id de referência ao invés do .id */
  referenciaId?: string
}

export type MovimentacaoResult =
  | { ok: true; action: "created"; movimentacao: MovimentacaoFinanceira }
  | { ok: true; action: "skipped_idempotent" }
  | { ok: false; reason: string }

/** Correção M1 dos endpoints legados; não é a aplicação geral de Gastos/G004. */
export class PagamentoLegadoError extends Error {
  constructor(public readonly code: string, public readonly status = 422, public readonly definitivoSemEfeito = false, message = code) {
    super(message)
    this.name = "PagamentoLegadoError"
  }
}

export type PagamentoLegadoInput = {
  storeId: string
  tipo: "pagar" | "receber"
  op: "parcial" | "liquidar"
  idempotencyKey: string
  id?: string
  localKey?: string
  valor?: number
  observacao?: string
  formaPagamento?: string
  userLabel?: string
  canal: "financeiro" | "pdv"
  sessaoId?: string
  db?: MovimentacoesDbClient
}

type TituloPagamentoLegado = (ContaPagarTitulo | ContaReceberTitulo) & { storeId: string }
export type PagamentoLegadoResultado = {
  titulo: TituloPagamentoLegado
  valorAplicado: number
  movimentoId: string
  requestFingerprint: string
  replay: boolean
}

function chavePagamentoLegado(input: string): string {
  if (typeof input !== "string" || !input.trim() || input.length > 160 || /[\u0000-\u001f\u007f]/.test(input)) {
    throw new PagamentoLegadoError("idempotency_key_required", 400)
  }
  return input.trim()
}

/** ID só dos NOVOS movimentos M1; nenhum ID/origem/referência histórica é reescrito. */
export function movimentoIdPagamentoLegado(storeId: string, idempotencyKey: string): string {
  return `fin-baixa:${createHash("sha256").update(JSON.stringify([assertStoreId(storeId), chavePagamentoLegado(idempotencyKey)])).digest("hex")}`
}

/** Compartilhada com o PDV: operação antes de sessão/títulos e carteiras. */
export async function travarPagamentoLegado(db: MovimentacoesDbClient, storeId: string, idempotencyKey: string) {
  const movimentoId = movimentoIdPagamentoLegado(storeId, idempotencyKey)
  await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${movimentoId}))::text AS lock`
  return movimentoId
}

function objetoPagamento(payload: Prisma.JsonValue): Prisma.JsonObject {
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {}
}

/**
 * Uma intenção explícita = histórico + movimento + saldo na MESMA transação.
 * O chamador PDV inclui seu caixa nesta transação. Replay é comprovado pelos dois
 * registros persistidos; nenhuma heurística de soma/valor substitui a identidade.
 */
export async function aplicarPagamentoLegado(input: PagamentoLegadoInput): Promise<PagamentoLegadoResultado> {
  const resultado = await pagamentoLegadoInterno(input, false)
  if (!resultado) throw new PagamentoLegadoError("operacao_financeira_inconsistente", 503)
  return resultado
}

/** Replay anterior a guardas mutáveis (caixa/período): somente leitura, sem novo pagamento. */
export function consultarPagamentoLegado(input: PagamentoLegadoInput): Promise<PagamentoLegadoResultado | null> {
  return pagamentoLegadoInterno(input, true)
}

async function pagamentoLegadoInterno(input: PagamentoLegadoInput, somenteReplay: boolean): Promise<PagamentoLegadoResultado | null> {
  const storeId = assertStoreId(input.storeId)
  const key = chavePagamentoLegado(input.idempotencyKey)
  if ((input.tipo !== "pagar" && input.tipo !== "receber") || (input.op !== "parcial" && input.op !== "liquidar")
    || (input.canal !== "financeiro" && input.canal !== "pdv") || (!input.id && !input.localKey)
    || (input.canal === "pdv" && !input.sessaoId)) throw new PagamentoLegadoError("pagamento_invalido", 400)
  const parcialCentavos = input.op === "parcial" && typeof input.valor === "number" && Number.isFinite(input.valor)
    ? precisaoLegada(input.valor).valorCentavos : null

  return emTransacaoFinanceira(input.db, async tx => {
    const movimentoId = await travarPagamentoLegado(tx, storeId, key)
    if (!somenteReplay && input.tipo === "pagar") {
      if (input.id) await tx.$queryRaw`SELECT id FROM contas_pagar_titulos WHERE "storeId"=${storeId} AND id=${input.id} FOR UPDATE`
      else await tx.$queryRaw`SELECT id FROM contas_pagar_titulos WHERE "storeId"=${storeId} AND "localKey"=${input.localKey} FOR UPDATE`
    } else if (!somenteReplay) {
      if (input.id) await tx.$queryRaw`SELECT id FROM contas_receber_titulos WHERE "storeId"=${storeId} AND id=${input.id} FOR UPDATE`
      else await tx.$queryRaw`SELECT id FROM contas_receber_titulos WHERE "storeId"=${storeId} AND "localKey"=${input.localKey} FOR UPDATE`
    }
    const where = { storeId, ...(input.id ? { id: input.id } : {}), ...(input.localKey ? { localKey: input.localKey } : {}) }
    const titulo = input.tipo === "pagar"
      ? await tx.contaPagarTitulo.findFirst({ where }) : await tx.contaReceberTitulo.findFirst({ where })
    if (!titulo) throw new PagamentoLegadoError("not_found", 404)
    const requestFingerprint = createHash("sha256").update(JSON.stringify({ v: 1, tipo: input.tipo, tituloId: titulo.id,
      op: input.op, valorCentavos: parcialCentavos, ...(input.op === "parcial" && parcialCentavos === null ? { valorInvalido: String(input.valor) } : {}), observacao: safeStr(input.observacao), formaPagamento: safeStr(input.formaPagamento),
      canal: input.canal, sessaoId: input.sessaoId ?? null })).digest("hex")
    const base = objetoPagamento(titulo.payload)
    const historico = Array.isArray(base.historico) ? base.historico : []
    const recibos = historico.filter((item): item is Prisma.JsonObject => !!item && typeof item === "object" && !Array.isArray(item)
      && item.operacaoId === key)
    const anterior = await tx.movimentacaoFinanceira.findFirst({ where: { id: movimentoId, storeId } })
    if (anterior || recibos.length) {
      const recibo = recibos[0]
      if (!anterior || recibos.length !== 1 || recibo.requestFingerprint !== requestFingerprint
        || recibo.movimentoId !== movimentoId || recibo.valor !== anterior.valor
        || anterior.referenciaId !== titulo.id || anterior.tipo !== (input.tipo === "pagar" ? "saida" : "entrada")
        || anterior.origem !== `${input.tipo}${input.op === "parcial" ? "_parcial" : ""}`
        || (input.tipo === "pagar" ? anterior.pagarTituloId !== titulo.id : anterior.receberTituloId !== titulo.id)) {
        throw new PagamentoLegadoError("idempotency_conflict", 409)
      }
      const perfilId = await resolverPerfilEmpresa(tx, storeId)
      if (anterior.perfilId !== perfilId || titulo.perfilId !== perfilId) throw new PagamentoLegadoError("escopo_invalido", 403)
      return { titulo: registroFinanceiroDaEmpresa(titulo, storeId), valorAplicado: anterior.valor, movimentoId, requestFingerprint, replay: true }
    }
    if (somenteReplay) return null
    if (input.op === "parcial" && (!parcialCentavos || BigInt(parcialCentavos) <= BigInt(0))) {
      throw new PagamentoLegadoError("valor_invalido", 422, true)
    }
    if (titulo.ativo === false) throw new PagamentoLegadoError("not_found", 404, true)
    const status = input.tipo === "pagar" ? normalizePagarStatus(titulo.status) : normalizeReceberStatus(titulo.status)
    if (status === "pago") throw new PagamentoLegadoError("ja_pago", 422, true)
    if (status === "cancelado" || status === "estornado") throw new PagamentoLegadoError("titulo_encerrado", 422, true)
    const contaPayload = typeof base.carteiraId === "string" ? base.carteiraId.trim() : ""
    const carteiraId = titulo.carteiraId ?? (contaPayload || null)
    // A ponte trava título e TODAS as contas em ordem, antes dos writers chamados.
    // Conta ausente continua NULL; conta informada inválida nunca vira fallback.
    try {
      await dadosFinanceirosEmpresa(tx, storeId, undefined, { carteiraId,
        ...(input.tipo === "pagar" ? { pagarTituloId: titulo.id } : { receberTituloId: titulo.id }),
      })
    } catch (error) {
      // Somente operação NOVA, sem recibo sob o lock da intenção. O erro lançado
      // reverte inclusive adoção/provisionamento. Replay anterior nunca passa aqui.
      if (error instanceof FinanceiroScopeError) throw new PagamentoLegadoError("conta_indisponivel", 422, true,
        "Conta financeira indisponível. Confira o perfil e a conta antes de tentar novamente.")
      throw error
    }
    const pagar = await import("./contas-pagar-service")
    const receber = await import("./contas-receber-service")
    const pago = input.tipo === "pagar" ? pagar.sumPagamentosFromHistoricoPayloadContaPagar(titulo.payload)
      : receber.sumPagamentosFromHistoricoPayload(titulo.payload)
    const centavos = input.op === "parcial" ? parcialCentavos : precisaoLegada(Math.max(0, titulo.valor - pago)).valorCentavos
    if (centavos === null) throw new PagamentoLegadoError("valor_invalido", 422, true)
    const valorAplicado = Number(centavos) / 100
    if (!(valorAplicado > 0)) throw new PagamentoLegadoError("nada_em_aberto", 422, true)
    const params = { storeId, id: titulo.id, db: tx, observacao: input.observacao, formaPagamento: input.formaPagamento, userLabel: input.userLabel }
    const baixa = input.tipo === "pagar"
      ? input.op === "parcial" ? await pagar.registrarPagamentoParcialContaPagar({ ...params, valorPago: valorAplicado }) : await pagar.liquidarContaPagar(params)
      : input.op === "parcial" ? await receber.registrarPagamentoParcial({ ...params, valorPago: valorAplicado }) : await receber.liquidarContaReceber(params)
    if (!baixa.ok) throw new PagamentoLegadoError(baixa.reason, baixa.reason === "titulo_alterado" ? 409 : 422, true)
    const opts = { parcial: input.op === "parcial", carteiraId, db: tx, idempotenciaDoChamador: true,
      operacaoPagamentoId: key, formaPagamento: input.formaPagamento }
    const mov = input.tipo === "pagar"
      ? await createMovimentacaoSaidaFromPagar(baixa.data, valorAplicado, opts)
      : await createMovimentacaoEntradaFromReceber({ ...baixa.data, cliente: "cliente" in baixa.data ? baixa.data.cliente : "" }, valorAplicado, opts)
    if (!mov.ok || mov.action !== "created" || mov.movimentacao.id !== movimentoId) throw new PagamentoLegadoError("movimentacao_financeira_falhou", 503)
    const depois = objetoPagamento(baixa.data.payload)
    const eventos = Array.isArray(depois.historico) ? depois.historico : []
    const ultimo = eventos.at(-1)
    if (!ultimo || typeof ultimo !== "object" || Array.isArray(ultimo) || ultimo.valor !== valorAplicado) {
      throw new PagamentoLegadoError("historico_financeiro_inconsistente", 503)
    }
    const payload: Prisma.InputJsonObject = { ...depois, historico: [...eventos.slice(0, -1), {
      ...ultimo, operacaoId: key, requestFingerprint, movimentoId,
    }] }
    const carimbado = input.tipo === "pagar"
      ? await tx.contaPagarTitulo.update({ where: { id: titulo.id, storeId }, data: { payload } })
      : await tx.contaReceberTitulo.update({ where: { id: titulo.id, storeId }, data: { payload } })
    return { titulo: registroFinanceiroDaEmpresa(carimbado, storeId), valorAplicado, movimentoId, requestFingerprint, replay: false }
  })
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

/**
 * Verifica idempotência: existe movimentação com (storeId, referenciaId, tipo, origem)?
 */
async function existeMovimentacao(
  storeId: string,
  referenciaId: string,
  tipo: MovTipo,
  origem: string,
  db?: MovimentacoesDbClient,
): Promise<boolean> {
  const found = await dbOf(db).movimentacaoFinanceira.findFirst({
    where: { storeId, referenciaId, tipo, origem },
    select: { id: true },
  })
  return found !== null
}

// ─── funções genéricas ────────────────────────────────────────────────────────

export async function listMovimentacoes(
  storeId: string,
  filters: ListMovimentacoesFilters = {},
): Promise<MovimentacaoFinanceira[]> {
  const sid = assertStoreId(storeId)
  const where: Prisma.MovimentacaoFinanceiraWhereInput = { storeId: sid }

  if (filters.tipo) where.tipo = assertTipo(filters.tipo)
  if (filters.origem) where.origem = safeStr(filters.origem)
  if (filters.referenciaId) where.referenciaId = safeStr(filters.referenciaId)
  if (filters.q) where.descricao = { contains: safeStr(filters.q), mode: "insensitive" }
  if (filters.dataInicial || filters.dataFinal) {
    const gte = toDate(filters.dataInicial)
    const lte = toDate(filters.dataFinal)
    where.createdAt = { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) }
  }

  return prisma.movimentacaoFinanceira.findMany({
    where: leituraEmpresaWhere(sid, where),
    orderBy: { createdAt: "desc" },
    take: typeof filters.take === "number" ? Math.min(filters.take, 1000) : 200,
    skip: typeof filters.skip === "number" ? Math.max(0, filters.skip) : 0,
  })
}

export async function createMovimentacao(
  input: CreateMovimentacaoInput,
): Promise<MovimentacaoFinanceira> {
  const storeId = assertStoreId(input.storeId)
  const tipo = assertTipo(input.tipo)
  const valor = safeMoney(input.valor)
  if (!(valor > 0)) throw new Error("movimentacoes-service: valor deve ser > 0")
  const descricao = safeStr(input.descricao)
  if (!descricao) throw new Error("movimentacoes-service: descricao é obrigatória")
  const carteiraId = safeStr(input.carteiraId) || null

  return emTransacaoFinanceira<MovimentacaoFinanceira>(input.db, async (tx) => {
    const scope = await dadosFinanceirosEmpresa(tx, storeId, Math.abs(input.valor), { carteiraId })
    const row = await tx.movimentacaoFinanceira.create({
      data: { ...scope,
        storeId,
        tipo,
        valor,
        descricao,
        origem: safeStr(input.origem) || "manual",
        referenciaId: safeStr(input.referenciaId) || null,
        carteiraId,
        ...(input.createdAt && !Number.isNaN(input.createdAt.getTime())
          ? { createdAt: input.createdAt }
          : {}),
      },
    })

    if (carteiraId) {
      await recalcularSaldoCarteira(carteiraId, storeId, tx)
    }

    return row
  })
}

export async function createEntrada(
  input: Omit<CreateMovimentacaoInput, "tipo">,
): Promise<MovimentacaoFinanceira> {
  return createMovimentacao({ ...input, tipo: "entrada" })
}

export async function createSaida(
  input: Omit<CreateMovimentacaoInput, "tipo">,
): Promise<MovimentacaoFinanceira> {
  return createMovimentacao({ ...input, tipo: "saida" })
}

export async function deleteMovimentacao(id: string, storeId: string): Promise<void> {
  const sid = assertStoreId(storeId)
  const tid = safeStr(id)
  if (!tid) throw new Error("movimentacoes-service: id é obrigatório")

  const existing = await prisma.movimentacaoFinanceira.findFirst({
    where: { id: tid, storeId: sid },
    select: { id: true },
  })
  if (!existing) throw new Error(`movimentacoes-service: movimentação "${tid}" não encontrada`)
  await prisma.movimentacaoFinanceira.delete({ where: { id: tid } })
}

export async function getResumoMovimentacoes(
  storeId: string,
  range?: { dataInicial?: Date | string; dataFinal?: Date | string },
): Promise<ResumoMovimentacoes> {
  const sid = assertStoreId(storeId)
  const gte = toDate(range?.dataInicial)
  const lte = toDate(range?.dataFinal)
  const dateFilter: Prisma.MovimentacaoFinanceiraWhereInput["createdAt"] = {
    ...(gte ? { gte } : {}),
    ...(lte ? { lte } : {}),
  }
  const baseWhere: Prisma.MovimentacaoFinanceiraWhereInput = {
    storeId: sid,
    ...(gte || lte ? { createdAt: dateFilter } : {}),
  }

  const [entradas, saidas, count] = await prisma.$transaction([
    prisma.movimentacaoFinanceira.aggregate({ where: leituraEmpresaWhere(sid, { ...baseWhere, tipo: "entrada" }), _sum: { valor: true } }),
    prisma.movimentacaoFinanceira.aggregate({ where: leituraEmpresaWhere(sid, { ...baseWhere, tipo: "saida" }), _sum: { valor: true } }),
    prisma.movimentacaoFinanceira.count({ where: leituraEmpresaWhere(sid, baseWhere) }),
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

// ─── funções de integração CR/CP ──────────────────────────────────────────────

/**
 * Cria movimentação de ENTRADA a partir de um ContaReceberTitulo liquidado/parcial.
 * Idempotente: (storeId, referenciaId=titulo.id, tipo="entrada", origem="receber").
 * Para parciais sucessivos, usa origem="receber_parcial_<suffix>" para não colidir.
 *
 * `carteiraId` (opcional): quando o título traz `payload.carteiraId`, a baixa é
 * registrada na carteira indicada e o saldo é recalculado. Sem `carteiraId`, a
 * movimentação fica sem carteira (entra no saldo agregado de caixa, não em uma
 * carteira específica).
 */
export async function createMovimentacaoEntradaFromReceber(
  titulo: { id: string; storeId: string | null; descricao: string; cliente: string },
  valor: number,
  opts: {
    parcial?: boolean
    meta?: CreateFromTituloMeta
    carteiraId?: string | null
    /** Quando informado, o lançamento participa da transação do chamador. */
    db?: MovimentacoesDbClient
    /**
     * O CHAMADOR é dono da idempotência — pula as duas checagens daqui.
     *
     * Existe para o recebimento em LOTE (G2), cuja identidade é o advisory lock
     * transacional + o `localId` da `CaixaOperacao`. A heurística de soma abaixo
     * ("já gravei ≥ este valor ⇒ é retry") supõe um pagamento por vez e, num lote,
     * suprimiria uma segunda parcial legítima de mesmo valor — dinheiro recebido que
     * sumiria do financeiro. Sem o flag, nada muda para os chamadores existentes.
     */
    idempotenciaDoChamador?: boolean
    /** Somente aplicação atômica M1, com recibo no histórico servidor. */
    operacaoPagamentoId?: string
    formaPagamento?: string
    /**
     * Não recalcula o saldo da carteira agora — o chamador recalcula uma vez por
     * carteira ao fim do lote. Evita N varreduras completas das movimentações dentro de
     * uma transação que precisa ser curta (pgBouncer, `connection_limit=1`).
     */
    adiarRecalculoCarteira?: boolean
  } = {},
): Promise<MovimentacaoResult> {
  const storeId = assertStoreId(titulo.storeId)
  const referenciaId = safeStr(opts.meta?.referenciaId) || titulo.id
  const valorMoney = safeMoney(valor)
  if (!(valorMoney > 0)) return { ok: false, reason: "valor_invalido" }

  return emTransacaoFinanceira<MovimentacaoResult>(opts.db, async (tx) => {
    const client = tx
    const origem = opts.parcial ? "receber_parcial" : "receber"
    const carteiraId = safeStr(opts.carteiraId) || null

    // Compatibilidade do endpoint legado sem identidade de pagamento. O caminho
    // com identidade do chamador (já usado pelo lote) admite parciais iguais.
    if (!opts.idempotenciaDoChamador && !opts.parcial
      && await existeMovimentacao(storeId, referenciaId, "entrada", origem, tx)) {
      return { ok: true, action: "skipped_idempotent" }
    }
    if (!opts.idempotenciaDoChamador && opts.parcial) {
      const agg = await tx.movimentacaoFinanceira.aggregate({
        where: { storeId, referenciaId, tipo: "entrada", origem: { startsWith: "receber" } }, _sum: { valor: true },
      })
      if (safeMoney(agg._sum.valor ?? 0) >= valorMoney) return { ok: true, action: "skipped_idempotent" }
    }

    const descricao = `Recebimento — ${titulo.cliente || titulo.descricao}`
    const scope = await dadosFinanceirosEmpresa(tx, storeId, Math.abs(valor), { carteiraId, receberTituloId: titulo.id })
    const movimentacao = await client.movimentacaoFinanceira.create({
      data: { ...scope, receberTituloId: titulo.id, storeId, tipo: "entrada", valor: valorMoney, descricao, origem, referenciaId, carteiraId,
        ...(opts.operacaoPagamentoId ? { id: movimentoIdPagamentoLegado(storeId, opts.operacaoPagamentoId), formaPagamento: opts.formaPagamento ?? null } : {}) },
    })
    if (carteiraId && !opts.adiarRecalculoCarteira) await recalcularSaldoCarteira(carteiraId, storeId, tx)
    return { ok: true, action: "created", movimentacao }
  })
}

/**
 * Cria movimentação de SAÍDA a partir de um ContaPagarTitulo liquidado/parcial.
 * Idempotente: (storeId, referenciaId=titulo.id, tipo="saida", origem="pagar").
 *
 * `carteiraId` (opcional): mesmo contrato de `createMovimentacaoEntradaFromReceber`.
 */
export async function createMovimentacaoSaidaFromPagar(
  titulo: { id: string; storeId: string | null; descricao: string },
  valor: number,
  opts: {
    parcial?: boolean
    meta?: CreateFromTituloMeta
    carteiraId?: string | null
    /** Transação do chamador: a saída commita (ou desfaz) junto com o ledger do título. */
    db?: MovimentacoesDbClient
    /**
     * O chamador já garante UM pagamento novo no ledger (título travado + CAS): exatamente
     * UMA saída, sem as heurísticas abaixo — que descartavam a 2ª parcial menor e o novo
     * pagamento depois de um estorno.
     */
    idempotenciaDoChamador?: boolean
    /** G002/M1: identidade explícita da intenção → ID determinístico do NOVO movimento. */
    operacaoPagamentoId?: string
    formaPagamento?: string
  } = {},
): Promise<MovimentacaoResult> {
  const storeId = assertStoreId(titulo.storeId)
  const referenciaId = safeStr(opts.meta?.referenciaId) || titulo.id
  const valorMoney = safeMoney(valor)
  if (!(valorMoney > 0)) return { ok: false, reason: "valor_invalido" }

  return emTransacaoFinanceira<MovimentacaoResult>(opts.db, async (tx) => {
    const origem = opts.parcial ? "pagar_parcial" : "pagar"
    const carteiraId = safeStr(opts.carteiraId) || null

    if (!opts.idempotenciaDoChamador && !opts.parcial && await existeMovimentacao(storeId, referenciaId, "saida", origem, tx)) {
      return { ok: true, action: "skipped_idempotent" }
    }
    if (!opts.idempotenciaDoChamador && opts.parcial) {
      const agg = await tx.movimentacaoFinanceira.aggregate({
        where: { storeId, referenciaId, tipo: "saida", origem: { startsWith: "pagar" } }, _sum: { valor: true },
      })
      if (safeMoney(agg._sum.valor ?? 0) >= valorMoney) return { ok: true, action: "skipped_idempotent" }
    }

    const descricao = `Pagamento — ${titulo.descricao}`
    const scope = await dadosFinanceirosEmpresa(tx, storeId, Math.abs(valor), { carteiraId, pagarTituloId: titulo.id })
    const movimentacao = await tx.movimentacaoFinanceira.create({
      data: { ...scope, pagarTituloId: titulo.id, storeId, tipo: "saida", valor: valorMoney, descricao, origem, referenciaId, carteiraId,
        ...(opts.operacaoPagamentoId ? { id: movimentoIdPagamentoLegado(storeId, opts.operacaoPagamentoId), formaPagamento: opts.formaPagamento ?? null } : {}) },
    })
    if (carteiraId) await recalcularSaldoCarteira(carteiraId, storeId, tx)
    return { ok: true, action: "created", movimentacao }
  })
}

/**
 * Cria movimentação de estorno: lança entrada reversa (para saída) ou saída reversa (para entrada).
 * Idempotente via origem="estorno_receber" / "estorno_pagar".
 *
 * Reaproveita a `carteiraId` da movimentação original — para que o saldo da
 * carteira que recebeu o pagamento volte ao estado anterior à baixa.
 */
export async function estornarMovimentacaoPorReferencia(
  storeId: string,
  referenciaId: string,
  origemOriginal: "receber" | "pagar",
): Promise<MovimentacaoResult> {
  const sid = assertStoreId(storeId)
  const rid = safeStr(referenciaId)
  if (!rid) return { ok: false, reason: "referenciaId_invalida" }

  return emTransacaoFinanceira<MovimentacaoResult>(undefined, async (tx) => {
    const origemEstorno = origemOriginal === "receber" ? "estorno_receber" : "estorno_pagar"
    const tipoEstorno: MovTipo = origemOriginal === "receber" ? "saida" : "entrada"
    const tipoOriginal: MovTipo = origemOriginal === "receber" ? "entrada" : "saida"
    const lock = `financeiro:estorno:${sid}:${rid}:${origemOriginal}`
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lock}))::text AS lock`

    // Reconciliação #397 × G002: estorna o LÍQUIDO ainda movimentado (originais − estornos
    // já lançados), agora POR CONTA. Um estorno anterior (ex.: de um pagamento parcial) não
    // faz este pular inteiro; na 2ª chamada o líquido é zero (idempotente sob o advisory).
    // Preserva cada conta realmente usada, inclusive contas históricas inativas; nenhum
    // valor migra para a conta mais recente.
    const [originais, estornosAnteriores] = await Promise.all([
      tx.movimentacaoFinanceira.findMany({
        where: { storeId: sid, referenciaId: rid, tipo: tipoOriginal, OR: [
          { origem: origemOriginal }, { origem: `${origemOriginal}_parcial` },
          { origem: { startsWith: `${origemOriginal}_parcial_` } },
        ] },
        orderBy: { createdAt: "desc" },
        select: { valor: true, carteiraId: true },
      }),
      tx.movimentacaoFinanceira.findMany({
        where: { storeId: sid, referenciaId: rid, tipo: tipoEstorno, origem: origemEstorno },
        select: { valor: true, carteiraId: true },
      }),
    ])
    if (originais.length === 0) {
      // Nenhuma movimentação original — nada a estornar
      return { ok: true, action: "skipped_idempotent" }
    }
    const grupos = new Map<string | null, number>()
    for (const original of originais) {
      const carteiraId = original.carteiraId ?? null
      grupos.set(carteiraId, (grupos.get(carteiraId) ?? 0) + (original.valor ?? 0))
    }
    for (const estorno of estornosAnteriores) {
      const carteiraId = estorno.carteiraId ?? null
      if (grupos.has(carteiraId)) grupos.set(carteiraId, grupos.get(carteiraId)! - (estorno.valor ?? 0))
    }
    const descricao = `Estorno de ${origemOriginal === "receber" ? "recebimento" : "pagamento"}`
    let primeira: MovimentacaoFinanceira | undefined
    for (const [carteiraId, liquido] of [...grupos].sort(([a], [b]) => {
      const left = a ?? "", right = b ?? ""
      return left < right ? -1 : left > right ? 1 : 0
    })) {
      const valorOriginal = safeMoney(liquido)
      if (!(valorOriginal > 0.009)) continue
      const scope = await dadosFinanceirosEmpresa(tx, sid, valorOriginal, { carteiraHistoricaId: carteiraId })
      const row = await tx.movimentacaoFinanceira.create({
        data: { ...scope, storeId: sid, tipo: tipoEstorno, valor: valorOriginal, descricao, origem: origemEstorno, referenciaId: rid, carteiraId },
      })
      primeira ??= row
      if (carteiraId) await recalcularSaldoCarteira(carteiraId, sid, tx)
    }
    return primeira ? { ok: true, action: "created", movimentacao: primeira } : { ok: true, action: "skipped_idempotent" }
  })
}

/**
 * Saída de estorno de UM pagamento de Conta a Receber, dentro da transação do chamador
 * (que já gravou o `estorno_pagamento` no ledger do título — é ele a identidade e a trava
 * contra estorno duplicado).
 *
 * Valor = o do pagamento estornado, nunca a soma dos anteriores. Reconciliação com o
 * ledger: a saída nunca leva o líquido movimentado do título abaixo do que o ledger ainda
 * diz recebido (`recebidoRestante`). Em ledger consistente isso é exatamente `valor`; num
 * título legado cuja entrada daquele pagamento nunca foi gravada (heurística antiga de
 * parciais), a saída diminui e `divergente` sinaliza — nunca cria saída sem entrada.
 */
export async function estornarMovimentacaoDePagamentoReceber(
  db: MovimentacoesDbClient,
  input: { storeId: string; tituloId: string; valor: number; recebidoRestante: number; historico?: unknown },
): Promise<{ valor: number; divergente: boolean; movimentacaoId: string | null }> {
  return estornarMovimentacaoDePagamento(db, "receber", { ...input, restante: input.recebidoRestante })
}

/**
 * Contas a Pagar: mesmo contrato do Receber com os sinais trocados — a ENTRADA de estorno
 * tem o valor exato do pagamento estornado e nunca leva o líquido pago abaixo do que o
 * ledger ainda diz pago (`pagoRestante`). Substitui, no estorno do Pagar, o
 * `estornarMovimentacaoPorReferencia` (que estorna o líquido inteiro do título).
 */
export async function estornarMovimentacaoDePagamentoPagar(
  db: MovimentacoesDbClient,
  input: { storeId: string; tituloId: string; valor: number; pagoRestante: number; historico?: unknown },
): Promise<{ valor: number; divergente: boolean; movimentacaoId: string | null }> {
  return estornarMovimentacaoDePagamento(db, "pagar", { ...input, restante: input.pagoRestante })
}

/**
 * Conta financeira do pagamento revertido pelo último `estorno_pagamento` do ledger. Cada pagamento
 * (`pagamento`/`liquidacao` com valor > 0) gera exatamente um movimento original, na mesma ordem:
 * o k-ésimo pagamento do histórico ↔ o k-ésimo movimento original (createdAt, id). Devolve
 * `undefined` (= manter a regra anterior) quando a correspondência não é comprovável: contagens
 * diferentes (legado com movimento ausente), valor que não confere ou alvo não identificado.
 */
export function carteiraDoPagamentoEstornado(
  historico: unknown,
  originais: ReadonlyArray<{ carteiraId: string | null; valor: number | null }>,
  valorEstornado: number,
): string | null | undefined {
  const arr = Array.isArray(historico) ? historico : []
  const rec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)
  let alvo: number | undefined
  for (let i = arr.length - 1; i >= 0; i--) {
    const e = arr[i]
    if (rec(e) && String(e.tipo ?? "").toLowerCase() === "estorno_pagamento") {
      alvo = typeof e.refHistoricoIndex === "number" ? e.refHistoricoIndex : undefined
      break
    }
  }
  if (alvo === undefined) return undefined
  const pagamentos: number[] = []
  arr.forEach((e, index) => {
    if (!rec(e)) return
    const t = String(e.tipo ?? "").toLowerCase()
    if ((t === "pagamento" || t === "liquidacao") && safeMoney(Number(e.valor ?? 0)) > 0.009) pagamentos.push(index)
  })
  const ordem = pagamentos.indexOf(alvo)
  if (ordem < 0 || pagamentos.length !== originais.length) return undefined
  const original = originais[ordem]!
  const valorPagamento = safeMoney(Number((arr[alvo] as Record<string, unknown>).valor ?? 0))
  if (Math.abs(safeMoney(original.valor ?? 0) - valorPagamento) > 0.009) return undefined
  if (Math.abs(valorPagamento - safeMoney(valorEstornado)) > 0.009) return undefined
  return original.carteiraId ?? null
}

async function estornarMovimentacaoDePagamento(
  db: MovimentacoesDbClient,
  lado: "receber" | "pagar",
  input: { storeId: string; tituloId: string; valor: number; restante: number; historico?: unknown },
): Promise<{ valor: number; divergente: boolean; movimentacaoId: string | null }> {
  const storeId = assertStoreId(input.storeId)
  const tituloId = safeStr(input.tituloId)
  if (!tituloId) throw new Error("movimentacoes-service: tituloId é obrigatório")
  const valor = safeMoney(input.valor)
  const restante = safeMoney(input.restante)
  const tipoOriginal: MovTipo = lado === "receber" ? "entrada" : "saida"
  const tipoEstorno: MovTipo = lado === "receber" ? "saida" : "entrada"
  const origemEstorno = lado === "receber" ? "estorno_receber" : "estorno_pagar"

  const [entradas, estornos, comCarteira] = await Promise.all([
    db.movimentacaoFinanceira.aggregate({
      where: { storeId, referenciaId: tituloId, tipo: tipoOriginal, origem: { startsWith: lado } },
      _sum: { valor: true },
    }),
    db.movimentacaoFinanceira.aggregate({
      where: { storeId, referenciaId: tituloId, tipo: tipoEstorno, origem: origemEstorno },
      _sum: { valor: true },
    }),
    db.movimentacaoFinanceira.findFirst({
      where: { storeId, referenciaId: tituloId, tipo: tipoOriginal, origem: { startsWith: lado }, carteiraId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { carteiraId: true },
    }),
  ])
  const liquido = safeMoney((entradas._sum.valor ?? 0) - (estornos._sum.valor ?? 0))
  const excedente = Math.max(0, Math.round((liquido - restante) * 100) / 100)
  const saida = Math.min(valor, excedente)
  const divergente = Math.abs(saida - valor) > 0.009
  if (!(saida > 0.009)) return { valor: 0, divergente, movimentacaoId: null }

  // Conta do PAGAMENTO estornado (identidade #397: refHistoricoIndex do último estorno_pagamento),
  // não a do pagamento mais recente. Só quando o ledger é consistente com os movimentos; senão,
  // o comportamento anterior (conta mais recente) é preservado.
  const carteiraDoPagamento = input.historico === undefined ? undefined : carteiraDoPagamentoEstornado(
    input.historico,
    await db.movimentacaoFinanceira.findMany({
      where: { storeId, referenciaId: tituloId, tipo: tipoOriginal, origem: { startsWith: lado } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { carteiraId: true, valor: true },
    }),
    valor,
  )
  const carteiraId = carteiraDoPagamento !== undefined ? carteiraDoPagamento : comCarteira?.carteiraId ?? null
  // Reconciliação G002: o fato novo entra no escopo EMPRESA da loja (perfil adotado na mesma
  // transação). A conta é referência histórica — pode ter sido desativada depois do pagamento.
  const scope = await dadosFinanceirosEmpresa(db, storeId, saida, { carteiraHistoricaId: carteiraId })
  const mov = await db.movimentacaoFinanceira.create({
    data: {
      ...scope,
      storeId,
      tipo: tipoEstorno,
      valor: saida,
      descricao: lado === "receber" ? "Estorno de recebimento" : "Estorno de pagamento",
      origem: origemEstorno,
      referenciaId: tituloId,
      carteiraId,
    },
  })
  // Mesmo cliente da transação: o saldo da carteira volta atrás junto num rollback.
  if (carteiraId) await recalcularSaldoCarteira(carteiraId, storeId, db)
  return { valor: saida, divergente, movimentacaoId: mov.id }
}

/**
 * Saída manual via Omni Agent HUB — idempotente por comando confirmado.
 * Chave: (storeId, referenciaId=commandId, tipo=saida, origem=omni_agent).
 */
export async function createMovimentacaoSaidaFromOmniAgent(input: {
  storeId: string
  commandId: string
  valor: number
  descricao: string
  categoria?: string
}): Promise<MovimentacaoResult> {
  const storeId = assertStoreId(input.storeId)
  const referenciaId = safeStr(input.commandId)
  if (!referenciaId) return { ok: false, reason: "commandId_obrigatorio" }

  const valorMoney = safeMoney(input.valor)
  if (!(valorMoney > 0)) return { ok: false, reason: "valor_invalido" }

  return emTransacaoFinanceira<MovimentacaoResult>(undefined, async (tx) => {
    const origem = "omni_agent"
    if (await existeMovimentacao(storeId, referenciaId, "saida", origem, tx)) {
      return { ok: true, action: "skipped_idempotent" }
    }

    const cat = safeStr(input.categoria)
    const base = safeStr(input.descricao) || "Despesa"
    const descricao = cat ? `Despesa — ${base} (${cat})` : `Despesa — ${base}`

    const scope = await dadosFinanceirosEmpresa(tx, storeId, Math.abs(input.valor), {})
    const movimentacao = await tx.movimentacaoFinanceira.create({
      data: { ...scope,
        storeId,
        tipo: "saida",
        valor: valorMoney,
        descricao: descricao.slice(0, 500),
        origem,
        referenciaId,
        carteiraId: null,
      },
    })

    return { ok: true, action: "created", movimentacao }
  })
}

/**
 * Entrada manual via Omni Agent HUB — idempotente por comando confirmado.
 * Chave: (storeId, referenciaId=commandId, tipo=entrada, origem=omni_agent).
 */
export async function createMovimentacaoEntradaFromOmniAgent(input: {
  storeId: string
  commandId: string
  valor: number
  descricao: string
  pagador?: string
  formaPagamento?: string
}): Promise<MovimentacaoResult> {
  const storeId = assertStoreId(input.storeId)
  const referenciaId = safeStr(input.commandId)
  if (!referenciaId) return { ok: false, reason: "commandId_obrigatorio" }

  const valorMoney = safeMoney(input.valor)
  if (!(valorMoney > 0)) return { ok: false, reason: "valor_invalido" }

  return emTransacaoFinanceira<MovimentacaoResult>(undefined, async (tx) => {
    const origem = "omni_agent"
    if (await existeMovimentacao(storeId, referenciaId, "entrada", origem, tx)) {
      return { ok: true, action: "skipped_idempotent" }
    }

    const pagador = safeStr(input.pagador)
    const forma = safeStr(input.formaPagamento)
    const base = safeStr(input.descricao) || "Recebimento avulso"
    let descricao = `Recebimento — ${base}`
    if (pagador) descricao += ` (${pagador})`
    if (forma) descricao += ` [${forma}]`

    const scope = await dadosFinanceirosEmpresa(tx, storeId, Math.abs(input.valor), {})
    const movimentacao = await tx.movimentacaoFinanceira.create({
      data: { ...scope,
        storeId,
        tipo: "entrada",
        valor: valorMoney,
        descricao: descricao.slice(0, 500),
        origem,
        referenciaId,
        carteiraId: null,
      },
    })

    return { ok: true, action: "created", movimentacao }
  })
}
