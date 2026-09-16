import { NextResponse } from "next/server"
import { duplicateProductResponse } from "@/lib/produtos/duplicate-product"
import { buildIdempotencyKey } from "@/lib/estoque/stock-ledger-contract"
import type { ProductWriteResult } from "@/lib/cadastros/product-write-contract"
import type { StockLedgerResult } from "@/lib/estoque/stock-ledger-contract"

/**
 * CAD-R2-007 — Adapter HTTP fino para os boundaries canônicos de Produto/Estoque.
 *
 * Puro HTTP: mapeia `ProductWriteResult` / `StockLedgerResult` para status/body
 * REST sem reduplicar duplicate engine, metadata merge ou writes Prisma.
 * `duplicateProductResponse` é usado SOMENTE como response adapter.
 */

export const PRODUTO_REST_SELECT = {
  id: true,
  name: true,
  stock: true,
  price: true,
  precoCusto: true,
  sku: true,
  barcode: true,
  category: true,
  brand: true,
  supplierName: true,
  warrantyDays: true,
  active: true,
  status: true,
  metadata: true,
  storeId: true,
  createdAt: true,
  updatedAt: true,
} as const

type Failure = Extract<ProductWriteResult, { ok: false }>

function duplicateAdapter(result: Failure, context: "create" | "update") {
  const produto = result.produto
  if (produto) {
    if (result.field === "barcode" && produto.barcode) {
      return duplicateProductResponse(produto, undefined, produto.barcode, { context })
    }
    if (produto.sku) {
      return duplicateProductResponse(produto, produto.sku, undefined, { context })
    }
    return duplicateProductResponse(produto, undefined, undefined, { context })
  }
  return NextResponse.json(
    {
      error: "Produto já cadastrado",
      type: "DUPLICATE_PRODUCT",
      message: result.message || "Produto já cadastrado nesta loja.",
    },
    { status: 409 },
  )
}

/** Mapeia falha do ProductWriteService para resposta HTTP (sem vazar Prisma). */
export function mapProductWriteFailureToResponse(
  result: Failure,
  opts?: { context?: "create" | "update" },
) {
  const context = opts?.context ?? "create"
  switch (result.code) {
    case "VALIDATION":
      return NextResponse.json({ error: result.message }, { status: 400 })
    case "DUPLICATE":
      return duplicateAdapter(result, context)
    case "NOT_FOUND":
    case "CROSS_STORE":
      // Fail-closed sem oráculo entre lojas: cross-store vira 404.
      return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 })
    case "UNTRUSTED_CONTEXT":
      return NextResponse.json({ error: result.message || "Não autorizado" }, { status: 401 })
    case "PERSISTENCE":
    default:
      return NextResponse.json({ error: "Falha ao salvar produto" }, { status: 503 })
  }
}

/** Mapeia falha do StockLedger boundary para resposta HTTP (sem vazar Prisma). */
export function mapStockLedgerFailureToResponse(result: Extract<StockLedgerResult, { ok: false }>) {
  switch (result.code) {
    case "VALIDATION":
      return NextResponse.json({ error: result.message }, { status: 400 })
    case "NOT_FOUND":
    case "CROSS_STORE":
      return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 })
    case "INSUFFICIENT_STOCK":
    case "STOCK_INVARIANT_DRIFT":
    case "IDEMPOTENCY_CONFLICT":
      return NextResponse.json({ error: result.message }, { status: 409 })
    case "UNTRUSTED_CONTEXT":
      return NextResponse.json({ error: result.message || "Não autorizado" }, { status: 401 })
    case "PERSISTENCE":
    default:
      return NextResponse.json({ error: "Falha ao ajustar estoque" }, { status: 503 })
  }
}

/**
 * Deriva a idempotencyKey do PATCH de estoque a partir do header HTTP
 * `Idempotency-Key` (quando presente), namespaceda por produto.
 * Ausente = null (compatibilidade; header nunca obrigatório neste GOAL).
 * Nunca usa o header puro globalmente; nunca como authorization.
 */
export function restPatchIdempotencyKey(req: Request, productId: string): string | null {
  const raw = req.headers.get("Idempotency-Key") ?? req.headers.get("idempotency-key")
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  // Normaliza e limita para caber na coluna TEXT + índice único sem abuso.
  const safe = trimmed.slice(0, 200)
  if (!safe) return null
  const pid = (productId ?? "").trim()
  if (!pid) return null
  return buildIdempotencyKey("api-produto-patch", pid, safe)
}
