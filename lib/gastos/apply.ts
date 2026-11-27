import "server-only"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import type { Prisma } from "@/generated/prisma"
import { projetarPagamentoEstruturadoContaPagar } from "@/lib/financeiro/services/contas-pagar-service"
import { saldoCarteiraGasto, travarCarteirasGasto } from "@/lib/financeiro/services/carteiras-service"
import { criarMovimentoOperacaoGasto, criarMovimentosTransferenciaGasto } from "@/lib/financeiro/services/movimentacoes-service"
import { storeDoContexto, type FinanceiroDb } from "./financeiro-scope"
import type { FinanceiroContextoAutorizado } from "./types"
import { agoraDoBanco, autorizarOperacaoNaTransacao, emTransacaoGasto, exigirRevisaoPronta, lockGasto, travarRevisaoGasto } from "./operacoes"
import { chaveOperacao, identificadorOperacao, hashOperacaoGasto, normalizarPropostaGasto, OperacaoGastoError,
  type PropostaGasto, type ResultadoOperacaoGasto, valorPropostaGasto, ordemBinaria, meioCompensacaoGasto } from "./operacao-schema"
import { centavosLegadosExatos, saldoTituloGasto, travarTitulosGasto, type AlocacaoPlanejada } from "./pagamentos"
import { travarCiclosGasto } from "./cartoes"
import { resolverFornecedorGasto } from "./fornecedores"
import { datasDaProposta, exigirPeriodosAbertosGasto, travarPeriodosGasto } from "./periodo"
import { vincularDocumentoGastoNaTransacao } from "./documentos"

const confirmar = z.object({ revisaoId: identificadorOperacao, versaoEsperada: z.number().int().positive(), chave: chaveOperacao }).strict()

async function fontesEstorno(tx: FinanceiroDb, ctx: FinanceiroContextoAutorizado, p: PropostaGasto) {
  if (p.tipo === "ESTORNAR_PAGAMENTO") {
    const pagamento = await tx.pagamentoFinanceiro.findFirst({ where: { id: p.pagamentoId, perfilId: ctx.perfilId, tipo: "PAGAMENTO" },
      include: { alocacoes: true, movimento: true } })
    if (!pagamento) throw new OperacaoGastoError("pagamento_indisponivel", 404)
    return { pagamento, movimento: pagamento.movimento }
  }
  if (p.tipo === "ESTORNAR_LEGADO") {
    const movimento = await tx.movimentacaoFinanceira.findFirst({ where: { id: p.movimentoOriginalId, perfilId: ctx.perfilId,
      storeId: storeDoContexto(ctx), pagarTituloId: p.tituloId, tipo: "saida", operacaoFinanceiraId: null } })
    if (!movimento || !movimento.carteiraId) throw new OperacaoGastoError("pagamento_exige_revisao", 409)
    // Uma compensação genérica antiga não comprova qual parcial foi devolvida.
    if (await tx.movimentacaoFinanceira.count({ where: { storeId: storeDoContexto(ctx), referenciaId: movimento.referenciaId,
      origem: "estorno_pagar", compensaMovimentacaoId: null } })) throw new OperacaoGastoError("pagamento_exige_revisao", 409)
    return { pagamento: null, movimento }
  }
  return null
}

function alocarEstorno(p: Extract<PropostaGasto, { tipo: "ESTORNAR_PAGAMENTO" }>,
  originais: Array<{ id: string; pagarTituloId: string | null; gastoId: string | null; valorCentavos: Prisma.Decimal; estornadoCentavos: Prisma.Decimal }>): AlocacaoPlanejada[] {
  const disponiveis = originais.map(a => ({ a, livre: BigInt(a.valorCentavos.toString()) - BigInt(a.estornadoCentavos.toString()) }))
  const total = disponiveis.reduce((s, a) => s + a.livre, BigInt(0)), valor = BigInt(p.valorCentavos)
  if (valor > total) throw new OperacaoGastoError("estorno_acima_pagamento", 409)
  const escolhas = p.alocacoes ?? (valor === total ? disponiveis.filter(a => a.livre > BigInt(0)).map(({ a, livre }) => ({ alocacaoId: a.id, valorCentavos: livre.toString() }))
    : disponiveis.filter(a => a.livre > BigInt(0)).length === 1 ? [{ alocacaoId: disponiveis.find(a => a.livre > BigInt(0))!.a.id, valorCentavos: p.valorCentavos }] : null)
  if (!escolhas) throw new OperacaoGastoError("estorno_exige_alocacoes", 409)
  return escolhas.map(e => {
    const row = disponiveis.find(a => a.a.id === e.alocacaoId), v = BigInt(e.valorCentavos)
    if (!row || v > row.livre) throw new OperacaoGastoError("estorno_acima_alocacao", 409)
    return { tituloId: row.a.pagarTituloId ?? undefined, gastoId: row.a.gastoId ?? undefined, valor: v, compensaAlocacaoId: row.a.id }
  })
}

/** API interna: somente um contexto opaco emitido/revalidado pelo G001 é aceito. */
export async function aplicarOperacaoGasto(contexto: unknown, input: unknown): Promise<ResultadoOperacaoGasto> {
  const parsed = confirmar.safeParse(input)
  if (!parsed.success) throw new OperacaoGastoError("confirmacao_invalida")
  const command = parsed.data
  return emTransacaoGasto(contexto, async (tx, ctx) => {
    await lockGasto(tx, ["operacao", ctx.perfilId, command.chave])
    const revisao = await travarRevisaoGasto(tx, ctx, command.revisaoId)
    const p = normalizarPropostaGasto(revisao.proposta), hash = hashOperacaoGasto(p)
    if (hash !== revisao.payloadHash) throw new OperacaoGastoError("revisao_corrompida", 409)
    const existente = await tx.financeiroOperacao.findFirst({ where: { perfilId: ctx.perfilId,
      OR: [{ chave: command.chave }, { grupoChave: revisao.grupoChave }] } })
    if (existente) {
      await autorizarOperacaoNaTransacao(tx, ctx)
      if (existente.chave !== command.chave || existente.revisaoId !== revisao.id || existente.payloadHash !== hash
        || command.versaoEsperada !== revisao.versao || existente.estado !== "APLICADA" || !existente.resultado) {
        throw new OperacaoGastoError("operacao_conteudo_divergente", 409)
      }
      return existente.resultado as unknown as ResultadoOperacaoGasto
    }
    const agora = await agoraDoBanco(tx)
    exigirRevisaoPronta(revisao, command.versaoEsperada, agora)
    const datas = datasDaProposta(p)
    await travarPeriodosGasto(tx, ctx, datas)
    const documentoId = "documentoId" in p ? p.documentoId : undefined
    if (documentoId) {
      await tx.$queryRaw`SELECT id FROM documentos_gastos WHERE id=${documentoId} AND "perfilId"=${ctx.perfilId} FOR UPDATE`
      const doc = await tx.documentoGasto.findFirst({ where: { id: documentoId, perfilId: ctx.perfilId,
        storeId: storeDoContexto(ctx), estado: { not: "QUARENTENA" } }, include: { vinculos: true } })
      if (!doc) throw new OperacaoGastoError("documento_indisponivel", 404)
      const titulos = doc.vinculos.flatMap(v => v.pagarTituloId ? [v.pagarTituloId] : [])
      if (titulos.length && (p.tipo !== "PAGAR_TITULO" || titulos.some(id => id !== p.tituloId))) {
        throw new OperacaoGastoError("documento_ja_vinculado_titulo", 409)
      }
    }
    const ciclos = await travarCiclosGasto(tx, ctx, p.tipo === "COMPRA_CREDITO"
      ? p.parcelas?.map(a => a.cicloId) ?? [p.cicloId!] : p.tipo === "PAGAR_FATURA" ? [p.cicloId] : [])
    const fonteBase = await fontesEstorno(tx, ctx, p)
    const ids = p.tipo === "PAGAR_TITULO" || p.tipo === "ESTORNAR_LEGADO" ? [p.tituloId]
      : p.tipo === "PAGAR_FATURA" ? p.alocacoes.map(a => a.tituloId)
        : fonteBase?.pagamento ? fonteBase.pagamento.alocacoes.flatMap(a => a.pagarTituloId ? [a.pagarTituloId] : []) : []
    let titulos = await travarTitulosGasto(tx, ctx, ids)
    await autorizarOperacaoNaTransacao(tx, ctx)
    await exigirPeriodosAbertosGasto(tx, ctx, datas)
    if (p.tipo === "TRANSFERENCIA_INTERNA") {
      return aplicarTransferenciaInterna(tx, ctx, p, { chave: command.chave, versaoEsperada: command.versaoEsperada, revisao, hash, agora })
    }
    const estorno = p.tipo === "ESTORNAR_PAGAMENTO" || p.tipo === "ESTORNAR_LEGADO"
    const carteiraId = "carteiraId" in p ? p.carteiraId : fonteBase?.movimento.carteiraId ?? undefined
    const contas = await travarCarteirasGasto(tx, ctx,
      [...titulos.flatMap(t => t.carteiraId ? [t.carteiraId] : []), ...(carteiraId ? [carteiraId] : [])], carteiraId, estorno)
    for (const t of titulos) if (!t.perfilId) await tx.contaPagarTitulo.update({ where: { id: t.id }, data: { perfilId: ctx.perfilId } })
    if (ids.length) titulos = await tx.contaPagarTitulo.findMany({ where: { id: { in: ids }, perfilId: ctx.perfilId } })
    if (fonteBase) {
      if (fonteBase.pagamento) {
        await tx.$queryRaw`SELECT id FROM pagamentos_financeiros WHERE id=${fonteBase.pagamento.id} FOR UPDATE`
        for (const id of fonteBase.pagamento.alocacoes.map(a => a.id).sort(ordemBinaria)) {
          await tx.$queryRaw`SELECT id FROM alocacoes_pagamento WHERE id=${id} FOR UPDATE`
        }
      }
      await tx.$queryRaw`SELECT id FROM movimentacoes_financeiras WHERE id=${fonteBase.movimento.id} FOR NO KEY UPDATE`
    }
    const fonte = await fontesEstorno(tx, ctx, p)
    const saldos = new Map<string, Awaited<ReturnType<typeof saldoTituloGasto>>>()
    for (const t of titulos) saldos.set(t.id, await saldoTituloGasto(tx, t))
    let valor = valorPropostaGasto(p), alocacoes: AlocacaoPlanejada[] = []
    if (p.tipo === "PAGAR_TITULO") {
      const saldo = saldos.get(p.tituloId)!
      valor = p.quitar ? saldo.restante : BigInt(p.valorCentavos!)
      if (valor <= BigInt(0) || valor > saldo.restante) throw new OperacaoGastoError("valor_acima_saldo_titulo", 409)
      alocacoes = [{ tituloId: p.tituloId, valor }]
    } else if (p.tipo === "PAGAR_FATURA") {
      alocacoes = p.alocacoes.map(a => {
        if (titulos.find(t => t.id === a.tituloId)?.cartaoCicloId !== p.cicloId
          || BigInt(a.valorCentavos) > saldos.get(a.tituloId)!.restante) throw new OperacaoGastoError("alocacao_fatura_invalida", 409)
        return { tituloId: a.tituloId, valor: BigInt(a.valorCentavos) }
      })
    } else if (p.tipo === "ESTORNAR_PAGAMENTO") alocacoes = alocarEstorno(p, fonte!.pagamento!.alocacoes)
    else if (p.tipo === "ESTORNAR_LEGADO") alocacoes = [{ tituloId: p.tituloId, valor: BigInt(p.valorCentavos) }]
    if (fonte) {
      const disponivel = centavosLegadosExatos(fonte.movimento.valor) - BigInt(fonte.movimento.compensadoGastosCentavos.toString())
      if (valor! > disponivel) throw new OperacaoGastoError("estorno_acima_pagamento", 409)
      for (const a of alocacoes) if (a.tituloId && a.valor > saldos.get(a.tituloId)!.pago) throw new OperacaoGastoError("estorno_acima_titulo", 409)
    }
    let fornecedorId: string | null = null
    const fato = p.tipo === "GASTO_PAGO" || p.tipo === "CONTA_PAGAR" || p.tipo === "COMPRA_CREDITO" ? p : null
    if (fato) {
      fornecedorId = await resolverFornecedorGasto(tx, ctx, fato)
      if (fato.categoriaId && !await tx.categoriaGasto.findFirst({ where: { id: fato.categoriaId, perfilId: ctx.perfilId,
        storeId: storeDoContexto(ctx), ativo: true, natureza: "DESPESA" } })) throw new OperacaoGastoError("categoria_indisponivel", 404)
    }
    const temPagamento = p.tipo !== "CONTA_PAGAR" && p.tipo !== "COMPRA_CREDITO"
    if (temPagamento && (!carteiraId || !contas.get(carteiraId))) throw new OperacaoGastoError("conta_obrigatoria")
    if (temPagamento && !estorno && await saldoCarteiraGasto(tx, ctx, contas.get(carteiraId!)!) < valor!) {
      throw new OperacaoGastoError("saldo_conta_insuficiente", 409)
    }
    const op = await tx.financeiroOperacao.create({ data: { perfilId: ctx.perfilId, storeId: storeDoContexto(ctx),
      autorAdminUserId: ctx.userId, chave: command.chave, grupoChave: revisao.grupoChave, tipo: p.tipo,
      payloadHash: hash, revisaoId: revisao.id } })
    let gastoId: string | null = null
    const novosTitulos: string[] = []
    if (fato) {
      const gasto = await tx.gasto.create({ data: { perfilId: ctx.perfilId, storeId: storeDoContexto(ctx), operacaoId: op.id,
        revisaoId: revisao.id, grupoChave: revisao.grupoChave, tipo: fato.tipo, descricao: fato.descricao,
        valorCentavos: fato.valorCentavos, moeda: "BRL", dataGasto: new Date(fato.dataGasto + "T00:00:00Z"),
        competencia: fato.competencia, categoriaId: fato.categoriaId, fornecedorId,
        contraparteTexto: fato.contraparteTexto, documentoId } })
      gastoId = gasto.id
      if (p.tipo === "GASTO_PAGO") alocacoes = [{ gastoId, valor: valor! }]
      const parcelas = p.tipo === "CONTA_PAGAR" ? [{ valor: valor!, vencimento: p.vencimento, cicloId: null, numero: null, total: null }]
        : p.tipo === "COMPRA_CREDITO" ? (p.parcelas ?? [{ cicloId: p.cicloId!, valorCentavos: p.valorCentavos, numero: null, total: null }]).map(a => ({
          valor: BigInt(a.valorCentavos), vencimento: ciclos.find(c => c.id === a.cicloId)!.vencimento.toISOString().slice(0, 10),
          cicloId: a.cicloId, numero: a.numero, total: a.total })) : []
      for (const [i, a] of parcelas.entries()) {
        const identity = `gastos:${ctx.tipo.toLowerCase()}:${ctx.perfilId}:${op.id}:${i}`
        const t = await tx.contaPagarTitulo.create({ data: { perfilId: ctx.perfilId, storeId: storeDoContexto(ctx), gastoId,
          localKey: ctx.tipo === "EMPRESA" ? identity : null, identidadePessoal: ctx.tipo === "PESSOAL" ? identity : null,
          descricao: fato.descricao, valor: Number(a.valor) / 100, valorCentavos: a.valor.toString(), precisaoStatus: "CENTAVOS",
          vencimento: a.vencimento, vencimentoEm: new Date(a.vencimento + "T00:00:00Z"), fornecedorId, categoriaId: fato.categoriaId,
          carteiraId: p.tipo === "CONTA_PAGAR" ? p.carteiraId : null, cartaoCicloId: a.cicloId,
          payload: { origem: "gastos", operacaoId: op.id, ...(a.numero ? { parcelaNumero: a.numero, parcelaTotal: a.total } : {}) } } })
        novosTitulos.push(t.id)
        if (documentoId) await vincularDocumentoGastoNaTransacao(tx, ctx, documentoId, { tipo: "PAGAR", id: t.id })
      }
    }
    let pagamentoId: string | null = null
    const movimentoIds: string[] = []
    if (temPagamento) {
      const pagoEm = new Date("dataPagamento" in p ? p.dataPagamento : ""), movimentoId = randomUUID()
      const formaPagamento = "formaPagamento" in p ? p.formaPagamento : meioCompensacaoGasto(fonte!.movimento.formaPagamento)
      const pagamento = await tx.pagamentoFinanceiro.create({ data: { perfilId: ctx.perfilId, storeId: storeDoContexto(ctx),
        operacaoId: op.id, tipo: estorno ? "ESTORNO" : "PAGAMENTO", valorCentavos: valor!.toString(), carteiraId: carteiraId!,
        formaPagamento, pagoEm, movimentoId, compensaPagamentoId: fonte?.pagamento?.id,
        compensaMovimentoLegadoId: p.tipo === "ESTORNAR_LEGADO" ? fonte!.movimento.id : null } })
      pagamentoId = pagamento.id
      for (const a of alocacoes) await tx.alocacaoPagamento.create({ data: { perfilId: ctx.perfilId, storeId: storeDoContexto(ctx),
        pagamentoId, pagarTituloId: a.tituloId, gastoId: a.gastoId, valorCentavos: a.valor.toString(), compensaAlocacaoId: a.compensaAlocacaoId } })
      const unicoTitulo = alocacoes.length === 1 ? alocacoes[0].tituloId : undefined
      await criarMovimentoOperacaoGasto(tx, ctx, { id: movimentoId, operacaoId: op.id, carteiraId: carteiraId!, valor: valor!,
        pagoEm, formaPagamento, estorno, descricao: fato?.descricao ?? (estorno ? "Compensação de pagamento" : "Pagamento de obrigação"),
        tituloId: unicoTitulo, categoriaId: fato?.categoriaId ?? (unicoTitulo ? titulos.find(t => t.id === unicoTitulo)?.categoriaId ?? undefined : undefined),
        compensaMovimentacaoId: fonte?.movimento.id })
      movimentoIds.push(movimentoId)
      await saldoCarteiraGasto(tx, ctx, contas.get(carteiraId!)!, true)
      for (const a of alocacoes) if (a.tituloId) {
        const titulo = titulos.find(t => t.id === a.tituloId)!, antes = saldos.get(a.tituloId)!
        await projetarPagamentoEstruturadoContaPagar(tx, titulo, { pagamentoId, operacaoId: op.id, movimentoId,
          valorCentavos: a.valor, estorno, pagoEm, motivo: "motivo" in p ? p.motivo : undefined }, antes.pago + (estorno ? -a.valor : a.valor))
      }
      if (documentoId) await vincularDocumentoGastoNaTransacao(tx, ctx, documentoId, { tipo: "MOVIMENTACAO", id: movimentoId })
    }
    const resultado: ResultadoOperacaoGasto = { operacaoId: op.id, revisaoId: revisao.id, gastoId,
      tituloIds: novosTitulos.length ? novosTitulos : [...new Set(alocacoes.flatMap(a => a.tituloId ? [a.tituloId] : []))].sort(ordemBinaria),
      pagamentoId, movimentoIds, valorCentavos: valor!.toString(), estado: "APLICADA" }
    return concluirOperacaoGasto(tx, ctx, { opId: op.id, revisaoId: revisao.id, versaoEsperada: command.versaoEsperada, agora, resultado })
  })
}

/** Evento + outbox + CAS da revisão + conclusão: o mesmo fechamento para todo tipo de operação. */
async function concluirOperacaoGasto(tx: FinanceiroDb, ctx: FinanceiroContextoAutorizado,
  k: { opId: string; revisaoId: string; versaoEsperada: number; agora: Date; resultado: ResultadoOperacaoGasto }) {
  const { resultado } = k
  await tx.financeiroOperacaoEvento.create({ data: { perfilId: ctx.perfilId, storeId: storeDoContexto(ctx), operacaoId: k.opId,
    tipo: "APLICADA", dados: resultado } })
  await tx.gastoOutbox.create({ data: { perfilId: ctx.perfilId, storeId: storeDoContexto(ctx), operacaoId: k.opId,
    tipo: "OPERACAO_APLICADA", payload: resultado } })
  const cas = await tx.gastoRevisao.updateMany({ where: { id: k.revisaoId, versao: k.versaoEsperada, estado: "PRONTA" },
    data: { estado: "APLICADA", decididaEm: k.agora } })
  if (cas.count !== 1) throw new OperacaoGastoError("revisao_desatualizada", 409)
  await tx.financeiroOperacao.update({ where: { id: k.opId }, data: { estado: "APLICADA", resultado, concluidaEm: k.agora } })
  return resultado
}

/**
 * TRANSFERENCIA_INTERNA: contas do MESMO perfil (PESSOAL global ou EMPRESA da loja), ambas travadas pelo
 * mesmo lock do G004; destino ativo e não crédito; saldo da origem pelo ledger. Nenhum fato/pagamento.
 */
async function aplicarTransferenciaInterna(tx: FinanceiroDb, ctx: FinanceiroContextoAutorizado,
  p: Extract<PropostaGasto, { tipo: "TRANSFERENCIA_INTERNA" }>,
  k: { chave: string; versaoEsperada: number; revisao: { id: string; grupoChave: string }; hash: string; agora: Date }) {
  const contas = await travarCarteirasGasto(tx, ctx, [p.carteiraOrigemId, p.carteiraDestinoId], p.carteiraOrigemId)
  const origem = contas.get(p.carteiraOrigemId)!, destino = contas.get(p.carteiraDestinoId)!
  if (!destino.ativo || destino.tipo === "credito") throw new OperacaoGastoError("conta_indisponivel", 404)
  const valor = BigInt(p.valorCentavos)
  if (await saldoCarteiraGasto(tx, ctx, origem) < valor) throw new OperacaoGastoError("saldo_conta_insuficiente", 409)
  const op = await tx.financeiroOperacao.create({ data: { perfilId: ctx.perfilId, storeId: storeDoContexto(ctx),
    autorAdminUserId: ctx.userId, chave: k.chave, grupoChave: k.revisao.grupoChave, tipo: p.tipo,
    payloadHash: k.hash, revisaoId: k.revisao.id } })
  const saidaId = randomUUID(), entradaId = randomUUID()
  await criarMovimentosTransferenciaGasto(tx, ctx, { saidaId, entradaId, operacaoId: op.id, origemId: origem.id, destinoId: destino.id,
    valor, ocorridoEm: new Date(p.dataPagamento), descricao: p.descricao ?? "Transferência entre contas" })
  await saldoCarteiraGasto(tx, ctx, origem, true)
  await saldoCarteiraGasto(tx, ctx, destino, true)
  const resultado: ResultadoOperacaoGasto = { operacaoId: op.id, revisaoId: k.revisao.id, gastoId: null, tituloIds: [],
    pagamentoId: null, movimentoIds: [saidaId, entradaId], valorCentavos: valor.toString(), estado: "APLICADA" }
  return concluirOperacaoGasto(tx, ctx, { opId: op.id, revisaoId: k.revisao.id, versaoEsperada: k.versaoEsperada, agora: k.agora, resultado })
}

const estornoHubSchema = z.object({ localKey: z.string().trim().min(1).max(260), chave: chaveOperacao,
  pagamentoId: identificadorOperacao.optional(), movimentoId: identificadorOperacao.optional(),
  valorCentavos: z.string().regex(/^\d{1,16}$/).optional(), motivo: z.string().trim().max(2000).optional() }).strict()

/** Resolve uma vez o "último" do HUB e conserva essa escolha em uma revisão privada.
 * Preparação não altera dinheiro. A confirmação abaixo é uma única transação financeira.
 */
export async function estornarPagamentoHub(contexto: unknown, input: unknown) {
  const parsed = estornoHubSchema.safeParse(input)
  if (!parsed.success || (parsed.data.pagamentoId && parsed.data.movimentoId)) throw new OperacaoGastoError("estorno_invalido")
  const pedido = parsed.data, pedidoHash = hashOperacaoGasto(pedido), grupoChave = `hub-estorno:${pedido.chave}`
  const revisao = await emTransacaoGasto(contexto, async (tx, ctx) => {
    if (ctx.tipo !== "EMPRESA") throw new OperacaoGastoError("acesso_negado", 403)
    await lockGasto(tx, ["grupo", ctx.perfilId, grupoChave])
    await autorizarOperacaoNaTransacao(tx, ctx)
    const existente = await tx.gastoRevisao.findFirst({ where: { perfilId: ctx.perfilId, grupoChave }, orderBy: { versao: "desc" } })
    if (existente) {
      const p = normalizarPropostaGasto(existente.proposta)
      if (!("pedidoHash" in p) || p.pedidoHash !== pedidoHash) throw new OperacaoGastoError("operacao_conteudo_divergente", 409)
      return existente
    }
    const titulo = await tx.contaPagarTitulo.findFirst({ where: { storeId: ctx.storeId, perfilId: ctx.perfilId,
      localKey: pedido.localKey, ativo: true } })
    if (!titulo) throw new OperacaoGastoError("titulo_indisponivel", 404)
    const payload = titulo.payload && typeof titulo.payload === "object" && !Array.isArray(titulo.payload) ? titulo.payload : {}
    const historico = Array.isArray(payload.historico) ? payload.historico : []
    let pagamentoId = pedido.pagamentoId, movimentoId = pedido.movimentoId
    if (!pagamentoId && !movimentoId) {
      for (const e of [...historico].reverse()) {
        if (!e || typeof e !== "object" || Array.isArray(e) || !["pagamento", "liquidacao"].includes(String(e.tipo))) continue
        if (typeof e.pagamentoId === "string") {
          const a = await tx.alocacaoPagamento.findFirst({ where: { pagamentoId: e.pagamentoId, pagarTituloId: titulo.id, perfilId: ctx.perfilId } })
          if (a && a.valorCentavos.gt(a.estornadoCentavos)) { pagamentoId = e.pagamentoId; break }
        } else if (typeof e.movimentoId === "string") {
          const m = await tx.movimentacaoFinanceira.findFirst({ where: { id: e.movimentoId, perfilId: ctx.perfilId, pagarTituloId: titulo.id, tipo: "saida" } })
          if (m && centavosLegadosExatos(m.valor) > BigInt(m.compensadoGastosCentavos.toString())) { movimentoId = m.id; break }
        }
      }
    }
    let proposta: PropostaGasto
    const comum = { moeda: "BRL", dataPagamento: new Date().toISOString(), motivo: pedido.motivo || "Estorno solicitado no HUB", pedidoHash }
    if (pagamentoId) {
      const alvo = await tx.pagamentoFinanceiro.findFirst({ where: { id: pagamentoId, perfilId: ctx.perfilId, tipo: "PAGAMENTO",
        alocacoes: { some: { pagarTituloId: titulo.id } } }, include: { alocacoes: true } })
      if (!alvo || alvo.alocacoes.length !== 1) throw new OperacaoGastoError("estorno_exige_alocacoes", 409)
      proposta = normalizarPropostaGasto({ tipo: "ESTORNAR_PAGAMENTO", ...comum, pagamentoId,
        valorCentavos: pedido.valorCentavos ?? alvo.alocacoes[0].valorCentavos.sub(alvo.alocacoes[0].estornadoCentavos).toString() })
    } else {
      const alvo = movimentoId ? await tx.movimentacaoFinanceira.findFirst({ where: { id: movimentoId, perfilId: ctx.perfilId,
        storeId: ctx.storeId, pagarTituloId: titulo.id, tipo: "saida", operacaoFinanceiraId: null } }) : null
      if (!alvo) throw new OperacaoGastoError("pagamento_exige_revisao", 409)
      proposta = normalizarPropostaGasto({ tipo: "ESTORNAR_LEGADO", ...comum, tituloId: titulo.id, movimentoOriginalId: alvo.id,
        valorCentavos: pedido.valorCentavos ?? (centavosLegadosExatos(alvo.valor) - BigInt(alvo.compensadoGastosCentavos.toString())).toString() })
    }
    return tx.gastoRevisao.create({ data: { perfilId: ctx.perfilId, storeId: ctx.storeId, criadoPorAdminUserId: ctx.userId,
      grupoChave, versao: 1, tipo: proposta.tipo, proposta: proposta as Prisma.InputJsonObject, payloadHash: hashOperacaoGasto(proposta),
      expiraEm: new Date((await agoraDoBanco(tx)).getTime() + 30 * 60_000) } })
  })
  return aplicarOperacaoGasto(contexto, { revisaoId: revisao.id, versaoEsperada: revisao.versao, chave: pedido.chave })
}
