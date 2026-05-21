import type { Prisma } from "@/generated/prisma"
import { isOsVirtualSaleLine } from "@/lib/os-pdv-virtual-lines"
import type { PaymentBreakdownFull } from "@/lib/operations-sale-types"

export type SalePayload = {
  id?: string
  at?: string
  total?: number
  customerName?: string
  /** FK real para Cliente (cuid). Nulo em consumidor final. */
  clienteId?: string
  /** Operador/caixa que realizou a venda (extraído de SaleRecord.cashierId). */
  cashierId?: string
  /** Formas de pagamento — usado para gerar MovimentacaoFinanceira por forma. */
  paymentBreakdown?: Partial<PaymentBreakdownFull>
  lines?: Array<{
    inventoryId?: string
    name?: string
    quantity?: number
    unitPrice?: number
    lineTotal?: number
    qtyReturned?: number
  }>
}

function asJsonPayload(sale: SalePayload): Prisma.InputJsonValue {
  return sale as unknown as Prisma.InputJsonValue
}

function arredonda2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
}

/** Upsert de uma venda PDV + itens + ledger de estoque + movimentação financeira. */
export async function upsertVendaInTransaction(
  tx: Prisma.TransactionClient,
  lojaId: string,
  sale: SalePayload,
  operadorLabel?: string
): Promise<void> {
  const pedidoId = typeof sale.id === "string" && sale.id.trim() ? sale.id.trim() : ""
  if (!pedidoId) throw new Error("sale.id inválido")

  const total = typeof sale.total === "number" && Number.isFinite(sale.total) ? sale.total : 0
  let at: Date
  try {
    at = sale.at ? new Date(sale.at) : new Date()
    if (Number.isNaN(at.getTime())) at = new Date()
  } catch {
    at = new Date()
  }

  const clienteNome =
    typeof sale.customerName === "string" && sale.customerName.trim() ? sale.customerName.trim() : null

  const clienteId =
    typeof sale.clienteId === "string" && sale.clienteId.trim() ? sale.clienteId.trim() : null

  const operador =
    operadorLabel?.trim() ||
    (typeof sale.cashierId === "string" && sale.cashierId.trim() ? sale.cashierId.trim() : null)

  const lines = Array.isArray(sale.lines) ? sale.lines : []

  // ── 1. Upsert Venda ─────────────────────────────────────────────────────────
  const v = await tx.venda.upsert({
    where: { pedidoId },
    create: {
      storeId: lojaId,
      pedidoId,
      payload: asJsonPayload(sale),
      total,
      at,
      clienteNome,
      clienteId,
      operador,
    },
    update: {
      storeId: lojaId,
      payload: asJsonPayload(sale),
      total,
      at,
      clienteNome,
      ...(clienteId ? { clienteId } : {}),
      ...(operador ? { operador } : {}),
    },
  })

  // ── 2. ItemVenda (recria para idempotência) ──────────────────────────────────
  await tx.itemVenda.deleteMany({ where: { vendaId: v.id } })

  for (const line of lines) {
    const inventoryId = typeof line.inventoryId === "string" ? line.inventoryId : null
    const nome = typeof line.name === "string" ? line.name : ""
    const qRaw = typeof line.quantity === "number" && Number.isFinite(line.quantity) ? line.quantity : 0
    const quantidade = Math.max(0, Math.min(2_000_000_000, Math.round(qRaw)))
    const precoUnitario =
      typeof line.unitPrice === "number" && Number.isFinite(line.unitPrice) ? line.unitPrice : 0
    const lineTotal =
      typeof line.lineTotal === "number" && Number.isFinite(line.lineTotal)
        ? line.lineTotal
        : Math.round(precoUnitario * quantidade * 100) / 100

    await tx.itemVenda.create({
      data: {
        vendaId: v.id,
        inventoryId,
        nome,
        quantidade,
        precoUnitario,
        lineTotal,
      },
    })
  }

  // ── 3. MovimentacaoEstoque (saída PDV) ──────────────────────────────────────
  // Idempotência: verifica se já existe ledger para este pedidoId antes de criar.
  // Impede dupla baixa em caso de retry da rota.
  for (const line of lines) {
    const invId = typeof line.inventoryId === "string" ? line.inventoryId.trim() : ""
    if (!invId || isOsVirtualSaleLine(invId)) continue

    const qty = Math.max(0, Math.round(typeof line.quantity === "number" ? line.quantity : 0))
    if (qty === 0) continue

    const jaExiste = await tx.movimentacaoEstoque.findFirst({
      where: { storeId: lojaId, documento: pedidoId, produtoId: invId, origem: "pdv" },
      select: { id: true },
    })
    if (jaExiste) continue

    const produto = await tx.produto.findFirst({
      where: { id: invId, storeId: lojaId },
      select: { stock: true, precoCusto: true, sku: true, name: true },
    })
    if (!produto) continue

    const estoqueAntes = produto.stock
    const custo = arredonda2(Math.max(0, produto.precoCusto))

    await tx.produto.update({
      where: { id: invId },
      data: { stock: { decrement: qty } },
    })

    await tx.movimentacaoEstoque.create({
      data: {
        storeId: lojaId,
        produtoId: invId,
        produtoSku: produto.sku ?? null,
        produtoNome: produto.name,
        tipo: "saida",
        origem: "pdv",
        quantidade: -qty,
        estoqueAntes,
        estoqueDepois: estoqueAntes - qty,
        custoUnitario: custo,
        custoMedioAntes: custo,
        custoMedioDepois: custo,
        valorTotal: arredonda2(qty * custo),
        documento: pedidoId,
        motivo: pedidoId,
        usuario: operador,
      },
    })
  }

  // ── 4. MovimentacaoFinanceira (receita à vista PDV) ─────────────────────────
  // aPrazo já vira ContaReceberTitulo no cliente — não duplicar aqui.
  // creditoVale é abatimento de saldo existente — não é receita nova.
  const pb = sale.paymentBreakdown
  const aPrazoVal = typeof pb?.aPrazo === "number" && pb.aPrazo > 0 ? pb.aPrazo : 0
  const valorImediato = arredonda2(total - aPrazoVal)

  if (valorImediato > 0) {
    const dupFinanceiro = await tx.movimentacaoFinanceira.findFirst({
      where: { storeId: lojaId, referenciaId: pedidoId, origem: "venda", tipo: "entrada" },
      select: { id: true },
    })
    if (!dupFinanceiro) {
      const sufixoCliente =
        typeof sale.customerName === "string" && sale.customerName.trim()
          ? ` — ${sale.customerName.trim().slice(0, 80)}`
          : ""
      await tx.movimentacaoFinanceira.create({
        data: {
          storeId: lojaId,
          tipo: "entrada",
          valor: valorImediato,
          descricao: `Venda PDV ${pedidoId}${sufixoCliente}`,
          origem: "venda",
          referenciaId: pedidoId,
        },
      })
    }
  }
}
