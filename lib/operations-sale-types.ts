/** Tipos compartilhados entre PDV (client) e rotas `/api/ops/vendas-*` (server). */

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
}

export interface SaleRecord {
  id: string
  at: string
  lines: SaleLineRecord[]
  total: number
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
  /** Auditoria: supervisor/admin que autorizou desconto manual (id local quando disponível). */
  discountAuthorizedByAdminId?: string
  /** Desconto manual no checkout (somente auditoria). */
  discountReais?: number
  /** Desconto manual no checkout (somente auditoria). */
  discountPercent?: number
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
}
