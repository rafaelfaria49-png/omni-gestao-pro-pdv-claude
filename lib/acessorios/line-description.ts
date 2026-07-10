import { resolveAcessorioColorLabel } from "./cores"
import { sanitizeAccessorySelection } from "./selection"
import type { AccessorySelectionV1 } from "./types"

export const ACCESSORY_LINE_SEPARATOR = " — "

function normalizedForComparison(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim()
}

export function resolveAccessoryModelPresentation(selection: AccessorySelectionV1 | null): string | null {
  const modelName = selection?.deviceModelName?.trim()
  if (!modelName) return null
  const brand = selection?.deviceBrand?.trim()
  if (!brand) return modelName

  const normalizedName = normalizedForComparison(modelName)
  const normalizedBrand = normalizedForComparison(brand)
  if (normalizedName === normalizedBrand || normalizedName.startsWith(`${normalizedBrand} `)) {
    return modelName
  }
  return `${brand} ${modelName}`
}

export function resolveAccessoryColorPresentation(selection: AccessorySelectionV1 | null): string | null {
  if (!selection?.colorKey) return null
  if (selection.colorKey === "outra") return selection.customColorLabel?.trim() || null
  return resolveAcessorioColorLabel(selection.colorKey)
}

export function buildAccessoryLineDescription(baseProductName: string, selectionValue?: unknown): string {
  const base = baseProductName.trim()
  const selection = sanitizeAccessorySelection(selectionValue)
  const parts = [
    base,
    resolveAccessoryModelPresentation(selection),
    resolveAccessoryColorPresentation(selection),
  ].filter((part): part is string => Boolean(part))
  return parts.join(ACCESSORY_LINE_SEPARATOR)
}
