import { ACESSORIO_CORES_PADRAO, type AcessorioColorKey } from "./cores"
import {
  getProdutoAcessoriosMetadata,
  modoCorEfetivo,
  modoModeloEfetivo,
  sanitizeProdutoAcessoriosMetadata,
} from "./metadata"
import type { AcessorioModoCaptura, ProdutoAcessorioTipo, ProdutoAcessoriosMetadataV1 } from "./types"

export type ProdutoAcessoriosFormValue = {
  enabled: boolean
  tipo: ProdutoAcessorioTipo
  exigeModelo: boolean
  exigeCor: boolean
  usaCoresPadrao: boolean
  coresPermitidas: AcessorioColorKey[]
  /**
   * COMPAT-PROFISSIONAL-001 — modo de captura (fonte da verdade quando presente).
   * Ausente = derivado dos booleanos (formulários antigos continuam válidos).
   */
  modoModelo?: AcessorioModoCaptura
  modoCor?: AcessorioModoCaptura
  /** Ids de cores próprias da loja permitidas. `null`/ausente = todas as ativas. */
  coresLoja?: string[] | null
}

const TODAS_AS_CORES = ACESSORIO_CORES_PADRAO.map((cor) => cor.key)

export function emptyProdutoAcessoriosForm(): ProdutoAcessoriosFormValue {
  return {
    enabled: false,
    tipo: "acessorio_generico",
    exigeModelo: false,
    exigeCor: false,
    usaCoresPadrao: true,
    coresPermitidas: [...TODAS_AS_CORES],
  }
}

export function produtoAcessoriosFormFromMetadata(source: unknown): ProdutoAcessoriosFormValue {
  const config = getProdutoAcessoriosMetadata(source)
  if (!config) return emptyProdutoAcessoriosForm()
  return {
    enabled: true,
    tipo: config.tipo,
    exigeModelo: config.exigeModelo,
    exigeCor: config.exigeCor,
    usaCoresPadrao: config.usaCoresPadrao,
    coresPermitidas: config.coresPermitidas == null ? [...TODAS_AS_CORES] : [...config.coresPermitidas],
    modoModelo: modoModeloEfetivo(config),
    modoCor: modoCorEfetivo(config),
    coresLoja: config.coresLoja == null ? null : [...config.coresLoja],
  }
}

/** Aplica um modo de captura mantendo o booleano legado coerente. */
export function withModoCaptura(
  value: ProdutoAcessoriosFormValue,
  campo: "modelo" | "cor",
  modo: AcessorioModoCaptura,
): ProdutoAcessoriosFormValue {
  return campo === "modelo"
    ? { ...value, modoModelo: modo, exigeModelo: modo === "obrigatorio" }
    : { ...value, modoCor: modo, exigeCor: modo === "obrigatorio" }
}

export function produtoAcessoriosMetadataFromForm(
  value: ProdutoAcessoriosFormValue,
): ProdutoAcessoriosMetadataV1 | null {
  if (!value.enabled) return null
  const coresLoja = value.coresLoja == null ? undefined : value.coresLoja
  // Paleta restrita + cores próprias: a cor própria viaja como "outra" + rótulo,
  // então "outra" precisa estar entre as permitidas para a venda não recusar a cor.
  const coresPermitidas = value.usaCoresPadrao
    ? null
    : coresLoja && coresLoja.length > 0 && !value.coresPermitidas.includes("outra")
      ? [...value.coresPermitidas, "outra" as const]
      : value.coresPermitidas
  return sanitizeProdutoAcessoriosMetadata({
    version: 1,
    tipo: value.tipo,
    exigeModelo: value.exigeModelo,
    exigeCor: value.exigeCor,
    usaCoresPadrao: value.usaCoresPadrao,
    coresPermitidas,
    ...(value.modoModelo ? { modoModelo: value.modoModelo } : {}),
    ...(value.modoCor ? { modoCor: value.modoCor } : {}),
    ...(coresLoja ? { coresLoja } : {}),
  })
}
