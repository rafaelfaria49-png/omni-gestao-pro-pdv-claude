import { ACESSORIO_CORES_PADRAO, isAcessorioColorKey, type AcessorioColorKey } from "./cores"
import {
  PRODUTO_ACESSORIO_TIPOS,
  type ProdutoAcessorioTipo,
  type ProdutoAcessoriosMetadataV1,
} from "./types"

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function isProdutoAcessorioTipo(value: unknown): value is ProdutoAcessorioTipo {
  return typeof value === "string" && (PRODUTO_ACESSORIO_TIPOS as readonly string[]).includes(value)
}

function sanitizeCoresPermitidas(value: readonly unknown[]): readonly AcessorioColorKey[] {
  const requested = new Set<AcessorioColorKey>()
  for (const item of value) {
    if (isAcessorioColorKey(item)) requested.add(item)
  }
  return Object.freeze(
    ACESSORIO_CORES_PADRAO.filter((cor) => requested.has(cor.key)).map((cor) => cor.key),
  )
}

export function sanitizeProdutoAcessoriosMetadata(value: unknown): ProdutoAcessoriosMetadataV1 | null {
  const input = asRecord(value)
  if (!input || input.version !== 1 || !isProdutoAcessorioTipo(input.tipo)) return null
  if (
    typeof input.exigeModelo !== "boolean" ||
    typeof input.exigeCor !== "boolean" ||
    typeof input.usaCoresPadrao !== "boolean"
  ) {
    return null
  }

  const output: {
    version: 1
    tipo: ProdutoAcessorioTipo
    exigeModelo: boolean
    exigeCor: boolean
    usaCoresPadrao: boolean
    coresPermitidas?: readonly AcessorioColorKey[] | null
  } = {
    version: 1,
    tipo: input.tipo,
    exigeModelo: input.exigeModelo,
    exigeCor: input.exigeCor,
    usaCoresPadrao: input.usaCoresPadrao,
  }

  if (Object.prototype.hasOwnProperty.call(input, "coresPermitidas")) {
    if (input.coresPermitidas === null) output.coresPermitidas = null
    else if (Array.isArray(input.coresPermitidas)) {
      output.coresPermitidas = sanitizeCoresPermitidas(input.coresPermitidas)
    } else return null
  }

  return Object.freeze(output)
}

export function getProdutoAcessoriosMetadata(source: unknown): ProdutoAcessoriosMetadataV1 | null {
  const root = asRecord(source)
  if (!root) return null
  const nestedMetadata = asRecord(root.metadata)
  const metadata = nestedMetadata ?? root
  return sanitizeProdutoAcessoriosMetadata(metadata.acessorios)
}

export function mergeProdutoAcessoriosIntoMetadata(
  metadataBase: unknown,
  config: unknown,
): Readonly<Record<string, unknown>> {
  const base = { ...(asRecord(metadataBase) ?? {}) }
  const sanitized = config == null ? null : sanitizeProdutoAcessoriosMetadata(config)
  if (sanitized) base.acessorios = sanitized
  else delete base.acessorios
  return Object.freeze(base)
}
