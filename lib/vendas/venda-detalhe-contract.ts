/**
 * Contrato de leitura da venda — resposta de `GET /api/vendas/[id]` (e `?full=1`).
 *
 * Fonte ÚNICA do read-model consumido pelo Histórico de Vendas e pela Conferência do
 * Fechamento de Caixa (GOAL CAIXA-CONFERENCIA-VENDAS-ACOES-REAIS-007). Antes deste
 * arquivo o tipo vivia apenas dentro de `vendas-arquivo-geral.tsx`; a Conferência
 * precisava dos MESMOS campos e copiá-los criaria um segundo contrato divergente.
 *
 * Só descreve o que a rota realmente devolve. Campo que a rota não grava não entra
 * aqui — a UI mostra "não registrado" em vez de inventar.
 */

/** Item da venda. `acessorio` só existe quando houve seleção de modelo/cor (004C). */
export type VendaDetalheItem = {
  id: string
  inventoryId?: string | null
  nome: string
  quantidade: number
  precoUnitario: number
  lineTotal: number
  metadata?: unknown
  acessorio?: { modelLabel?: string; colorLabel?: string }
}

/** Devolução vinculada à venda (`DevolucaoVenda` + itens). */
export type VendaDetalheDevolucao = {
  id: string
  localId: string
  at: string
  tipo: string
  valorTotal: number
  creditoEmitido: number
  operador: string
  motivo: string
  modo?: string | null
  novaVendaId?: string | null
  itens: Array<{ nome: string; quantidade: number; valorTotal: number }>
}

/** Correção registrada em `payload.correcoes[]`. */
export type VendaDetalheCorrecao = {
  at: string
  operador: string
  motivo: string
  campos: string[]
  pagamentoAnterior?: string
  pagamentoNovo?: string
  clienteAnterior?: string | null
  clienteNovo?: string | null
  observacaoAnterior?: string | null
  observacaoNova?: string | null
  supervisorNome?: string
}

/** Movimentação do ledger financeiro ligada à venda (só com `?full=1`). */
export type VendaDetalheMovimentacao = {
  id: string
  tipo: string
  origem: string
  valor: number
  descricao: string
  createdAt: string
}

/** Título de Contas a Receber da venda à prazo (só com `?full=1`). */
export type VendaDetalheTitulo = {
  id: string
  localKey: string
  descricao: string
  cliente: string
  valor: number
  vencimento: string
  status: string
  /** Soma de `payload.historico[]` de pagamentos — quanto já foi recebido. */
  pago: number
  createdAt: string
}

/** Sessão de caixa em que a venda ocorreu (só com `?full=1`). */
export type VendaDetalheSessao = {
  id: string
  operador: string
  status: string
  abertaEm: string
  fechadaEm: string | null
  saldoInicial: number
  terminalId: string | null
}

export type VendaDetalhe = {
  /** Número comercial (`pedidoId`) — ex.: VDA-L01-2026-000407. */
  id: string
  /** Id técnico da linha (`Venda.id`, cuid). */
  dbId: string
  at: string
  clienteNome: string | null
  clienteId: string | null
  clienteCpf: string | null
  total: number
  desconto: number
  cashTendered: number | null
  status: string
  operador: string | null
  canceladaEm: string | null
  canceladaPor: string | null
  motivoCancelamento: string | null
  estoqueReposto?: boolean
  estornoFinanceiro?: boolean
  sessaoId: string | null
  terminalId?: string | null
  terminal?: { id: string; code: string; name: string } | null
  observacao: string | null
  /**
   * Presente só quando a venda nasceu de uma recuperação de quarentena. Guarda o
   * número ANTIGO como auditoria — a identidade atual continua sendo `id`.
   */
  recovery?: {
    recoveredFromPedidoId: string
    recoveredAt: string | null
    motivo: string | null
    conflictCode: string | null
  } | null
  correcoes: VendaDetalheCorrecao[]
  pagamentos: Array<{ label: string; valor: number }>
  itens: VendaDetalheItem[]
  devolucoes: VendaDetalheDevolucao[]
  // ── Enriquecimento `?full=1` (somente leitura) ───────────────────────────────
  sessao?: VendaDetalheSessao | null
  movimentacoesFinanceiras?: VendaDetalheMovimentacao[]
  titulos?: VendaDetalheTitulo[]
  statusFinanceiro?: string
  clienteCompleto?: {
    id: string
    name: string
    document: string | null
    phone: string | null
  } | null
}

/** URL canônica do detalhe. `full` liga o enriquecimento Enterprise (read-only). */
export function vendaDetalheUrl(pedidoId: string, full = false): string {
  return `/api/vendas/${encodeURIComponent(pedidoId)}${full ? "?full=1" : ""}`
}
