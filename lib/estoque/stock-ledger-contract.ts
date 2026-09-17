/**
 * CAD-R2-009 — Contrato puro do boundary canônico de estoque (Stock/Ledger).
 *
 * Módulo PURO: sem I/O, sem Prisma runtime, sem `server-only`, sem browser.
 * Pode ser importado por testes, rotas e serviços server-side.
 *
 * VERDADE DE DADOS (não criar uma quarta verdade):
 * - `Produto.stock` = saldo operacional agregado / cache da loja;
 * - `ProdutoDeposito.quantidade` = saldo físico por depósito;
 * - `MovimentacaoEstoque` = livro-razão append-only.
 * Invariante: SUM(ProdutoDeposito) == Produto.stock após toda mutation canônica.
 */

import type { CadastrosAuditPrincipal } from "@/lib/cadastros/cadastros-audit-principal"

/** Tipos de movimento do ledger (coluna `tipo`, livre no banco). */
export const STOCK_LEDGER_TIPOS = ["entrada", "saida", "ajuste"] as const
export type StockLedgerTipo = (typeof STOCK_LEDGER_TIPOS)[number]

/**
 * Origens conhecidas (coluna `origem`, livre no banco — novos valores são
 * aditivos). "cadastro" = estoque inicial via ProductWriteService (009).
 */
export const STOCK_LEDGER_ORIGENS = [
  "manual",
  "pdv",
  "cancelamento_pdv",
  "correcao_pdv",
  "devolucao",
  "os",
  "inventario",
  "importacao",
  "cadastro",
] as const
export type StockLedgerOrigem = (typeof STOCK_LEDGER_ORIGENS)[number] | (string & {})

/**
 * Contexto CONFIÁVEL — somente dados já provados pelo servidor.
 * NUNCA montar a partir de `input.storeId`, `input.usuario`, `userLabel`,
 * `revisadoPor` ou qualquer campo vindo do browser.
 */
export type StockLedgerContext = {
  /** Loja autorizada (server-derived). Obrigatório, sem fallback silencioso. */
  storeId: string
  /** Principal humano canônico quando existir; null = operação automatizada. */
  principal: CadastrosAuditPrincipal | null
  /** Origem técnica server-derived (ex.: "pdv", "os-hub", "estoque-actions"). */
  source: string
  /**
   * Rótulo de operador server-derived (ex.: sessão NextAuth) para a coluna
   * `usuario` do ledger quando não houver principal humano. Nunca browser-input.
   */
  operatorLabel?: string | null
}

type StockLedgerCommandBase = {
  produtoId: string
  /** Depósito alvo. Ausente = depósito principal (única seleção até fase futura). */
  depositoId?: string | null
  documento?: string | null
  motivo?: string | null
  observacao?: string | null
  fornecedor?: string | null
  /** Chave de idempotência estável do caller. Sem Date.now()/random em retry. */
  idempotencyKey?: string | null
  origem: StockLedgerOrigem
}

export type StockLedgerCommand =
  | (StockLedgerCommandBase & {
      kind: "entrada"
      /** Inteiro > 0. */
      quantidade: number
      /** Custo unitário da entrada real; ausente/0 preserva o custo médio. */
      custoUnitario?: number
    })
  | (StockLedgerCommandBase & {
      kind: "saida"
      /** Inteiro > 0. */
      quantidade: number
      /**
       * Escape hatch LEGADO (default false): permite saldo negativo.
       * Uso exclusivo do replay histórico de vendas (`enforceStock=false`),
       * que preserva fatos passados. PDV ao vivo, OS, inventário e ajustes
       * NUNCA usam.
       */
      permitirNegativo?: boolean
    })
  | (StockLedgerCommandBase & {
      kind: "ajuste"
      /** Novo saldo absoluto, inteiro >= 0. */
      novoSaldo: number
    })

export type StockLedgerErrorCode =
  | "UNTRUSTED_CONTEXT"
  | "VALIDATION"
  | "NOT_FOUND"
  | "CROSS_STORE"
  | "INSUFFICIENT_STOCK"
  | "STOCK_INVARIANT_DRIFT"
  | "IDEMPOTENCY_CONFLICT"
  | "PERSISTENCE"

export type StockLedgerSuccess = {
  ok: true
  movimentacaoId: string
  produtoId: string
  depositoId: string
  tipo: StockLedgerTipo
  quantidade: number
  estoqueAntes: number
  estoqueDepois: number
  depositoAntes: number
  depositoDepois: number
  custoMedioAntes: number
  custoMedioDepois: number
  /** true = retry deduplicado, saldo NÃO reaplicado. */
  idempotente: boolean
}

export type StockLedgerFailure = {
  ok: false
  code: StockLedgerErrorCode
  message: string
  /** Saldo conhecido no momento da falha (para erros de negócio). */
  estoqueAntes?: number
}

export type StockLedgerResult = StockLedgerSuccess | StockLedgerFailure

// ─── Normalização determinística ─────────────────────────────────────────────

function cleanId(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function cleanText(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== "string") return null
  const t = value.trim()
  return t ? t : null
}

function truncInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.trim())
    if (Number.isFinite(n)) return Math.trunc(n)
  }
  return null
}

export type NormalizedStockCommand = {
  kind: "entrada" | "saida" | "ajuste"
  produtoId: string
  depositoId: string | null
  quantidade: number | null
  novoSaldo: number | null
  custoUnitario: number
  permitirNegativo: boolean
  origem: string
  documento: string | null
  motivo: string | null
  observacao: string | null
  fornecedor: string | null
  idempotencyKey: string | null
}

/** Normaliza sem tocar banco: mesma entrada ⇒ mesma saída. */
export function normalizeStockCommand(cmd: StockLedgerCommand): NormalizedStockCommand {
  const quantidade =
    cmd.kind === "ajuste" ? null : truncInt((cmd as { quantidade?: unknown }).quantidade)
  const novoSaldo =
    cmd.kind === "ajuste" ? truncInt((cmd as { novoSaldo?: unknown }).novoSaldo) : null
  const custoRaw =
    cmd.kind === "entrada"
      ? Number((cmd as { custoUnitario?: unknown }).custoUnitario ?? 0)
      : 0
  return {
    kind: cmd.kind,
    produtoId: cleanId(cmd.produtoId),
    depositoId: cleanId(cmd.depositoId ?? null) || null,
    quantidade,
    novoSaldo,
    custoUnitario: Number.isFinite(custoRaw) ? Math.max(0, custoRaw) : 0,
    permitirNegativo: cmd.kind === "saida" ? (cmd.permitirNegativo === true) : false,
    origem: cleanId(cmd.origem) || "manual",
    documento: cleanText(cmd.documento),
    motivo: cleanText(cmd.motivo),
    observacao: cleanText(cmd.observacao),
    fornecedor: cleanText(cmd.fornecedor),
    idempotencyKey: cleanText(cmd.idempotencyKey),
  }
}

/** Delta assinado do comando normalizado (requer kind+quantidade válidos). */
export function stockCommandDelta(cmd: NormalizedStockCommand, estoqueAntes: number): number {
  if (cmd.kind === "entrada") return cmd.quantidade as number
  if (cmd.kind === "saida") return -(cmd.quantidade as number)
  return (cmd.novoSaldo as number) - estoqueAntes
}

export function stockCommandTipo(kind: NormalizedStockCommand["kind"]): StockLedgerTipo {
  return kind === "entrada" ? "entrada" : kind === "saida" ? "saida" : "ajuste"
}

/**
 * Assinatura semântica do conteúdo lógico (para IDEMPOTENCY_CONFLICT).
 * Custo só participa em ENTRADA (em saída/ajuste o `custoUnitario` gravado é
 * snapshot do custo vigente — varia com o tempo e não é conteúdo do comando).
 */
export function stockSemanticSignature(params: {
  tipo: string
  produtoId: string
  quantidade: number
  documento: string | null
  motivo: string | null
  custoUnitario: number
}): string {
  const custo = params.tipo === "entrada" ? params.custoUnitario : 0
  return [
    params.tipo,
    params.produtoId,
    String(params.quantidade),
    params.documento ?? "",
    params.motivo ?? "",
    String(custo),
  ].join("|")
}

// ─── Chaves de idempotência por origem ───────────────────────────────────────

/**
 * Junção determinística de segmentos estáveis. Callers DEVEM passar apenas IDs
 * estáveis (venda, OS, devolução, sessão, lote) — nunca Date.now()/random em
 * caminho que deveria deduplicar retry.
 */
export function buildIdempotencyKey(...segments: Array<string | number | null | undefined>): string {
  return segments
    .map((s) => (s === null || s === undefined ? "" : String(s).trim()))
    .filter((s) => s.length > 0)
    .join(":")
}

export const StockIdempotency = {
  /** PDV/venda: uma baixa por (venda, produto). */
  venda: (pedidoId: string, produtoId: string) =>
    buildIdempotencyKey("pdv", pedidoId, produtoId),
  /** Cancelamento: uma reposição por (venda cancelada, produto). */
  cancelamento: (pedidoId: string, produtoId: string) =>
    buildIdempotencyKey("cancelamento-pdv", pedidoId, produtoId),
  /** Devolução: uma reposição por (devolução, produto). */
  devolucao: (localId: string, produtoId: string) =>
    buildIdempotencyKey("devolucao", localId, produtoId),
  /** OS consumo na entrega: uma baixa por (OS, produto). */
  osConsumo: (osId: string, produtoId: string) =>
    buildIdempotencyKey("os", osId, "consumo", produtoId),
  /** OS estorno: uma reposição por (OS, produto). */
  osEstorno: (osId: string, produtoId: string) =>
    buildIdempotencyKey("os", osId, "estorno", produtoId),
  /** OS delta pós-revisão: um ajuste por (OS, revisão, produto). */
  osDelta: (osId: string, revisaoKey: string, produtoId: string) =>
    buildIdempotencyKey("os", osId, "delta", revisaoKey, produtoId),
  /** Inventário: um ajuste por (sessão, produto). */
  inventario: (sessaoId: string, produtoId: string) =>
    buildIdempotencyKey("inventario", sessaoId, produtoId),
  /** Importação: uma entrada por (lote, produto). */
  importacao: (batchId: string, produtoId: string) =>
    buildIdempotencyKey("import", batchId, produtoId),
  /** Estoque inicial do cadastro: uma entrada por produto. */
  cadastroInicial: (produtoId: string) =>
    buildIdempotencyKey("cadastro", "inicial", produtoId),
} as const

// ─── Erros ───────────────────────────────────────────────────────────────────

export function stockFail(
  code: StockLedgerErrorCode,
  message: string,
  extra?: { estoqueAntes?: number },
): StockLedgerFailure {
  return { ok: false, code, message, ...(extra?.estoqueAntes !== undefined ? { estoqueAntes: extra.estoqueAntes } : {}) }
}
