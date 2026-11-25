/**
 * Service de CarteiraFinanceira — contas/carteiras do HUB Financeiro.
 *
 * Invariantes:
 *  - `storeId` obrigatório em todas as operações
 *  - `saldoAtual` é sempre recalculado a partir das MovimentacaoFinanceira vinculadas
 *  - Transferências são transacionais: saída + entrada em uma única operação atômica
 *  - Tipos aceitos: caixa | banco | pix | dinheiro | credito | debito | investimento
 */

import { leituraEmpresaWhere } from "@/lib/gastos/read-scope"
import { prisma } from "@/lib/prisma"
import { dadosFinanceirosEmpresa, emTransacaoFinanceira, FinanceiroScopeError, FINANCEIRO_CONTA_LOCK_PREFIX, precisaoLegada } from "@/lib/gastos/financeiro-scope"
import type { CarteiraFinanceira, Prisma } from "@/generated/prisma"
import type { FinanceiroContextoAutorizado } from "@/lib/gastos/types"
import { storeDoContexto, type FinanceiroDb, LIMITE_CENTAVOS } from "@/lib/gastos/financeiro-scope"
import { centavosLegadosExatos } from "@/lib/gastos/pagamentos"
import { OperacaoGastoError, ordemBinaria } from "@/lib/gastos/operacao-schema"

/** Ordem compartilhada com transferências/baixas G002. Inclui contas históricas dos títulos. */
export async function travarCarteirasGasto(tx: FinanceiroDb, ctx: FinanceiroContextoAutorizado, ids: string[], selecionada?: string, compensacao = false) {
  const rows = new Map<string, CarteiraFinanceira>()
  for (const id of [...new Set(ids)].sort(ordemBinaria)) {
    const key = `${FINANCEIRO_CONTA_LOCK_PREFIX}:${ctx.tipo === "EMPRESA" ? ctx.storeId : ctx.perfilId}:${id}`
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text AS lock`
    await tx.$queryRaw`SELECT id FROM carteiras_financeiras WHERE id=${id} AND "storeId" IS NOT DISTINCT FROM ${storeDoContexto(ctx)}
      AND ("perfilId"=${ctx.perfilId} OR ("perfilId" IS NULL AND ${ctx.tipo === "EMPRESA"})) FOR NO KEY UPDATE`
    let row = await tx.carteiraFinanceira.findFirst({ where: { id, storeId: storeDoContexto(ctx),
      ...(ctx.tipo === "PESSOAL" ? { perfilId: ctx.perfilId } : { OR: [{ perfilId: ctx.perfilId }, { perfilId: null }] }) } })
    if (!row || (id === selecionada && ((!compensacao && !row.ativo) || row.tipo === "credito"))) {
      throw new OperacaoGastoError("conta_indisponivel", 404)
    }
    if (!row.perfilId) row = await tx.carteiraFinanceira.update({ where: { id }, data: { perfilId: ctx.perfilId } })
    rows.set(id, row)
  }
  return rows
}

/** Ledger canônico sob o lock da conta; não usa o saldo materializado como autoridade. */
export async function saldoCarteiraGasto(tx: FinanceiroDb, ctx: FinanceiroContextoAutorizado, conta: CarteiraFinanceira, gravar = false) {
  let saldo = centavosLegadosExatos(conta.saldoInicial)
  if (conta.saldoInicialCentavos !== null && BigInt(conta.saldoInicialCentavos.toString()) !== saldo) throw new OperacaoGastoError("precisao_legada_exige_revisao", 409)
  const movimentos = await tx.movimentacaoFinanceira.findMany({ where: { carteiraId: conta.id, storeId: storeDoContexto(ctx),
    ...(ctx.tipo === "PESSOAL" ? { perfilId: ctx.perfilId } : { OR: [{ perfilId: ctx.perfilId }, { perfilId: null }] }) },
    select: { tipo: true, valor: true, valorCentavos: true } })
  for (const m of movimentos) {
    const v = centavosLegadosExatos(m.valor)
    if (!["entrada", "saida"].includes(m.tipo) || v <= BigInt(0) || (m.valorCentavos !== null && BigInt(m.valorCentavos.toString()) !== v)) {
      throw new OperacaoGastoError("precisao_legada_exige_revisao", 409)
    }
    saldo += m.tipo === "entrada" ? v : -v
  }
  if (saldo > LIMITE_CENTAVOS || saldo < -LIMITE_CENTAVOS) throw new OperacaoGastoError("saldo_fora_limite", 409)
  if (gravar) await tx.carteiraFinanceira.update({ where: { id: conta.id }, data: {
    saldoInicialCentavos: centavosLegadosExatos(conta.saldoInicial).toString(),
    saldoAtual: Number(saldo) / 100, saldoAtualCentavos: saldo.toString(), precisaoStatus: "CENTAVOS" } })
  return saldo
}

/** Recusa de negócio que precisa desfazer provisionamento antes de manter o contrato ok:false. */
class TransferenciaRecusada extends Error {}

// ─── tipos públicos ────────────────────────────────────────────────────────────

export const TIPOS_CARTEIRA = [
  "caixa",
  "banco",
  "pix",
  "dinheiro",
  "credito",
  "debito",
  "investimento",
] as const

export type TipoCarteira = (typeof TIPOS_CARTEIRA)[number]

/** Cliente Prisma aceito: o singleton global OU um `Prisma.TransactionClient`. */
export type CarteirasDbClient = Prisma.TransactionClient

export const CARTEIRA_SALDO_LOCK_PREFIX = FINANCEIRO_CONTA_LOCK_PREFIX

export function buildCarteiraSaldoLockKey(storeId: string, carteiraId: string): string {
  return `${CARTEIRA_SALDO_LOCK_PREFIX}:${storeId}:${carteiraId}`
}

export type CarteiraPublica = {
  id: string
  storeId: string
  nome: string
  tipo: TipoCarteira
  saldoInicial: number
  saldoAtual: number
  ativo: boolean
  cor: string
  icone: string
  createdAt: string
  updatedAt: string
}

export type CriarCarteiraInput = {
  storeId: string
  nome: string
  tipo?: TipoCarteira
  saldoInicial?: number
  cor?: string
  icone?: string
}

export type AtualizarCarteiraInput = {
  id: string
  storeId: string
  nome?: string
  tipo?: TipoCarteira
  saldoInicial?: number
  ativo?: boolean
  cor?: string
  icone?: string
}

export type TransferenciaInput = {
  storeId: string
  origemId: string
  destinoId: string
  valor: number
  descricao?: string
}

export type TransferenciaResult = {
  ok: boolean
  saidaId?: string
  entradaId?: string
  origemSaldo?: number
  destinoSaldo?: number
  error?: string
}

// ─── helpers internos ─────────────────────────────────────────────────────────

function toPublica(c: CarteiraFinanceira): CarteiraPublica {
  if (!c.storeId) throw new Error("Carteira pessoal não é exposta pelo contrato empresarial.")
  return {
    id: c.id,
    storeId: c.storeId,
    nome: c.nome,
    tipo: c.tipo as TipoCarteira,
    saldoInicial: c.saldoInicial,
    saldoAtual: c.saldoAtual,
    ativo: c.ativo,
    cor: c.cor,
    icone: c.icone,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }
}

function safeMoney(v: number): number {
  return Math.round((v ?? 0) * 100) / 100
}

// ─── listarCarteiras ──────────────────────────────────────────────────────────

export async function listarCarteiras(
  storeId: string,
  apenasAtivas = false
): Promise<CarteiraPublica[]> {
  const where: Prisma.CarteiraFinanceiraWhereInput = { storeId }
  if (apenasAtivas) where.ativo = true

  const rows = await prisma.carteiraFinanceira.findMany({
    where: leituraEmpresaWhere(storeId, where),
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
  })

  return rows.map(toPublica)
}

// ─── criarCarteira ────────────────────────────────────────────────────────────

export async function criarCarteira(
  input: CriarCarteiraInput
): Promise<CarteiraPublica> {
  const saldo = input.saldoInicial ?? 0
  const precision = precisaoLegada(saldo)
  return emTransacaoFinanceira(undefined, async (tx) => {

  const row = await tx.carteiraFinanceira.create({
    data: {
      storeId: input.storeId,
      ...await dadosFinanceirosEmpresa(tx, input.storeId),
      nome: input.nome.trim(),
      tipo: input.tipo ?? "caixa",
      saldoInicial: saldo,
      saldoAtual: saldo,
      saldoInicialCentavos: precision.valorCentavos,
      saldoAtualCentavos: precision.valorCentavos,
      precisaoStatus: precision.precisaoStatus,
      ativo: true,
      cor: input.cor ?? "#6366f1",
      icone: input.icone ?? "wallet",
    },
  })

  return toPublica(row)
  })
}

// ─── atualizarCarteira ────────────────────────────────────────────────────────

export async function atualizarCarteira(
  input: AtualizarCarteiraInput
): Promise<CarteiraPublica> {
  const { id, storeId, ...fields } = input
  return emTransacaoFinanceira(undefined, async (tx) => {
  const existing = await tx.carteiraFinanceira.findFirst({ where: { id, storeId } })
  if (!existing) throw new Error("Carteira indisponível.")

  const data: Prisma.CarteiraFinanceiraUncheckedUpdateInput = await dadosFinanceirosEmpresa(tx, storeId)
  if (fields.nome !== undefined) data.nome = fields.nome.trim()
  if (fields.tipo !== undefined) data.tipo = fields.tipo
  if (fields.cor !== undefined) data.cor = fields.cor
  if (fields.icone !== undefined) data.icone = fields.icone
  if (fields.ativo !== undefined) data.ativo = fields.ativo
  if (fields.saldoInicial !== undefined) {
    data.saldoInicial = fields.saldoInicial
    const initial = precisaoLegada(fields.saldoInicial)
    const current = precisaoLegada(existing.saldoAtual)
    data.saldoInicialCentavos = initial.valorCentavos
    data.saldoAtualCentavos = current.valorCentavos
    data.precisaoStatus = initial.precisaoStatus === "CENTAVOS" && current.precisaoStatus === "CENTAVOS" ? "CENTAVOS" : "ANOMALIA_LEGADO"
  }

  const row = await tx.carteiraFinanceira.update({
    where: { id, storeId },
    data,
  })

  return toPublica(row)
  })
}

// ─── recalcularSaldoCarteira ─────────────────────────────────────────────────
/** Recalcula com o lock já pertencendo à MESMA transação das agregações e do update. */
async function recalcularSaldoCarteiraTransacional(
  id: string,
  storeId: string,
  client: CarteirasDbClient,
): Promise<CarteiraPublica> {
  if (typeof storeId !== "string" || !storeId.trim() || typeof id !== "string" || !id.trim()) {
    throw new FinanceiroScopeError(422)
  }
  // Duas baixas podem inserir movimentações em transações distintas e calcular o mesmo
  // saldo antes de qualquer uma commitar. O advisory xact lock serializa por loja+carteira
  // ANTES das agregações; quem esperar passa a enxergar o ledger já commitado do vencedor.
  const lockKey = buildCarteiraSaldoLockKey(storeId, id)
  await client.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))::text AS lock`

  const carteira = await client.carteiraFinanceira.findFirst({
    where: { id, storeId },
  })
  if (!carteira) throw new Error(`Carteira não encontrada: ${id}`)

  // Materialização não provisiona/adota. Legado NULL continua exclusivamente
  // empresarial pela loja exata; perfil já atribuído precisa existir e conferir.
  const perfil = await client.financeiroPerfil.findUnique({ where: { storeId } })
  if (perfil && (!perfil.ativo || perfil.tipo !== "EMPRESA" || perfil.storeId !== storeId)) throw new FinanceiroScopeError()
  if (carteira.perfilId != null && (!perfil || carteira.perfilId !== perfil.id)) throw new FinanceiroScopeError()
  // Materializar saldo não muda ownership de uma carteira legada. Alterar aqui a
  // chave (id, perfilId) pede lock incompatível com referências já inseridas por
  // outra transação que espera este advisory lock. A adoção fica nos writers
  // canônicos, antes de inserir o movimento, via dadosFinanceirosEmpresa(refs).

  // Sequencial (não `Promise.all`): um `TransactionClient` serializa numa única conexão.
  const entradas = await client.movimentacaoFinanceira.aggregate({
    where: { carteiraId: id, storeId, tipo: "entrada" },
    _sum: { valor: true },
  })
  const saidas = await client.movimentacaoFinanceira.aggregate({
    where: { carteiraId: id, storeId, tipo: "saida" },
    _sum: { valor: true },
  })

  const totalEntradas = safeMoney(entradas._sum.valor ?? 0)
  const totalSaidas = safeMoney(saidas._sum.valor ?? 0)
  const saldoAtual = safeMoney(carteira.saldoInicial + totalEntradas - totalSaidas)

  const updated = await client.carteiraFinanceira.update({
    where: { id, storeId },
    data: { saldoAtual,
      saldoInicialCentavos: precisaoLegada(carteira.saldoInicial).valorCentavos,
      saldoAtualCentavos: precisaoLegada(saldoAtual).valorCentavos,
      precisaoStatus: precisaoLegada(carteira.saldoInicial).precisaoStatus === "CENTAVOS"
        && precisaoLegada(saldoAtual).precisaoStatus === "CENTAVOS" ? "CENTAVOS" : "ANOMALIA_LEGADO" },
  })

  return toPublica(updated)
}

/**
 * Recalcula `saldoAtual` somando saldoInicial + entradas - saídas a partir do ledger.
 *
 * Com `db`, participa da transação do recebimento. Sem `db`, abre uma transação curta
 * própria para que o advisory lock permaneça retido até agregação + update terminarem.
 */
export async function recalcularSaldoCarteira(
  id: string,
  storeId: string,
  db?: CarteirasDbClient,
): Promise<CarteiraPublica> {
  if (db && db !== prisma) return recalcularSaldoCarteiraTransacional(id, storeId, db)
  return prisma.$transaction((tx) => recalcularSaldoCarteiraTransacional(id, storeId, tx), {
    maxWait: 5_000,
    timeout: 15_000,
  })
}

// ─── transferirEntreCarteiras ─────────────────────────────────────────────────
/**
 * Transação atômica:
 *  1. Cria MovimentacaoFinanceira saída na carteira origem
 *  2. Cria MovimentacaoFinanceira entrada na carteira destino
 *  3. Recalcula saldoAtual de ambas
 */
export async function transferirEntreCarteiras(
  input: TransferenciaInput
): Promise<TransferenciaResult> {
  const { storeId, origemId, destinoId, valor, descricao } = input
  if (typeof storeId !== "string" || !storeId.trim() || typeof origemId !== "string" || !origemId.trim()
    || typeof destinoId !== "string" || !destinoId.trim()) {
    return { ok: false, error: "Unidade, origem e destino são obrigatórios." }
  }
  const valorMoney = safeMoney(valor)

  if (valorMoney <= 0) {
    return { ok: false, error: "Valor de transferência deve ser maior que zero." }
  }
  if (origemId === destinoId) {
    return { ok: false, error: "Origem e destino não podem ser iguais." }
  }

  try {
    return await emTransacaoFinanceira<TransferenciaResult>(undefined, async (tx) => {
  // Criação inicial do perfil antes de qualquer carteira. Recusa posterior
  // aborta a transação antes de retornar ok:false, sem deixar perfil órfão.
  await dadosFinanceirosEmpresa(tx, storeId)
  // Mesma ordem dos locks de saldo, inclusive em transferências opostas.
  for (const id of [origemId, destinoId].sort()) {
    const lock = buildCarteiraSaldoLockKey(storeId, id)
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lock}))::text AS lock`
  }
  const origem = await tx.carteiraFinanceira.findFirst({ where: { id: origemId, storeId, ativo: true } })
  const destino = await tx.carteiraFinanceira.findFirst({ where: { id: destinoId, storeId, ativo: true } })

  if (!origem) throw new TransferenciaRecusada(`Carteira de origem não encontrada: ${origemId}`)
  if (!destino) throw new TransferenciaRecusada(`Carteira de destino não encontrada: ${destinoId}`)

  const descricaoBase =
    descricao?.trim() ||
    `Transferência: ${origem.nome} → ${destino.nome}`

  const scopeOrigem = await dadosFinanceirosEmpresa(tx, storeId, valor, { carteiraId: origemId })
  const scopeDestino = await dadosFinanceirosEmpresa(tx, storeId, valor, { carteiraId: destinoId })
  const saida = await tx.movimentacaoFinanceira.create({
      data: {
        ...scopeOrigem,
        storeId,
        tipo: "saida",
        origem: "transferencia",
        descricao: `${descricaoBase} (saída)`,
        valor: valorMoney,
        carteiraId: origemId,
      },
    })
  const entrada = await tx.movimentacaoFinanceira.create({
      data: {
        ...scopeDestino,
        storeId,
        tipo: "entrada",
        origem: "transferencia",
        descricao: `${descricaoBase} (entrada)`,
        valor: valorMoney,
        carteiraId: destinoId,
      },
    })

  const origemAtualizada = await recalcularSaldoCarteira(origemId, storeId, tx)
  const destinoAtualizado = await recalcularSaldoCarteira(destinoId, storeId, tx)

  return {
    ok: true,
    saidaId: saida.id,
    entradaId: entrada.id,
    origemSaldo: origemAtualizada.saldoAtual,
    destinoSaldo: destinoAtualizado.saldoAtual,
  }
    })
  } catch (error) {
    if (error instanceof TransferenciaRecusada) return { ok: false, error: error.message }
    throw error
  }
}
