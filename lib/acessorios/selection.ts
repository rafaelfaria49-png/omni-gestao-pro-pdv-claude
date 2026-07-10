import { isAcessorioColorKey, resolveAcessorioColorLabel } from "./cores"
import { sanitizeProdutoAcessoriosMetadata } from "./metadata"
import type {
  AccessorySelectionV1,
  AccessorySelectionValidationError,
  AccessorySelectionValidationResult,
} from "./types"

export const ACCESSORY_SELECTION_TEXT_LIMITS = Object.freeze({
  deviceModelKey: 160,
  deviceBrand: 80,
  deviceModelName: 160,
  customColorLabel: 80,
})

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function trimmedText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined
  const text = value.trim()
  return text ? text.slice(0, maxLength) : undefined
}

export function sanitizeAccessorySelection(value: unknown): AccessorySelectionV1 | null {
  const input = asRecord(value)
  if (!input || input.version !== 1) return null

  const deviceModelKey = trimmedText(input.deviceModelKey, ACCESSORY_SELECTION_TEXT_LIMITS.deviceModelKey)
  const deviceBrand = trimmedText(input.deviceBrand, ACCESSORY_SELECTION_TEXT_LIMITS.deviceBrand)
  const deviceModelName = trimmedText(input.deviceModelName, ACCESSORY_SELECTION_TEXT_LIMITS.deviceModelName)

  if (input.colorKey !== undefined && !isAcessorioColorKey(input.colorKey)) return null
  const colorKey = isAcessorioColorKey(input.colorKey) ? input.colorKey : undefined
  const colorLabel = colorKey ? (resolveAcessorioColorLabel(colorKey) ?? undefined) : undefined
  const customColorLabel = colorKey === "outra"
    ? trimmedText(input.customColorLabel, ACCESSORY_SELECTION_TEXT_LIMITS.customColorLabel)
    : undefined

  return Object.freeze({
    version: 1 as const,
    ...(deviceModelKey ? { deviceModelKey } : {}),
    ...(deviceBrand ? { deviceBrand } : {}),
    ...(deviceModelName ? { deviceModelName } : {}),
    ...(colorKey ? { colorKey } : {}),
    ...(colorLabel ? { colorLabel } : {}),
    ...(customColorLabel ? { customColorLabel } : {}),
  })
}

function validationError(
  code: AccessorySelectionValidationError["code"],
  field: AccessorySelectionValidationError["field"],
  message: string,
): AccessorySelectionValidationError {
  return Object.freeze({ code, field, message })
}

export function validateAccessorySelectionAgainstConfig(
  configValue: unknown,
  selectionValue: unknown,
): AccessorySelectionValidationResult {
  const config = sanitizeProdutoAcessoriosMetadata(configValue)
  const selectionWasProvided = selectionValue !== null && selectionValue !== undefined
  const selection = selectionWasProvided ? sanitizeAccessorySelection(selectionValue) : null

  if (selectionWasProvided && !selection) {
    return Object.freeze({
      valid: false,
      selection: null,
      errors: Object.freeze([
        validationError("INVALID_SELECTION", "accessorySelection", "Seleção de acessório inválida."),
      ]),
    })
  }

  const errors: AccessorySelectionValidationError[] = []
  if (config?.exigeModelo) {
    if (!selection?.deviceModelKey) {
      errors.push(validationError("MODEL_REQUIRED", "deviceModelKey", "Selecione o modelo do aparelho."))
    }
    if (!selection?.deviceModelName) {
      errors.push(validationError("MODEL_REQUIRED", "deviceModelName", "Informe o nome do modelo selecionado."))
    }
  }

  if (config?.exigeCor && !selection?.colorKey) {
    errors.push(validationError("COLOR_REQUIRED", "colorKey", "Selecione a cor do acessório."))
  }

  if (selection?.colorKey === "outra" && !selection.customColorLabel) {
    errors.push(
      validationError("CUSTOM_COLOR_REQUIRED", "customColorLabel", "Informe a cor personalizada."),
    )
  }

  if (
    selection?.colorKey &&
    Array.isArray(config?.coresPermitidas) &&
    !config.coresPermitidas.includes(selection.colorKey)
  ) {
    errors.push(validationError("COLOR_NOT_ALLOWED", "colorKey", "A cor selecionada não é permitida."))
  }

  return Object.freeze({
    valid: errors.length === 0,
    selection,
    errors: Object.freeze(errors),
  })
}

function normalizedCustomColor(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR")
}

export function buildAccessoryConsolidationKey(inventoryId: string, selectionValue?: unknown): string {
  const selection = sanitizeAccessorySelection(selectionValue)
  return JSON.stringify([
    inventoryId.trim(),
    selection?.deviceModelKey ?? "",
    selection?.colorKey ?? "",
    selection?.colorKey === "outra" ? normalizedCustomColor(selection.customColorLabel) : "",
  ])
}
