import "server-only"
import { randomUUID } from "node:crypto"
import { aplicarOperacaoGasto } from "@/lib/gastos/apply"
import {
  cadastrarCartaoGasto,
  cadastrarCicloGasto,
  consultarCartoesGasto,
  consultarHistoricoLimiteCartaoGasto,
  editarCartaoGasto,
} from "@/lib/gastos/cartoes"
import { criarCategoriaGasto, definirCategoriaGastoAtiva } from "@/lib/gastos/categorias"
import { criarContaFinanceira, definirContaFinanceiraAtiva } from "@/lib/gastos/contas"
import { GateStorageG003Error } from "@/lib/gastos/documentos-storage"
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
import {
  CONTA_PARA_TIPO_G002,
  criarCartaoInputSchema,
  criarCategoriaInputSchema,
  criarContaInputSchema,
  editarCartaoInputSchema,
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
  type EditarCartaoInput,
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
import { descreverBloqueioGateStorageG003 } from "./documents-adapter"

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

const MENSAGENS_OPERACAO_GASTO: Record<string, string> = {
  limite_cartao_insuficiente:
    "Limite disponível insuficiente neste cartão para concluir a compra (todas as parcelas comprometem o limite integralmente). Reduza o valor, pague uma fatura em aberto ou ajuste o limite do cartão.",
  ciclo_cartao_divergente:
    "Todos os ciclos informados para uma compra no cartão devem pertencer ao mesmo cartão.",
  saldo_conta_insuficiente:
    "Saldo insuficiente na conta selecionada para concluir a operação.",
  cartao_indisponivel: "Cartão não encontrado ou inativo no perfil autorizado.",
  cartao_invalido: "Dados do cartão ou limite informados são inválidos.",
  documento_indisponivel: "Comprovante não encontrado ou em quarentena no perfil autorizado.",
  documento_ja_vinculado_titulo: "Este comprovante já está vinculado a outro título.",
}

export function mapearErroIntegracaoReal(error: unknown): GestorMoneyApiError {
  if (error instanceof GestorMoneyApiError) return error
  if (error instanceof GateStorageG003Error) {
    return new GestorMoneyApiError(
      error.code,
      error.status,
      descreverBloqueioGateStorageG003(error.code)
    )
  }
  if (error instanceof OperacaoGastoError) {
    return new GestorMoneyApiError(
      error.code,
      error.status,
      MENSAGENS_OPERACAO_GASTO[error.code] ?? error.message
    )
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
  raw: TransferirInput,
  chave?: string
): Promise<OperacaoFeedback> {
  const parsed = transferirInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new GestorMoneyApiError("validacao_transferencia", 422, parsed.error.issues[0]?.message ?? "Dados inválidos.")
  }
  const p = parsed.data

  // Contrato canônico G004 (`TRANSFERENCIA_INTERNA`, adicionado na PR #405 commit 2554d25):
  // funciona atomicamente e com idempotência para PESSOAL e EMPRESA no mesmo perfil,
  // sem criar receita nem despesa e sem loja fictícia.
  const proposta: PropostaGasto = {
    tipo: "TRANSFERENCIA_INTERNA",
    valorCentavos: p.valorCentavos,
    moeda: "BRL",
    carteiraOrigemId: p.carteiraOrigemId,
    carteiraDestinoId: p.carteiraDestinoId,
    dataPagamento: instanteParaDataCivil(p.dataTransferencia),
    ...(p.descricao ? { descricao: p.descricao } : {}),
  }

  const { resultado } = await executarPropostaG004(ctx, proposta, chave)
  return {
    ok: true,
    operacaoId: resultado.operacaoId,
    contratoG004: "TRANSFERENCIA_INTERNA",
    mensagem: `Transferência interna concluída no perfil ${ctx.tipo} sem duplicar receitas ou despesas (G004).`,
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
    ...(p.limiteCentavos !== undefined ? { limiteCentavos: p.limiteCentavos } : {}),
    ...(p.motivo ? { motivo: p.motivo } : {}),
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
    mensagem:
      p.limiteCentavos !== undefined && p.limiteCentavos !== null
        ? `Cartão "${cartao.nome}", limite inicial e ciclo ${competenciaAtual} persistidos (G004).`
        : `Cartão "${cartao.nome}" e ciclo inicial ${competenciaAtual} persistidos (limite não informado).`,
  }
}

export async function editarCartaoReal(
  ctx: FinanceiroContextoAutorizado,
  raw: EditarCartaoInput
) {
  const parsed = editarCartaoInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new GestorMoneyApiError("validacao_cartao", 422, parsed.error.issues[0]?.message ?? "Dados inválidos.")
  }
  const p = parsed.data
  const res = await editarCartaoGasto(ctx, {
    cartaoId: p.cartaoId,
    ...(p.nome !== undefined ? { nome: p.nome } : {}),
    ...(p.bandeira !== undefined ? { bandeira: p.bandeira } : {}),
    ...(p.ultimos4 !== undefined ? { ultimos4: p.ultimos4 } : {}),
    ...(p.ativo !== undefined ? { ativo: p.ativo } : {}),
    ...(p.limiteCentavos !== undefined ? { limiteCentavos: p.limiteCentavos } : {}),
    ...(p.motivo !== undefined ? { motivo: p.motivo } : {}),
  })

  const feedback: OperacaoFeedback = {
    ok: true,
    operacaoId: res.eventoLimite?.id ?? res.cartao.id,
    contratoG004: res.eventoLimite ? `G004_CARTAO_LIMITE_${res.eventoLimite.acao}` : "G004_CARTAO_EDITAR",
    mensagem: res.eventoLimite
      ? res.eventoLimite.acao === "REMOCAO"
        ? `Limite do cartão "${res.cartao.nome}" removido e auditado no histórico (G004).`
        : `Limite do cartão "${res.cartao.nome}" atualizado e registrado no histórico (G004).`
      : `Dados do cartão "${res.cartao.nome}" atualizados (G004).`,
  }

  return {
    feedback,
    cartao: res.cartao,
    resumoLimite: res.resumoLimite,
    eventoLimite: res.eventoLimite,
  }
}

export async function listarCartoesCanonicosReal(
  ctx: FinanceiroContextoAutorizado,
  opcoes?: { cartaoId?: string; incluirInativos?: boolean; incluirHistoricoLimites?: boolean }
) {
  return consultarCartoesGasto(ctx, opcoes ?? {})
}

export async function listarHistoricoLimiteCartaoReal(
  ctx: FinanceiroContextoAutorizado,
  cartaoId: string
) {
  return consultarHistoricoLimiteCartaoGasto(ctx, cartaoId)
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

  let alocacoesAplicadas = alocacoes
  if (p.valorCentavos) {
    const desejado = parseBigIntCentavos(p.valorCentavos)
    const totalAberto = alocacoes.reduce((acc, a) => acc + parseBigIntCentavos(a.valorCentavos), BigInt(0))
    if (desejado <= BigInt(0) || desejado > totalAberto) {
      throw new GestorMoneyApiError(
        "valor_fatura_invalido",
        409,
        "O valor informado excede o saldo em aberto desta fatura."
      )
    }
    let restanteDistribuir = desejado
    const parciais: Array<{ tituloId: string; valorCentavos: string }> = []
    for (const item of alocacoes) {
      if (restanteDistribuir <= BigInt(0)) break
      const abertoItem = parseBigIntCentavos(item.valorCentavos)
      const aplicado = abertoItem <= restanteDistribuir ? abertoItem : restanteDistribuir
      parciais.push({ tituloId: item.tituloId, valorCentavos: aplicado.toString() })
      restanteDistribuir -= aplicado
    }
    alocacoesAplicadas = parciais
  }

  const proposta: PropostaGasto = {
    tipo: "PAGAR_FATURA",
    cicloId: p.cicloId,
    alocacoes: alocacoesAplicadas,
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
    mensagem: p.valorCentavos
      ? "Pagamento parcial da fatura aplicado no motor G004 com recomposição proporcional do limite."
      : "Fatura paga atomicamente no motor G004 com recomposição do limite disponível.",
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
