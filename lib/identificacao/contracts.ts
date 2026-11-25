import { z } from "zod"

export const id = z.string().trim().min(1).max(160).regex(/^[^\x00-\x20\x7f]+$/)
export const requestKey = z.string().min(8).max(100).regex(/^[A-Za-z0-9._:-]+$/)
export const targetSchema = z.object({ produtoId: id, varianteId: id.nullable().default(null) }).strict()
export type Target = z.infer<typeof targetSchema>
export const internalSchema = z.object({ target: targetSchema, requestKey, preservarCodigoExistente: z.boolean().default(false) }).strict()
export const identifierSchema = z.object({
  target: targetSchema, requestKey, tipo: z.enum(["ALIAS", "GTIN"]), valor: z.string().min(1).max(100),
  origem: z.enum(["MANUAL", "FABRICANTE", "FORNECEDOR", "MARCA"]), evidencia: z.string().trim().min(3).max(500),
}).strict()
export const activeSchema = z.object({ id, ativo: z.boolean(), expectedVersion: z.number().int().positive(), requestKey }).strict()
export const mediaSchema = z.object({
  widthMm: z.number().int().min(50).max(110), heightMm: z.number().int().min(30).max(80),
  marginMm: z.number().int().min(2).max(6), barcodeHeightMm: z.number().int().min(7).max(20), showPrice: z.boolean(),
}).strict().refine((v) => v.barcodeHeightMm + v.marginMm * 2 + (v.showPrice ? 18 : 15) <= v.heightMm, "A mídia precisa comportar texto, margens e barras. Reduza as barras/margens ou aumente a altura.")
export type LabelMedia = z.infer<typeof mediaSchema>
export const DEFAULT_MEDIA: LabelMedia = { widthMm: 60, heightMm: 40, marginMm: 2, barcodeHeightMm: 10, showPrice: false }
export const jobSchema = z.object({
  requestKey, media: mediaSchema,
  items: z.array(z.object({ target: targetSchema, quantidade: z.number().int().min(1).max(100),
    expectedUpdatedAt: z.string().datetime(), expectedVariantVersion: z.number().int().positive().nullable().default(null),
  }).strict()).min(1).max(50),
}).strict().superRefine((v, ctx) => {
  if (v.items.reduce((n, x) => n + x.quantidade, 0) > 500) ctx.addIssue({ code: "custom", message: "Limite de 500 etiquetas por lote." })
  const targets = v.items.map((x) => targetKey(x.target))
  if (new Set(targets).size !== targets.length) ctx.addIssue({ code: "custom", message: "Não repita o alvo no lote; ajuste a quantidade." })
})
export const reprintSchema = z.object({ loteId: id, motivo: z.string().trim().min(3).max(300), requestKey }).strict()
export const attemptSchema = z.object({ loteId: id, requestKey }).strict()
export const attemptEventSchema = z.object({ tentativaId: id, requestKey,
  evento: z.enum(["DIALOGO_SOLICITADO", "POPUP_BLOQUEADO", "FALHA_PREPARACAO", "CONFIRMAR_MANUAL"]),
}).strict()

export type IdentifierType = "INTERNO" | "GTIN" | "ALIAS"
export type PrintState = "SOLICITADO" | "RESULTADO_DESCONHECIDO" | "FALHA_ANTES_ENVIO" | "CONFIRMADO_MANUAL"
export type IdentifierDTO = { id: string; produtoId: string; varianteId: string | null; tipo: string; valor: string; ativo: boolean; version: number; formato: string | null; origem: string; evidencia: string }
export type TargetDTO = { produtoId: string; varianteId: string | null; nome: string; sku: string | null; cor: string | null; tamanho: string | null;
  updatedAt: string; variantVersion: number | null; precoCentavos: number | null; codigoInterno: string | null; codigoInternoAtivo: boolean; codigoExistente: string | null }
export type LabelItem = TargetDTO & { identificadorId: string; codigo: string; quantidade: number }
export type LabelSnapshot = { version: 1; createdAt: string; media: LabelMedia; items: LabelItem[]; total: number }
export const snapshotSchema = z.object({
  version: z.literal(1), createdAt: z.string().datetime(), media: mediaSchema, total: z.number().int().min(1).max(500),
  items: z.array(z.object({
    produtoId: id, varianteId: id.nullable(), nome: z.string().min(1).max(2000), sku: z.string().max(2000).nullable(),
    cor: z.string().max(2000).nullable(), tamanho: z.string().max(2000).nullable(), updatedAt: z.string().datetime(),
    variantVersion: z.number().int().positive().nullable(), precoCentavos: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
    codigoInterno: z.string(), codigoInternoAtivo: z.literal(true), codigoExistente: z.string().nullable(),
    identificadorId: id, codigo: z.string().regex(/^OGV-[0-9]{12}$/), quantidade: z.number().int().min(1).max(100),
  }).strict()).min(1).max(50),
}).strict().superRefine((v, ctx) => {
  if (v.items.reduce((n, x) => n + x.quantidade, 0) !== v.total || new Set(v.items.map(targetKey)).size !== v.items.length
    || v.items.some(x => x.codigoInterno !== x.codigo || (v.media.showPrice && x.precoCentavos === null) || (x.varianteId !== null && (!x.cor || !x.tamanho)))) {
    ctx.addIssue({ code: "custom", message: "Snapshot de etiquetas inconsistente." })
  }
})
export const operationSchema = z.enum(["INTERNO", "CADASTRAR", "ATIVO", "LOTE", "REIMPRIMIR", "TENTATIVA", "EVENTO"])
export type Operation = z.infer<typeof operationSchema>
export type MutationRef = { id: string; kind: "identifier" | "job" | "attempt" }
export type JobDTO = { id: string; total: number; originalId: string | null; motivo: string; createdAt: string; snapshot: LabelSnapshot;
  tentativas: { id: string; estado: PrintState; confirmedBy: string | null }[] }
export type Failure = { ok: false; code: string; message: string }
export type Result<T> = { ok: true; value: T } | Failure
export function targetKey(v: Target): string { return JSON.stringify([v.produtoId, v.varianteId ?? null]) }
/** O legado mantém seu valor; esta chave só compara reservas novas e o lookup P03. */
export function codeKey(value: string): string {
  return value.trim().replace(/[a-z]/g, (c) => c.toUpperCase())
}
export function nextPrintState(current: PrintState, event: z.infer<typeof attemptEventSchema>["evento"]): PrintState {
  if (current === "CONFIRMADO_MANUAL" || current === "FALHA_ANTES_ENVIO") return current
  if (event === "CONFIRMAR_MANUAL") return "CONFIRMADO_MANUAL"
  if (event === "DIALOGO_SOLICITADO") return "RESULTADO_DESCONHECIDO"
  return current === "SOLICITADO" ? "FALHA_ANTES_ENVIO" : current
}
