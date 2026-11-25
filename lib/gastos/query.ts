import "server-only"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma"
import { getEnterprisePermissions } from "@/lib/auth/enterprise-permissions"
import { comLeituraFinanceira, requireLeituraFinanceiraEmpresa, FinanceiroReadError } from "./read-scope"
import { isOrigemTransferenciaInterna, isOrigemEstornoPagar, isOrigemEstornoReceber, isOrigemDevolucaoPdv } from "@/lib/financeiro/services/movimentacao-financeira-classify"
import {
  centavosConsulta, saldoTituloConsulta, reaisConsulta, objetoConsulta, diaNoFusoConsulta,
  intervaloConsulta, FUSO_FINANCEIRO, VERSAO_CALCULO_FINANCEIRO, ConsultaFinanceiraError,
} from "./query-calculo"

export { reaisConsulta, diaNoFusoConsulta, intervaloConsulta } from "./query-calculo"
const id = z.string().trim().min(1).max(191)
const filtroSchema = z.object({
  base: z.literal("CAIXA_REALIZADO"), timezone: z.literal(FUSO_FINANCEIRO), moeda: z.literal("BRL"),
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), dataFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), carteiraId: id.optional(), categoriaId: id.optional(),
  categoriaNome: z.string().trim().min(1).max(120).optional(),
}).strict()
export type FiltroConsultaFinanceira = z.infer<typeof filtroSchema>
export type PeriodoConsultaFinanceira = Partial<Pick<FiltroConsultaFinanceira, "dataInicio" | "dataFim" | "carteiraId" | "categoriaId" | "categoriaNome">>

export function filtroConsultaFinanceira(input: PeriodoConsultaFinanceira = {}): FiltroConsultaFinanceira {
  const hoje = diaNoFusoConsulta(new Date())
  return { base: "CAIXA_REALIZADO", timezone: FUSO_FINANCEIRO, moeda: "BRL",
    dataInicio: hoje.slice(0, 7) + "-01", dataFim: hoje, ...input }
}

type Scope = { storeId: string | null; perfilId: string | null; tipo: "EMPRESA" | "PESSOAL" }
/** Diagnóstico técnico de servidor: nunca inclui descrição, payload, valor ou identidade pessoal. */
function comRegistro<T>(tabela: string, registroId: string, calcular: () => T): T {
  try { return calcular() } catch (e) {
    if (e instanceof ConsultaFinanceiraError) console.error(JSON.stringify({ evento: "consulta_financeira_inconsistente", code: e.code, tabela, registroId }))
    throw e
  }
}
function erroRegistro(code: string, registroId: string): never {
  return comRegistro("movimentacoes_financeiras", registroId, () => { throw new ConsultaFinanceiraError(code) })
}
export function erroConsultaFinanceira(e: unknown) {
  const conhecido = e instanceof ConsultaFinanceiraError
  const status = conhecido ? e.status : e instanceof FinanceiroReadError ? e.status : 503
  return { status, body: { ok: false as const, code: conhecido ? e.code : "consulta_financeira_indisponivel", error: "Não foi possível consultar os dados financeiros com segurança. Solicite revisão dos registros se o problema persistir." } }
}
function tituloPorReferencia<T extends { id: string }>(porId: Map<string, T>, porChave: Map<string, T>, ref: string) {
  const id = porId.get(ref), chave = porChave.get(ref)
  if (id && chave && id.id !== chave.id) throw new ConsultaFinanceiraError("vinculo_legado_exige_revisao")
  return id ?? chave
}
function whereScope(scope: Scope) {
  if (scope.tipo === "PESSOAL") {
    if (!scope.perfilId || scope.storeId !== null) throw new FinanceiroReadError()
    return { storeId: null, perfilId: scope.perfilId }
  }
  if (!scope.storeId) throw new FinanceiroReadError()
  // Perfil NULL é exclusivamente o legado da mesma empresa, nunca todos os perfis.
  return { storeId: scope.storeId, OR: scope.perfilId ? [{ perfilId: scope.perfilId }, { perfilId: null }] : [{ perfilId: null }] }
}

async function revalidarEmpresa(db: Prisma.TransactionClient, storeId: string, userId: string): Promise<Scope> {
  const user = await db.adminUser.findUnique({ where: { id: userId }, select: { active: true, role: true } })
  if (!user?.active || !getEnterprisePermissions(user.role).financeiro.view
    || !await db.adminUserStore.findUnique({ where: { adminUserId_storeId: { adminUserId: userId, storeId } }, select: { storeId: true } })) {
    throw new FinanceiroReadError()
  }
  const p = await db.financeiroPerfil.findUnique({ where: { storeId }, select: {
    id: true, tipo: true, ativo: true, ownerAdminUserId: true,
    membros: { where: { adminUserId: userId, storeId, revogadoEm: null }, select: { id: true } },
  } })
  if (p && (p.tipo !== "EMPRESA" || !p.ativo || p.ownerAdminUserId !== null || !p.membros.length)) throw new FinanceiroReadError()
  return { tipo: "EMPRESA", storeId, perfilId: p?.id ?? null }
}

/** Fundação compartilhada; não recebe principal do cliente nem abre transação própria. */
async function carregarConsulta(db: Prisma.TransactionClient, scope: Scope, raw: unknown) {
  const parsed = filtroSchema.safeParse(raw)
  if (!parsed.success) throw new ConsultaFinanceiraError("filtros_invalidos", 422)
  const filtro = parsed.data, range = intervaloConsulta(filtro.dataInicio, filtro.dataFim, filtro.timezone)
  const [clock] = await db.$queryRaw<Array<{ instante: Date }>>`SELECT statement_timestamp() AS instante`
  const asOf = clock.instante, where = whereScope(scope)
  const [contas, pagarRows, receberRows, movimentos, categorias, gastos, loja] = await Promise.all([
    db.carteiraFinanceira.findMany({ where, orderBy: { id: "asc" } }),
    db.contaPagarTitulo.findMany({ where, include: { alocacoesPagamento: {
      select: { pagamentoId: true, valorCentavos: true, pagamento: { select: { tipo: true } } },
    } }, orderBy: { id: "asc" } }),
    db.contaReceberTitulo.findMany({ where, orderBy: { id: "asc" } }),
    db.movimentacaoFinanceira.findMany({ where, include: { pagamentoFinanceiro: {
      select: { id: true, tipo: true, valorCentavos: true, alocacoes: {
        select: { id: true, pagarTituloId: true, gastoId: true, valorCentavos: true },
      } },
    } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    scope.perfilId ? db.categoriaGasto.findMany({ where: { perfilId: scope.perfilId, storeId: scope.storeId } }) : Promise.resolve([]),
    scope.perfilId ? db.gasto.findMany({ where: { perfilId: scope.perfilId, storeId: scope.storeId }, select: { id: true, categoriaId: true } }) : Promise.resolve([]),
    scope.storeId ? db.store.findUnique({ where: { id: scope.storeId }, select: { name: true } }) : Promise.resolve(null),
  ])
  if (filtro.carteiraId && !contas.some(c => c.id === filtro.carteiraId)) throw new FinanceiroReadError(404)
  let categoriaId = filtro.categoriaId
  if (filtro.categoriaNome) {
    if (categoriaId) throw new ConsultaFinanceiraError("categoria_ambigua", 422)
    const candidatas = categorias.filter(c => c.ativo && c.nome.toLocaleLowerCase("pt-BR") === filtro.categoriaNome!.toLocaleLowerCase("pt-BR"))
    if (candidatas.length !== 1) throw new ConsultaFinanceiraError("categoria_exige_esclarecimento", 422)
    categoriaId = candidatas[0].id
  }
  if (categoriaId && !categorias.some(c => c.id === categoriaId)) throw new FinanceiroReadError(404)
  const catMap = new Map(categorias.map(c => [c.id, c.nome]))
  const contasIds = new Set(contas.map(c => c.id))
  // FKs históricas simples não autorizam transportar identificadores de outro perfil.
  for (const row of movimentos) {
    if ((row.carteiraId && !contasIds.has(row.carteiraId)) || (row.categoriaId && !catMap.has(row.categoriaId))) throw new FinanceiroReadError(503)
  }
  const pagarMap = new Map(pagarRows.map(t => [t.id, t]))
  const receberMap = new Map(receberRows.map(t => [t.id, t]))
  const pagarPorChave = new Map(pagarRows.flatMap(t => t.localKey ? [[t.localKey, t] as const] : []))
  const receberPorChave = new Map(receberRows.flatMap(t => t.localKey ? [[t.localKey, t] as const] : []))
  const gastoMap = new Map(gastos.map(g => [g.id, g]))
  const movMap = new Map(movimentos.map(m => [m.id, m]))
  const valores = new Map(movimentos.map(m => {
    const valor = comRegistro("movimentacoes_financeiras", m.id, () => centavosConsulta(m.valor, m.valorCentavos))
    if (valor <= BigInt(0) || !["entrada", "saida"].includes(m.tipo)) erroRegistro("movimento_exige_revisao", m.id)
    return [m.id, valor] as const
  }))
  const compensacoes = new Map<string, bigint>()
  for (const m of movimentos) {
    if (!m.compensaMovimentacaoId) continue
    const original = movMap.get(m.compensaMovimentacaoId)
    if (!original || original.compensaMovimentacaoId || original.tipo === m.tipo || original.carteiraId !== m.carteiraId
      || isOrigemTransferenciaInterna(original.origem) || isOrigemEstornoPagar(original.origem) || isOrigemEstornoReceber(original.origem) || isOrigemDevolucaoPdv(original.origem)) erroRegistro("compensacao_exige_revisao", m.id)
    const total = (compensacoes.get(original.id) ?? BigInt(0)) + valores.get(m.id)!
    if (total > valores.get(original.id)!) erroRegistro("compensacao_exige_revisao", m.id)
    compensacoes.set(original.id, total)
  }
  const instante = (m: typeof movimentos[number]) => m.ocorridoEm ?? m.createdAt
  const elegivel = (m: typeof movimentos[number]) => instante(m) <= asOf && instante(m) < range.lt
  const noPeriodo = (m: typeof movimentos[number]) => elegivel(m) && instante(m) >= range.gte
  type Evento = { id: string; movimentoId: string; carteiraId: string | null; categoriaId: string | null; categoria: string;
    referenciaTituloId: string | null;
    descricao: string; origem: string; dia: string; ocorridoEm: string; tipo: string;
    valorCentavos: string; receitaCentavos: string; despesaCentavos: string; transferencia: boolean }
  const eventosCompletos: Evento[] = []
  for (const m of movimentos) {
    if (instante(m) > asOf || (filtro.carteiraId && m.carteiraId !== filtro.carteiraId)) continue
    const original = m.compensaMovimentacaoId ? movMap.get(m.compensaMovimentacaoId)! : m
    const transferencia = isOrigemTransferenciaInterna(original.origem)
    const estornoPagar = m.compensaMovimentacaoId ? original.tipo === "saida" : isOrigemEstornoPagar(m.origem)
    const estornoReceber = m.compensaMovimentacaoId ? original.tipo === "entrada" : isOrigemEstornoReceber(m.origem) || isOrigemDevolucaoPdv(m.origem)
    const tituloOrigem = comRegistro("movimentacoes_financeiras", m.id, () => original.pagarTituloId ? pagarMap.get(original.pagarTituloId)
      : original.receberTituloId ? receberMap.get(original.receberTituloId)
      : original.referenciaId ? (original.tipo === "saida" && !isOrigemEstornoReceber(original.origem) && !isOrigemDevolucaoPdv(original.origem)
        ? tituloPorReferencia(pagarMap, pagarPorChave, original.referenciaId) : tituloPorReferencia(receberMap, receberPorChave, original.referenciaId)) : undefined)
    if ((estornoPagar || estornoReceber) && !m.compensaMovimentacaoId) {
      // Legado só compensa quando há uma referência inequívoca com lastro no ledger.
      const lastro = movimentos.filter(o => !o.compensaMovimentacaoId && o.referenciaId && o.referenciaId === m.referenciaId
        && o.tipo !== m.tipo && !isOrigemTransferenciaInterna(o.origem) && !isOrigemEstornoPagar(o.origem) && !isOrigemEstornoReceber(o.origem) && !isOrigemDevolucaoPdv(o.origem))
      const revertido = movimentos.filter(o => !o.compensaMovimentacaoId && o.referenciaId === m.referenciaId && o.tipo === m.tipo
        && (isOrigemEstornoPagar(o.origem) || isOrigemEstornoReceber(o.origem) || isOrigemDevolucaoPdv(o.origem)))
      const vinculado = lastro.reduce((s, o) => s + (compensacoes.get(o.id) ?? BigInt(0)), BigInt(0))
      if (lastro.length !== 1 || vinculado + revertido.reduce((s, o) => s + valores.get(o.id)!, BigInt(0)) > lastro.reduce((s, o) => s + valores.get(o.id)!, BigInt(0))) {
        erroRegistro("compensacao_legada_exige_revisao", m.id)
      }
    }
    const alocacoes = m.pagamentoFinanceiro?.alocacoes ?? []
    if (m.pagamentoFinanceiro && BigInt(m.pagamentoFinanceiro.valorCentavos.toString()) !== valores.get(m.id)) erroRegistro("pagamento_exige_revisao", m.id)
    if (alocacoes.length && alocacoes.reduce((s, a) => s + BigInt(a.valorCentavos.toString()), BigInt(0)) !== valores.get(m.id)) {
      erroRegistro("alocacao_exige_revisao", m.id)
    }
    const partes = alocacoes.length ? alocacoes.map(a => ({ id: a.id, valor: BigInt(a.valorCentavos.toString()),
      categoriaId: (a.pagarTituloId ? pagarMap.get(a.pagarTituloId)?.categoriaId : a.gastoId ? gastoMap.get(a.gastoId)?.categoriaId : null) ?? null }))
      : [{ id: m.id, valor: valores.get(m.id)!, categoriaId: original.categoriaId
        ?? tituloOrigem?.categoriaId ?? null }]
    for (const parte of partes) {
      if (parte.categoriaId && !catMap.has(parte.categoriaId)) throw new FinanceiroReadError(503)
      if (categoriaId && parte.categoriaId !== categoriaId) continue
      const despesa = !transferencia && (estornoPagar || (!estornoReceber && m.tipo === "saida"))
      const receita = !transferencia && !despesa
      eventosCompletos.push({ id: parte.id, movimentoId: m.id, carteiraId: m.carteiraId,
        referenciaTituloId: tituloOrigem?.id ?? null,
        categoriaId: parte.categoriaId, categoria: parte.categoriaId ? catMap.get(parte.categoriaId) ?? "Sem categoria" : "Sem categoria",
        descricao: m.descricao, origem: m.origem, dia: diaNoFusoConsulta(instante(m), filtro.timezone),
        ocorridoEm: instante(m).toISOString(), tipo: m.tipo, valorCentavos: parte.valor.toString(), transferencia,
        despesaCentavos: despesa ? (parte.valor * (estornoPagar ? -BigInt(1) : BigInt(1))).toString() : "0",
        receitaCentavos: receita ? (parte.valor * (estornoReceber ? -BigInt(1) : BigInt(1))).toString() : "0" })
    }
  }
  const eventos = eventosCompletos.filter(e => e.dia >= filtro.dataInicio && e.dia <= filtro.dataFim)
  const somar = <T,>(rows: T[], fn: (r: T) => string) => rows.reduce((s, r) => s + BigInt(fn(r)), BigInt(0)).toString()
  const porCategoria = [...new Set(eventos.map(e => e.categoriaId))].map(id => {
    const linhas = eventos.filter(e => e.categoriaId === id)
    return { categoriaId: id, categoria: id ? catMap.get(id) ?? "Sem categoria" : "Sem categoria",
      despesaCentavos: somar(linhas, e => e.despesaCentavos), receitaCentavos: somar(linhas, e => e.receitaCentavos),
      quantidade: new Set(linhas.map(e => e.movimentoId)).size }
  })
  const hoje = diaNoFusoConsulta(asOf), ano = Number(hoje.slice(0, 4)), mes = Number(hoje.slice(5, 7))
  const anterior = new Date(Date.UTC(ano, mes - 2, 1)).toISOString().slice(0, 7)
  const receitaEntre = (inicio: string, fim: string) => somar(eventosCompletos.filter(e => e.dia >= inicio && e.dia <= fim), e => e.receitaCentavos)
  const comparativos = { criterio: "CALENDARIO_ATUAL_VS_ANTERIOR_COMPLETO" as const,
    receitaMesAtualCentavos: receitaEntre(hoje.slice(0, 7) + "-01", hoje),
    receitaMesAnteriorCentavos: receitaEntre(anterior + "-01", anterior + "-31"),
    receitaAnoAtualCentavos: receitaEntre(`${ano}-01-01`, hoje),
    receitaAnoAnteriorCentavos: receitaEntre(`${ano - 1}-01-01`, `${ano - 1}-12-31`) }
  const totalDespesa = somar(eventos, e => e.despesaCentavos), totalReceita = somar(eventos, e => e.receitaCentavos)
  const semConta = movimentos.filter(m => !m.carteiraId && elegivel(m))
  const semCarteira = { quantidade: semConta.length,
    entradasCentavos: semConta.filter(m => m.tipo === "entrada").reduce((s,m) => s + valores.get(m.id)!, BigInt(0)).toString(),
    saidasCentavos: semConta.filter(m => m.tipo === "saida").reduce((s,m) => s + valores.get(m.id)!, BigInt(0)).toString() }
  const mesesCalendario = new Map<string, { receita: bigint; despesa: bigint }>()
  for (const e of eventosCompletos) { const mes = e.dia.slice(0,7), v = mesesCalendario.get(mes) ?? { receita: BigInt(0), despesa: BigInt(0) }; v.receita += BigInt(e.receitaCentavos); v.despesa += BigInt(e.despesaCentavos); mesesCalendario.set(mes,v) }
  const calendario = [...mesesCalendario].map(([mes,v]) => ({ mes, receitaCentavos: v.receita.toString(), despesaCentavos: v.despesa.toString() }))
  const dto = { base: filtro.base, moeda: filtro.moeda, timezone: filtro.timezone, asOf: asOf.toISOString(), versaoCalculo: VERSAO_CALCULO_FINANCEIRO,
    periodo: { dataInicio: filtro.dataInicio, dataFim: filtro.dataFim, inicio: range.gte.toISOString(), fimExclusivo: range.lt.toISOString() },
    criterios: { ...filtro, categoriaId: categoriaId ?? null, perfilId: scope.perfilId, tipoPerfil: scope.tipo,
      saldoContas: "SOMENTE_MOVIMENTOS_COM_CARTEIRA" as const, corteSaldoContas: "ATE_FIM_DO_PERIODO_OU_ASOF" as const, semCarteiraIndependeDoFiltroDeConta: true,
      saldoIndependeDaCategoria: true, dataLegadaSemOcorridoEm: "CREATED_AT_LEGADO" as const },
    totalRealizadoCentavos: totalDespesa, despesaRealizadaCentavos: totalDespesa, receitaRealizadaCentavos: totalReceita,
    resultadoCentavos: (BigInt(totalReceita) - BigInt(totalDespesa)).toString(),
    quantidadeRegistros: new Set(eventos.map(e => e.movimentoId)).size, porCategoria, eventos, comparativos, calendario, semCarteira, lojaNome: loja?.name ?? null }
  return { dto, fonte: { contas, pagarRows, receberRows, movimentos, catMap, valores, filtro, categoriaId, asOf, range, elegivel, noPeriodo } }
}
/** Posições são calculadas separadamente: DRE/fechamento não validam títulos sem relação com seus eventos. */
async function apurarPosicoes(db: Prisma.TransactionClient, scope: Scope, raw: unknown) {
  const { dto, fonte } = await carregarConsulta(db, scope, raw)
  const { contas, pagarRows, receberRows, movimentos, catMap, valores, filtro, categoriaId, elegivel, noPeriodo } = fonte
  const somar = <T,>(rows: T[], fn: (r: T) => string) => rows.reduce((s, r) => s + BigInt(fn(r)), BigInt(0)).toString()
  const titulos = (rows: typeof receberRows | typeof pagarRows, natureza: "PAGAR" | "RECEBER") => rows
    .filter(t => (!filtro.carteiraId || t.carteiraId === filtro.carteiraId) && (!categoriaId || t.categoriaId === categoriaId))
    .map(t => comRegistro(natureza === "PAGAR" ? "contas_pagar_titulos" : "contas_receber_titulos", t.id, () => {
      if ((t.carteiraId && !contas.some(c => c.id === t.carteiraId)) || (t.categoriaId && !catMap.has(t.categoriaId))) throw new FinanceiroReadError(503)
      const s = saldoTituloConsulta(t), p = objetoConsulta(t.payload)
      const texto = (...keys: string[]) => keys.map(k => p[k]).find(v => typeof v === "string" && v.trim()) as string | undefined
      return { id: t.id, localKey: t.localKey, natureza, descricao: t.descricao, valorCentavos: s.total.toString(),
        pagoCentavos: s.pago.toString(), restanteCentavos: s.restante.toString(), cancelado: s.cancelado,
        status: t.status, vencimento: t.vencimento, categoriaId: t.categoriaId, carteiraId: t.carteiraId,
        contraparte: "cliente" in t ? t.cliente : typeof p.fornecedorNome === "string" ? p.fornecedorNome : "",
        createdAt: t.createdAt.toISOString(),
        apresentacao: { fornecedor: texto("fornecedorNome", "fornecedor") ?? "", cliente: "cliente" in t ? t.cliente : "",
          categoria: t.categoriaId ? catMap.get(t.categoriaId) ?? "Sem categoria" : texto("planoContas", "categoria") ?? "Sem categoria",
          formaPagamento: texto("formaPagamento") ?? "", contaBancaria: texto("contaBancaria") ?? "",
          observacao: texto("observacoes", "observacao") ?? "", dataConfirmacao: texto("dataConfirmacao") ?? "",
          parcela: p.parcelaNumero && p.parcelaTotal ? `${p.parcelaNumero}/${p.parcelaTotal}` : "",
          historico: (Array.isArray(p.historico) ? p.historico : []).map(objetoConsulta).map(e => ({
            tipo: String(e.tipo ?? ""), valor: typeof e.valor === "number" ? reaisConsulta(centavosConsulta(e.valor)) : undefined,
            at: typeof e.at === "string" ? e.at : undefined, motivo: typeof e.motivo === "string" ? e.motivo : undefined,
          })) } }
    }))
  const pagar = titulos(pagarRows, "PAGAR"), receber = titulos(receberRows, "RECEBER")
  const contasDTO = contas.filter(c => !filtro.carteiraId || c.id === filtro.carteiraId).map(c => {
    const inicial = comRegistro("carteiras_financeiras", c.id, () => centavosConsulta(c.saldoInicial, c.saldoInicialCentavos))
    const ledger = movimentos.filter(m => m.carteiraId === c.id && elegivel(m))
    const saldo = ledger.reduce((s, m) => s + valores.get(m.id)! * (m.tipo === "entrada" ? BigInt(1) : -BigInt(1)), inicial)
    return { id: c.id, nome: c.nome, tipo: c.tipo, ativo: c.ativo, cor: c.cor, icone: c.icone,
      createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(), saldoInicialCentavos: inicial.toString(), saldoCentavos: saldo.toString(),
      entradasCentavos: ledger.filter(noPeriodo).filter(m => m.tipo === "entrada").reduce((s, m) => s + valores.get(m.id)!, BigInt(0)).toString(),
      saidasCentavos: ledger.filter(noPeriodo).filter(m => m.tipo === "saida").reduce((s, m) => s + valores.get(m.id)!, BigInt(0)).toString(),
      quantidadeMovimentos: ledger.filter(noPeriodo).length }
  })
  return { ...dto, criterios: { ...dto.criterios, posicaoTitulos: "ATUAL_NO_SNAPSHOT" as const },
    saldoCentavos: somar(contasDTO.filter(c => c.ativo && c.tipo !== "credito"), c => c.saldoCentavos),
    pagarAbertoCentavos: somar(pagar, t => t.restanteCentavos), receberAbertoCentavos: somar(receber, t => t.restanteCentavos),
    valorPagoTitulosCentavos: somar(pagar, t => t.pagoCentavos), valorRecebidoTitulosCentavos: somar(receber, t => t.pagoCentavos),
    contas: contasDTO, pagar, receber }
}

export type ConsultaFinanceiraDTO = Awaited<ReturnType<typeof apurarPosicoes>>

/** PESSOAL permanece exclusivamente interno: exige o objeto opaco G001, nunca JSON. */
export async function consultarFinanceiro(contexto: unknown, input: FiltroConsultaFinanceira): Promise<ConsultaFinanceiraDTO> {
  let erro: ConsultaFinanceiraError | undefined
  try {
    return await comLeituraFinanceira(contexto, async (db, ctx) => {
      try { return await apurarPosicoes(db, { tipo: ctx.tipo, perfilId: ctx.perfilId, storeId: ctx.tipo === "EMPRESA" ? ctx.storeId : null }, input) }
      catch (e) { if (e instanceof ConsultaFinanceiraError) erro = e; throw e }
    })
  } catch (e) { throw erro ?? e }
}

export async function consultarFinanceiroEmpresa(storeId: string, input: PeriodoConsultaFinanceira = {}): Promise<ConsultaFinanceiraDTO> {
  const gate = await requireLeituraFinanceiraEmpresa(storeId)
  return prisma.$transaction(async db => {
    await db.$executeRaw`SET TRANSACTION READ ONLY`
    return apurarPosicoes(db, await revalidarEmpresa(db, storeId, gate.userId), filtroConsultaFinanceira(input))
  }, { isolationLevel: "RepeatableRead", timeout: 20000 })
}

/** Composição interna: herda o isolamento do chamador. READ COMMITTED no fechamento não promete snapshot G005. */
export async function consultarFinanceiroEmpresaNaTransacao(storeId: string, db: Prisma.TransactionClient, input: PeriodoConsultaFinanceira) {
  const gate = await requireLeituraFinanceiraEmpresa(storeId)
  return apurarPosicoes(db, await revalidarEmpresa(db, storeId, gate.userId), filtroConsultaFinanceira(input))
}

/** Apenas fatos realizados, sem posição de títulos/contas. O chamador controla a transação. */
export async function consultarEventosFinanceirosEmpresaNaTransacao(storeId: string, db: Prisma.TransactionClient, input: PeriodoConsultaFinanceira) {
  const gate = await requireLeituraFinanceiraEmpresa(storeId)
  return (await carregarConsulta(db, await revalidarEmpresa(db, storeId, gate.userId), filtroConsultaFinanceira(input))).dto
}

/** Pré-auditoria interna somente leitura. Conta alertas, sem devolver IDs, valores ou payloads. Não remedia dados. */
export async function auditarQualidadeFinanceiraEmpresa(storeId: string) {
  const gate = await requireLeituraFinanceiraEmpresa(storeId)
  return prisma.$transaction(async db => {
    await db.$executeRaw`SET TRANSACTION READ ONLY`
    const scope = await revalidarEmpresa(db, storeId, gate.userId)
    const [clock] = await db.$queryRaw<Array<{ asOf: Date }>>`SELECT transaction_timestamp() AS "asOf"`
    const porCodigo = await db.$queryRaw<Array<{ code: string; quantidade: string }>>`
      WITH registros AS (
        SELECT 'pagar' tabela,t.id,t.valor,t."valorCentavos" exato,t.status,t.payload,
          EXISTS(SELECT 1 FROM alocacoes_pagamento a WHERE a."pagarTituloId"=t.id) estruturado
        FROM contas_pagar_titulos t WHERE t."storeId"=${storeId} AND (t."perfilId"=${scope.perfilId} OR t."perfilId" IS NULL)
        UNION ALL SELECT 'receber',t.id,t.valor,t."valorCentavos",t.status,t.payload,FALSE
        FROM contas_receber_titulos t WHERE t."storeId"=${storeId} AND (t."perfilId"=${scope.perfilId} OR t."perfilId" IS NULL)
        UNION ALL SELECT 'movimento',m.id,m.valor,m."valorCentavos",m.tipo,NULL::jsonb,FALSE
        FROM movimentacoes_financeiras m WHERE m."storeId"=${storeId} AND (m."perfilId"=${scope.perfilId} OR m."perfilId" IS NULL)
        UNION ALL SELECT 'conta',c.id,c."saldoInicial",c."saldoInicialCentavos",'',NULL::jsonb,FALSE
        FROM carteiras_financeiras c WHERE c."storeId"=${storeId} AND (c."perfilId"=${scope.perfilId} OR c."perfilId" IS NULL)
      ), alertas AS (
        SELECT tabela,id,unnest(array_remove(ARRAY[
          CASE WHEN valor NOT BETWEEN -90000000000 AND 90000000000 OR abs(valor*100-round(valor*100))>0.00001
            OR (exato IS NOT NULL AND exato::numeric<>round((valor*100)::numeric)) THEN 'precisao_legada_exige_revisao' END,
          CASE WHEN tabela='movimento' AND (valor<=0 OR status NOT IN ('entrada','saida')) THEN 'movimento_exige_revisao' END,
          CASE WHEN tabela IN ('pagar','receber') AND status='parcial' AND NOT estruturado AND
            CASE WHEN jsonb_typeof(payload->'historico')='array' THEN jsonb_array_length(payload->'historico') ELSE 0 END=0 THEN 'historico_exige_revisao' END
        ],NULL)) code FROM registros
      ) SELECT code,count(*)::text quantidade FROM alertas GROUP BY code ORDER BY code`
    return { asOf:clock.asOf.toISOString(), versaoCalculo:VERSAO_CALCULO_FINANCEIRO, porCodigo, verificacoes: ["precisao_valor_base", "movimento_positivo_e_tipo", "parcial_sem_historico_ou_alocacao"],
      limite: "PRECHECK_NAO_SUBSTITUI_VALIDACAO_INTEGRAL_DE_VINCULOS", somenteLeitura: true }
  }, { isolationLevel: "RepeatableRead", timeout: 20000 })
}

export function resumoTitulosConsulta(q: ConsultaFinanceiraDTO, natureza: "PAGAR" | "RECEBER") {
  const rows = natureza === "PAGAR" ? q.pagar : q.receber, hoje = diaNoFusoConsulta(new Date(q.asOf), q.timezone)
  const soma = (fn: (t: typeof rows[number]) => boolean, field: "pagoCentavos" | "restanteCentavos") =>
    reaisConsulta(rows.filter(fn).reduce((s, t) => s + BigInt(t[field]), BigInt(0)))
  const porStatus: Record<string, number> = {}
  for (const t of rows) porStatus[t.status] = (porStatus[t.status] ?? 0) + 1
  return { quantidade: rows.length, totalAberto: soma(() => true, "restanteCentavos"),
    totalVencido: soma(t => { try { return intervaloConsulta(t.vencimento, t.vencimento).gte < intervaloConsulta(hoje, hoje).gte } catch { return false } }, "restanteCentavos"),
    totalPago: soma(() => true, "pagoCentavos"), totalParcial: soma(t => BigInt(t.restanteCentavos) > BigInt(0), "pagoCentavos"), porStatus }
}
