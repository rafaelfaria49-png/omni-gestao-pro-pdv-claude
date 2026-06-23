/**
 * Tipos do XML Builder da NFC-e (GOAL_009).
 *
 * O builder é PURO e DORMENTE: consome EXCLUSIVAMENTE a NotaFiscal congelada
 * (cabeçalho + `snapshotEmitente`/`snapshotDestinatario`/`snapshotPagamento` + itens
 * `NotaFiscalItem`). NUNCA lê Produto/Cliente/Venda/Loja vivos. NÃO assina, NÃO transmite,
 * NÃO gera DANFE/QRCode. Apenas constrói um XML determinístico (mesmo snapshot → mesmo XML).
 *
 * Os tipos de emitente/destinatário REUSAM os snapshots congelados (GOAL_005) — são
 * exatamente os blocos persistidos em `NotaFiscal.snapshotEmitente/snapshotDestinatario`.
 */
import type { SnapshotDestinatario, SnapshotEmitente } from "../venda-fiscal-snapshot"

export type { SnapshotDestinatario, SnapshotEmitente } from "../venda-fiscal-snapshot"

/** Cabeçalho congelado da NotaFiscal necessário ao XML (subconjunto). */
export type NfceXmlNotaHeader = {
  modelo: string
  ambiente: string
  /** Numeração (GOAL_008). Nulo antes de alocar → nós ficam vazios (XML ainda determinístico). */
  serie: number | null
  numero: number | null
  valorTotal: number
  valorDesconto: number
  valorFrete?: number
  valorTotalTributos?: number
  /** Data/hora de emissão CONGELADA (ISO). Default: pagamento.venda.data → pagamento.geradoEm. */
  dhEmi?: string
  /** Natureza da operação (constante de venda; default "VENDA"). */
  naturezaOperacao?: string
}

/** Item congelado (subconjunto de `NotaFiscalItem`/SnapshotItem) lido pelo builder. */
export type NfceXmlItem = {
  numeroItem: number
  codigoProduto: string
  descricao: string
  gtin: string
  ncm: string
  cest: string
  cfop: string
  cst: string
  csosn: string
  origemMercadoria: string | number
  unidadeComercial: string
  quantidade: number
  valorUnitario: number
  valorBruto?: number
  valorDesconto: number
  valorTotal: number
}

/** Snapshot de pagamento congelado (`NotaFiscal.snapshotPagamento` — GOAL_005). */
export type NfceXmlPagamentoSnapshot = {
  versao?: number
  geradoEm?: string
  venda?: {
    data?: string
    paymentBreakdown?: Record<string, unknown> | null
  } | null
  totais?: {
    valorTotal?: number
    valorDesconto?: number
    quantidadeItens?: number
  } | null
} | null

/** Entrada COMPLETA do builder — tudo congelado, nada vivo. */
export type NfceXmlInput = {
  nota: NfceXmlNotaHeader
  emitente: SnapshotEmitente
  /** Null = consumidor final (sem identificação) → bloco `dest` é omitido. */
  destinatario: SnapshotDestinatario | null
  pagamento: NfceXmlPagamentoSnapshot
  itens: NfceXmlItem[]
}

/** Linha de pagamento normalizada para o bloco `pag`. */
export type NfcePagamentoLinha = {
  /** Código `tPag` (NFe): 01 dinheiro, 03 crédito, 04 débito, 17 PIX, 90 sem pagamento, 99 outros… */
  tPag: string
  vPag: number
  /** Rótulo de origem (chave do paymentBreakdown), só para ordenação determinística. */
  origem: string
}

export type NfceXmlResult = {
  /** XML determinístico (compacto). Mesmo snapshot → mesmo XML. */
  xml: string
  /** Hash interno determinístico do XML (FNV-1a) — usado nos testes. */
  hash: string
}
