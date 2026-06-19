/**
 * Reconstrução do snapshot fiscal CONGELADO a partir da `NotaFiscal` vigente (GOAL_007).
 *
 * O snapshot foi gravado pelo GOAL_005 nos campos `snapshotEmitente`/`snapshotDestinatario`/
 * `snapshotPagamento` (este último carrega versao/geradoEm/venda/totais/diagnostico) e nas
 * linhas `NotaFiscalItem`. Aqui montamos de volta o objeto `VendaFiscalSnapshot` SEM ler
 * `Produto`/`Venda` vivos — é a foto do instante, não o estado atual. Resultado é deep-frozen.
 */
import {
  deepFreeze,
  VENDA_FISCAL_SNAPSHOT_VERSAO,
  type SnapshotDestinatario,
  type SnapshotEmitente,
  type SnapshotItem,
  type SnapshotVenda,
  type VendaFiscalSnapshot,
} from "../venda-fiscal-snapshot"

/** Linha de item persistida na NotaFiscal (subconjunto lido pelo serviço). */
export type NotaItemRow = {
  itemVendaId: string | null
  produtoId: string | null
  numeroItem: number
  codigoProduto: string
  descricao: string
  gtin: string | null
  ncm: string
  cest: string | null
  cfop: string
  cst: string | null
  csosn: string | null
  origemMercadoria: number
  unidadeComercial: string
  quantidade: number
  valorUnitario: number
  valorDesconto: number
  valorTotal: number
}

/** Cabeçalho da NotaFiscal vigente (subconjunto lido pelo serviço). */
export type NotaFiscalRow = {
  id: string
  storeId: string
  vendaId: string
  modelo: string
  ambiente: string
  snapshotEmitente: unknown
  snapshotDestinatario: unknown
  snapshotPagamento: unknown
  itens: NotaItemRow[]
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}
function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}
function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v)
}
function numArray(v: unknown): number[] {
  return Array.isArray(v) ? v.map((x) => num(x)).filter((n) => Number.isFinite(n)) : []
}
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => str(x)) : []
}

/**
 * Reconstrói o `VendaFiscalSnapshot` a partir da NotaFiscal vigente. Retorna null se o
 * cabeçalho não tiver os blocos mínimos (emitente/pagamento) — o pipeline trata como
 * `snapshot_invalido`. Campos não persistidos por item (unidadeTributável, pendências) são
 * derivados de forma conservadora a partir do diagnóstico congelado.
 */
export function reconstructSnapshotFromNota(nota: NotaFiscalRow): VendaFiscalSnapshot | null {
  if (!nota) return null
  const emit = asRecord(nota.snapshotEmitente)
  const pag = asRecord(nota.snapshotPagamento)
  if (Object.keys(emit).length === 0 || Object.keys(pag).length === 0) return null

  const diag = asRecord(pag.diagnostico)
  const itensSemFiscal = numArray(diag.itensSemFiscal)

  // Blocos gravados como objeto único pelo GOAL_005 — reusados como vieram (foto congelada).
  const emitente = nota.snapshotEmitente as unknown as SnapshotEmitente
  const destinatario = nota.snapshotDestinatario as unknown as SnapshotDestinatario
  const venda = (asRecord(pag.venda) as unknown) as SnapshotVenda
  const totaisRaw = asRecord(pag.totais)

  const itens: SnapshotItem[] = (Array.isArray(nota.itens) ? nota.itens : []).map((it) => ({
    numeroItem: num(it.numeroItem),
    itemVendaId: it.itemVendaId ?? null,
    produtoId: it.produtoId ?? null,
    codigoProduto: str(it.codigoProduto),
    descricao: str(it.descricao),
    gtin: str(it.gtin ?? ""),
    quantidade: num(it.quantidade),
    valorUnitario: num(it.valorUnitario),
    valorDesconto: num(it.valorDesconto),
    valorTotal: num(it.valorTotal),
    ncm: str(it.ncm),
    cest: str(it.cest ?? ""),
    cfop: str(it.cfop),
    cst: str(it.cst ?? ""),
    csosn: str(it.csosn ?? ""),
    origemMercadoria: str(it.origemMercadoria ?? ""),
    unidadeComercial: str(it.unidadeComercial) || "UN",
    // unidadeTributável não tem coluna dedicada — deriva da comercial (padrão NFC-e).
    unidadeTributavel: str(it.unidadeComercial) || "UN",
    fiscalCompleto: !itensSemFiscal.includes(num(it.numeroItem)),
    pendencias: [],
  }))

  const snapshot: VendaFiscalSnapshot = {
    versao: num(pag.versao) || VENDA_FISCAL_SNAPSHOT_VERSAO,
    geradoEm: str(pag.geradoEm),
    storeId: str(nota.storeId),
    vendaId: str(nota.vendaId),
    modelo: str(emit.modelo) || str(nota.modelo),
    ambiente: str(emit.ambiente) || str(nota.ambiente),
    emitente,
    destinatario,
    venda,
    itens,
    totais: {
      valorTotal: num(totaisRaw.valorTotal),
      valorDesconto: num(totaisRaw.valorDesconto),
      quantidadeItens: num(totaisRaw.quantidadeItens) || itens.length,
    },
    diagnostico: {
      prontoParaEmissao: Boolean(diag.prontoParaEmissao),
      pendencias: strArray(diag.pendencias),
      itensSemFiscal,
    },
  }

  return deepFreeze(snapshot)
}
