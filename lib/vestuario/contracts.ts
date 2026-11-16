/** P01: contratos prospectivos. Não substituem DTOs legados nem declaram persistência operacional. */
import { z } from "zod"
import { lineTotalCents } from "./money"

export const VESTUARIO_CONTRACT_VERSION = 1 as const

const id = z.string().min(1).max(128).refine((v) => v === v.trim() && !/[\u0000-\u001f\u007f]/.test(v), "Identificador inválido")
const label = z.string().min(1).max(200).refine((v) => v === v.trim() && !/[\u0000-\u001f\u007f]/.test(v), "Rótulo inválido")
const internalBarcode = z.string().min(1).max(64).regex(/^[\x21-\x7e]+$/)
const minorUnits = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const quantity = z.number().int().positive().max(2_000_000_000)
const owner = { version: z.literal(VESTUARIO_CONTRACT_VERSION), storeId: id, produtoId: id }

export const simpleProductV1Schema = z.object({ ...owner, mode: z.literal("SIMPLES") }).strict()
export const gradeProductV1Schema = z.object({ ...owner, mode: z.literal("COM_GRADE"), gradeId: id }).strict()
export const productCatalogV1Schema = z.discriminatedUnion("mode", [simpleProductV1Schema, gradeProductV1Schema])

export const variantIdentityV1Schema = z.object({
  ...owner,
  varianteId: id,
  corId: id,
  tamanhoId: id,
  sku: label,
  /** Código interno para Code 128, independente do GTIN; sem geração ou impressão nesta fase. */
  barcodeInterno: internalBarcode,
}).strict()

const stockOwner = { ...owner, depositoId: id }
export const stockTargetV1Schema = z.discriminatedUnion("kind", [
  z.object({ ...stockOwner, kind: z.literal("SIMPLES") }).strict(),
  z.object({ ...stockOwner, kind: z.literal("VARIANTE"), varianteId: id }).strict(),
])

const saleLineBase = {
  ...owner,
  lineId: id,
  depositoId: id,
  catalogVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  quantity,
  unitPriceCents: minorUnits,
  discountCents: minorUnits,
  totalCents: minorUnits,
}

function validateLineTotal(value: { quantity: number; unitPriceCents: number; discountCents: number; totalCents: number }, ctx: z.RefinementCtx) {
  try {
    if (lineTotalCents(value.quantity, value.unitPriceCents, value.discountCents) === value.totalCents) return
  } catch { /* overflow ou desconto maior que o bruto também são inválidos */ }
  ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["totalCents"], message: "Total não corresponde à quantidade, preço e desconto." })
}

export const simpleSaleLineV1Schema = z.object({
  ...saleLineBase, kind: z.literal("SIMPLES"), skuSnapshot: label,
}).strict().superRefine(validateLineTotal)

export const variantSaleLineV1Schema = z.object({
  ...saleLineBase,
  kind: z.literal("VARIANTE"),
  varianteId: id,
  corId: id,
  tamanhoId: id,
  skuSnapshot: label,
  corSnapshot: label,
  tamanhoSnapshot: label,
  barcodeSnapshot: internalBarcode,
}).strict().superRefine(validateLineTotal)

export const saleLineV1Schema = z.union([simpleSaleLineV1Schema, variantSaleLineV1Schema])

export type ProductCatalogV1 = z.infer<typeof productCatalogV1Schema>
export type VariantIdentityV1 = z.infer<typeof variantIdentityV1Schema>
export type StockTargetV1 = z.infer<typeof stockTargetV1Schema>
export type SimpleSaleLineV1 = z.infer<typeof simpleSaleLineV1Schema>
export type VariantSaleLineV1 = z.infer<typeof variantSaleLineV1Schema>
export type SaleLineV1 = z.infer<typeof saleLineV1Schema>

/** SKU/rótulos/código são snapshots mutáveis. Nunca derivar varianteId de cor, tamanho ou texto. */
export function stableVariantKey(identity: Pick<VariantIdentityV1, "storeId" | "produtoId" | "varianteId">): string {
  return JSON.stringify([identity.storeId, identity.produtoId, identity.varianteId])
}

export type VariantScopeResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; code: "UNTRUSTED_CONTEXT" | "CROSS_STORE" | "PRODUCT_MISMATCH" | "VARIANT_REQUIRED" | "INVALID_CONTRACT" }>

/** Contexto e registros devem vir do servidor; payload só pode ser comparado com eles. Sem I/O. */
export function validateVariantScope(
  authorizedStoreId: string, product: unknown, variant: unknown,
): VariantScopeResult {
  if (!id.safeParse(authorizedStoreId).success) return { ok: false, code: "UNTRUSTED_CONTEXT" }
  const p = productCatalogV1Schema.safeParse(product)
  if (!p.success) return { ok: false, code: "INVALID_CONTRACT" }
  if (p.data.storeId !== authorizedStoreId) return { ok: false, code: "CROSS_STORE" }
  if (variant === null || variant === undefined) return p.data.mode === "SIMPLES" ? { ok: true } : { ok: false, code: "VARIANT_REQUIRED" }
  const v = variantIdentityV1Schema.safeParse(variant)
  if (!v.success) return { ok: false, code: "INVALID_CONTRACT" }
  if (v.data.storeId !== authorizedStoreId) return { ok: false, code: "CROSS_STORE" }
  if (v.data.produtoId !== p.data.produtoId || p.data.mode !== "COM_GRADE") return { ok: false, code: "PRODUCT_MISMATCH" }
  return { ok: true }
}
