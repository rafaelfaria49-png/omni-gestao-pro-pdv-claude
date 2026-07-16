/** Agregador read-only do Contador HUB, sempre escopado por `ContadorScopeInterno`. */
import { prisma, prismaEnsureConnected } from "@/lib/prisma"
import {
  resolvePeriodoUtc,
  type Competencia,
  type PeriodoUtc,
} from "@/lib/contador/competencia"
import type { ContadorScopeInterno } from "@/lib/contador/scope-core"
import { agregarVendas, type VendaRow } from "./vendas"
import { agregarDevolucoes, type DevolucaoRow } from "./devolucoes"
import { agregarFinanceiro, type MovimentacaoRow, type TituloRow } from "./financeiro"
import { agregarCaixa, type CaixaOperacaoRow, type SessaoRow } from "./caixa"
import {
  monetarioIndisponivel,
  monetarioReal,
  numericoIndisponivel,
  type AlertaQualidade,
  type CaixaContador,
  type ContadorDadosReais,
  type DevolucoesContador,
  type FinanceiroContador,
  type VendasContador,
} from "./tipos"

export type FonteContador =
  | "vendas"
  | "devolucoes"
  | "movimentacoes"
  | "receber"
  | "pagar"
  | "sessoes"
  | "operacoes"

export type FontesContador = {
  vendas: VendaRow[]
  devolucoes: DevolucaoRow[]
  movimentacoes: MovimentacaoRow[]
  receber: TituloRow[]
  pagar: TituloRow[]
  sessoes: SessaoRow[]
  operacoes: CaixaOperacaoRow[]
  /** Apenas o identificador da fonte; mensagens/stack do banco nunca chegam ao DTO/UI. */
  falhas: readonly FonteContador[]
}

type FindMany<T> = (args: Record<string, unknown>) => Promise<T[]>

/** Porta mínima injetável para testar as fronteiras das queries sem banco real. */
export type ContadorReaderClient = {
  venda: { findMany: FindMany<VendaRow> }
  devolucaoVenda: { findMany: FindMany<DevolucaoRow> }
  movimentacaoFinanceira: { findMany: FindMany<MovimentacaoRow> }
  contaReceberTitulo: { findMany: FindMany<TituloRow> }
  contaPagarTitulo: { findMany: FindMany<TituloRow> }
  sessaoCaixa: { findMany: FindMany<SessaoRow> }
  caixaOperacao: { findMany: FindMany<CaixaOperacaoRow> }
}

const OBS_FONTE_INDISPONIVEL =
  "A leitura desta fonte falhou. O valor não foi substituído por zero; tente novamente."

const ROTULO_FONTE: Record<FonteContador, string> = {
  vendas: "Venda",
  devolucoes: "DevolucaoVenda",
  movimentacoes: "MovimentacaoFinanceira",
  receber: "ContaReceberTitulo",
  pagar: "ContaPagarTitulo",
  sessoes: "SessaoCaixa",
  operacoes: "CaixaOperacao",
}

function vendasIndisponiveis(): VendasContador {
  const fonte = ROTULO_FONTE.vendas
  return Object.freeze({
    quantidade: numericoIndisponivel(fonte, OBS_FONTE_INDISPONIVEL),
    total: monetarioIndisponivel(fonte, OBS_FONTE_INDISPONIVEL),
    canceladasQuantidade: numericoIndisponivel(fonte, OBS_FONTE_INDISPONIVEL),
    canceladasTotal: monetarioIndisponivel(fonte, OBS_FONTE_INDISPONIVEL),
    descontoTotal: monetarioIndisponivel("Venda.payload.discountTotal", OBS_FONTE_INDISPONIVEL),
    descontoCoberturaQuantidade: numericoIndisponivel(
      "Venda.payload.discountTotal",
      OBS_FONTE_INDISPONIVEL,
    ),
    formasPagamento: Object.freeze([]),
    formaPagamentoDisponibilidade: "indisponivel",
    naoIdentificadoQuantidade: numericoIndisponivel(fonte, OBS_FONTE_INDISPONIVEL),
    naoIdentificadoValor: monetarioIndisponivel(fonte, OBS_FONTE_INDISPONIVEL),
    divergenciaPagamentoQuantidade: numericoIndisponivel(fonte, OBS_FONTE_INDISPONIVEL),
    reconciliacaoPagamento: null,
  })
}

function devolucoesIndisponiveis(): DevolucoesContador {
  const fonte = ROTULO_FONTE.devolucoes
  return Object.freeze({
    quantidade: numericoIndisponivel(fonte, OBS_FONTE_INDISPONIVEL),
    total: monetarioIndisponivel(fonte, OBS_FONTE_INDISPONIVEL),
  })
}

function aplicarFalhasFinanceiro(
  base: FinanceiroContador,
  falhou: (fonte: FonteContador) => boolean,
): FinanceiroContador {
  const movIndisponivel = monetarioIndisponivel(ROTULO_FONTE.movimentacoes, OBS_FONTE_INDISPONIVEL)
  const crMon = monetarioIndisponivel(ROTULO_FONTE.receber, OBS_FONTE_INDISPONIVEL)
  const crNum = numericoIndisponivel(ROTULO_FONTE.receber, OBS_FONTE_INDISPONIVEL)
  const cpMon = monetarioIndisponivel(ROTULO_FONTE.pagar, OBS_FONTE_INDISPONIVEL)
  const cpNum = numericoIndisponivel(ROTULO_FONTE.pagar, OBS_FONTE_INDISPONIVEL)
  return Object.freeze({
    entradasRealizadas: falhou("movimentacoes") ? movIndisponivel : base.entradasRealizadas,
    saidasRealizadas: falhou("movimentacoes") ? movIndisponivel : base.saidasRealizadas,
    estornos: falhou("movimentacoes") ? movIndisponivel : base.estornos,
    transferencias: falhou("movimentacoes") ? movIndisponivel : base.transferencias,
    transferenciasQuantidade: falhou("movimentacoes")
      ? numericoIndisponivel(ROTULO_FONTE.movimentacoes, OBS_FONTE_INDISPONIVEL)
      : base.transferenciasQuantidade,
    naoClassificados: falhou("movimentacoes") ? movIndisponivel : base.naoClassificados,
    naoClassificadosQuantidade: falhou("movimentacoes")
      ? numericoIndisponivel(ROTULO_FONTE.movimentacoes, OBS_FONTE_INDISPONIVEL)
      : base.naoClassificadosQuantidade,
    titulosReceberAberto: falhou("receber") ? crMon : base.titulosReceberAberto,
    titulosReceberQuantidade: falhou("receber") ? crNum : base.titulosReceberQuantidade,
    titulosPagarAberto: falhou("pagar") ? cpMon : base.titulosPagarAberto,
    titulosPagarQuantidade: falhou("pagar") ? cpNum : base.titulosPagarQuantidade,
  })
}

function aplicarFalhasCaixa(
  base: CaixaContador,
  falhou: (fonte: FonteContador) => boolean,
): CaixaContador {
  const sessaoNum = numericoIndisponivel(ROTULO_FONTE.sessoes, OBS_FONTE_INDISPONIVEL)
  const sessaoMon = monetarioIndisponivel(ROTULO_FONTE.sessoes, OBS_FONTE_INDISPONIVEL)
  const operacaoNum = numericoIndisponivel(ROTULO_FONTE.operacoes, OBS_FONTE_INDISPONIVEL)
  const operacaoMon = monetarioIndisponivel(ROTULO_FONTE.operacoes, OBS_FONTE_INDISPONIVEL)
  return Object.freeze({
    sessoes: falhou("sessoes") ? sessaoNum : base.sessoes,
    sessoesAbertas: falhou("sessoes") ? sessaoNum : base.sessoesAbertas,
    sangriasTotal: falhou("operacoes") ? operacaoMon : base.sangriasTotal,
    sangriasQuantidade: falhou("operacoes") ? operacaoNum : base.sangriasQuantidade,
    suprimentosTotal: falhou("operacoes") ? operacaoMon : base.suprimentosTotal,
    suprimentosQuantidade: falhou("operacoes") ? operacaoNum : base.suprimentosQuantidade,
    diferencas: falhou("sessoes") ? sessaoMon : base.diferencas,
  })
}

/** Monta o DTO honesto a partir de fontes já carregadas. Puro/determinístico. */
export function montarDados(fontes: FontesContador, competencia: Competencia): ContadorDadosReais {
  const falhou = (fonte: FonteContador) => fontes.falhas.includes(fonte)
  const vendas = falhou("vendas") ? vendasIndisponiveis() : agregarVendas(fontes.vendas)
  const devolucoes = falhou("devolucoes")
    ? devolucoesIndisponiveis()
    : agregarDevolucoes(fontes.devolucoes)
  const financeiro = aplicarFalhasFinanceiro(
    agregarFinanceiro({
      movimentacoes: fontes.movimentacoes,
      receber: fontes.receber,
      pagar: fontes.pagar,
      competencia,
    }),
    falhou,
  )
  const caixa = aplicarFalhasCaixa(
    agregarCaixa({ sessoes: fontes.sessoes, operacoes: fontes.operacoes }),
    falhou,
  )

  const liquidoCompetencia =
    falhou("vendas") || falhou("devolucoes")
      ? monetarioIndisponivel(
          "Venda.total − DevolucaoVenda.valorTotal",
          "Venda ou devolução indisponível; o líquido não pode ser calculado com segurança.",
        )
      : monetarioReal(
          (vendas.total.valor ?? 0) - (devolucoes.total.valor ?? 0),
          "Venda.total − DevolucaoVenda.valorTotal",
          "Devolução reduz a competência em que ocorreu; sem dupla subtração.",
        )

  const alertas: AlertaQualidade[] = fontes.falhas.map((fonte) => ({
    nivel: "atencao",
    titulo: `Fonte ${ROTULO_FONTE[fonte]} indisponível`,
    detalhe: OBS_FONTE_INDISPONIVEL,
  }))

  if (!falhou("vendas") && (vendas.naoIdentificadoQuantidade.valor ?? 0) > 0) {
    alertas.push({
      nivel: "atencao",
      titulo: "Vendas com forma de pagamento incompleta",
      detalhe: `${vendas.naoIdentificadoQuantidade.valor} venda(s) sem paymentBreakdown completo e reconciliado.`,
    })
  }
  if (!falhou("vendas") && vendas.descontoTotal.disponibilidade === "parcial") {
    alertas.push({
      nivel: "info",
      titulo: "Cobertura de desconto parcial",
      detalhe: vendas.descontoTotal.observacao ?? "Parte das vendas não registrou desconto no payload.",
    })
  }
  const reconciliacaoPagamento = vendas.reconciliacaoPagamento
  if (!falhou("vendas") && (reconciliacaoPagamento?.residualNaoIdentificado ?? 0) > 0) {
    alertas.push({
      nivel: "atencao",
      titulo: "Residual não identificado no breakdown de pagamentos",
      detalhe: `Breakdown abaixo de Venda.total; residual total de ${reconciliacaoPagamento?.residualNaoIdentificado}.`,
    })
  }
  if (!falhou("vendas") && (reconciliacaoPagamento?.excedenteBreakdown ?? 0) > 0) {
    alertas.push({
      nivel: "atencao",
      titulo: "Excedente no breakdown de pagamentos",
      detalhe: `Breakdown acima de Venda.total; excedente declarado de ${reconciliacaoPagamento?.excedenteBreakdown}.`,
    })
  }
  if (!falhou("movimentacoes") && (financeiro.naoClassificadosQuantidade.valor ?? 0) > 0) {
    alertas.push({
      nivel: "atencao",
      titulo: "Movimentacoes financeiras nao classificadas",
      detalhe: `${financeiro.naoClassificadosQuantidade.valor} movimento(s) ficaram fora de entradas e saidas por origem nao reconhecida.`,
    })
  }
  if (!falhou("receber") && financeiro.titulosReceberAberto.disponibilidade === "parcial") {
    alertas.push({
      nivel: "info",
      titulo: "Títulos a receber sem vencimento reconhecível",
      detalhe: financeiro.titulosReceberAberto.observacao ?? "Alguns títulos abertos ficaram fora da competência.",
    })
  }
  if (!falhou("pagar") && financeiro.titulosPagarAberto.disponibilidade === "parcial") {
    alertas.push({
      nivel: "info",
      titulo: "Títulos a pagar sem vencimento reconhecível",
      detalhe: financeiro.titulosPagarAberto.observacao ?? "Alguns títulos abertos ficaram fora da competência.",
    })
  }
  if (!falhou("sessoes") && (caixa.sessoes.valor ?? 0) > 0 && caixa.diferencas.disponibilidade === "indisponivel") {
    alertas.push({
      nivel: "info",
      titulo: "Diferença de caixa indisponível",
      detalhe: caixa.diferencas.observacao ?? "Sessões sem conferência de saldo.",
    })
  }
  alertas.push({
    nivel: "info",
    titulo: "Fonte fiscal indisponível nesta fase",
    detalhe: "Nota Fiscal permanece atrás de CONTADOR_FISCAL_READER e não é consultada neste módulo.",
  })

  return Object.freeze({
    competencia: Object.freeze({ ano: competencia.ano, mes: competencia.mes }),
    liquidoCompetencia,
    vendas,
    devolucoes,
    financeiro,
    caixa,
    alertas: Object.freeze(alertas),
    fiscal: monetarioIndisponivel(
      "NotaFiscal (CONTADOR_FISCAL_READER)",
      "Fonte fiscal fora de escopo neste GOAL; não disponível nesta fase.",
    ),
  })
}

function valorOuVazio<T>(
  resultado: PromiseSettledResult<T[]>,
  fonte: FonteContador,
  falhas: FonteContador[],
): T[] {
  if (resultado.status === "fulfilled") return resultado.value
  falhas.push(fonte)
  return []
}

/**
 * Executa as sete consultas isoladamente. Uma falha não cancela as demais e o erro bruto
 * não é propagado ao DTO. Exportado para testes de fronteira com porta Prisma injetada.
 */
export async function carregarFontesComCliente(
  scope: ContadorScopeInterno,
  periodo: PeriodoUtc,
  cliente: ContadorReaderClient,
): Promise<FontesContador> {
  const noPeriodo = { gte: periodo.inicio, lt: periodo.fimExclusivo }
  const resultados = await Promise.allSettled([
    cliente.venda.findMany({
      where: { storeId: scope.storeId, at: noPeriodo },
      select: { total: true, status: true, payload: true },
    }),
    cliente.devolucaoVenda.findMany({
      where: { storeId: scope.storeId, at: noPeriodo },
      select: { valorTotal: true },
    }),
    cliente.movimentacaoFinanceira.findMany({
      where: { storeId: scope.storeId, createdAt: noPeriodo },
      select: { tipo: true, origem: true, valor: true },
    }),
    cliente.contaReceberTitulo.findMany({
      where: { storeId: scope.storeId },
      select: { valor: true, status: true, vencimento: true },
    }),
    cliente.contaPagarTitulo.findMany({
      where: { storeId: scope.storeId },
      select: { valor: true, status: true, vencimento: true },
    }),
    cliente.sessaoCaixa.findMany({
      where: { storeId: scope.storeId, abertaEm: noPeriodo },
      select: { status: true, saldoFinal: true, saldoContado: true },
    }),
    cliente.caixaOperacao.findMany({
      where: { storeId: scope.storeId, at: noPeriodo },
      select: { tipo: true, valor: true },
    }),
  ] as const)

  const falhas: FonteContador[] = []
  const vendas = valorOuVazio(resultados[0], "vendas", falhas)
  const devolucoes = valorOuVazio(resultados[1], "devolucoes", falhas)
  const movimentacoes = valorOuVazio(resultados[2], "movimentacoes", falhas)
  const receber = valorOuVazio(resultados[3], "receber", falhas)
  const pagar = valorOuVazio(resultados[4], "pagar", falhas)
  const sessoes = valorOuVazio(resultados[5], "sessoes", falhas)
  const operacoes = valorOuVazio(resultados[6], "operacoes", falhas)

  return {
    vendas,
    devolucoes,
    movimentacoes,
    receber,
    pagar,
    sessoes: sessoes.map((s) => ({
      status: String(s.status),
      saldoFinal: s.saldoFinal,
      saldoContado: s.saldoContado,
    })),
    operacoes,
    falhas: Object.freeze(falhas),
  }
}

/** Carrega fontes reais via Prisma usando apenas um scope já validado. */
export async function carregarFontes(
  scope: ContadorScopeInterno,
  competencia: Competencia,
): Promise<FontesContador> {
  await prismaEnsureConnected()
  return carregarFontesComCliente(
    scope,
    resolvePeriodoUtc(competencia),
    prisma as unknown as ContadorReaderClient,
  )
}

/** Conveniência: carrega fontes reais e monta o DTO. Read-only. */
export async function construirDadosContador(
  scope: ContadorScopeInterno,
  competencia: Competencia,
): Promise<ContadorDadosReais> {
  return montarDados(await carregarFontes(scope, competencia), competencia)
}
