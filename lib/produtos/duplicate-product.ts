import { NextResponse } from "next/server"

/**
 * CADASTROS-PRODUTOS-DUPLICIDADE — contrato ÚNICO de resposta para "Produto já cadastrado".
 *
 * Compartilhado pelo POST `/api/produtos` (cadastro novo — GOAL 001) e pelo PATCH
 * `/api/produtos/[id]` (edição — GOAL PATCH-002), para o front tratar a duplicidade de
 * forma idêntica (`type: "DUPLICATE_PRODUCT"` + `field` + `produto`), independente de ser
 * criação ou edição. Mantém uma única definição do shape — evita drift entre as rotas.
 */

/** Campos mínimos e seguros do produto já existente expostos na resposta de duplicidade. */
export type ExistingProdutoLite = {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  stock: number
}

export type DuplicateProductDetails = {
  type: "DUPLICATE_PRODUCT"
  field: "barcode" | "sku"
  message: string
  produto: ExistingProdutoLite
}

/** Select Prisma para reconsultar o item já cadastrado (apenas dados mínimos e seguros). */
export const PRODUTO_DUP_SELECT = { id: true, name: true, sku: true, barcode: true, stock: true } as const

/** Dados estruturados compartilhados por API e Server Action. */
export function duplicateProductDetails(
  existing: ExistingProdutoLite,
  sku?: string | null,
  barcode?: string | null,
  opts?: { context?: "create" | "update" },
): DuplicateProductDetails {
  const matchedBarcode = !!barcode && !!existing.barcode && existing.barcode === barcode
  const field = matchedBarcode ? "barcode" : "sku"
  const codeLabel = matchedBarcode ? "código de barras (EAN)" : "código/SKU"
  const item = opts?.context === "update" ? "outro item" : "um item"
  return {
    type: "DUPLICATE_PRODUCT",
    field,
    message: `Produto já cadastrado. Encontramos ${item} com este mesmo ${codeLabel} nesta loja.`,
    produto: existing,
  }
}

/**
 * Resposta 409 estruturada quando o item já existe na loja (mesmo SKU/código ou mesmo
 * código de barras/EAN). Substitui o antigo 503 genérico vindo do unique constraint (P2002),
 * que não avisava o operador que o produto já estava cadastrado.
 *
 * `context: "create"` (padrão) → "Encontramos um item…"; `"update"` → "Encontramos outro
 * item…" (na edição, a colisão é sempre com um produto DIFERENTE do que está sendo editado).
 */
export function duplicateProductResponse(
  existing: ExistingProdutoLite,
  sku?: string,
  barcode?: string,
  opts?: { context?: "create" | "update" },
) {
  const duplicate = duplicateProductDetails(existing, sku, barcode, opts)
  return NextResponse.json(
    {
      error: "Produto já cadastrado",
      ...duplicate,
    },
    { status: 409 },
  )
}
