/**
 * GOAL_INVENTARIO_BARCODE_ALIAS_V01 — Alias de código (barcode/EAN/SKU) do PRODUTO. Núcleo PURO.
 *
 * Quando um código bipado SEM cadastro é reconciliado no Inventário Assistido (produto novo
 * cadastrado ou associado a um existente), o código vira um ALIAS persistente do produto para ser
 * reconhecido automaticamente nas contagens futuras. Persistência ADITIVA em
 * `Produto.metadata.codigosAlias` (string[]), espelhando o padrão de `metadata.fiscal`
 * (`lib/produto-fiscal.ts`) — SEM schema/migration/db:push.
 *
 * As colunas core `barcode`/`sku` (únicas por loja, `@@unique([storeId, x])`) seguem INTOCADAS: o
 * alias é uma lista complementar de códigos que também resolvem o produto. A unicidade do alias na
 * loja é garantida pela Server Action (consulta o catálogo antes de gravar) — aqui é tudo PURO,
 * sem Prisma/rede. `storeId` é responsabilidade do chamador.
 */

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/** Normaliza o código (trim). Mesma normalização da bipagem (`normalizarCodigo`). Não muda caixa. */
export function normalizarCodigoAlias(code: string | null | undefined): string {
  return (code ?? "").trim()
}

/** Lê a lista de aliases gravada em `metadata.codigosAlias` (dedup, só strings não vazias). PURO. */
export function lerCodigosAlias(metadata: unknown): string[] {
  const meta = asRecord(metadata)
  const arr = meta?.codigosAlias
  if (!Array.isArray(arr)) return []
  const out: string[] = []
  for (const v of arr) {
    const s = normalizarCodigoAlias(typeof v === "string" ? v : "")
    if (s && !out.includes(s)) out.push(s)
  }
  return out
}

/** Forma mínima de um produto para resolução por código. */
export type ProdutoCodigos = {
  barcode?: string | null
  sku?: string | null
  metadata?: unknown
}

/** Todos os códigos que JÁ resolvem este produto: barcode + sku + aliases (dedup, normalizado). */
export function codigosDoProduto(produto: ProdutoCodigos): string[] {
  const out: string[] = []
  const bc = normalizarCodigoAlias(produto.barcode)
  const sku = normalizarCodigoAlias(produto.sku)
  if (bc) out.push(bc)
  if (sku && !out.includes(sku)) out.push(sku)
  for (const a of lerCodigosAlias(produto.metadata)) if (!out.includes(a)) out.push(a)
  return out
}

/** `true` se o código já resolve este produto (barcode, sku ou alias). PURO. */
export function produtoResolveCodigo(produto: ProdutoCodigos, code: string | null | undefined): boolean {
  const c = normalizarCodigoAlias(code)
  if (!c) return false
  return codigosDoProduto(produto).includes(c)
}

/**
 * Devolve um NOVO objeto `metadata` com o código adicionado a `codigosAlias` (dedup), preservando
 * todas as demais chaves (ex.: `fiscal`). PURO. Código vazio ou já presente → devolve a base
 * inalterada (sem poluir o JSONB).
 */
export function adicionarCodigoAliasMetadata(metadataBase: unknown, code: string | null | undefined): Record<string, unknown> {
  const base = { ...(asRecord(metadataBase) ?? {}) }
  const c = normalizarCodigoAlias(code)
  if (!c) return base
  const atuais = lerCodigosAlias(base)
  if (atuais.includes(c)) return base
  base.codigosAlias = [...atuais, c]
  return base
}
