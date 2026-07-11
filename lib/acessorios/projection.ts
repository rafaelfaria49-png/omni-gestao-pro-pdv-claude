import { getProdutoAcessoriosMetadata } from "./metadata"
import type { ProdutoAcessoriosMetadataV1 } from "./types"

/** Projeta somente o contrato saneado; metadata bruto nunca cruza a fronteira do catálogo. */
export function projectProdutoAccessoryConfig(source: unknown): ProdutoAcessoriosMetadataV1 | undefined {
  return getProdutoAcessoriosMetadata(source) ?? undefined
}
