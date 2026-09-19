/**
 * CAD-R2-009 — classificação de drift SUM(depósitos) vs Produto.stock.
 *
 * Não escolhe o maior, o menor nem o valor conveniente para vender.
 * Autoridade comprovável:
 * - livro (`MovimentacaoEstoque.estoqueDepois` mais recente) quando casa com
 *   um dos lados;
 * - materialização equivalente ao bootstrap (sem linhas OU linhas só em zero);
 * - overhang SUM>stock absorvível no único depósito com saldo (legado PDV · PR #212).
 * Múltiplos depósitos positivos com gap ≠ 0 não são reparo comprovado: absorver
 * no alvo não prova qual bin deve perder (ou ganhar) as unidades.
 * Qualquer outro desacordo permanece bloqueado.
 */

export const STOCK_DRIFT_REASON = {
  ALIGNED: "aligned",
  UNMATERIALIZED_ZERO: "unmaterialized_zero",
  LEGACY_DEPOSIT_OVERHANG: "legacy_deposit_overhang",
  LEGACY_DEPOSIT_UNDERCOUNT: "legacy_deposit_undercount",
  LEGACY_STOCK_CACHE_STALE: "legacy_stock_cache_stale",
  PRINCIPAL_CANNOT_ABSORB: "principal_cannot_absorb",
  MULTI_DEPOSIT_AMBIGUOUS: "multi_deposit_ambiguous",
  UNPROVEN_WITHOUT_LEDGER: "unproven_without_ledger",
  LEDGER_CONFLICT: "ledger_conflict",
} as const

export type StockDriftReason = (typeof STOCK_DRIFT_REASON)[keyof typeof STOCK_DRIFT_REASON]

export type StockDriftDepositRow = { depositoId: string; quantidade: number }

export type StockDriftDetails = {
  produtoId: string
  produtoNome: string
  produtoSku: string | null
  stock: number
  somaDepositos: number
  gap: number
  depositoId: string
  depositoQuantidade: number
  requestedQty: number | null
  driftReason: StockDriftReason
  depositCount: number
  lastLedgerEstoqueDepois: number | null
  authority: string
}

export type StockDriftClassification = {
  reason: StockDriftReason
  stock: number
  soma: number
  gap: number
  depositCount: number
  positiveDepositCount: number
  targetQty: number
  canAbsorbOverhang: boolean
  lastLedgerEstoqueDepois: number | null
  proven: boolean
  authority: string
  /** Novo saldo do depósito alvo se a correção estrutural for aplicada. */
  alignedTargetQty: number | null
  /** Novo Produto.stock se a correção estrutural for aplicada. */
  alignedStock: number | null
}

export type ClassifyStockDriftInput = {
  stock: number
  deposits: ReadonlyArray<StockDriftDepositRow>
  targetDepositoId: string
  lastLedgerEstoqueDepois: number | null
}

function truncQty(n: unknown): number {
  const q = Math.trunc(Number(n))
  return Number.isFinite(q) ? q : 0
}

export function sumDepositQuantities(deposits: ReadonlyArray<StockDriftDepositRow>): number {
  let soma = 0
  for (const row of deposits) soma += truncQty(row.quantidade)
  return soma
}

function baseFields(input: ClassifyStockDriftInput): {
  stock: number
  soma: number
  gap: number
  depositCount: number
  positiveDepositCount: number
  targetQty: number
} {
  const stock = truncQty(input.stock)
  const soma = sumDepositQuantities(input.deposits)
  const targetQty =
    truncQty(input.deposits.find((row) => row.depositoId === input.targetDepositoId)?.quantidade) || 0
  return {
    stock,
    soma,
    gap: soma - stock,
    depositCount: input.deposits.length,
    positiveDepositCount: input.deposits.filter((row) => truncQty(row.quantidade) !== 0).length,
    targetQty,
  }
}

function classified(
  input: ClassifyStockDriftInput,
  patch: Pick<
    StockDriftClassification,
    "reason" | "proven" | "authority" | "alignedTargetQty" | "alignedStock" | "canAbsorbOverhang"
  >,
): StockDriftClassification {
  const base = baseFields(input)
  return {
    ...base,
    lastLedgerEstoqueDepois:
      input.lastLedgerEstoqueDepois === null || input.lastLedgerEstoqueDepois === undefined
        ? null
        : truncQty(input.lastLedgerEstoqueDepois),
    ...patch,
  }
}

/**
 * Classifica o desacordo. Não escreve banco.
 */
export function classifyStockDrift(input: ClassifyStockDriftInput): StockDriftClassification {
  const { stock, soma, gap, depositCount, positiveDepositCount, targetQty } = baseFields(input)
  const ledger =
    input.lastLedgerEstoqueDepois === null || input.lastLedgerEstoqueDepois === undefined
      ? null
      : truncQty(input.lastLedgerEstoqueDepois)
  const ledgerMatchesStock = ledger !== null && ledger === stock
  const ledgerMatchesSoma = ledger !== null && ledger === soma
  const canAbsorbOverhang = gap > 0 && targetQty >= gap
  const allZero = depositCount > 0 && soma === 0

  if (depositCount === 0 || soma === stock) {
    return classified(input, {
      reason: STOCK_DRIFT_REASON.ALIGNED,
      proven: true,
      authority: "invariante-ok",
      alignedTargetQty: null,
      alignedStock: null,
      canAbsorbOverhang: false,
    })
  }

  if (allZero && stock > 0 && (ledger === null || ledgerMatchesStock)) {
    return classified(input, {
      reason: STOCK_DRIFT_REASON.UNMATERIALIZED_ZERO,
      proven: true,
      authority:
        ledger === null
          ? "bootstrap-equivalente-sem-livro"
          : "livro-casa-com-stock+deposito-zero",
      alignedTargetQty: stock,
      alignedStock: stock,
      canAbsorbOverhang: false,
    })
  }

  if (ledgerMatchesSoma && !ledgerMatchesStock) {
    return classified(input, {
      reason: STOCK_DRIFT_REASON.LEGACY_STOCK_CACHE_STALE,
      proven: true,
      authority: "livro-casa-com-soma-depositos",
      alignedTargetQty: targetQty,
      alignedStock: soma,
      canAbsorbOverhang,
    })
  }

  if (gap > 0 && (ledger === null || ledgerMatchesStock)) {
    if (positiveDepositCount > 1) {
      return classified(input, {
        reason: STOCK_DRIFT_REASON.MULTI_DEPOSIT_AMBIGUOUS,
        proven: false,
        authority: ledgerMatchesStock
          ? "livro-casa-com-stock-multiplos-depositos-overhang"
          : "overhang-multiplos-depositos-sem-distribuicao-comprovada",
        alignedTargetQty: null,
        alignedStock: null,
        canAbsorbOverhang: false,
      })
    }
    if (!canAbsorbOverhang) {
      return classified(input, {
        reason: STOCK_DRIFT_REASON.PRINCIPAL_CANNOT_ABSORB,
        proven: false,
        authority: ledgerMatchesStock ? "livro-casa-com-stock-mas-alvo-insuficiente" : "overhang-alvo-insuficiente",
        alignedTargetQty: null,
        alignedStock: null,
        canAbsorbOverhang: false,
      })
    }
    return classified(input, {
      reason: STOCK_DRIFT_REASON.LEGACY_DEPOSIT_OVERHANG,
      proven: true,
      authority: ledgerMatchesStock ? "livro-casa-com-stock" : "legado-pdv-sum-gt-stock-absorvivel",
      alignedTargetQty: targetQty - gap,
      alignedStock: stock,
      canAbsorbOverhang: true,
    })
  }

  if (gap < 0 && ledgerMatchesStock) {
    if (positiveDepositCount > 1) {
      return classified(input, {
        reason: STOCK_DRIFT_REASON.MULTI_DEPOSIT_AMBIGUOUS,
        proven: false,
        authority: "livro-casa-com-stock-multiplos-depositos",
        alignedTargetQty: null,
        alignedStock: null,
        canAbsorbOverhang: false,
      })
    }
    return classified(input, {
      reason: STOCK_DRIFT_REASON.LEGACY_DEPOSIT_UNDERCOUNT,
      proven: true,
      authority: "livro-casa-com-stock",
      alignedTargetQty: targetQty - gap,
      alignedStock: stock,
      canAbsorbOverhang: false,
    })
  }

  if (ledger !== null && !ledgerMatchesStock && !ledgerMatchesSoma) {
    return classified(input, {
      reason: STOCK_DRIFT_REASON.LEDGER_CONFLICT,
      proven: false,
      authority: "livro-nao-casa-com-nenhum-lado",
      alignedTargetQty: null,
      alignedStock: null,
      canAbsorbOverhang,
    })
  }

  if (positiveDepositCount > 1) {
    return classified(input, {
      reason: STOCK_DRIFT_REASON.MULTI_DEPOSIT_AMBIGUOUS,
      proven: false,
      authority: "multiplos-depositos-sem-maioria",
      alignedTargetQty: null,
      alignedStock: null,
      canAbsorbOverhang,
    })
  }

  return classified(input, {
    reason: STOCK_DRIFT_REASON.UNPROVEN_WITHOUT_LEDGER,
    proven: false,
    authority: "sem-livro-e-sem-padrao-legado-comprovavel",
    alignedTargetQty: null,
    alignedStock: null,
    canAbsorbOverhang,
  })
}

export function isProvenStructuralRepair(classification: StockDriftClassification): boolean {
  if (!classification.proven) return false
  return (
    classification.reason === STOCK_DRIFT_REASON.UNMATERIALIZED_ZERO ||
    classification.reason === STOCK_DRIFT_REASON.LEGACY_DEPOSIT_OVERHANG ||
    classification.reason === STOCK_DRIFT_REASON.LEGACY_DEPOSIT_UNDERCOUNT ||
    classification.reason === STOCK_DRIFT_REASON.LEGACY_STOCK_CACHE_STALE
  )
}

export function toStockDriftDetails(
  classification: StockDriftClassification,
  meta: {
    produtoId: string
    produtoNome: string
    produtoSku: string | null
    depositoId: string
    requestedQty?: number | null
  },
): StockDriftDetails {
  return {
    produtoId: meta.produtoId,
    produtoNome: meta.produtoNome,
    produtoSku: meta.produtoSku,
    stock: classification.stock,
    somaDepositos: classification.soma,
    gap: classification.gap,
    depositoId: meta.depositoId,
    depositoQuantidade: classification.targetQty,
    requestedQty: meta.requestedQty ?? null,
    driftReason: classification.reason,
    depositCount: classification.depositCount,
    lastLedgerEstoqueDepois: classification.lastLedgerEstoqueDepois,
    authority: classification.authority,
  }
}

export function stockDriftFailMessage(classification: StockDriftClassification): string {
  const soma = classification.soma
  const stock = classification.stock
  switch (classification.reason) {
    case STOCK_DRIFT_REASON.PRINCIPAL_CANNOT_ABSORB:
      return `Divergência estrutural: SUM(depósitos)=${soma} != Produto.stock=${stock}. O depósito alvo não absorve a diferença ${classification.gap}.`
    case STOCK_DRIFT_REASON.MULTI_DEPOSIT_AMBIGUOUS:
      return `Divergência estrutural: SUM(depósitos)=${soma} != Produto.stock=${stock}. Múltiplos depósitos com saldo — exige decisão administrativa.`
    case STOCK_DRIFT_REASON.LEDGER_CONFLICT:
      return `Divergência estrutural: SUM(depósitos)=${soma} != Produto.stock=${stock}. O livro (${classification.lastLedgerEstoqueDepois}) não casa com nenhum lado.`
    case STOCK_DRIFT_REASON.UNPROVEN_WITHOUT_LEDGER:
      return `Divergência estrutural: SUM(depósitos)=${soma} != Produto.stock=${stock}. Sem livro que comprove qual saldo é o espelho legado.`
    default:
      return `Divergência estrutural: SUM(depósitos)=${soma} != Produto.stock=${stock}. Correção manual necessária.`
  }
}

export function stockDriftPublicPayload(details: StockDriftDetails): Record<string, unknown> {
  return {
    produtoId: details.produtoId,
    produtoNome: details.produtoNome,
    produtoSku: details.produtoSku,
    stock: details.stock,
    somaDepositos: details.somaDepositos,
    gap: details.gap,
    depositoId: details.depositoId,
    depositoQuantidade: details.depositoQuantidade,
    requestedQty: details.requestedQty,
    driftReason: details.driftReason,
    depositCount: details.depositCount,
    lastLedgerEstoqueDepois: details.lastLedgerEstoqueDepois,
    authority: details.authority,
  }
}

export function parseStockDriftDetails(input: unknown): StockDriftDetails | undefined {
  if (!input || typeof input !== "object") return undefined
  const o = input as Record<string, unknown>
  const produtoId = typeof o.produtoId === "string" ? o.produtoId.trim() : ""
  const driftReason = typeof o.driftReason === "string" ? o.driftReason : ""
  if (!produtoId || !driftReason) return undefined
  const num = (v: unknown): number => {
    const n = typeof v === "number" ? v : Number(v)
    return Number.isFinite(n) ? n : 0
  }
  return {
    produtoId,
    produtoNome: typeof o.produtoNome === "string" ? o.produtoNome : "",
    produtoSku: typeof o.produtoSku === "string" ? o.produtoSku : null,
    stock: num(o.stock),
    somaDepositos: num(o.somaDepositos),
    gap: num(o.gap),
    depositoId: typeof o.depositoId === "string" ? o.depositoId : "",
    depositoQuantidade: num(o.depositoQuantidade),
    requestedQty: o.requestedQty === null || o.requestedQty === undefined ? null : num(o.requestedQty),
    driftReason: driftReason as StockDriftReason,
    depositCount: num(o.depositCount),
    lastLedgerEstoqueDepois:
      o.lastLedgerEstoqueDepois === null || o.lastLedgerEstoqueDepois === undefined
        ? null
        : num(o.lastLedgerEstoqueDepois),
    authority: typeof o.authority === "string" ? o.authority : "",
  }
}
