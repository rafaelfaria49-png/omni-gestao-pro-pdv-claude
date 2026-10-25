/**
 * CAD-R2-009 — Stock/Ledger boundary canônico (server-only).
 *
 * VERDADE DE DADOS (não cria quarta verdade):
 * - `Produto.stock` = saldo operacional agregado / cache da loja;
 * - `ProdutoDeposito.quantidade` = saldo físico por depósito;
 * - `MovimentacaoEstoque` = livro-razão append-only.
 * Invariante: SUM(ProdutoDeposito) == Produto.stock após toda mutation canônica.
 *
 * GARANTIAS (todas na MESMA transação):
 * - lock de linha `SELECT ... FOR UPDATE` por produto (serializa concorrentes);
 * - ownership produto+depósito por storeId (FAIL CLOSED, anti-IDOR/cross-store);
 * - idempotência DB-forte via @@unique([storeId, idempotencyKey]) + conflito semântico;
 * - saída bloqueada quando agregado ou depósito insuficientes (sem negativo);
 * - custo médio ponderado só em entrada com custo > 0; saída/ajuste preservam;
 * - ledger append-only com snapshots; reversão = linha compensatória;
 * - drift legado (SUM != stock com rows existentes) falha, nunca corrige
 *   — exceto (a) saída PDV com `realinharDepositoAoStock` quando a autoridade
 *   é comprovável (livro, bootstrap-zero, overhang no único depósito com saldo,
 *   cache obsoleto); distribuição ambígua entre depósitos positivos não repara;
 *   (b) entrada humana com a mesma flag, porém sem haircut PDV sem livro —
 *   reconcilia o baseline comprovado, depois aplica a mercadoria nova;
 *   (c) ajuste humano explícito que fecha o depósito alvo em
 *   `novoSaldo - SUM(outros)` quando esse residual cabe (senão 409).
 *   Correção estrutural e operação comercial são ledger separados na mesma tx.
 *
 * COMPOSIÇÃO: `applyStockMutationTx(tx, ...)` participa da transação maior do
 * caller (venda/OS/cancelamento/devolução) — NUNCA abre nested transaction.
 * `applyStockMutation(...)` abre a sua própria transação quando o caller não tem.
 */
import "server-only"

import type { Prisma } from "@/generated/prisma"
import { prisma } from "@/lib/prisma"
import { ensureDepositoPrincipal } from "@/lib/estoque/deposito-core"
import {
  normalizeStockCommand,
  stockCommandTipo,
  StockIdempotency,
  stockFail,
  type NormalizedStockCommand,
  type StockLedgerCommand,
  type StockLedgerContext,
  type StockLedgerResult,
} from "@/lib/estoque/stock-ledger-contract"
import {
  classifyStockDriftForUnit,
  isProvenEntradaBaselineRepair,
  isProvenStructuralRepair,
  STOCK_DRIFT_REASON,
  stockDriftFailMessage,
  toStockDriftDetails,
  type StockDriftClassification,
} from "@/lib/estoque/stock-drift-reconcile"
import {
  fromStockUnits,
  MAX_STOCK_UNITS,
  stockUnitFromMetadata,
  toStockUnits,
  type StockUnit,
} from "@/lib/estoque/stock-quantity"

/** Subconjunto do TransactionClient usado pelo boundary (falsificável em testes). */
export type StockLedgerTx = {
  $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>
  produto: {
    findFirst(args: unknown): Promise<{
      id: string
      name: string
      sku: string | null
      stock: number
      precoCusto: number
      metadata?: unknown
    } | null>
    findUnique(args: unknown): Promise<{ id: string; storeId: string } | null>
    update(args: unknown): Promise<unknown>
  }
  deposito: {
    findFirst(args: unknown): Promise<{ id: string; storeId: string } | null>
    findUnique(args: unknown): Promise<{ id: string; storeId: string } | null>
    create(args: unknown): Promise<{ id: string; storeId: string }>
  }
  produtoDeposito: {
    findMany(args: unknown): Promise<Array<{ depositoId: string; quantidade: number }>>
    upsert(args: unknown): Promise<unknown>
  }
  movimentacaoEstoque: {
    findFirst(args: unknown): Promise<{
      id: string
      tipo: string
      produtoId: string | null
      quantidade: number
      documento: string | null
      motivo: string | null
      custoUnitario: number
      estoqueAntes: number
      estoqueDepois: number
      custoMedioAntes: number
      custoMedioDepois: number
    } | null>
    create(args: unknown): Promise<{ id: string }>
  }
}

type DbLike = {
  $transaction<T>(fn: (tx: StockLedgerTx) => Promise<T>): Promise<T>
}

function arredonda2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
}

/** Unidades mínimas que fazem ida e volta exata pelo double (ver `stock-quantity.ts`). */
function dentroDoLimite(units: number): boolean {
  return Number.isSafeInteger(units) && Math.abs(units) <= MAX_STOCK_UNITS
}

function trustedStoreId(ctx: StockLedgerContext | null | undefined): string | null {
  const sid = (ctx?.storeId ?? "").trim()
  return sid ? sid : null
}

function trustedPrincipalOk(ctx: StockLedgerContext | null | undefined): boolean {
  if (!ctx) return false
  if (ctx.principal === null || ctx.principal === undefined) return true
  return Boolean((ctx.principal.userId ?? "").trim())
}

function operatorLabel(ctx: StockLedgerContext): string | null {
  if (ctx.principal?.displayLabel?.trim()) return ctx.principal.displayLabel.trim().slice(0, 500)
  const op = (ctx.operatorLabel ?? "").trim()
  return op ? op.slice(0, 500) : null
}

function isP2002(e: unknown): boolean {
  if (e instanceof Error && (e as { code?: unknown }).code === "P2002") return true
  const r = e as { code?: unknown; name?: unknown } | null
  return r?.code === "P2002" && String(r?.name ?? "").includes("PrismaClientKnown")
}

/** Assinatura lógica esperada para comparar com a linha já persistida. */
function expectedSignature(cmd: NormalizedStockCommand): {
  tipo: string
  quantidade: number
  documento: string | null
  motivo: string | null
  custo: number
  isAjuste: boolean
  novoSaldo: number | null
} {
  const tipo = stockCommandTipo(cmd.kind)
  if (cmd.kind === "ajuste") {
    return {
      tipo,
      quantidade: 0, // não usado para ajuste (compara estoqueDepois)
      documento: cmd.documento,
      motivo: cmd.motivo,
      custo: 0,
      isAjuste: true,
      novoSaldo: cmd.novoSaldo,
    }
  }
  const qtd = cmd.quantidade as number
  const signed = cmd.kind === "entrada" ? qtd : -qtd
  return {
    tipo,
    quantidade: signed,
    documento: cmd.documento,
    motivo: cmd.motivo,
    custo: cmd.kind === "entrada" ? cmd.custoUnitario : 0,
    isAjuste: false,
    novoSaldo: null,
  }
}

function storedMatchesExpected(
  stored: {
    tipo: string
    quantidade: number
    documento: string | null
    motivo: string | null
    custoUnitario: number
    estoqueDepois: number
    produtoId: string | null
  },
  cmd: NormalizedStockCommand,
  produtoId: string,
  unit: StockUnit,
): boolean {
  if ((stored.produtoId ?? "") !== produtoId) return false
  const exp = expectedSignature(cmd)
  if (stored.tipo !== exp.tipo) return false
  if ((stored.documento ?? null) !== (exp.documento ?? null)) return false
  if ((stored.motivo ?? null) !== (exp.motivo ?? null)) return false
  // `cmd` já está em unidades mínimas; a linha gravada está na unidade do produto.
  if (exp.isAjuste) {
    return toStockUnits(stored.estoqueDepois, unit) === (exp.novoSaldo as number)
  }
  if (toStockUnits(stored.quantidade, unit) !== exp.quantidade) return false
  if (exp.tipo === "entrada" && Number(stored.custoUnitario) !== Number(exp.custo)) return false
  return true
}

export async function applyStockMutationTx(
  tx: StockLedgerTx,
  context: StockLedgerContext,
  command: StockLedgerCommand,
): Promise<StockLedgerResult> {
  const sid = trustedStoreId(context)
  if (!sid || !trustedPrincipalOk(context)) {
    return stockFail("UNTRUSTED_CONTEXT", "Contexto de estoque não confiável: loja precisa ser provada pelo servidor.")
  }
  const input = normalizeStockCommand(command)
  if (!input.produtoId) return stockFail("VALIDATION", "produtoId inválido.")
  if (!input.origem) return stockFail("VALIDATION", "origem inválida.")
  // Pré-validação independente de unidade; inteiro × 3 casas só depois de ler o produto.
  if (input.kind === "entrada" || input.kind === "saida") {
    if (input.quantidadeExata === null || input.quantidadeExata <= 0) {
      return stockFail("VALIDATION", "Quantidade deve ser maior que zero.")
    }
  }
  if (input.kind === "ajuste") {
    if (input.novoSaldoExato === null || input.novoSaldoExato < 0) {
      return stockFail("VALIDATION", "Novo saldo deve ser >= 0.")
    }
  }
  if (input.kind === "entrada" && !(input.custoUnitario >= 0 && Number.isFinite(input.custoUnitario))) {
    return stockFail("VALIDATION", "Custo unitário inválido.")
  }
  const pid = input.produtoId

  // ── 1. Lock de linha por produto (serializa mutations concorrentes) ──────
  // O predicado inclui storeId: produto de outra loja nunca é travado/lido aqui.
  // Fakes de teste DEVEM validar o `FOR UPDATE` (ver stock-ledger-service.test.ts).
  try {
    await tx.$queryRaw`
      SELECT "id" FROM "estoque_produtos"
      WHERE "id" = ${pid} AND "storeId" = ${sid}
      FOR UPDATE
    `
  } catch (e) {
    return stockFail("PERSISTENCE", `Falha ao travar linha do produto: ${e instanceof Error ? e.message : String(e)}`)
  }

  // ── 2. Ownership do produto ───────────────────────────────────────────────
  const prod = await tx.produto.findFirst({
    where: { id: pid, storeId: sid },
    select: { id: true, name: true, sku: true, stock: true, precoCusto: true, metadata: true },
  } as never) as {
    id: string
    name: string
    sku: string | null
    stock: number
    precoCusto: number
    metadata?: unknown
  } | null
  if (!prod) {
    const elsewhere = await tx.produto.findUnique({
      where: { id: pid },
      select: { id: true, storeId: true },
    } as never) as { id: string; storeId: string } | null
    if (elsewhere) return stockFail("CROSS_STORE", "Produto pertence a outra loja.")
    return stockFail("NOT_FOUND", "Produto não encontrado nesta loja.")
  }

  // ── 2b. Unidade do saldo: daqui em diante toda aritmética é em unidades mínimas
  // inteiras (UN/G = 1, KG = milésimo). Grava-se e devolve-se só `out(x)`.
  const unit = stockUnitFromMetadata(prod.metadata)
  const out = (units: number) => fromStockUnits(units, unit)
  let quantidadeUnits: number | null = null
  let novoSaldoUnits: number | null = null
  if (unit === "KG") {
    if (input.kind === "ajuste") novoSaldoUnits = toStockUnits(input.novoSaldoExato, unit)
    else quantidadeUnits = toStockUnits(input.quantidadeExata, unit)
    if (quantidadeUnits === null && novoSaldoUnits === null) {
      return stockFail("VALIDATION", "Quantidade em kg aceita no máximo 3 casas decimais.")
    }
  } else {
    // UN/G: contrato legado intacto (valor truncado, inteiro obrigatório).
    if (input.kind === "ajuste") {
      if (!Number.isInteger(input.novoSaldo) || (input.novoSaldo as number) < 0) {
        return stockFail("VALIDATION", "Novo saldo deve ser um inteiro >= 0.")
      }
      novoSaldoUnits = input.novoSaldo
    } else {
      if (!Number.isInteger(input.quantidade) || (input.quantidade as number) <= 0) {
        return stockFail("VALIDATION", "Quantidade deve ser um inteiro maior que zero.")
      }
      quantidadeUnits = input.quantidade
    }
  }
  const comandoUnits = (quantidadeUnits ?? novoSaldoUnits) as number
  if (!dentroDoLimite(comandoUnits)) {
    return stockFail("VALIDATION", "Quantidade fora do limite permitido.")
  }
  const cmd: NormalizedStockCommand = { ...input, quantidade: quantidadeUnits, novoSaldo: novoSaldoUnits }
  const stockAtualUnits = toStockUnits(prod.stock, unit)
  if (stockAtualUnits === null) {
    return stockFail("STOCK_INVARIANT_DRIFT", `Saldo gravado (${prod.stock}) tem precisão incompatível com a unidade ${unit}. Correção manual necessária.`)
  }

  // ── 3. Depósito alvo (explícito validado ou principal) ────────────────────
  let depositoId: string
  if (cmd.depositoId) {
    const dep = await tx.deposito.findFirst({
      where: { id: cmd.depositoId, storeId: sid },
      select: { id: true, storeId: true },
    } as never) as { id: string; storeId: string } | null
    if (!dep) {
      const depElsewhere = await tx.deposito.findUnique({
        where: { id: cmd.depositoId },
        select: { id: true, storeId: true },
      } as never) as { id: string; storeId: string } | null
      if (depElsewhere) return stockFail("CROSS_STORE", "Depósito pertence a outra loja.")
      return stockFail("NOT_FOUND", "Depósito não encontrado nesta loja.")
    }
    depositoId = dep.id
  } else {
    try {
      const principal = await ensureDepositoPrincipal(
        tx as unknown as Prisma.TransactionClient,
        sid,
      )
      depositoId = principal.id
    } catch (e) {
      return stockFail("PERSISTENCE", `Falha ao resolver depósito principal: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // ── 4. Idempotência (antes de qualquer write) ─────────────────────────────
  if (cmd.idempotencyKey) {
    const existing = await tx.movimentacaoEstoque.findFirst({
      where: { storeId: sid, idempotencyKey: cmd.idempotencyKey },
    } as never) as {
      id: string
      tipo: string
      produtoId: string | null
      quantidade: number
      documento: string | null
      motivo: string | null
      custoUnitario: number
      estoqueAntes: number
      estoqueDepois: number
      custoMedioAntes: number
      custoMedioDepois: number
    } | null
    if (existing) {
      if (!storedMatchesExpected(existing, cmd, pid, unit)) {
        return stockFail("IDEMPOTENCY_CONFLICT", "Idempotency key já usada com conteúdo diferente.")
      }
      // Retry deduplicado: saldo NÃO reaplicado. Depósito atual para referência.
      const depRows = await tx.produtoDeposito.findMany({
        where: { storeId: sid, produtoId: pid },
        select: { depositoId: true, quantidade: true },
      } as never) as Array<{ depositoId: string; quantidade: number }>
      const depAtual = depRows.find((r) => r.depositoId === depositoId)?.quantidade ?? 0
      return {
        ok: true,
        movimentacaoId: existing.id,
        produtoId: pid,
        depositoId,
        tipo: existing.tipo as "entrada" | "saida" | "ajuste",
        quantidade: existing.quantidade,
        estoqueAntes: existing.estoqueAntes,
        estoqueDepois: existing.estoqueDepois,
        depositoAntes: depAtual,
        depositoDepois: depAtual,
        custoMedioAntes: existing.custoMedioAntes,
        custoMedioDepois: existing.custoMedioDepois,
        idempotente: true,
        structuralRepairApplied: false,
      }
    }
  }

  // ── 5. Invariante SUM(depósitos) == stock ──────────────────────────────────
  let estoqueAntes = stockAtualUnits
  const custoMedioAntes = prod.precoCusto ?? 0
  const depRowsGravados = await tx.produtoDeposito.findMany({
    where: { storeId: sid, produtoId: pid },
    select: { depositoId: true, quantidade: true },
  } as never) as Array<{ depositoId: string; quantidade: number }>
  let depRows: Array<{ depositoId: string; quantidade: number }> = []
  for (const row of depRowsGravados) {
    const quantidade = toStockUnits(row.quantidade, unit)
    if (quantidade === null) {
      return stockFail("STOCK_INVARIANT_DRIFT", `Saldo do depósito (${row.quantidade}) tem precisão incompatível com a unidade ${unit}. Correção manual necessária.`, { estoqueAntes: prod.stock })
    }
    depRows.push({ depositoId: row.depositoId, quantidade })
  }
  let structuralRepair: {
    classification: StockDriftClassification
    stockAntes: number
    depositoAntes: number
    alignedStock: number
    alignedDeposito: number
  } | null = null
  let ajusteCloseOnTarget = false
  let ajusteOthersSum = 0

  if (depRows.length === 0) {
    // Bootstrap estrutural legado (UMA vez, na mesma tx): materializa a linha do
    // depósito alvo com o saldo atual. NÃO é movimentação — não gera ledger.
    await tx.produtoDeposito.upsert({
      where: { produtoId_depositoId: { produtoId: pid, depositoId } },
      create: { storeId: sid, produtoId: pid, depositoId, quantidade: out(estoqueAntes) },
      update: { quantidade: out(estoqueAntes) },
    } as never)
    depRows = [{ depositoId, quantidade: estoqueAntes }]
  } else {
    const lastLedger = await tx.movimentacaoEstoque.findFirst({
      where: { storeId: sid, produtoId: pid },
      orderBy: { createdAt: "desc" },
      select: { estoqueDepois: true },
    } as never) as { estoqueDepois: number } | null
    const scaled = classifyStockDriftForUnit({
      unit,
      stock: prod.stock,
      deposits: depRowsGravados,
      targetDepositoId: depositoId,
      lastLedgerEstoqueDepois: lastLedger?.estoqueDepois ?? null,
    })
    if (!scaled) {
      return stockFail("STOCK_INVARIANT_DRIFT", `Último saldo do livro tem precisão incompatível com a unidade ${unit}. Correção manual necessária.`, { estoqueAntes: prod.stock })
    }
    const { classification, display } = scaled
    if (classification.reason !== STOCK_DRIFT_REASON.ALIGNED) {
      const requestedQty = out(
        cmd.kind === "saida" || cmd.kind === "entrada" ? (cmd.quantidade as number) : (cmd.novoSaldo as number),
      )
      const drift = toStockDriftDetails(display, {
        produtoId: pid,
        produtoNome: prod.name,
        produtoSku: prod.sku,
        depositoId,
        requestedQty,
      })
      const canProvenRepair =
        cmd.realinharDepositoAoStock === true &&
        (cmd.kind === "entrada"
          ? isProvenEntradaBaselineRepair(classification)
          : isProvenStructuralRepair(classification))
      const othersSum = classification.soma - classification.targetQty
      if (canProvenRepair) {
        const alignedStock = classification.alignedStock as number
        const alignedDeposito = classification.alignedTargetQty as number
        structuralRepair = {
          classification,
          stockAntes: estoqueAntes,
          depositoAntes: classification.targetQty,
          alignedStock,
          alignedDeposito,
        }
        estoqueAntes = alignedStock
        depRows = depRows.some((r) => r.depositoId === depositoId)
          ? depRows.map((r) => (r.depositoId === depositoId ? { ...r, quantidade: alignedDeposito } : r))
          : [...depRows, { depositoId, quantidade: alignedDeposito }]
      } else if (cmd.kind === "ajuste") {
        const novo = cmd.novoSaldo as number
        if (othersSum > novo) {
          return stockFail(
            "STOCK_INVARIANT_DRIFT",
            `Divergência estrutural: SUM(depósitos)=${display.soma} != Produto.stock=${display.stock}. Outros depósitos somam ${out(othersSum)}, acima do novo saldo ${out(novo)}.`,
            { estoqueAntes: out(estoqueAntes), drift },
          )
        }
        ajusteCloseOnTarget = true
        ajusteOthersSum = othersSum
      } else {
        return stockFail("STOCK_INVARIANT_DRIFT", stockDriftFailMessage(display), {
          estoqueAntes: out(estoqueAntes),
          drift,
        })
      }
    }
  }
  const depositoAntes = depRows.find((r) => r.depositoId === depositoId)?.quantidade ?? 0

  // ── 6. Delta / validações de negócio ──────────────────────────────────────
  let delta: number
  let estoqueDepois: number
  if (cmd.kind === "entrada") {
    delta = cmd.quantidade as number
    estoqueDepois = estoqueAntes + delta
  } else if (cmd.kind === "saida") {
    delta = -(cmd.quantidade as number)
    estoqueDepois = estoqueAntes + delta
    if (!cmd.permitirNegativo) {
      if (estoqueAntes < (cmd.quantidade as number)) {
        return stockFail("INSUFFICIENT_STOCK", `Estoque insuficiente: disponível ${out(estoqueAntes)}, solicitado ${out(cmd.quantidade as number)}.`, { estoqueAntes: out(estoqueAntes) })
      }
      if (depositoAntes < (cmd.quantidade as number)) {
        return stockFail("INSUFFICIENT_STOCK", `Estoque insuficiente no depósito: disponível ${out(depositoAntes)}, solicitado ${out(cmd.quantidade as number)}.`, { estoqueAntes: out(estoqueAntes) })
      }
    }
  } else {
    estoqueDepois = cmd.novoSaldo as number
    delta = estoqueDepois - estoqueAntes
    if (delta < 0 && !cmd.permitirNegativo && !ajusteCloseOnTarget) {
      const reducao = -delta
      if (depositoAntes < reducao) {
        return stockFail("INSUFFICIENT_STOCK", `Ajuste exigiria depósito negativo: disponível ${out(depositoAntes)}, redução ${out(reducao)}.`, { estoqueAntes: out(estoqueAntes) })
      }
    }
  }
  const depositoDepois = ajusteCloseOnTarget
    ? (cmd.novoSaldo as number) - ajusteOthersSum
    : depositoAntes + delta
  if (cmd.kind === "ajuste" && delta === 0 && depositoDepois === depositoAntes) {
    return stockFail("VALIDATION", "Novo saldo igual ao atual — nada a ajustar.", { estoqueAntes: out(estoqueAntes) })
  }
  if (!cmd.permitirNegativo && depositoDepois < 0) {
    return stockFail("INSUFFICIENT_STOCK", `Operação deixaria o depósito negativo (${out(depositoDepois)}).`, { estoqueAntes: out(estoqueAntes) })
  }
  if (!cmd.permitirNegativo && estoqueDepois < 0) {
    return stockFail("INSUFFICIENT_STOCK", `Operação deixaria o estoque negativo (${out(estoqueDepois)}).`, { estoqueAntes: out(estoqueAntes) })
  }
  // Tudo que será gravado precisa voltar exato na próxima leitura (`toStockUnits`):
  // um saldo acima do limite seria aceito agora e travaria o produto depois.
  if (![delta, estoqueDepois, depositoDepois].every(dentroDoLimite)) {
    return stockFail("VALIDATION", "Saldo resultante fora do limite permitido.", { estoqueAntes: out(estoqueAntes) })
  }

  // ── 7. Custo (preserva regra de entrada ponderada; saída/ajuste preservam) ─
  let custoMedioDepois = custoMedioAntes
  let custoUnitarioGravado = 0
  if (cmd.kind === "entrada") {
    custoUnitarioGravado = cmd.custoUnitario
    if (cmd.custoUnitario > 0 && estoqueDepois > 0) {
      custoMedioDepois = arredonda2((estoqueAntes * custoMedioAntes + (cmd.quantidade as number) * cmd.custoUnitario) / estoqueDepois)
    }
  } else if (cmd.kind === "saida") {
    custoUnitarioGravado = arredonda2(Math.max(0, custoMedioAntes))
  }

  const tipo = stockCommandTipo(cmd.kind)
  const usuario = operatorLabel(context)
  const commercialObservacao = structuralRepair
    ? [
        cmd.observacao,
        `reconcile:${structuralRepair.classification.reason}:${structuralRepair.classification.authority}`,
      ]
        .filter(Boolean)
        .join(" | ")
    : ajusteCloseOnTarget
      ? [cmd.observacao, `ajuste-fecha-alvo:others=${out(ajusteOthersSum)}`].filter(Boolean).join(" | ")
      : cmd.observacao
  const ledgerData = {
    storeId: sid,
    produtoId: pid,
    produtoSku: prod.sku ?? null,
    produtoNome: prod.name,
    tipo,
    origem: cmd.origem,
    quantidade: out(delta),
    estoqueAntes: out(estoqueAntes),
    estoqueDepois: out(estoqueDepois),
    custoUnitario: custoUnitarioGravado,
    custoMedioAntes,
    custoMedioDepois,
    valorTotal: cmd.kind === "entrada" ? arredonda2(out(cmd.quantidade as number) * custoUnitarioGravado) : arredonda2(out(Math.abs(delta)) * arredonda2(Math.max(0, custoMedioAntes))),
    documento: cmd.documento,
    motivo: cmd.motivo,
    observacao: commercialObservacao,
    fornecedor: cmd.kind === "entrada" ? cmd.fornecedor : null,
    usuario,
    ...(cmd.idempotencyKey ? { idempotencyKey: cmd.idempotencyKey } : {}),
  }

  // ── 8. Writes atômicos (lock já adquirido — set direto, sem lost update) ──
  if (structuralRepair) {
      const stockDelta = structuralRepair.alignedStock - structuralRepair.stockAntes
      const reconcileKey = cmd.idempotencyKey ? StockIdempotency.stockReconcile(cmd.idempotencyKey) : null
      await tx.movimentacaoEstoque.create({
          data: {
            storeId: sid,
            produtoId: pid,
            produtoSku: prod.sku ?? null,
            produtoNome: prod.name,
            tipo: "ajuste",
            origem: "estoque-reconcile",
            quantidade: out(stockDelta),
            estoqueAntes: out(structuralRepair.stockAntes),
            estoqueDepois: out(structuralRepair.alignedStock),
            custoUnitario: 0,
            custoMedioAntes,
            custoMedioDepois: custoMedioAntes,
            valorTotal: 0,
            documento: cmd.documento,
            motivo: `Reconciliação estrutural ${structuralRepair.classification.reason}`,
            observacao: JSON.stringify({
              authority: structuralRepair.classification.authority,
              reason: structuralRepair.classification.reason,
              stockAntes: out(structuralRepair.stockAntes),
              stockDepois: out(structuralRepair.alignedStock),
              depositoAntes: out(structuralRepair.depositoAntes),
              depositoDepois: out(structuralRepair.alignedDeposito),
              somaAntes: out(structuralRepair.classification.soma),
              gap: out(structuralRepair.classification.gap),
              lastLedgerEstoqueDepois:
                structuralRepair.classification.lastLedgerEstoqueDepois === null
                  ? null
                  : out(structuralRepair.classification.lastLedgerEstoqueDepois),
            }),
            usuario,
          ...(reconcileKey ? { idempotencyKey: reconcileKey } : {}),
          },
        } as never)
    }
    await tx.produto.update({
      where: { id: pid },
      data: {
        stock: out(estoqueDepois),
        ...(cmd.kind === "entrada" && cmd.custoUnitario > 0 ? { precoCusto: custoMedioDepois } : {}),
      },
    } as never)
    await tx.produtoDeposito.upsert({
      where: { produtoId_depositoId: { produtoId: pid, depositoId } },
      create: { storeId: sid, produtoId: pid, depositoId, quantidade: out(depositoDepois) },
      update: { quantidade: out(depositoDepois) },
    } as never)
    const mov = await tx.movimentacaoEstoque.create({ data: ledgerData } as never) as { id: string }
    const movimentacaoId = mov.id

    return {
      ok: true,
      movimentacaoId,
      produtoId: pid,
      depositoId,
      tipo,
      quantidade: out(delta),
      estoqueAntes: out(estoqueAntes),
      estoqueDepois: out(estoqueDepois),
      depositoAntes: out(depositoAntes),
      depositoDepois: out(depositoDepois),
      custoMedioAntes,
      custoMedioDepois,
      idempotente: false,
      structuralRepairApplied: structuralRepair != null,
    }
}

/**
 * Variante standalone: abre a sua própria transação.
 * Callers que JÁ estão em `$transaction` DEVEM usar `applyStockMutationTx`.
 *
 * P2002 após writes aborta a transação. O replay só consulta estado durável
 * numa transação nova, sem reaplicar saldo.
 */
export async function applyStockMutation(
  context: StockLedgerContext,
  command: StockLedgerCommand,
  deps?: { db?: DbLike },
): Promise<StockLedgerResult> {
  const db = deps?.db ?? (prisma as unknown as DbLike)
  try {
    return await db.$transaction((tx) => applyStockMutationTx(tx, context, command))
  } catch (e) {
    if (!isP2002(e)) throw e
    const key = typeof command.idempotencyKey === "string" ? command.idempotencyKey.trim() : ""
    if (!key) throw e
    return await db.$transaction((tx) => applyStockMutationTx(tx, context, command))
  }
}
