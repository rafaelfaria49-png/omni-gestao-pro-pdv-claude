/** Tipos compartilhados entre PDV (client) e rotas `/api/ops/vendas-*` (server). */

export interface APrazoConfig {
  parcelas: number           // 1-24, default 1
  primeiroVencimento: string // DD/MM/YYYY
  intervalDias: number       // default 30
}

export interface PaymentBreakdownFull {
  dinheiro: number
  pix: number
  cartaoDebito: number
  cartaoCredito: number
  carne: number
  /** Valor faturado “à prazo” (conta do cliente / título em Contas a Receber). */
  aPrazo: number
  creditoVale: number
}

export interface SaleLineRecord {
  inventoryId: string
  name: string
  quantity: number
  unitPrice: number
  lineTotal: number
  qtyReturned?: number
  /**
   * `true` quando o item não veio do catálogo (Venda Avulsa via tecla INSERT no PDV).
   * Avulsos não baixam estoque e não exigem `Produto` resolvido no banco.
   * Persistido também em `Venda.payload.lines[]` para auditoria/relatórios.
   */
  isAvulso?: boolean
  /**
   * Custo unitário informado pelo operador no momento da venda avulsa.
   * Opcional: `null` ou ausente = custo desconhecido (não assumir lucro 100%).
   * Não há coluna `custoUnitario` em `ItemVenda` — o valor vive em `Venda.payload`.
   */
  custoUnitario?: number | null
}

export interface SaleRecord {
  id: string
  at: string
  lines: SaleLineRecord[]
  total: number
  /** Status da venda conforme coluna `Venda.status` no banco. Ausente = legado (tratar como concluida). */
  status?: "concluida" | "cancelada" | "parcialmente_devolvida" | "devolvida"
  /** Total de descontos aplicados na venda (quando persistido pelo PDV). */
  discountTotal?: number
  customerCpf?: string
  customerName?: string
  /** FK real para Cliente (cuid). Nulo em consumidor final ou vendas antigas. */
  clienteId?: string
  paymentBreakdown: PaymentBreakdownFull
  /** Auditoria: operador do caixa (id local do dispositivo). */
  cashierId?: string
  /** Sessão de caixa ativa no momento da venda (persiste no payload JSON da Venda). */
  sessaoId?: string
  /** Terminal PDV (PDV1, PDV2...) em que a venda foi feita (persiste no payload JSON da Venda). */
  terminalId?: string
  /** Auditoria: supervisor/admin que autorizou desconto manual (id local quando disponível). */
  discountAuthorizedByAdminId?: string
  /** Desconto manual no checkout (somente auditoria). */
  discountReais?: number
  /** Desconto manual no checkout (somente auditoria). */
  discountPercent?: number
  /** Configuração de parcelamento para venda à prazo. */
  aPrazoConfig?: APrazoConfig
  /** true = venda gravada localmente mas ainda não confirmada no Prisma. */
  syncPending?: boolean
}

export interface DevolucaoRecord {
  id: string
  at: string
  saleId: string
  customerCpf: string
  customerName: string
  lines: { inventoryId: string; name: string; quantity: number; valor: number }[]
  mode: "vale_credito" | "somente_estoque"
  creditIssued: number
  /** true = devolução gravada localmente mas ainda não confirmada no servidor. */
  syncPending?: boolean
  /** Sessão de caixa ativa no momento da devolução. */
  sessaoId?: string
  /** Tipo detalhado de devolução para a API. */
  tipo?: "vale_credito" | "somente_estoque" | "troca" | "devolucao"
  motivo?: string
  observacao?: string
  payload?: any
}

export interface CaixaOperacaoRecord {
  id: string // localId
  at: string // timestamp
  sessaoId: string
  tipo: "sangria" | "suprimento"
  valor: number
  motivo: string
  operador?: string
  syncPending?: boolean
}
