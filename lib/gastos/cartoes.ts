import "server-only"
import { z } from "zod"
import type { FinanceiroDb } from "./financeiro-scope"
import { LIMITE_CENTAVOS, storeDoContexto } from "./financeiro-scope"
import type { FinanceiroContextoAutorizado } from "./types"
import { autorizarOperacaoNaTransacao, emTransacaoGasto } from "./operacoes"
import { competencia, dataCivil, identificadorOperacao, OperacaoGastoError, ordemBinaria } from "./operacao-schema"
import { comLeituraFinanceira, FinanceiroReadError } from "./read-scope"
import { saldoTituloConsulta } from "./query-calculo"
import {
  calcularResumoLimiteCartao,
  normalizarLimiteCentavosInput,
  POLITICA_COMPROMETIMENTO_LIMITE_CARTAO,
  type ResumoLimiteCartao,
} from "./cartoes-calculo"

export {
  calcularResumoLimiteCartao,
  POLITICA_COMPROMETIMENTO_LIMITE_CARTAO,
  verificarLimiteDisponivelParaCompra,
  type ResumoLimiteCartao,
} from "./cartoes-calculo"

const limiteCentavosSchema = z.union([
  z.null(),
  z.string().trim().regex(/^\d{1,16}$/),
  z.number().finite().int().min(0).max(Number(LIMITE_CENTAVOS)),
]).refine((v) => {
  if (v === null) return true
  const norm = normalizarLimiteCentavosInput(v)
  return norm !== "INVALIDO"
}).transform((v) => (v === null ? null : normalizarLimiteCentavosInput(v)!))

const motivoSchema = z.string().trim().min(1).max(500)

const cartaoSchema = z.object({
  nome: z.string().trim().min(1).max(120),
  ultimos4: z.string().regex(/^\d{4}$/).optional(),
  bandeira: z.string().trim().min(1).max(40).optional(),
  limiteCentavos: limiteCentavosSchema.optional(),
  motivo: motivoSchema.optional(),
}).strict()

const editarCartaoSchema = z.object({
  cartaoId: identificadorOperacao,
  nome: z.string().trim().min(1).max(120).optional(),
  ultimos4: z.string().regex(/^\d{4}$/).nullable().optional(),
  bandeira: z.string().trim().min(1).max(40).nullable().optional(),
  ativo: z.boolean().optional(),
  limiteCentavos: limiteCentavosSchema.optional(),
  motivo: motivoSchema.optional(),
}).strict().refine((data) => (
  data.nome !== undefined
  || data.ultimos4 !== undefined
  || data.bandeira !== undefined
  || data.ativo !== undefined
  || data.limiteCentavos !== undefined
))

const cicloSchema = z.object({
  cartaoId: identificadorOperacao,
  identificador: identificadorOperacao,
  competencia,
  vencimento: dataCivil,
  fechamentoEm: dataCivil.optional(),
}).strict()

const consultaCartoesSchema = z.object({
  cartaoId: identificadorOperacao.optional(),
  incluirInativos: z.boolean().default(false),
  incluirHistoricoLimites: z.boolean().default(true),
}).strict()

function classificarAcaoLimite(anterior: string | null, novo: string | null): "CADASTRO" | "ALTERACAO" | "REMOCAO" {
  if (anterior === null && novo !== null) return "CADASTRO"
  if (anterior !== null && novo === null) return "REMOCAO"
  return "ALTERACAO"
}

export async function cadastrarCartaoGasto(contexto: unknown, input: unknown) {
  const p = cartaoSchema.safeParse(input)
  if (!p.success) throw new OperacaoGastoError("cartao_invalido")
  return emTransacaoGasto(contexto, async (tx, ctx) => {
    await autorizarOperacaoNaTransacao(tx, ctx)
    const { motivo, limiteCentavos, ...dadosCartao } = p.data
    const limiteInicial = limiteCentavos ?? null
    const cartao = await tx.cartaoInstrumento.create({
      data: {
        ...dadosCartao,
        limiteCentavos: limiteInicial,
        perfilId: ctx.perfilId,
        storeId: storeDoContexto(ctx),
      },
    })
    if (limiteInicial !== null) {
      await tx.cartaoLimiteEvento.create({
        data: {
          perfilId: ctx.perfilId,
          storeId: storeDoContexto(ctx),
          cartaoId: cartao.id,
          autorAdminUserId: ctx.userId,
          acao: "CADASTRO",
          limiteAnteriorCentavos: null,
          limiteNovoCentavos: limiteInicial,
          motivo: motivo ?? null,
        },
      })
    }
    return cartao
  })
}

export async function editarCartaoGasto(contexto: unknown, input: unknown) {
  const p = editarCartaoSchema.safeParse(input)
  if (!p.success) throw new OperacaoGastoError("cartao_invalido")
  const dados = p.data
  return emTransacaoGasto(contexto, async (tx, ctx) => {
    await tx.$queryRaw`SELECT id FROM cartoes_instrumentos WHERE id=${dados.cartaoId} AND "perfilId"=${ctx.perfilId} FOR UPDATE`
    await autorizarOperacaoNaTransacao(tx, ctx)
    const atual = await tx.cartaoInstrumento.findFirst({
      where: { id: dados.cartaoId, perfilId: ctx.perfilId, storeId: storeDoContexto(ctx) },
    })
    if (!atual) throw new OperacaoGastoError("cartao_indisponivel", 404)

    const anteriorLimite = atual.limiteCentavos === null ? null : atual.limiteCentavos.toString()
    const limiteEnviado = dados.limiteCentavos !== undefined
    const novoLimite = limiteEnviado ? dados.limiteCentavos! : anteriorLimite
    const limiteMudou = limiteEnviado && anteriorLimite !== novoLimite

    const patch: {
      nome?: string
      ultimos4?: string | null
      bandeira?: string | null
      ativo?: boolean
      limiteCentavos?: string | null
    } = {}
    if (dados.nome !== undefined && dados.nome !== atual.nome) patch.nome = dados.nome
    if (dados.ultimos4 !== undefined && dados.ultimos4 !== atual.ultimos4) patch.ultimos4 = dados.ultimos4
    if (dados.bandeira !== undefined && dados.bandeira !== atual.bandeira) patch.bandeira = dados.bandeira
    if (dados.ativo !== undefined && dados.ativo !== atual.ativo) patch.ativo = dados.ativo
    if (limiteMudou) patch.limiteCentavos = novoLimite

    const atualizado = Object.keys(patch).length > 0
      ? await tx.cartaoInstrumento.update({ where: { id: atual.id }, data: patch })
      : atual

    const eventoLimite = limiteMudou
      ? await tx.cartaoLimiteEvento.create({
          data: {
            perfilId: ctx.perfilId,
            storeId: storeDoContexto(ctx),
            cartaoId: atual.id,
            autorAdminUserId: ctx.userId,
            acao: classificarAcaoLimite(anteriorLimite, novoLimite),
            limiteAnteriorCentavos: anteriorLimite,
            limiteNovoCentavos: novoLimite,
            motivo: dados.motivo ?? null,
          },
        })
      : null

    const utilizado = await limiteUtilizadoCartaoNaTransacao(tx, ctx, atual.id)
    const resumoLimite = calcularResumoLimiteCartao(
      atualizado.limiteCentavos === null ? null : BigInt(atualizado.limiteCentavos.toString()),
      utilizado,
    )

    return {
      cartao: atualizado,
      resumoLimite,
      eventoLimite: eventoLimite
        ? {
            id: eventoLimite.id,
            acao: eventoLimite.acao as "CADASTRO" | "ALTERACAO" | "REMOCAO",
            limiteAnteriorCentavos: eventoLimite.limiteAnteriorCentavos?.toString() ?? null,
            limiteNovoCentavos: eventoLimite.limiteNovoCentavos?.toString() ?? null,
            motivo: eventoLimite.motivo,
            autorAdminUserId: eventoLimite.autorAdminUserId,
            criadoEm: eventoLimite.createdAt.toISOString(),
          }
        : null,
    }
  })
}

export async function cadastrarCicloGasto(contexto: unknown, input: unknown) {
  const p = cicloSchema.safeParse(input)
  if (!p.success) throw new OperacaoGastoError("ciclo_invalido")
  return emTransacaoGasto(contexto, async (tx, ctx) => {
    await tx.$queryRaw`SELECT id FROM cartoes_instrumentos WHERE id=${p.data.cartaoId} AND "perfilId"=${ctx.perfilId} FOR SHARE`
    await autorizarOperacaoNaTransacao(tx, ctx)
    if (!await tx.cartaoInstrumento.findFirst({ where: { id: p.data.cartaoId, perfilId: ctx.perfilId, storeId: storeDoContexto(ctx), ativo: true } })) {
      throw new OperacaoGastoError("cartao_indisponivel", 404)
    }
    const data = { ...p.data, perfilId: ctx.perfilId, storeId: storeDoContexto(ctx),
      vencimento: new Date(p.data.vencimento + "T00:00:00Z"),
      fechamentoEm: p.data.fechamentoEm ? new Date(p.data.fechamentoEm + "T00:00:00Z") : null }
    await tx.cartaoCiclo.createMany({ data: [data], skipDuplicates: true })
    const row = await tx.cartaoCiclo.findUniqueOrThrow({ where: { cartaoId_identificador: {
      cartaoId: p.data.cartaoId, identificador: p.data.identificador } } })
    if (!row.ativo || row.competencia !== data.competencia || row.vencimento.getTime() !== data.vencimento.getTime()
      || row.fechamentoEm?.getTime() !== data.fechamentoEm?.getTime()) throw new OperacaoGastoError("ciclo_divergente", 409)
    return row
  })
}

/**
 * Soma exata em centavos do limite utilizado por um cartão na transação atual:
 * todo saldo restante em aberto de títulos ativos (à vista e parcelas futuras)
 * vinculados a ciclos daquele cartão no mesmo perfil/escopo.
 */
export async function limiteUtilizadoCartaoNaTransacao(
  tx: FinanceiroDb,
  ctx: FinanceiroContextoAutorizado,
  cartaoId: string,
): Promise<bigint> {
  const titulos = await tx.contaPagarTitulo.findMany({
    where: {
      perfilId: ctx.perfilId,
      storeId: storeDoContexto(ctx),
      ativo: true,
      cartaoCiclo: { is: { cartaoId, perfilId: ctx.perfilId, storeId: storeDoContexto(ctx) } },
    },
    include: {
      alocacoesPagamento: {
        select: { pagamentoId: true, valorCentavos: true, pagamento: { select: { tipo: true } } },
      },
    },
  })
  let utilizado = BigInt(0)
  for (const t of titulos) {
    const s = saldoTituloConsulta(t)
    if (!s.cancelado) utilizado += s.restante
  }
  return utilizado
}

/** Instrumentos antes dos ciclos, sempre ordenados, antes de qualquer título. */
export async function travarCiclosGasto(
  tx: FinanceiroDb,
  ctx: FinanceiroContextoAutorizado,
  ids: string[],
  opcoes?: { travarCartaoParaEscrita?: boolean },
) {
  const where = { perfilId: ctx.perfilId, storeId: storeDoContexto(ctx), id: { in: [...new Set(ids)] } }
  const base = await tx.cartaoCiclo.findMany({ where })
  if (base.length !== new Set(ids).size) throw new OperacaoGastoError("ciclo_indisponivel", 404)
  for (const id of [...new Set(base.map(c => c.cartaoId))].sort(ordemBinaria)) {
    if (opcoes?.travarCartaoParaEscrita) {
      await tx.$queryRaw`SELECT id FROM cartoes_instrumentos WHERE id=${id} AND "perfilId"=${ctx.perfilId} FOR UPDATE`
    } else {
      await tx.$queryRaw`SELECT id FROM cartoes_instrumentos WHERE id=${id} AND "perfilId"=${ctx.perfilId} FOR SHARE`
    }
  }
  for (const id of [...new Set(ids)].sort(ordemBinaria)) {
    await tx.$queryRaw`SELECT id FROM cartoes_ciclos WHERE id=${id} AND "perfilId"=${ctx.perfilId} FOR UPDATE`
  }
  const rows = await tx.cartaoCiclo.findMany({ where, include: { cartao: true } })
  if (rows.some(c => !c.ativo || !c.cartao.ativo)) throw new OperacaoGastoError("ciclo_indisponivel", 404)
  return rows
}

export type CartaoCicloResumoDTO = Readonly<{
  id: string
  identificador: string
  competencia: string
  vencimento: string
  fechamentoEm: string | null
  ativo: boolean
  totalCentavos: string
  pagoCentavos: string
  restanteCentavos: string
  quantidadeTitulos: number
}>

export type CartaoLimiteEventoDTO = Readonly<{
  id: string
  acao: "CADASTRO" | "ALTERACAO" | "REMOCAO"
  limiteAnteriorCentavos: string | null
  limiteNovoCentavos: string | null
  motivo: string | null
  autorAdminUserId: string
  criadoEm: string
}>

export type CartaoConsultaDTO = Readonly<{
  id: string
  nome: string
  ultimos4: string | null
  bandeira: string | null
  ativo: boolean
  createdAt: string
  updatedAt: string
} & ResumoLimiteCartao & {
  ciclos: readonly CartaoCicloResumoDTO[]
  historicoLimites: readonly CartaoLimiteEventoDTO[]
}>

/** Leitura privada canônica de cartões, limites, faturas por ciclo e histórico de limites. */
export async function consultarCartoesGasto(contexto: unknown, input: unknown = {}): Promise<CartaoConsultaDTO[]> {
  const parsed = consultaCartoesSchema.safeParse(input)
  if (!parsed.success) throw new FinanceiroReadError(422)
  const { cartaoId, incluirInativos, incluirHistoricoLimites } = parsed.data
  return comLeituraFinanceira(contexto, async (db, ctx) => {
    const storeId = storeDoContexto(ctx)
    const cartoes = await db.cartaoInstrumento.findMany({
      where: {
        perfilId: ctx.perfilId,
        storeId,
        ...(cartaoId ? { id: cartaoId } : {}),
        ...(incluirInativos ? {} : { ativo: true }),
      },
      include: {
        ciclos: {
          orderBy: [{ competencia: "asc" }, { vencimento: "asc" }, { id: "asc" }],
        },
        limitesEventos: incluirHistoricoLimites
          ? { orderBy: [{ createdAt: "asc" }, { id: "asc" }] }
          : false,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    })
    if (cartaoId && cartoes.length === 0) throw new FinanceiroReadError(404)

    const cicloIds = cartoes.flatMap((c) => c.ciclos.map((ci) => ci.id))
    const titulos = cicloIds.length > 0
      ? await db.contaPagarTitulo.findMany({
          where: {
            perfilId: ctx.perfilId,
            storeId,
            cartaoCicloId: { in: cicloIds },
          },
          include: {
            alocacoesPagamento: {
              select: { pagamentoId: true, valorCentavos: true, pagamento: { select: { tipo: true } } },
            },
          },
          orderBy: { id: "asc" },
        })
      : []

    const titulosPorCiclo = new Map<string, typeof titulos>()
    for (const t of titulos) {
      if (!t.cartaoCicloId) continue
      const lista = titulosPorCiclo.get(t.cartaoCicloId) ?? []
      lista.push(t)
      titulosPorCiclo.set(t.cartaoCicloId, lista)
    }

    return cartoes.map((cartao) => {
      let utilizadoTotal = BigInt(0)
      const ciclosDTO: CartaoCicloResumoDTO[] = cartao.ciclos.map((ciclo) => {
        const rows = titulosPorCiclo.get(ciclo.id) ?? []
        let total = BigInt(0)
        let pago = BigInt(0)
        let restante = BigInt(0)
        let quantidadeTitulos = 0
        for (const t of rows) {
          const s = saldoTituloConsulta(t)
          if (s.cancelado) continue
          total += s.total
          pago += s.pago
          restante += s.restante
          quantidadeTitulos++
        }
        utilizadoTotal += restante
        return Object.freeze({
          id: ciclo.id,
          identificador: ciclo.identificador,
          competencia: ciclo.competencia,
          vencimento: ciclo.vencimento.toISOString().slice(0, 10),
          fechamentoEm: ciclo.fechamentoEm ? ciclo.fechamentoEm.toISOString().slice(0, 10) : null,
          ativo: ciclo.ativo,
          totalCentavos: total.toString(),
          pagoCentavos: pago.toString(),
          restanteCentavos: restante.toString(),
          quantidadeTitulos,
        })
      })

      const resumoLimite = calcularResumoLimiteCartao(
        cartao.limiteCentavos === null ? null : BigInt(cartao.limiteCentavos.toString()),
        utilizadoTotal,
      )
      const eventos = Array.isArray(cartao.limitesEventos)
        ? cartao.limitesEventos.map((e) =>
            Object.freeze({
              id: e.id,
              acao: e.acao as "CADASTRO" | "ALTERACAO" | "REMOCAO",
              limiteAnteriorCentavos: e.limiteAnteriorCentavos?.toString() ?? null,
              limiteNovoCentavos: e.limiteNovoCentavos?.toString() ?? null,
              motivo: e.motivo,
              autorAdminUserId: e.autorAdminUserId,
              criadoEm: e.createdAt.toISOString(),
            }),
          )
        : []

      return Object.freeze({
        id: cartao.id,
        nome: cartao.nome,
        ultimos4: cartao.ultimos4,
        bandeira: cartao.bandeira,
        ativo: cartao.ativo,
        createdAt: cartao.createdAt.toISOString(),
        updatedAt: cartao.updatedAt.toISOString(),
        ...resumoLimite,
        ciclos: ciclosDTO,
        historicoLimites: eventos,
      })
    })
  })
}

export async function consultarHistoricoLimiteCartaoGasto(
  contexto: unknown,
  cartaoId: string,
): Promise<CartaoLimiteEventoDTO[]> {
  if (!identificadorOperacao.safeParse(cartaoId).success) throw new FinanceiroReadError(404)
  const [cartao] = await consultarCartoesGasto(contexto, {
    cartaoId,
    incluirInativos: true,
    incluirHistoricoLimites: true,
  })
  return [...cartao.historicoLimites]
}

const planejarFaturaSchema = z.object({
  cicloId: identificadorOperacao, quitar: z.boolean().default(false),
  valorCentavos: z.string().regex(/^\d{1,16}$/).optional(),
}).strict()

export type PlanoPagamentoFaturaDTO = Readonly<{
  cicloId: string
  restanteCentavos: string
  valorCentavos: string
  alocacoes: ReadonlyArray<Readonly<{ tituloId: string; valorCentavos: string }>>
}>

/**
 * Assistente/HUB: "pagar R$ X da fatura do ciclo Y" → alocações EXPLÍCITAS para a proposta PAGAR_FATURA.
 * Só leitura (snapshot + RLS). Ordem determinística: vencimento, depois id; nunca aloca acima do aberto de
 * cada título nem do ciclo. A aplicação continua sendo a do G004 (revisão + confirmação), que revalida tudo.
 */
export async function planejarPagamentoFaturaGasto(contexto: unknown, input: unknown): Promise<PlanoPagamentoFaturaDTO> {
  const parsed = planejarFaturaSchema.safeParse(input)
  if (!parsed.success || parsed.data.quitar === (parsed.data.valorCentavos !== undefined)) throw new FinanceiroReadError(422)
  const { cicloId, quitar, valorCentavos } = parsed.data
  // Leitura no snapshot; a validação do valor vem DEPOIS, para a recusa tipada não virar 503 genérico.
  const abertos = await comLeituraFinanceira(contexto, async (db, ctx) => {
    const storeId = storeDoContexto(ctx)
    const ciclo = await db.cartaoCiclo.findFirst({ where: { id: cicloId, perfilId: ctx.perfilId, storeId }, select: { id: true } })
    if (!ciclo) throw new FinanceiroReadError(404)
    const titulos = await db.contaPagarTitulo.findMany({
      where: { perfilId: ctx.perfilId, storeId, cartaoCicloId: cicloId, ativo: true },
      include: { alocacoesPagamento: { select: { pagamentoId: true, valorCentavos: true, pagamento: { select: { tipo: true } } } } },
      orderBy: [{ vencimento: "asc" }, { id: "asc" }],
    })
    return titulos.map((t) => ({ id: t.id, restante: saldoTituloConsulta(t).restante })).filter((t) => t.restante > BigInt(0))
  })
  {
    const restante = abertos.reduce((s, t) => s + t.restante, BigInt(0))
    const alvo = quitar ? restante : BigInt(valorCentavos!)
    if (alvo <= BigInt(0) || alvo > restante) throw new OperacaoGastoError("valor_acima_saldo_fatura", 409)
    let falta = alvo
    const alocacoes: Array<{ tituloId: string; valorCentavos: string }> = []
    for (const t of abertos) {
      if (falta === BigInt(0)) break
      const v = t.restante < falta ? t.restante : falta
      alocacoes.push({ tituloId: t.id, valorCentavos: v.toString() })
      falta -= v
    }
    return Object.freeze({ cicloId, restanteCentavos: restante.toString(), valorCentavos: alvo.toString(),
      alocacoes: Object.freeze(alocacoes.map((a) => Object.freeze(a))) })
  }
}
