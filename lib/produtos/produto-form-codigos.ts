/**
 * PRODUTO-CODIGOS-UI-PAYLOAD-FIX-002 — fonte única do mapeamento dos códigos do
 * formulário de cadastro de produtos (`gestao-produtos.tsx`) para o payload da API.
 *
 * Mapeamento canônico (sem disputar a mesma coluna):
 *   - SKU / Código interno  → `Produto.sku`     (campo `sku`)
 *   - Código de barras EAN  → `Produto.barcode`  (campo `barcode`)
 *
 * A UI nova envia SÓ `sku` e `barcode` — não envia mais `codigo`/`codigoBarras`
 * duplicados, que antes podiam sobrescrever silenciosamente a mesma coluna. O backend
 * segue aceitando os aliases legados (`codigo`/`codigoBarras`) por compatibilidade.
 *
 * Aliases reais (`Produto.metadata.codigosAlias`) NÃO são editados aqui — são tratados
 * exclusivamente pelo fluxo de reconciliação do Inventário Assistido.
 */

/** Prefixos legados (importação / IDs sintéticos) — limpos do SKU exibido e enviado; nunca tocam `id`/`dbId`. */
const AUTO_CODIGO_PREFIX = /^(?:gc-|prod-|id-)/i

export function stripAutoCodigoPrefixes(raw: string): string {
  let s = raw.trim()
  while (AUTO_CODIGO_PREFIX.test(s)) s = s.replace(AUTO_CODIGO_PREFIX, "").trim()
  return s
}

export function normalizeUserCodigoInput(s: string | undefined | null): string | undefined {
  const t = (s ?? "").trim()
  if (!t) return undefined
  return stripAutoCodigoPrefixes(t) || undefined
}

export type ProdutoFormCodigos = { sku?: string; barcode?: string }

/**
 * Constrói o par canônico `{ sku?, barcode? }` a partir dos dois únicos campos de código
 * do formulário. Chaves vazias são omitidas (não viajam no payload), preservando o
 * comportamento de PATCH (não tocar campo ausente).
 */
export function buildProdutoFormCodigos(input: {
  sku?: string | null
  barcode?: string | null
}): ProdutoFormCodigos {
  const out: ProdutoFormCodigos = {}
  const sku = normalizeUserCodigoInput(input.sku ?? undefined)
  if (sku) out.sku = sku
  const barcode = (input.barcode ?? "").trim()
  if (barcode) out.barcode = barcode
  return out
}
