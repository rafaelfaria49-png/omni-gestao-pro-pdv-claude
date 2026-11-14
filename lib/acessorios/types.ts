import type { AcessorioColorKey } from "./cores"

export const PRODUTO_ACESSORIO_TIPOS = ["capinha", "pelicula", "acessorio_generico"] as const

export type ProdutoAcessorioTipo = (typeof PRODUTO_ACESSORIO_TIPOS)[number]

/**
 * COMPAT-PROFISSIONAL-001 — captura de modelo/cor na venda:
 *  - obrigatorio: o PDV pede e não deixa adicionar sem informar;
 *  - opcional:    o PDV pergunta, mas dá para adicionar sem informar (venda rápida);
 *  - desativado:  o PDV não pergunta.
 * Produtos antigos (sem `modoModelo`/`modoCor`) seguem os booleanos: exige → obrigatório,
 * não exige → desativado. `exigeModelo`/`exigeCor` continuam gravados e coerentes com o modo
 * (o servidor da venda valida por eles), então nenhum leitor antigo muda de comportamento.
 */
export const ACESSORIO_MODOS_CAPTURA = ["obrigatorio", "opcional", "desativado"] as const
export type AcessorioModoCaptura = (typeof ACESSORIO_MODOS_CAPTURA)[number]

export type ProdutoAcessoriosMetadataV1 = Readonly<{
  version: 1
  tipo: ProdutoAcessorioTipo
  exigeModelo: boolean
  exigeCor: boolean
  usaCoresPadrao: boolean
  coresPermitidas?: readonly AcessorioColorKey[] | null
  /** COMPAT-PROFISSIONAL-001 — ausente em produtos antigos (derivar de `exigeModelo`). */
  modoModelo?: AcessorioModoCaptura
  /** COMPAT-PROFISSIONAL-001 — ausente em produtos antigos (derivar de `exigeCor`). */
  modoCor?: AcessorioModoCaptura
  /**
   * COMPAT-PROFISSIONAL-001 — ids de cores PRÓPRIAS da loja permitidas neste produto.
   * Ausente/null = todas as cores próprias ativas da loja (quando `usaCoresPadrao`).
   */
  coresLoja?: readonly string[] | null
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
