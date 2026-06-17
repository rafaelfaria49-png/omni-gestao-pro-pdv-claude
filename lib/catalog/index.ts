/**
 * Catálogo inteligente — F1 · Barrel.
 *
 * Ponto único de import da camada de catálogo (fonte única de verdade do produto).
 * Reexporta normalização, dicionário léxico, compatibilidade, mídia, busca e fontes.
 *
 * Uso pretendido (F2+): PDV, WhatsApp IA, Marketplace, Marketing IA, Importador e Operações
 * passam a consumir daqui — sem reimplementar busca/normalização/mídia.
 */

export * from "@/lib/catalog/produto-sinonimos"
export * from "@/lib/catalog/produto-compatibilidade"
export * from "@/lib/catalog/produto-media"
export * from "@/lib/catalog/produto-catalogo"
export * from "@/lib/catalog/produto-busca"
export * from "@/lib/catalog/produto-fontes"
