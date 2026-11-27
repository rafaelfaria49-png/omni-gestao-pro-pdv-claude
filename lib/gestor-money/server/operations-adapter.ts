import "server-only"
import { randomUUID } from "node:crypto"
import { aplicarOperacaoGasto } from "@/lib/gastos/apply"
import { cadastrarCartaoGasto, cadastrarCicloGasto } from "@/lib/gastos/cartoes"
import { criarCategoriaGasto, definirCategoriaGastoAtiva } from "@/lib/gastos/categorias"
import { criarContaFinanceira, definirContaFinanceiraAtiva } from "@/lib/gastos/contas"
import {
  criarMovimentoFinanceiro,
  FinanceiroScopeError,
  gravarTituloFinanceiro,
} from "@/lib/gastos/financeiro-scope"
import {
  cancelarRevisaoGasto,
  corrigirRevisaoGasto,
  prepararRevisaoGasto,
} from "@/lib/gastos/operacoes"
import { OperacaoGastoError, type PropostaGasto } from "@/lib/gastos/operacao-schema"
import { comLeituraFinanceira, FinanceiroReadError } from "@/lib/gastos/read-scope"
import type { FinanceiroContextoAutorizado } from "@/lib/gastos/types"
import { transferirEntreCarteiras } from "@/lib/financeiro/services/carteiras-service"
import {
  CONTA_PARA_TIPO_G002,
  criarCartaoInputSchema,
  criarCategoriaInputSchema,
  criarContaInputSchema,
  pagarDividaInputSchema,
  pagarFaturaInputSchema,
  registrarCompraCartaoInputSchema,
  registrarDespesaInputSchema,
  registrarDividaInputSchema,
  registrarReceitaInputSchema,
  transferirInputSchema,
  type CriarCartaoInput,
  type CriarCategoriaInput,
  type CriarContaInput,
  type OperacaoFeedback,
  type PagarDividaInput,
  type PagarFaturaInput,
  type RegistrarCompraCartaoInput,
  type RegistrarDespesaInput,
  type RegistrarDividaInput,
  type RegistrarReceitaInput,
  type TransferirInput,
} from "@/lib/gestor-money/contracts"
import { hojeSaoPaulo, parseBigIntCentavos } from "@/lib/gestor-money/money"
import { GestorMoneyApiError } from "./auth-boundary"

function instanteParaDataCivil(dataCivil: string): string {
  return `${dataCivil}T12:00:00.000Z`
}

function adicionarMesesCompetencia(baseYm: string, offset: number): string {
  const ano = Number(baseYm.slice(0, 4))
  const mes = Number(baseYm.slice(5, 7))
  const d = new Date(Date.UTC(ano, mes - 1 + offset, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

function dataNoMes(competencia: string, dia: number): string {
  const clamped = Math.min(28, Math.max(1, Math.trunc(dia)))
  return `${competencia}-${String(clamped).padStart(2, "0")}`
}

/**
 * Aplica proposta canônica G004 seguindo o ciclo obrigatório:
 * `prepararRevisaoGasto` -> `aplicarOperacaoGasto` com chave de idempotência explícita.
 */
async function executarPropostaG004(
  ctx: FinanceiroContextoAutorizado,
  proposta: PropostaGasto,
  chaveIdempotencia?: string
) {
  const chave = (chaveIdempotencia?.trim() || randomUUID()).slice(0, 160)
  const grupoChave = `gm-${chave}`.slice(0, 191)
  const revisao = await prepararRevisaoGasto(ctx, { grupoChave, proposta })
  const resultado = await aplicarOperacaoGasto(ctx, {
    revisaoId: revisao.id,
    versaoEsperada: revisao.versao,
    chave,
  })
  return { revisao, resultado }
}

export function mapearErroIntegracaoReal(error: unknown): GestorMoneyApiError {
  if (error instanceof GestorMoneyApiError) return error
  if (error instanceof OperacaoGastoError) {
    return new GestorMoneyApiError(error.code, error.status, error.message)
  }
  if (error instanceof FinanceiroScopeError) {
    return new GestorMoneyApiError("escopo_financeiro_invalido", error.status, error.message)
  }
  if (error instanceof FinanceiroReadError) {
    return new GestorMoneyApiError("leitura_financeira_negada", error.status, error.message)
  }
  return new GestorMoneyApiError(
    "operacao_financeira_indisponivel",
    503,
    "Não foi possível concluir a operação financeira. Reenvie com a mesma chave de idempotência."
  )
}

export async function registrarDespesaReal(
  ctx: FinanceiroContextoAutorizado,
  raw: RegistrarDespesaInput & { documentoId?: string },
  chave?: string
): Promise<OperacaoFeedback> {
  const parsed = registrarDespesaInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new GestorMoneyApiError("validacao_despesa", 422, parsed.error.issues[0]?.message ?? "Dados inválidos.")
  }
  const p = parsed.data
  const baseFato = {
    descricao: p.descricao,
    valorCentavos: p.valorCentavos,
    moeda: "BRL" as const,
    dataGasto: p.dataGasto,
    categoriaId: p.categoriaId,
    ...(p.contraparte ? { contraparteTexto: p.contraparte } : {}),
    ...(raw.documentoId ? { documentoId: raw.documentoId } : {}),
  }

  const proposta: PropostaGasto = p.pagoAgora
    ? {
        tipo: "GASTO_PAGO",
        ...baseFato,
        carteiraId: p.carteiraId,
        formaPagamento: p.formaPagamento,
        dataPagamento: instanteParaDataCivil(p.dataGasto),
      }
    : {
        tipo: "CONTA_PAGAR",
        ...baseFato,
        vencimento: p.vencimento ?? p.dataGasto,
        carteiraId: p.carteiraId,
      }

  const { resultado } = await executarPropostaG004(ctx, proposta, chave)
  return {
    ok: true,
    operacaoId: resultado.operacaoId,
    contratoG004: proposta.tipo,
    mensagem: p.pagoAgora
      ? "Despesa registrada e liquidada no motor financeiro G004."
      : "Despesa agendada em Contas a Pagar no motor G004.",
  }
}

export async function registrarReceitaReal(
  ctx: FinanceiroContextoAutorizado,
  raw: RegistrarReceitaInput,
  chave?: string
): Promise<OperacaoFeedback> {
  const parsed = registrarReceitaInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new GestorMoneyApiError("validacao_receita", 422, parsed.error.issues[0]?.message ?? "Dados inválidos.")
  }
  const p = parsed.data

  if (p.recebidoAgora) {
    const mov = await criarMovimentoFinanceiro(ctx, {
      tipo: "entrada",
      descricao: p.descricao,
      valorCentavos: p.valorCentavos,
      carteiraId: p.carteiraId,
      categoriaId: p.categoriaId,
      formaPagamento: p.formaPagamento,
      ocorridoEm: instanteParaDataCivil(p.dataRecebimento),
    })
    return {
      ok: true,
      operacaoId: mov.id,
      contratoG004: "G002_MOVIMENTO_ENTRADA",
      mensagem: "Receita registrada e creditada no ledger G002/G005.",
    }
  }

  const titulo = await gravarTituloFinanceiro(ctx, {
    natureza: "RECEBER",
    chave: (chave?.trim() || `rec-${randomUUID()}`).slice(0, 191),
    descricao: p.descricao,
    valorCentavos: p.valorCentavos,
    vencimento: p.vencimento ?? p.dataRecebimento,
    carteiraId: p.carteiraId,
    categoriaId: p.categoriaId,
  })
  return {
    ok: true,
    operacaoId: titulo.id,
    contratoG004: "G002_TITULO_RECEBER",
    mensagem: "Receita prevista gravada em Contas a Receber (G002).",
  }
}

export async function registrarDividaReal(
  ctx: FinanceiroContextoAutorizado,
  raw: RegistrarDividaInput & { documentoId?: string },
  chave?: string
): Promise<OperacaoFeedback> {
  const parsed = registrarDividaInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new GestorMoneyApiError("validacao_divida", 422, parsed.error.issues[0]?.message ?? "Dados inválidos.")
  }
  const p = parsed.data
  const proposta: PropostaGasto = {
    tipo: "CONTA_PAGAR",
    descricao: p.descricao,
    valorCentavos: p.valorOriginalCentavos,
    moeda: "BRL",
    dataGasto: hojeSaoPaulo(),
    vencimento: p.vencimento,
    categoriaId: p.categoriaId,
    contraparteTexto: p.credor,
    ...(raw.documentoId ? { documentoId: raw.documentoId } : {}),
  }

  const { resultado } = await executarPropostaG004(ctx, proposta, chave)
  return {
    ok: true,
    operacaoId: resultado.operacaoId,
    contratoG004: "CONTA_PAGAR",
    mensagem: "Dívida registrada como título canônico no motor G004.",
  }
}

export async function pagarDividaReal(
  ctx: FinanceiroContextoAutorizado,
  raw: PagarDividaInput & { documentoId?: string },
  chave?: string
): Promise<OperacaoFeedback> {
  const parsed = pagarDividaInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new GestorMoneyApiError("validacao_pagamento", 422, parsed.error.issues[0]?.message ?? "Dados inválidos.")
  }
  const p = parsed.data
  const proposta: PropostaGasto = {
    tipo: "PAGAR_TITULO",
    tituloId: p.dividaId,
    ...(p.quitar ? { quitar: true } : { quitar: false, valorCentavos: p.valorCentavos }),
    moeda: "BRL",
    carteiraId: p.carteiraId,
    formaPagamento: p.formaPagamento,
    dataPagamento: instanteParaDataCivil(p.dataPagamento),
    ...(raw.documentoId ? { documentoId: raw.documentoId } : {}),
  }

  const { resultado } = await executarPropostaG004(ctx, proposta, chave)
  return {
    ok: true,
    operacaoId: resultado.operacaoId,
    contratoG004: "PAGAR_TITULO",
    mensagem: p.quitar
      ? "Quitação integral aplicada no motor G004."
      : "Pagamento parcial aplicado no motor G004.",
  }
}

export async function transferirReal(
  ctx: FinanceiroContextoAutorizado,
  raw: TransferirInput
): Promise<OperacaoFeedback> {
  const parsed = transferirInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new GestorMoneyApiError("validacao_transferencia", 422, parsed.error.issues[0]?.message ?? "Dados inválidos.")
  }
  const p = parsed.data

  // Lacuna explicitamente documentada na PR #405 (contratos-produto.postgres.test.ts):
  // não existe operação atômica de transferência para perfil PESSOAL no motor G004.
  if (ctx.tipo === "PESSOAL") {
    throw new GestorMoneyApiError(
      "transferencia_pessoal_pendente_g004",
      501,
      "Transferência interna entre carteiras pessoais ainda aguarda contrato dedicado no motor G004 (PR #405)."
    )
  }

  // Revalida que origem e destino pertencem ao perfil empresarial autorizado
  await comLeituraFinanceira(ctx, async (db, scope) => {
    const found = await db.carteiraFinanceira.findMany({
      where: {
        id: { in: [p.carteiraOrigemId, p.carteiraDestinoId] },
        storeId: scope.storeId,
        ativo: true,
        OR: [{ perfilId: scope.perfilId }, { perfilId: null }],
      },
      select: { id: true },
    })
    if (found.length !== 2) {
      throw new GestorMoneyApiError(
        "contas_transferencia_invalidas",
        404,
        "As contas de origem e destino devem estar ativas e pertencer ao perfil empresarial."
      )
    }
  })

  const valorReais = Number(parseBigIntCentavos(p.valorCentavos)) / 100
  const result = await transferirEntreCarteiras({
    storeId: ctx.storeId,
    origemId: p.carteiraOrigemId,
    destinoId: p.carteiraDestinoId,
    valor: valorReais,
    descricao: p.descricao,
  })
  if (!result.ok) {
    throw new GestorMoneyApiError(
      "transferencia_recusada",
      422,
      result.error || "Não foi possível concluir a transferência."
    )
  }

  return {
    ok: true,
    operacaoId: result.saidaId || randomUUID(),
    contratoG004: "TRANSFERENCIA_EMPRESA",
    mensagem: "Transferência interna concluída sem duplicar receitas ou despesas.",
  }
}

export async function criarContaReal(
  ctx: FinanceiroContextoAutorizado,
  raw: CriarContaInput
): Promise<OperacaoFeedback> {
  const parsed = criarContaInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new GestorMoneyApiError("validacao_conta", 422, parsed.error.issues[0]?.message ?? "Dados inválidos.")
  }
  const p = parsed.data
  const identificador =
    p.tipo === "pix" && !p.identificadorInstrumento?.toLowerCase().includes("pix")
      ? `Pix ${p.identificadorInstrumento ?? p.nome}`.trim().slice(0, 120)
      : p.identificadorInstrumento

  const row = await criarContaFinanceira(ctx, {
    nome: p.nome,
    tipo: CONTA_PARA_TIPO_G002[p.tipo],
    saldoInicialCentavos: p.saldoInicialCentavos,
    ...(p.instituicao ? { instituicao: p.instituicao } : {}),
    ...(identificador ? { identificadorInstrumento: identificador } : {}),
  })
  return {
    ok: true,
    operacaoId: row.id,
    contratoG004: "G002_CONTA_CRIAR",
    mensagem: `Conta "${row.nome}" persistida no perfil ${ctx.tipo}.`,
  }
}

export async function alternarContaAtivaReal(
  ctx: FinanceiroContextoAutorizado,
  contaId: string,
  ativo: boolean
): Promise<OperacaoFeedback> {
  const row = await definirContaFinanceiraAtiva(ctx, { id: contaId, ativo })
  return {
    ok: true,
    operacaoId: row.id,
    contratoG004: "G002_CONTA_ATIVAR",
    mensagem: ativo ? `Conta "${row.nome}" reativada.` : `Conta "${row.nome}" arquivada.`,
  }
}

export async function criarCategoriaReal(
  ctx: FinanceiroContextoAutorizado,
  raw: CriarCategoriaInput
): Promise<OperacaoFeedback> {
  const parsed = criarCategoriaInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new GestorMoneyApiError("validacao_categoria", 422, parsed.error.issues[0]?.message ?? "Dados inválidos.")
  }
  const row = await criarCategoriaGasto(ctx, {
    nome: parsed.data.nome,
    natureza: parsed.data.natureza,
  })
  return {
    ok: true,
    operacaoId: row.id,
    contratoG004: "G002_CATEGORIA_CRIAR",
    mensagem: `Categoria "${row.nome}" persistida com deduplicação NFKC (G002).`,
  }
}

export async function alternarCategoriaAtivaReal(
  ctx: FinanceiroContextoAutorizado,
  categoriaId: string,
  ativo: boolean
): Promise<OperacaoFeedback> {
  const row = await definirCategoriaGastoAtiva(ctx, { id: categoriaId, ativo })
  return {
    ok: true,
    operacaoId: row.id,
    contratoG004: "G002_CATEGORIA_ATIVAR",
    mensagem: ativo ? `Categoria "${row.nome}" ativada.` : `Categoria "${row.nome}" pausada.`,
  }
}

export async function criarCartaoReal(
  ctx: FinanceiroContextoAutorizado,
  raw: CriarCartaoInput
): Promise<OperacaoFeedback> {
  const parsed = criarCartaoInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new GestorMoneyApiError("validacao_cartao", 422, parsed.error.issues[0]?.message ?? "Dados inválidos.")
  }
  const p = parsed.data
  const cartao = await cadastrarCartaoGasto(ctx, {
    nome: p.nome,
    bandeira: p.bandeira,
    ultimos4: p.ultimos4,
  })
  const competenciaAtual = hojeSaoPaulo().slice(0, 7)
  await cadastrarCicloGasto(ctx, {
    cartaoId: cartao.id,
    identificador: competenciaAtual,
    competencia: competenciaAtual,
    fechamentoEm: dataNoMes(competenciaAtual, p.fechamentoDia),
    vencimento: dataNoMes(competenciaAtual, p.vencimentoDia),
  })
  return {
    ok: true,
    operacaoId: cartao.id,
    contratoG004: "G004_CARTAO_CADASTRAR",
    mensagem: `Cartão "${cartao.nome}" e ciclo inicial ${competenciaAtual} persistidos.`,
  }
}

export async function registrarCompraCartaoReal(
  ctx: FinanceiroContextoAutorizado,
  raw: RegistrarCompraCartaoInput,
  chave?: string
): Promise<OperacaoFeedback> {
  const parsed = registrarCompraCartaoInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new GestorMoneyApiError("validacao_compra_cartao", 422, parsed.error.issues[0]?.message ?? "Dados inválidos.")
  }
  const p = parsed.data

  // Busca fechamento/vencimento base do cartão (ou usa dia 5 / dia 12)
  const cardInfo = await comLeituraFinanceira(ctx, async (db, scope) => {
    const card = await db.cartaoInstrumento.findFirst({
      where: {
        id: p.cartaoId,
        perfilId: scope.perfilId,
        storeId: scope.tipo === "EMPRESA" ? scope.storeId : null,
        ativo: true,
      },
      include: { ciclos: { orderBy: { competencia: "desc" }, take: 1 } },
    })
    if (!card) throw new GestorMoneyApiError("cartao_indisponivel", 404, "Cartão não encontrado no perfil ativo.")
    const ult = card.ciclos[0]
    return {
      fechamentoDia: ult?.fechamentoEm ? ult.fechamentoEm.getUTCDate() : 5,
      vencimentoDia: ult ? ult.vencimento.getUTCDate() : 12,
    }
  })

  const competenciaInicial = p.dataCompra.slice(0, 7)
  const total = parseBigIntCentavos(p.valorTotalCentavos)
  const baseParcela = total / BigInt(p.parcelasTotal)
  const resto = total - baseParcela * BigInt(p.parcelasTotal)

  const ciclosCriados = []
  for (let i = 0; i < p.parcelasTotal; i++) {
    const comp = adicionarMesesCompetencia(competenciaInicial, i)
    const ciclo = await cadastrarCicloGasto(ctx, {
      cartaoId: p.cartaoId,
      identificador: comp,
      competencia: comp,
      fechamentoEm: dataNoMes(comp, cardInfo.fechamentoDia),
      vencimento: dataNoMes(comp, cardInfo.vencimentoDia),
    })
    ciclosCriados.push(ciclo)
  }

  const proposta: PropostaGasto =
    p.parcelasTotal === 1
      ? {
          tipo: "COMPRA_CREDITO",
          descricao: `${p.descricao} (${p.estabelecimento})`,
          valorCentavos: total.toString(),
          moeda: "BRL",
          dataGasto: p.dataCompra,
          categoriaId: p.categoriaId,
          contraparteTexto: p.estabelecimento,
          cicloId: ciclosCriados[0].id,
        }
      : {
          tipo: "COMPRA_CREDITO",
          descricao: `${p.descricao} (${p.estabelecimento})`,
          valorCentavos: total.toString(),
          moeda: "BRL",
          dataGasto: p.dataCompra,
          categoriaId: p.categoriaId,
          contraparteTexto: p.estabelecimento,
          parcelas: ciclosCriados.map((ciclo, idx) => ({
            cicloId: ciclo.id,
            numero: idx + 1,
            total: p.parcelasTotal,
            valorCentavos: (idx === 0 ? baseParcela + resto : baseParcela).toString(),
          })),
        }

  const { resultado } = await executarPropostaG004(ctx, proposta, chave)
  return {
    ok: true,
    operacaoId: resultado.operacaoId,
    contratoG004: "COMPRA_CREDITO",
    mensagem:
      p.parcelasTotal > 1
        ? `Compra parcelada em ${p.parcelasTotal}x registrada nos ciclos do cartão (G004).`
        : "Compra no cartão registrada na fatura (G004).",
  }
}

export async function pagarFaturaReal(
  ctx: FinanceiroContextoAutorizado,
  raw: PagarFaturaInput,
  chave?: string
): Promise<OperacaoFeedback> {
  const parsed = pagarFaturaInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new GestorMoneyApiError("validacao_fatura", 422, parsed.error.issues[0]?.message ?? "Dados inválidos.")
  }
  const p = parsed.data

  // Carrega os títulos abertos do ciclo e calcula saldo restante exato em centavos
  const alocacoes = await comLeituraFinanceira(ctx, async (db, scope) => {
    const titulos = await db.contaPagarTitulo.findMany({
      where: {
        perfilId: scope.perfilId,
        storeId: scope.tipo === "EMPRESA" ? scope.storeId : null,
        cartaoCicloId: p.cicloId,
        ativo: true,
        status: { notIn: ["cancelado", "estornado"] },
      },
      include: {
        alocacoesPagamento: {
          select: { valorCentavos: true, pagamento: { select: { tipo: true } } },
        },
      },
      orderBy: { id: "asc" },
    })
    const lista: Array<{ tituloId: string; valorCentavos: string }> = []
    for (const t of titulos) {
      const total = BigInt(t.valorCentavos?.toString() ?? Math.round(t.valor * 100))
      let pago = BigInt(0)
      for (const a of t.alocacoesPagamento) {
        const av = BigInt(a.valorCentavos.toString())
        pago += a.pagamento.tipo === "PAGAMENTO" ? av : -av
      }
      if (pago < BigInt(0)) pago = BigInt(0)
      const restante = total > pago ? total - pago : BigInt(0)
      if (restante > BigInt(0)) {
        lista.push({ tituloId: t.id, valorCentavos: restante.toString() })
      }
    }
    return lista
  })

  if (alocacoes.length === 0) {
    throw new GestorMoneyApiError("fatura_sem_saldo", 409, "Esta fatura não possui títulos pendentes.")
  }

  const proposta: PropostaGasto = {
    tipo: "PAGAR_FATURA",
    cicloId: p.cicloId,
    alocacoes,
    moeda: "BRL",
    carteiraId: p.carteiraId,
    formaPagamento: p.formaPagamento,
    dataPagamento: instanteParaDataCivil(p.dataPagamento),
  }

  const { resultado } = await executarPropostaG004(ctx, proposta, chave)
  return {
    ok: true,
    operacaoId: resultado.operacaoId,
    contratoG004: "PAGAR_FATURA",
    mensagem: "Fatura paga atomicamente no motor G004 sem duplicar despesas.",
  }
}

/** Fluxo explícito de revisão G004 (preparar / corrigir / cancelar / confirmar) para clientes que usam confirmação em 2 etapas. */
export async function executarRevisaoExplicitaG004(
  ctx: FinanceiroContextoAutorizado,
  input:
    | { acao: "preparar"; grupoChave: string; proposta: unknown; expiraEm?: string }
    | { acao: "corrigir"; revisaoId: string; versaoEsperada: number; proposta: unknown; expiraEm?: string }
    | { acao: "cancelar"; revisaoId: string; versaoEsperada: number }
    | { acao: "confirmar"; revisaoId: string; versaoEsperada: number; chave: string }
) {
  if (input.acao === "preparar") {
    return prepararRevisaoGasto(ctx, {
      grupoChave: input.grupoChave,
      proposta: input.proposta,
      ...(input.expiraEm ? { expiraEm: input.expiraEm } : {}),
    })
  }
  if (input.acao === "corrigir") {
    return corrigirRevisaoGasto(ctx, {
      revisaoId: input.revisaoId,
      versaoEsperada: input.versaoEsperada,
      proposta: input.proposta,
      ...(input.expiraEm ? { expiraEm: input.expiraEm } : {}),
    })
  }
  if (input.acao === "cancelar") {
    return cancelarRevisaoGasto(ctx, {
      revisaoId: input.revisaoId,
      versaoEsperada: input.versaoEsperada,
    })
  }
  return aplicarOperacaoGasto(ctx, {
    revisaoId: input.revisaoId,
    versaoEsperada: input.versaoEsperada,
    chave: input.chave,
  })
}
