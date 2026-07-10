import type { AcessorioColorKey } from "./cores"

export const PRODUTO_ACESSORIO_TIPOS = ["capinha", "pelicula", "acessorio_generico"] as const

export type ProdutoAcessorioTipo = (typeof PRODUTO_ACESSORIO_TIPOS)[number]

export type ProdutoAcessoriosMetadataV1 = Readonly<{
  version: 1
  tipo: ProdutoAcessorioTipo
  exigeModelo: boolean
  exigeCor: boolean
  usaCoresPadrao: boolean
  coresPermitidas?: readonly AcessorioColorKey[] | null
}>

export type AccessorySelectionV1 = Readonly<{
  version: 1
  deviceModelKey?: string
  deviceBrand?: string
  deviceModelName?: string
  colorKey?: AcessorioColorKey
  colorLabel?: string
  customColorLabel?: string
}>

export type AccessorySelectionValidationErrorCode =
  | "INVALID_SELECTION"
  | "MODEL_REQUIRED"
  | "COLOR_REQUIRED"
  | "CUSTOM_COLOR_REQUIRED"
  | "COLOR_NOT_ALLOWED"

export type AccessorySelectionValidationField =
  | "accessorySelection"
  | "deviceModelKey"
  | "deviceModelName"
  | "colorKey"
  | "customColorLabel"

export type AccessorySelectionValidationError = Readonly<{
  code: AccessorySelectionValidationErrorCode
  field: AccessorySelectionValidationField
  message: string
}>

export type AccessorySelectionValidationResult = Readonly<{
  valid: boolean
  selection: AccessorySelectionV1 | null
  errors: readonly AccessorySelectionValidationError[]
}>
