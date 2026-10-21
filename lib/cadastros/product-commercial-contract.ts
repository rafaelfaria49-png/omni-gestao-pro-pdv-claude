import { getProdutoAcessoriosMetadata } from "@/lib/acessorios/metadata"

/** Descrição comercial. Não armazena saldo, não converte estoque nem habilita PDV. */
export type ProductCommercialV1 = {
  version: 1
  modoVenda: "unidade" | "peso"
  unidade: "UN" | "KG" | "G"
  basePreco: "UN" | "KG" | "G"
  gradePlanejada?: boolean
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function validateProductCommercial(value: unknown): value is ProductCommercialV1 {
  const input = record(value)
  if (Object.keys(input).some((key) => !["version", "modoVenda", "unidade", "basePreco", "gradePlanejada"].includes(key))) return false
  if (input.version !== 1 || (input.gradePlanejada !== undefined && typeof input.gradePlanejada !== "boolean")) return false
  if (input.modoVenda === "unidade") return input.unidade === "UN" && input.basePreco === "UN"
  return input.modoVenda === "peso" && (input.unidade === "KG" || input.unidade === "G") && input.basePreco === input.unidade
}

export function productCommercialFromMetadata(metadata: unknown): ProductCommercialV1 {
  const raw = record(metadata).comercial
  if (validateProductCommercial(raw) && raw.modoVenda === "peso") return raw
  // Declarações legadas de peso também bloqueiam venda; nunca reinterpretar como unidade.
  const base = record(metadata)
  if (base.vendaPorPeso === true || record(base.atributos).vendaPorPeso === true ||
      record(raw).modoVenda === "peso") {
    return { version: 1, modoVenda: "peso", unidade: "KG", basePreco: "KG" }
  }
  if (validateProductCommercial(raw)) return raw
  return { version: 1, modoVenda: "unidade", unidade: "UN", basePreco: "UN" }
}

export function isProductWeightDeclared(metadata: unknown): boolean {
  return productCommercialFromMetadata(metadata).modoVenda === "peso"
}

/** Handoff puro para o catálogo futuro do PDV; não sinaliza suporte inexistente. */
export function productCommercialCatalogProjection(metadata: unknown, price: number) {
  const commercial = productCommercialFromMetadata(metadata)
  return {
    ...commercial,
    precoNaBase: price,
    precisaoQuantidade: commercial.unidade === "KG" ? 3 : 0,
    vendaPorPeso: commercial.modoVenda === "peso",
    vendaOperacional: commercial.modoVenda === "unidade",
    estoqueFracionadoOperacional: false as const,
    gradeOperacional: false as const,
  }
}

export function productSpecificApplicability(metadata: unknown) {
  const base = record(metadata)
  const explicit = record(base.cadastroRecursos)
  const attrs = record(base.atributos)
  return {
    compatibilidade: typeof explicit.compatibilidade === "boolean" ? explicit.compatibilidade :
      !!(attrs.modeloCompativel || (Array.isArray(record(base.catalogoAparelhos).deviceModelKeys) &&
        (record(base.catalogoAparelhos).deviceModelKeys as unknown[]).length)),
    acessorios: typeof explicit.acessorios === "boolean" ? explicit.acessorios : getProdutoAcessoriosMetadata(base) !== null,
  }
}

/** Guard comum do servidor: não depende do ramo/configuração atual nem do payload do PDV. */
export class ProductWeightNotOperationalError extends Error {
  readonly code = "PRODUTO_POR_PESO_NAO_OPERACIONAL"
  constructor() {
    super("Produto por peso em preparação: venda bloqueada até a integração de quantidade e estoque. Não venda este produto por unidade.")
    this.name = "ProductWeightNotOperationalError"
  }
}

export function assertProductCommercialSaleSupported(metadata: unknown): void {
  if (isProductWeightDeclared(metadata)) throw new ProductWeightNotOperationalError()
}
