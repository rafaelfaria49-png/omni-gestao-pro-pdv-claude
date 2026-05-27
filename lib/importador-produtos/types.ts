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

/**
 * Decomposição da contagem de possíveis duplicados no banco — usada para
 * ajustar a expectativa do usuário e calibrar a trava server-side no lote.
 */
export type AnaliseDuplicados = {
  /** Match FORTE: barcode EAN/GTIN válido OU SKU alfanumérico/≥7 dígitos casando no banco. Autoriza update no modo "atualizar". */
  forte: number
  /** Match FRACO: SKU curto numérico (ex.: "10", "148"). NÃO autoriza update — produto novo é criado. */
  fraco: number
  /** Produtos sem SKU nem barcode — serão criados sem chave de identidade. */
  semChave: number
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
  /** Total de possíveis duplicados (forte + fraco). Mantido para retrocompat. */
  possiveisDuplicadosBanco: number
  /** Decomposição por força do match — preview e execução usam a MESMA classificação. */
  analiseDuplicadosBanco: AnaliseDuplicados
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

/**
 * Modo de conflito quando há produto no banco com chave de match.
 *
 * Importante: "chave fraca" (SKU curto numérico, ex.: "10", "148") NUNCA autoriza
 * update automático em nenhum modo — vide {@link import("./match").decidirAcao}.
 *
 *  - "atualizar":  cria novos; atualiza quando há match FORTE (barcode EAN/GTIN ou SKU
 *                  alfanumérico/longo); pula quando match fraco.
 *  - "pular":      cria apenas quando não há nenhum match; pula em qualquer match.
 *  - "criar":      cria sempre, EXCETO quando há match forte (aí pula). [default seguro]
 */
export type ModoConflito = "atualizar" | "pular" | "criar"

/** Payload de POST /api/import/produtos/lote. */
export type LoteRequest = {
  batchId: string
  arquivo: string
  modoConflito: ModoConflito
  loteIndex: number
  totalLotes: number
  itens: ProdutoNormalizado[]
  /**
   * Defesa em profundidade contra race de troca de unidade no client:
   * cliente envia o storeId que está vendo na UI; servidor confere se bate
   * com `x-assistec-loja-id` recebido no header. Discrepância aborta.
   */
  lojaAtivaIdConfirmado: string
}

/** Resposta de erro de segurança (quando trava anti-update massivo dispara). */
export type LoteErroSeguranca = {
  ok: false
  error: string
  detalhe?: string
  totaisTentados?: {
    criados: number
    atualizados: number
    pulados: number
    erros: number
  }
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
