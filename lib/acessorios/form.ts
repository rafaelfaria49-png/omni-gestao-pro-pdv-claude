import { ACESSORIO_CORES_PADRAO, type AcessorioColorKey } from "./cores"
import { getProdutoAcessoriosMetadata, sanitizeProdutoAcessoriosMetadata } from "./metadata"
import type { ProdutoAcessorioTipo, ProdutoAcessoriosMetadataV1 } from "./types"

export type ProdutoAcessoriosFormValue = {
  enabled: boolean
  tipo: ProdutoAcessorioTipo
  exigeModelo: boolean
  exigeCor: boolean
  usaCoresPadrao: boolean
  coresPermitidas: AcessorioColorKey[]
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
  }
}

export function produtoAcessoriosMetadataFromForm(
  value: ProdutoAcessoriosFormValue,
): ProdutoAcessoriosMetadataV1 | null {
  if (!value.enabled) return null
  return sanitizeProdutoAcessoriosMetadata({
    version: 1,
    tipo: value.tipo,
    exigeModelo: value.exigeModelo,
    exigeCor: value.exigeCor,
    usaCoresPadrao: value.usaCoresPadrao,
    coresPermitidas: value.usaCoresPadrao ? null : value.coresPermitidas,
  })
}
