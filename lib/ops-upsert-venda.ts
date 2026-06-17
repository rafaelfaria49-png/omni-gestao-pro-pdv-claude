import type { Prisma } from "@/generated/prisma"
import { isVirtualSaleLine } from "@/lib/os-pdv-virtual-lines"
import type { PaymentBreakdownFull } from "@/lib/operations-sale-types"

/**
 * Lançada pela baixa de estoque do PDV quando `enforceStock` está ativo e o saldo
 * do produto não cobre a quantidade vendida (anti-negativo / anti-oversell — DT-B).
 * O caller (rota `venda-persist`) traduz para HTTP 409 explícito.
 */
export class InsufficientStockError extends Error {
  readonly code = "ESTOQUE_INSUFICIENTE"
  readonly produtoId: string
  readonly produtoNome: string
  readonly disponivel: number
  readonly solicitado: number
  constructor(produtoId: string, produtoNome: string, disponivel: number, solicitado: number) {
    super(
      `Estoque insuficiente para "${produtoNome}": disponível ${disponivel}, solicitado ${solicitado}.`,
    )
    this.name = "InsufficientStockError"
    this.produtoId = produtoId
    this.produtoNome = produtoNome
    this.disponivel = disponivel
    this.solicitado = solicitado
  }
}

export type UpsertVendaOptions = {
  /**
   * Quando `true`, a baixa de estoque bloqueia qualquer decremento que deixaria o saldo
   * negativo, falhando com `InsufficientStockError`. Usado no fluxo PDV ao vivo
   * (`/api/ops/venda-persist`). O replay legado (`/api/ops/sync-legacy-vendas`) mantém
   * o default `false` para não quebrar a importação histórica.
   */
  enforceStock?: boolean
}

export type SalePayload = {
  id?: string
  at?: string
  total?: number
  customerName?: string
  /** CPF/CNPJ somente dígitos — usado para debitar ClienteCredito quando creditoVale > 0. */
  customerCpf?: string
  /** FK real para Cliente (cuid). Nulo em consumidor final. */
  clienteId?: string
  /** Operador/caixa que realizou a venda (extraído de SaleRecord.cashierId). */
  cashierId?: string
  /**
   * Terminal PDV (PDV1, PDV2...) em que a venda foi feita. Fase 1: persiste apenas no
   * `Venda.payload` (este campo) — a coluna `Venda.terminalId` é preparada no schema
   * para a Fase 2 (filtros/relatórios por terminal via SQL).
   */
  terminalId?: string | null
  /** Formas de pagamento — usado para gerar MovimentacaoFinanceira por forma. */
  paymentBreakdown?: Partial<PaymentBreakdownFull>
  /** Configuração de parcelamento para venda à prazo. */
  aPrazoConfig?: {
    parcelas?: number
    primeiroVencimento?: string // DD/MM/YYYY
    intervalDias?: number
    /** Observação opcional do operador (espelhada no payload do título). */
    observacao?: string
  }
  lines?: Array<{
    inventoryId?: string
    name?: string
    quantity?: number
    unitPrice?: number
    lineTotal?: number
    qtyReturned?: number
    /** Item avulso (Venda Avulsa via INSERT no PDV) — não baixa estoque. */
    isAvulso?: boolean
    /** Custo unitário opcional informado no balcão para relatórios de margem. */
    custoUnitario?: number | null
  }>
}

function asJsonPayload(sale: SalePayload): Prisma.InputJsonValue {
  return sale as unknown as Prisma.InputJsonValue
}

function arredonda2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
}

/** Valida FK de Cliente — evita P2003 quando o PDV envia id stale/outra loja. */
async function resolveClienteIdForStore(
  tx: Prisma.TransactionClient,
  lojaId: string,
  rawClienteId: string | null,
  pedidoId: string,
): Promise<string | null> {
  if (!rawClienteId) return null
  const found = await tx.cliente.findFirst({
    where: { id: rawClienteId, storeId: lojaId },
    select: { id: true },
  })
  if (!found) {
    console.warn(
      "[upsert-venda] clienteId-ignorado",
      JSON.stringify({ pedidoId, lojaId, clienteId: rawClienteId }),
    )
    return null
  }
  return found.id
}

/** Upsert de uma venda PDV + itens + ledger de estoque + movimentação financeira. */
export async function upsertVendaInTransaction(
  tx: Prisma.TransactionClient,
  lojaId: string,
  sale: SalePayload,
  operadorLabel?: string,
  options?: UpsertVendaOptions
): Promise<void> {
  const enforceStock = options?.enforceStock === true
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

  const rawClienteId =
    typeof sale.clienteId === "string" && sale.clienteId.trim() ? sale.clienteId.trim() : null
  const clienteId = await resolveClienteIdForStore(tx, lojaId, rawClienteId, pedidoId)

  const operador =
    operadorLabel?.trim() ||
    (typeof sale.cashierId === "string" && sale.cashierId.trim() ? sale.cashierId.trim() : null)

  const terminalId =
    typeof sale.terminalId === "string" && sale.terminalId.trim() ? sale.terminalId.trim() : null

  const lines = Array.isArray(sale.lines) ? sale.lines : []

  // ── 1. Upsert Venda ─────────────────────────────────────────────────────────
  // Multi-Terminais Fase 3: também popula a coluna `Venda.terminalId` (além do payload)
  // para permitir filtros SQL por terminal nos relatórios. Tudo nullable —
  // vendas sem terminal selecionado ou anteriores à feature continuam funcionando.
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
      ...(terminalId ? { terminalId } : {}),
    },
    update: {
      storeId: lojaId,
      payload: asJsonPayload(sale),
      total,
      at,
      clienteNome,
      ...(clienteId ? { clienteId } : {}),
      ...(operador ? { operador } : {}),
      ...(terminalId ? { terminalId } : {}),
    },
  })

  // ── 2. ItemVenda (recria para idempotência) + resolução de produto ───────────
  // inventoryId vindo do PDV pode ser SKU ou cuid; resolvemos via OR lookup e
  // armazenamos o cuid real em ItemVenda.inventoryId e no cache para o Step 3.
  await tx.itemVenda.deleteMany({ where: { vendaId: v.id } })

  type ResolvedProduct = {
    dbId: string
    stock: number
    precoCusto: number
    sku: string | null
    name: string
  }
  const resolvedProductMap = new Map<string, ResolvedProduct>()

  for (const line of lines) {
    const rawInvId = typeof line.inventoryId === "string" ? line.inventoryId.trim() : null
    const nome = typeof line.name === "string" ? line.name : ""
    const qRaw = typeof line.quantity === "number" && Number.isFinite(line.quantity) ? line.quantity : 0
    const quantidade = Math.max(0, Math.min(2_000_000_000, Math.round(qRaw)))
    const precoUnitario =
      typeof line.unitPrice === "number" && Number.isFinite(line.unitPrice) ? line.unitPrice : 0
    const lineTotal =
      typeof line.lineTotal === "number" && Number.isFinite(line.lineTotal)
        ? line.lineTotal
        : Math.round(precoUnitario * quantidade * 100) / 100

    // Resolve produto real via OR (id | sku | barcode); evita busca duplicada por linha
    if (rawInvId && !isVirtualSaleLine(rawInvId) && !resolvedProductMap.has(rawInvId)) {
      const produto = await tx.produto.findFirst({
        where: {
          storeId: lojaId,
          OR: [{ id: rawInvId }, { sku: rawInvId }, { barcode: rawInvId }],
        },
        select: { id: true, stock: true, precoCusto: true, sku: true, name: true },
      })
      if (produto) {
        resolvedProductMap.set(rawInvId, {
          dbId: produto.id,
          stock: produto.stock,
          precoCusto: produto.precoCusto,
          sku: produto.sku ?? null,
          name: produto.name,
        })
      }
    }

    // Usa o cuid real do banco; preserva rawInvId para linhas virtuais/serviço
    const resolvedProduct = rawInvId ? resolvedProductMap.get(rawInvId) : undefined
    const inventoryId = resolvedProduct ? resolvedProduct.dbId : rawInvId

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
  // Agrega quantidade total por produto antes de criar o ledger.
  // Isso garante que 2 linhas de qty=1 para o mesmo produto gerem um único
  // decremento de qty=2, e que retry da mesma venda seja bloqueado pelo guard.
  const qtyByProdutoId = new Map<string, number>()
  const unresolvedInventoryIds: string[] = []
  for (const line of lines) {
    const rawInvId = typeof line.inventoryId === "string" ? line.inventoryId.trim() : ""
    if (!rawInvId || isVirtualSaleLine(rawInvId)) continue
    const resolved = resolvedProductMap.get(rawInvId)
    if (!resolved) {
      // Item vendido referencia inventoryId sem casamento por id/sku/barcode.
      // Causa típica: produto removido após cache do PDV ou SKU divergente. Sem ledger.
      unresolvedInventoryIds.push(rawInvId)
      continue
    }
    const qty = Math.max(0, Math.round(typeof line.quantity === "number" ? line.quantity : 0))
    if (qty === 0) continue
    qtyByProdutoId.set(resolved.dbId, (qtyByProdutoId.get(resolved.dbId) ?? 0) + qty)
  }
  if (unresolvedInventoryIds.length > 0) {
    console.warn(
      "[upsert-venda] estoque-nao-baixado",
      JSON.stringify({ pedidoId, lojaId, unresolvedInventoryIds }),
    )
  }

  // Mapa reverso dbId → resolved (para acessar sku/nome)
  const resolvedByDbId = new Map<string, ResolvedProduct>()
  for (const resolved of resolvedProductMap.values()) {
    resolvedByDbId.set(resolved.dbId, resolved)
  }

  for (const [produtoId, qty] of qtyByProdutoId) {
    const resolved = resolvedByDbId.get(produtoId)
    if (!resolved) continue

    // Idempotência: bloqueia retry da mesma venda (mesmo pedidoId + produto)
    const jaExiste = await tx.movimentacaoEstoque.findFirst({
      where: { storeId: lojaId, documento: pedidoId, produtoId, origem: "pdv" },
      select: { id: true },
    })
    if (jaExiste) continue

    // Re-lê stock atual dentro da transação para estoqueAntes preciso
    const produtoAtual = await tx.produto.findUnique({
      where: { id: produtoId },
      select: { stock: true, precoCusto: true },
    })
    if (!produtoAtual) continue

    const estoqueAntes = produtoAtual.stock
    const custo = arredonda2(Math.max(0, produtoAtual.precoCusto))

    if (enforceStock) {
      // Baixa atômica anti-negativo (DT-B): o predicado `stock >= qty` faz parte do
      // WHERE do UPDATE, reavaliado sob lock de linha pelo Postgres. Dois caixas
      // vendendo o mesmo SKU em paralelo serializam na linha — a 2ª transação que
      // não encontrar saldo retorna `count = 0` e falha de forma explícita, sem
      // nunca deixar `Produto.stock` abaixo de zero.
      const baixa = await tx.produto.updateMany({
        where: { id: produtoId, storeId: lojaId, stock: { gte: qty } },
        data: { stock: { decrement: qty } },
      })
      if (baixa.count === 0) {
        // Rollback de toda a transação da venda (atomicidade do $transaction).
        throw new InsufficientStockError(produtoId, resolved.name, estoqueAntes, qty)
      }
    } else {
      await tx.produto.update({
        where: { id: produtoId },
        data: { stock: { decrement: qty } },
      })
    }

    await tx.movimentacaoEstoque.create({
      data: {
        storeId: lojaId,
        produtoId,
        produtoSku: resolved.sku ?? null,
        produtoNome: resolved.name,
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
      // createdAt = at (data real da venda no cliente). Sem isso, vendas offline
      // sincronizadas tardiamente cairiam na sessão de caixa errada — a query de
      // sessao-detalhe/fechamento filtra MovimentacaoFinanceira por createdAt entre
      // SessaoCaixa.abertaEm e fechadaEm.
      await tx.movimentacaoFinanceira.create({
        data: {
          storeId: lojaId,
          tipo: "entrada",
          valor: valorImediato,
          descricao: `Venda PDV ${pedidoId}${sufixoCliente}`,
          origem: "venda",
          referenciaId: pedidoId,
          createdAt: at,
        },
      })
    }
  }

  // ── 5. Debitar ClienteCredito (quando creditoVale foi usado na venda) ─────────
  // Dentro da mesma transação: se falhar, a venda inteira reverte — sem crédito perdido.
  const creditoValeUsado = arredonda2(pb?.creditoVale ?? 0)
  const cpfNorm = typeof sale.customerCpf === "string" ? sale.customerCpf.replace(/\D/g, "") : ""
  if (creditoValeUsado > 0 && cpfNorm) {
    const creditos = await tx.clienteCredito.findMany({
      where: { storeId: lojaId, clienteDoc: cpfNorm, status: "ativo", saldoAtual: { gt: 0 } },
      orderBy: { createdAt: "asc" },
    })
    let restante = creditoValeUsado
    for (const c of creditos) {
      if (restante <= 0.001) break
      const debit = arredonda2(Math.min(c.saldoAtual, restante))
      if (debit <= 0) continue
      const saldoAntes = c.saldoAtual
      const saldoDepois = arredonda2(c.saldoAtual - debit)
      await tx.clienteCredito.update({
        where: { id: c.id },
        data: {
          saldoAtual: saldoDepois,
          status: saldoDepois <= 0.001 ? "zerado" : "ativo",
        },
      })
      await tx.usoCreditoCliente.create({
        data: {
          creditoId: c.id,
          storeId: lojaId,
          vendaId: pedidoId,
          valor: debit,
          saldoAntes,
          saldoDepois,
          operador: operadorLabel ?? "",
        },
      })
      restante = arredonda2(restante - debit)
    }
    if (restante > 0.001) {
      console.warn("[upsert-venda] credito-sub-debitado", { pedidoId, cpfNorm, creditoValeUsado, restante })
    }
  }

  // ── 6. Título(s) à prazo (Contas a Receber) — DENTRO da transação ───────────
  // Cria um ContaReceberTitulo por parcela. Se não há config de parcelamento,
  // cria título único com vencimento em 30 dias (comportamento anterior).
  // localKey por parcela (`pdv-aprazo-{pedidoId}` ou `pdv-aprazo-{pedidoId}-{n}`)
  // garante idempotência em retries.
  if (aPrazoVal > 0) {
    const cfg = sale.aPrazoConfig
    const parcelas = Math.max(1, Math.min(24, Number(cfg?.parcelas) || 1))
    const intervalDias = Math.max(1, Number(cfg?.intervalDias) || 30)
    const aprazoCliente = clienteNome || "Cliente"
    const aprazoObs =
      typeof cfg?.observacao === "string" && cfg.observacao.trim()
        ? cfg.observacao.trim().slice(0, 500)
        : null

    // Resolve primeiro vencimento (DD/MM/YYYY → Date)
    let primeiroVenc: Date
    if (cfg?.primeiroVencimento) {
      const parts = cfg.primeiroVencimento.split("/")
      if (parts.length === 3) {
        const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]))
        primeiroVenc = isNaN(d.getTime()) ? new Date(at.getTime() + intervalDias * 86_400_000) : d
      } else {
        primeiroVenc = new Date(at.getTime() + intervalDias * 86_400_000)
      }
    } else {
      primeiroVenc = new Date(at.getTime() + intervalDias * 86_400_000)
    }

    const valorBase = arredonda2(aPrazoVal / parcelas)
    // Captura o id do primeiro título (n=1) para vincular em Venda.contaReceberTituloId.
    // O cancelamento da venda varre TODOS os títulos via `localKey startsWith pdv-aprazo-${pedidoId}`,
    // então o vínculo singular aqui é apenas indicação rápida para UI/relatórios.
    let firstTituloId: string | null = null
    for (let n = 1; n <= parcelas; n++) {
      // Última parcela absorve arredondamento
      const valorParcela = n === parcelas ? arredonda2(aPrazoVal - valorBase * (parcelas - 1)) : valorBase
      const aprazoLocalKey = parcelas === 1 ? `pdv-aprazo-${pedidoId}` : `pdv-aprazo-${pedidoId}-${n}`
      const vencDate = new Date(primeiroVenc)
      vencDate.setDate(vencDate.getDate() + (n - 1) * intervalDias)
      const vencStr = vencDate.toLocaleDateString("pt-BR")
      const aprazoDesc =
        parcelas === 1
          ? `Venda PDV ${pedidoId} — À prazo`
          : `Venda PDV ${pedidoId} — À prazo ${n}/${parcelas}`

      const aprazoPayload = {
        id: aprazoLocalKey,
        descricao: aprazoDesc,
        cliente: aprazoCliente,
        valor: valorParcela,
        vencimento: vencStr,
        status: "pendente",
        tipo: "pdv_aprazo",
        total_value: aPrazoVal,
        numeroParcela: n,
        totalParcelas: parcelas,
        ...(aprazoObs ? { observacao: aprazoObs } : {}),
        vendas: [{ saleId: pedidoId, total: aPrazoVal }],
      } as unknown as Prisma.InputJsonValue

      const upserted = await tx.contaReceberTitulo.upsert({
        where: { storeId_localKey: { storeId: lojaId, localKey: aprazoLocalKey } },
        create: {
          storeId: lojaId,
          localKey: aprazoLocalKey,
          descricao: aprazoDesc,
          cliente: aprazoCliente,
          valor: valorParcela,
          vencimento: vencStr,
          status: "pendente",
          payload: aprazoPayload,
        },
        // `status` fora do update para preservar baixas/pagamentos já feitos em re-sync.
        update: {
          descricao: aprazoDesc,
          cliente: aprazoCliente,
          valor: valorParcela,
          vencimento: vencStr,
          payload: aprazoPayload,
        },
        select: { id: true },
      })
      if (n === 1) firstTituloId = upserted.id
    }

    // Vincula a FK na venda (idempotente — re-sync aponta para o mesmo id pelo localKey único).
    if (firstTituloId) {
      await tx.venda.update({
        where: { id: v.id },
        data: { contaReceberTituloId: firstTituloId },
      })
    }
  }
}
