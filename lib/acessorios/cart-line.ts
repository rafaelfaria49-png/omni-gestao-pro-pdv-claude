import { ACESSORIO_CORES_PADRAO, type AcessorioCor } from "./cores"
import { buildAccessoryLineDescription } from "./line-description"
import { sanitizeProdutoAcessoriosMetadata } from "./metadata"
import { buildAccessoryConsolidationKey, validateAccessorySelectionAgainstConfig } from "./selection"
import type {
  AccessorySelectionV1,
  AccessorySelectionValidationError,
  ProdutoAcessoriosMetadataV1,
} from "./types"

/**
 * PDV-ACESSORIOS-SELETOR-MODELO-COR-003 — contrato da LINHA DO CARRINHO do PDV.
 *
 * A seleção de modelo/cor é operacional (snapshot da linha), nunca variação de
 * estoque: `inventoryId`/`dbId`/SKU/preço continuam sendo do produto real, e a
 * `cartLineKey` existe apenas para agrupar visualmente combinações iguais.
 */

/** Config válida que exige interação do operador na venda (modelo e/ou cor). */
export function accessoryConfigRequiresSelection(configValue: unknown): boolean {
  const config = sanitizeProdutoAcessoriosMetadata(configValue)
  return !!config && (config.exigeModelo || config.exigeCor)
}

/**
 * Cores elegíveis para a config: subconjunto `coresPermitidas` quando presente,
 * senão a lista global canônica. Vazio quando a config não exige cor.
 * Nunca duplica labels — retorna sempre referências de `ACESSORIO_CORES_PADRAO`.
 */
export function resolveAccessoryColorOptions(configValue: unknown): readonly AcessorioCor[] {
  const config = sanitizeProdutoAcessoriosMetadata(configValue)
  if (!config?.exigeCor) return []
  const allowed = config.coresPermitidas
  if (Array.isArray(allowed) && allowed.length > 0) {
    return ACESSORIO_CORES_PADRAO.filter((cor) => allowed.includes(cor.key))
  }
  return ACESSORIO_CORES_PADRAO
}

/** Snapshot pronto para a linha do carrinho: chave determinística + descrição expandida. */
export type AccessoryCartLineSnapshot = Readonly<{
  /** Chave de agrupamento (produto real + modelo + cor). NUNCA usar como id de estoque. */
  cartLineKey: string
  /** "Produto — Modelo — Cor" (o nome cadastrado do produto não muda). */
  lineDescription: string
  /** Seleção saneada pelo contrato canônico. */
  selection: AccessorySelectionV1
}>

export type AccessoryCartLineResult =
  | Readonly<{ ok: true; line: AccessoryCartLineSnapshot }>
  | Readonly<{ ok: false; errors: readonly AccessorySelectionValidationError[] }>

const INVALID_SELECTION_ERROR: readonly AccessorySelectionValidationError[] = Object.freeze([
  Object.freeze({
    code: "INVALID_SELECTION" as const,
    field: "accessorySelection" as const,
    message: "Seleção de acessório inválida.",
  }),
])

/**
 * Valida a seleção contra a config e monta o snapshot da linha.
 * Nunca falha silenciosamente: seleção inválida/incompleta retorna `ok: false`
 * com os erros do contrato — o caller NÃO deve adicionar ao carrinho.
 */
export function buildAccessoryCartLine(input: {
  inventoryId: string
  productName: string
  config: unknown
  selection: unknown
}): AccessoryCartLineResult {
  const result = validateAccessorySelectionAgainstConfig(input.config, input.selection)
  if (!result.valid) {
    return Object.freeze({ ok: false as const, errors: result.errors })
  }
  if (!result.selection) {
    return Object.freeze({ ok: false as const, errors: INVALID_SELECTION_ERROR })
  }
  return Object.freeze({
    ok: true as const,
    line: Object.freeze({
      cartLineKey: buildAccessoryConsolidationKey(input.inventoryId, result.selection),
      lineDescription: buildAccessoryLineDescription(input.productName, result.selection),
      selection: result.selection,
    }),
  })
}

/** Duas linhas de acessório são agrupáveis quando têm a MESMA chave determinística. */
export function sameAccessoryCartLine(
  aKey: string | null | undefined,
  bKey: string | null | undefined,
): boolean {
  return typeof aKey === "string" && aKey.length > 0 && aKey === bKey
}

/**
 * Quantidade total de um produto real no carrinho, somando TODAS as linhas
 * (seleções diferentes incluídas) — base do anti-oversell client-side.
 */
export function sumCartQuantityByInventoryId(
  lines: ReadonlyArray<{ inventoryId: string; quantity: number }>,
  inventoryId: string,
): number {
  return lines.reduce(
    (sum, line) => (line.inventoryId === inventoryId ? sum + line.quantity : sum),
    0,
  )
}

/** Re-export do tipo do contrato para os PDVs importarem de um único lugar. */
export type { AccessorySelectionV1, ProdutoAcessoriosMetadataV1 }
