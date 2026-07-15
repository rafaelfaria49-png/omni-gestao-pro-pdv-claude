/**
 * Contador HUB · agregador de dados reais da competência (read-only). GOAL 006.
 *
 * `montarDados` é PURO (testável sem banco). `carregarFontes` isola o IO Prisma
 * (todas as queries são `findMany` read-only escopadas por `storeId`). Nenhuma escrita,
 * nenhuma consulta a NotaFiscal / módulo Fiscal.
 */
import { prisma, prismaEnsureConnected } from "@/lib/prisma"
import { resolvePeriodoUtc, type Competencia } from "@/lib/contador/competencia"
import { agregarVendas, type VendaRow } from "./vendas"
import { agregarDevolucoes, type DevolucaoRow } from "./devolucoes"
import { agregarFinanceiro, type MovimentacaoRow, type TituloRow } from "./financeiro"
import { agregarCaixa, type SessaoRow, type CaixaOperacaoRow } from "./caixa"
import {
  arred,
  monetarioReal,
  monetarioIndisponivel,
  type AlertaQualidade,
  type ContadorDadosReais,
} from "./tipos"

export type FontesContador = {
  vendas: VendaRow[]
  devolucoes: DevolucaoRow[]
  movimentacoes: MovimentacaoRow[]
  receber: TituloRow[]
  pagar: TituloRow[]
  sessoes: SessaoRow[]
  operacoes: CaixaOperacaoRow[]
}

/** Monta o DTO honesto a partir de fontes já carregadas. Puro/determinístico. */
export function montarDados(fontes: FontesContador, competencia: Competencia): ContadorDadosReais {
  const vendas = agregarVendas(fontes.vendas)
  const devolucoes = agregarDevolucoes(fontes.devolucoes)
  const financeiro = agregarFinanceiro({
    movimentacoes: fontes.movimentacoes,
    receber: fontes.receber,
    pagar: fontes.pagar,
    competencia,
  })
  const caixa = agregarCaixa({ sessoes: fontes.sessoes, operacoes: fontes.operacoes })

  // Líquido = vendas.total − devoluções.total. Subtração única (sem dupla subtração).
  const liquidoValor = (vendas.total.valor ?? 0) - (devolucoes.total.valor ?? 0)
  const liquidoCompetencia = monetarioReal(
    liquidoValor,
    "Venda.total − DevolucaoVenda.valorTotal",
    "Devolução reduz a competência em que ocorreu; Venda.total não é reduzido de novo.",
  )

  const alertas: AlertaQualidade[] = []
  if ((vendas.naoIdentificadoQuantidade.valor ?? 0) > 0) {
    alertas.push({
      nivel: "atencao",
      titulo: "Vendas sem forma de pagamento identificada",
      detalhe: `${vendas.naoIdentificadoQuantidade.valor} venda(s) sem paymentBreakdown válido no payload.`,
    })
  }
  if (vendas.descontoTotal.disponibilidade === "parcial") {
    alertas.push({
      nivel: "info",
      titulo: "Cobertura de desconto parcial",
      detalhe: vendas.descontoTotal.observacao ?? "Parte das vendas não registrou desconto no payload.",
    })
  }
  if (financeiro.titulosReceberAberto.disponibilidade === "parcial") {
    alertas.push({
      nivel: "info",
      titulo: "Títulos a receber sem vencimento reconhecível",
      detalhe: financeiro.titulosReceberAberto.observacao ?? "Alguns títulos abertos ficaram fora da competência.",
    })
  }
  if (financeiro.titulosPagarAberto.disponibilidade === "parcial") {
    alertas.push({
      nivel: "info",
      titulo: "Títulos a pagar sem vencimento reconhecível",
      detalhe: financeiro.titulosPagarAberto.observacao ?? "Alguns títulos abertos ficaram fora da competência.",
    })
  }
  if ((caixa.sessoes.valor ?? 0) > 0 && caixa.diferencas.disponibilidade === "indisponivel") {
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
    liquidoCompetencia: Object.freeze({ ...liquidoCompetencia, valor: arred(liquidoValor) }),
    vendas,
    devolucoes,
    financeiro,
    caixa,
    alertas,
    fiscal: monetarioIndisponivel(
      "NotaFiscal (CONTADOR_FISCAL_READER)",
      "Fonte fiscal fora de escopo neste GOAL; não disponível nesta fase.",
    ),
  })
}

/** Carrega as fontes reais da loja/competência via Prisma (read-only, escopo por storeId). */
export async function carregarFontes(storeId: string, competencia: Competencia): Promise<FontesContador> {
  const { inicio, fimExclusivo } = resolvePeriodoUtc(competencia)
  const noPeriodo = { gte: inicio, lt: fimExclusivo }

  await prismaEnsureConnected()

  const [vendas, devolucoes, movimentacoes, receber, pagar, sessoes, operacoes] = await Promise.all([
    prisma.venda.findMany({
      where: { storeId, at: noPeriodo },
      select: { total: true, status: true, payload: true },
    }),
    prisma.devolucaoVenda.findMany({
      where: { storeId, at: noPeriodo },
      select: { valorTotal: true },
    }),
    prisma.movimentacaoFinanceira.findMany({
      where: { storeId, createdAt: noPeriodo },
      select: { tipo: true, origem: true, valor: true },
    }),
    prisma.contaReceberTitulo.findMany({
      where: { storeId },
      select: { valor: true, status: true, vencimento: true },
    }),
    prisma.contaPagarTitulo.findMany({
      where: { storeId },
      select: { valor: true, status: true, vencimento: true },
    }),
    prisma.sessaoCaixa.findMany({
      where: { storeId, abertaEm: noPeriodo },
      select: { status: true, saldoFinal: true, saldoContado: true },
    }),
    prisma.caixaOperacao.findMany({
      where: { storeId, at: noPeriodo },
      select: { tipo: true, valor: true },
    }),
  ])

  return {
    vendas,
    devolucoes,
    movimentacoes,
    receber,
    pagar,
    sessoes: sessoes.map((s) => ({ status: String(s.status), saldoFinal: s.saldoFinal, saldoContado: s.saldoContado })),
    operacoes,
  }
}

/** Conveniência: carrega fontes reais + monta o DTO. Read-only. */
export async function construirDadosContador(
  storeId: string,
  competencia: Competencia,
): Promise<ContadorDadosReais> {
  const fontes = await carregarFontes(storeId, competencia)
  return montarDados(fontes, competencia)
}
