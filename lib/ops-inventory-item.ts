/**
 * Projeção pura Produto → item do catálogo operacional (`/api/ops/inventory`).
 *
 * Extraída da rota (PDV-ACESSORIOS-CADASTRO-PROJECAO-002) apenas para ser testável
 * sem Prisma/auth — o comportamento externo da rota não muda. O PDV nunca recebe o
 * `metadata` bruto: cada namespace relevante entra como campo saneado e aditivo
 * (`fiscal` via `getProdutoFiscal`, `accessoryConfig` via contrato de lib/acessorios).
 */
import { getProdutoAcessoriosMetadata } from "@/lib/acessorios/metadata"
import type { ProdutoAcessoriosMetadataV1 } from "@/lib/acessorios/types"
import { getProdutoFiscal, isProdutoFiscalVazio, type ProdutoFiscal } from "@/lib/produto-fiscal"

/** Subconjunto estrutural de `Produto` que a projeção consome (o model Prisma satisfaz). */
export type ProdutoInventoryRow = {
  id: string
  name: string
  stock: number
  precoCusto: number
  price: number
  sku?: string | null
  barcode?: string | null
  category?: string | null
  metadata?: unknown
}

export type InvPayload = {
  id: string
  name: string
  barcode?: string
  sku?: string
  dbId?: string
  codigo?: string
  codigoBarras?: string
  stock: number
  cost: number
  price: number
  category?: string
  vendaPorPeso?: boolean
  precoPorKg?: number
  atributos?: unknown[]
  /**
   * Identidade fiscal do produto (GOAL_004) — campo ADITIVO e somente-leitura.
   * Presente apenas quando há algum dado fiscal. O PDV ignora; o Cadastro usa na edição.
   */
  fiscal?: ProdutoFiscal
  /**
   * Configuração de venda do acessório (PDV-ACESSORIOS-CADASTRO-PROJECAO-002) —
   * projeção SANEADA de `Produto.metadata.acessorios`. Presente apenas quando o
   * produto tem configuração válida; produto comum não recebe a chave. Não carrega
   * a lista global de cores nem modelos de aparelho — o futuro modal do PDV importa
   * cores de `lib/acessorios/cores.ts` e consulta `/api/catalogo/aparelhos/search`.
   */
  accessoryConfig?: ProdutoAcessoriosMetadataV1
}

export function rowToItem(row: ProdutoInventoryRow): InvPayload {
  const sku = typeof (row as unknown as { sku?: unknown }).sku === "string" ? String((row as unknown as { sku: string }).sku) : ""
  const barcode =
    typeof (row as unknown as { barcode?: unknown }).barcode === "string"
      ? String((row as unknown as { barcode: string }).barcode)
      : ""
  const skuTrim = sku.trim()
  const bcTrim = barcode.trim()
  const opId = skuTrim || row.id
  const fiscal = getProdutoFiscal(row)
  const accessoryConfig = getProdutoAcessoriosMetadata(row)
  return {
    id: opId,
    name: row.name,
    barcode: bcTrim || undefined,
    sku: skuTrim || undefined,
    dbId: row.id,
    codigo: skuTrim || undefined,
    codigoBarras: bcTrim || undefined,
    stock: row.stock,
    cost: row.precoCusto,
    price: row.price,
    category: typeof (row as unknown as { category?: unknown }).category === "string" ? (row as unknown as { category: string }).category : "",
    ...(isProdutoFiscalVazio(fiscal) ? {} : { fiscal }),
    ...(accessoryConfig ? { accessoryConfig } : {}),
  }
}
