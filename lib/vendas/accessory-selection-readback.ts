/**
 * PDV-ACESSORIOS-SELECAO-READBACK-004C
 *
 * Leitura defensiva de `accessorySelection` persistida em `Venda.payload.lines[]`
 * (saneada em `lib/ops-upsert-venda.ts` § 004B) para apresentação no detalhe da
 * venda. Contrato puro, sem React, sem rede, sem dependência de navegador —
 * reutilizável por qualquer superfície (Vendas HUB, PDV Next quando reativado).
 *
 * Histórico imutável: os labels retornados são exatamente os que foram
 * congelados no momento da venda. Não há aqui nenhuma consulta ao catálogo
 * atual de modelos/cores — `deviceModelName`/`deviceBrand` são texto livre já
 * persistido, e `colorLabel`/`customColorLabel` são usados como estão, sem
 * revalidar `colorKey` contra a paleta atual (`isAcessorioColorKey`). Isso
 * evita que uma futura mudança na paleta de cores apague retroativamente a
 * seleção de vendas antigas — o risco que `sanitizeAccessorySelection` (que
 * revalida `colorKey` contra a paleta vigente) introduziria se reutilizado
 * aqui para leitura.
 */
import { resolveAccessoryModelPresentation } from "@/lib/acessorios/line-description"
import type { AccessorySelectionV1 } from "@/lib/acessorios/types"

export type AccessorySelectionReadback = Readonly<{
  modelLabel?: string
  colorLabel?: string
  hasSelection: boolean
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

/**
 * Reconstrói `AccessorySelectionV1` a partir do valor bruto persistido,
 * validando apenas a forma (shape) — nunca o `colorKey` contra a paleta atual.
 */
function readPersistedSelection(raw: unknown): AccessorySelectionV1 | undefined {
  if (!isRecord(raw) || raw.version !== 1) return undefined

  const deviceModelKey = isNonEmptyString(raw.deviceModelKey) ? raw.deviceModelKey.trim() : undefined
  const deviceBrand = isNonEmptyString(raw.deviceBrand) ? raw.deviceBrand.trim() : undefined
  const deviceModelName = isNonEmptyString(raw.deviceModelName) ? raw.deviceModelName.trim() : undefined
  const colorKey = isNonEmptyString(raw.colorKey) ? raw.colorKey.trim() : undefined
  const colorLabel = isNonEmptyString(raw.colorLabel) ? raw.colorLabel.trim() : undefined
  const customColorLabel = isNonEmptyString(raw.customColorLabel) ? raw.customColorLabel.trim() : undefined

  if (!deviceModelKey && !deviceBrand && !deviceModelName && !colorKey && !colorLabel && !customColorLabel) {
    return undefined
  }

  return {
    version: 1,
    ...(deviceModelKey ? { deviceModelKey } : {}),
    ...(deviceBrand ? { deviceBrand } : {}),
    ...(deviceModelName ? { deviceModelName } : {}),
    ...(colorKey ? { colorKey: colorKey as AccessorySelectionV1["colorKey"] } : {}),
    ...(colorLabel ? { colorLabel } : {}),
    ...(customColorLabel ? { customColorLabel } : {}),
  }
}

function readColorLabel(selection: AccessorySelectionV1): string | undefined {
  if (selection.colorKey === "outra") return selection.customColorLabel ?? selection.colorLabel
  return selection.colorLabel
}

/**
 * Lê a seleção de acessório de uma linha bruta de `payload.lines[i]` (ou de
 * qualquer objeto desconhecido) e produz labels prontos para exibição.
 * Ausência total retorna `hasSelection: false` — nunca infere pelo nome do
 * produto, nunca lança erro.
 */
export function readAccessorySelectionForDisplay(rawLine: unknown): AccessorySelectionReadback {
  const line = isRecord(rawLine) ? rawLine : null
  const selection = line ? readPersistedSelection(line.accessorySelection) : undefined

  if (!selection) return { hasSelection: false }

  return {
    hasSelection: true,
    modelLabel: resolveAccessoryModelPresentation(selection) ?? undefined,
    colorLabel: readColorLabel(selection),
  }
}
