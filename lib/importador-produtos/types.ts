// ============================================================
// lib/importador-produtos/types.ts
// Tipos do importador dedicado a Produtos (planilhas grandes/legadas).
// ============================================================

/** Campos canônicos que aceitamos por produto. */
export type CampoCanonico =
  | "sku"
  | "barcode"
  | "nome"
  | "custo"
  | "preco"
  | "estoque"
  | "categoria"

/** Resultado da detecção de cabeçalho. */
export type DeteccaoCabecalho = {
  /** Índice 0-based da linha do cabeçalho dentro da AOA. */
  linha: number
  /** Headers crus (como apareceram na planilha) — pode conter strings vazias. */
  colunas: string[]
  /** Mapeamento headerOriginal → campo canônico (ou null se não mapeado). */
  mapeamento: Record<string, CampoCanonico | null>
}

/** Produto já normalizado e pronto para upsert. */
export type ProdutoNormalizado = {
  /** Índice 1-based da linha na planilha (relativo à planilha original, não à AOA). */
  linha: number
  sku: string
  barcode: string
  nome: string
  custo: number
  preco: number
  estoque: number
  categoria: string
}

/** Linha que não passou na validação. */
export type LinhaInvalida = {
  linha: number
  motivos: string[]
  /** Conteúdo cru das colunas mapeadas, em string. */
  campos: Record<string, string>
}

/** Resposta de POST /api/import/produtos/preview. */
export type PreviewProdutosResult = {
  ok: true
  arquivo: string
  storeId: string
  cabecalho: DeteccaoCabecalho
  totalLinhasLidas: number
  totalLinhasValidas: number
  totalLinhasInvalidas: number
  duplicadosInternos: number
  possiveisDuplicadosBanco: number
  /** Primeiras 20 linhas válidas, já normalizadas. */
  amostra: ProdutoNormalizado[]
  /** Primeiras 50 linhas inválidas para diagnóstico. */
  linhasInvalidas: LinhaInvalida[]
  /** Lotes prontos para envio sequencial — cada lote ≤ tamanhoLote. */
  lotes: ProdutoNormalizado[][]
  tamanhoLote: number
  totalLotes: number
}

/** Resposta de POST /api/import/produtos/preview em falha. */
export type PreviewProdutosErro = {
  ok: false
  error: string
  detalhe?: string
}

/** Modo de conflito quando SKU/barcode já existe no banco. */
export type ModoConflito = "atualizar" | "pular"

/** Payload de POST /api/import/produtos/lote. */
export type LoteRequest = {
  batchId: string
  arquivo: string
  modoConflito: ModoConflito
  loteIndex: number
  totalLotes: number
  itens: ProdutoNormalizado[]
}

/** Resultado por linha do lote. */
export type ItemResultado = {
  linha: number
  sku: string
  barcode: string
  nome: string
  acao: "criado" | "atualizado" | "pulado" | "erro"
  detalhe?: string
}

/** Resposta de POST /api/import/produtos/lote. */
export type LoteResult = {
  ok: boolean
  batchId: string
  loteIndex: number
  totalLotes: number
  criados: number
  atualizados: number
  pulados: number
  erros: number
  duracaoMs: number
  itens: ItemResultado[]
}
