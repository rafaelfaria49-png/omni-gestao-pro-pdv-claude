/**
 * Contador HUB · contratos de dados reais (GOAL CONTADOR-HUB-DADOS-REAIS-READONLY-006).
 *
 * Gate de honestidade + DTO agregado da competência. Sem IO, React, Prisma ou Fiscal.
 * Toda métrica carrega sua {@link DisponibilidadeDado}: `real` (fonte confiável e completa),
 * `parcial` (fonte existe mas cobertura incompleta — ex.: campo só no payload de parte das
 * vendas) ou `indisponivel` (sem fonte segura nesta fase; nunca virar 0 silencioso).
 *
 * Regras de negócio congeladas (ver docs/contador/CONTADOR_HUB_DADOS_REAIS_READONLY_006.md):
 * - Faturamento = `Venda.total` (exclui canceladas); OS não é somada.
 * - Devolução reduz a competência em que ocorreu (nunca retroage à venda).
 * - Realizados = `MovimentacaoFinanceira`; títulos abertos = `Conta*Titulo` (relatórios separados).
 * - Desconto = `Venda.payload.discountTotal` (informativo/parcial; não subtrai de `total`).
 * - Forma de pagamento = `Venda.payload.paymentBreakdown` (parser defensivo; inválido → não identificado).
 */

export type DisponibilidadeDado = "real" | "parcial" | "indisponivel"

export type DadoMonetario = Readonly<{
  valor: number | null
  disponibilidade: DisponibilidadeDado
  fonte: string
  observacao?: string
}>

export type DadoNumerico = Readonly<{
  valor: number | null
  disponibilidade: DisponibilidadeDado
  fonte: string
  observacao?: string
}>

/** Alerta de qualidade dos dados (ex.: vendas sem forma de pagamento identificada). */
export type AlertaQualidade = Readonly<{
  nivel: "info" | "atencao"
  titulo: string
  detalhe: string
}>

/* ─────────────────────────── Vendas ─────────────────────────── */

export type FormaPagamentoLinha = Readonly<{
  chave: string
  label: string
  valor: number
}>

/**
 * Reconciliação direcional do valor autoritativo das vendas com o breakdown declarado.
 * Residual e excedente são somados por venda, portanto nunca se compensam entre si.
 * `null` no DTO indica falha da fonte Venda, não um conjunto artificial de zeros.
 */
export type ReconciliacaoPagamento = Readonly<{
  totalVendas: number
  totalBreakdown: number
  residualNaoIdentificado: number
  excedenteBreakdown: number
  divergenciaAbsoluta: number
  reconciliado: boolean
}>

export type VendasContador = Readonly<{
  quantidade: DadoNumerico
  total: DadoMonetario
  /** Cancelamentos ocorridos na competência (informativo; já excluídos do total). */
  canceladasQuantidade: DadoNumerico
  canceladasTotal: DadoMonetario
  /** Cobertura do desconto: informativo, nunca subtrai de `total`. */
  descontoTotal: DadoMonetario
  descontoCoberturaQuantidade: DadoNumerico
  /** Quebra por forma de pagamento (payload-derivada). */
  formasPagamento: readonly FormaPagamentoLinha[]
  formaPagamentoDisponibilidade: DisponibilidadeDado
  naoIdentificadoQuantidade: DadoNumerico
  naoIdentificadoValor: DadoMonetario
  divergenciaPagamentoQuantidade: DadoNumerico
  reconciliacaoPagamento: ReconciliacaoPagamento | null
}>

/* ─────────────────────────── Devoluções ─────────────────────────── */

export type DevolucoesContador = Readonly<{
  quantidade: DadoNumerico
  total: DadoMonetario
}>

/* ─────────────────────────── Financeiro ─────────────────────────── */

export type FinanceiroContador = Readonly<{
  entradasRealizadas: DadoMonetario
  saidasRealizadas: DadoMonetario
  /** Estornos classificados à parte (não entram em entradas/saídas). */
  estornos: DadoMonetario
  transferencias: DadoMonetario
  transferenciasQuantidade: DadoNumerico
  naoClassificados: DadoMonetario
  naoClassificadosQuantidade: DadoNumerico
  titulosReceberAberto: DadoMonetario
  titulosReceberQuantidade: DadoNumerico
  titulosPagarAberto: DadoMonetario
  titulosPagarQuantidade: DadoNumerico
}>

/* ─────────────────────────── Caixa ─────────────────────────── */

export type CaixaContador = Readonly<{
  sessoes: DadoNumerico
  sessoesAbertas: DadoNumerico
  sangriasTotal: DadoMonetario
  sangriasQuantidade: DadoNumerico
  suprimentosTotal: DadoMonetario
  suprimentosQuantidade: DadoNumerico
  /** Σ(saldoContado − saldoFinal) das sessões fechadas com ambos os campos. */
  diferencas: DadoMonetario
}>

/* ─────────────────────────── DTO agregado ─────────────────────────── */

export type ContadorDadosReais = Readonly<{
  competencia: Readonly<{ ano: number; mes: number }>
  /** Valor líquido da competência = vendas.total − devoluções.total (sem dupla subtração). */
  liquidoCompetencia: DadoMonetario
  vendas: VendasContador
  devolucoes: DevolucoesContador
  financeiro: FinanceiroContador
  caixa: CaixaContador
  alertas: readonly AlertaQualidade[]
  /** Fiscal permanece atrás de CONTADOR_FISCAL_READER — não consultado nesta fase. */
  fiscal: DadoMonetario
}>

/* ─────────────────────────── construtores ─────────────────────────── */

export function monetarioReal(valor: number, fonte: string, observacao?: string): DadoMonetario {
  return Object.freeze({ valor: arred(valor), disponibilidade: "real" as const, fonte, observacao })
}

export function monetarioParcial(valor: number, fonte: string, observacao: string): DadoMonetario {
  return Object.freeze({ valor: arred(valor), disponibilidade: "parcial" as const, fonte, observacao })
}

export function monetarioIndisponivel(fonte: string, observacao: string): DadoMonetario {
  return Object.freeze({ valor: null, disponibilidade: "indisponivel" as const, fonte, observacao })
}

export function numericoReal(valor: number, fonte: string, observacao?: string): DadoNumerico {
  return Object.freeze({ valor, disponibilidade: "real" as const, fonte, observacao })
}

export function numericoParcial(valor: number, fonte: string, observacao: string): DadoNumerico {
  return Object.freeze({ valor, disponibilidade: "parcial" as const, fonte, observacao })
}

export function numericoIndisponivel(fonte: string, observacao: string): DadoNumerico {
  return Object.freeze({ valor: null, disponibilidade: "indisponivel" as const, fonte, observacao })
}

/** Arredonda em 2 casas evitando ruído de ponto flutuante. */
export function arred(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
