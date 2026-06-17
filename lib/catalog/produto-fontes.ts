/**
 * Catálogo inteligente — F1 · Fontes de captura (preparação futura, sem implementar).
 *
 * Define a ARQUITETURA pela qual todas as formas de identificar um produto convergem para
 * o MESMO ponto de busca (`parseProdutoQuery` / `buscarProdutos`): código, código de barras,
 * voz, IA, OCR e importador. Hoje cada canal apenas vira um texto de consulta; as
 * implementações reais (voz→texto, OCR→texto, IA→intenção) chegam em F2+ SEM mudar este
 * contrato nem o schema.
 *
 * PURE: só tipos + roteamento textual trivial. Nenhuma dependência de voz/OCR/IA aqui.
 */

/** Como um produto/termo foi capturado (espelha intenção; alinhado a ProductMedia.source). */
export type ProdutoCaptureSource =
  | "manual"
  | "codigo"
  | "barcode"
  | "voz"
  | "ia"
  | "ocr"
  | "importador"

/**
 * Entrada unificada de resolução de produto. Canais de "código" carregam um valor exato
 * (SKU/EAN); canais textuais (voz/ocr/ia/manual/importador) carregam texto livre.
 */
export type ProdutoResolveInput =
  | { fonte: Extract<ProdutoCaptureSource, "codigo" | "barcode">; valor: string }
  | { fonte: Extract<ProdutoCaptureSource, "voz" | "ocr" | "ia" | "manual" | "importador">; texto: string }

/**
 * Converte qualquer fonte de captura no texto de consulta canônico que alimenta
 * `parseProdutoQuery`. Ponto único de convergência — novas fontes plugam aqui.
 */
export function toBuscaQuery(input: ProdutoResolveInput): string {
  switch (input.fonte) {
    case "codigo":
    case "barcode":
      return String(input.valor ?? "").trim()
    default:
      return String(input.texto ?? "").trim()
  }
}

/** Fontes que representam um identificador EXATO (atalho: match por código vence a busca textual). */
export function isFonteCodigoExato(fonte: ProdutoCaptureSource): boolean {
  return fonte === "codigo" || fonte === "barcode"
}
