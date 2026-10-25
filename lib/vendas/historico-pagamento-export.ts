/**
 * Coleta paginada das vendas para a exportação CSV do Histórico
 * (GOAL PDV-PADARIA-HISTORICO-PAGAMENTO-G1-001).
 *
 * Com o filtro de pagamento aplicado no servidor antes da paginação, um lote
 * vazio significa fim real dos resultados. A coleta para no limite, no total
 * informado pelo servidor ou no primeiro lote vazio, nunca relê a mesma janela
 * e descarta repetições por `dbId` (offset pode deslocar se uma venda mudar de
 * status durante a exportação).
 *
 * O chamador fixa o fim do período (`to`) no instante em que a exportação
 * começa: vendas novas não empurram as páginas seguintes.
 */

export const HISTORICO_EXPORT_MAX = 5000
export const HISTORICO_EXPORT_PAGE = 200

export type HistoricoExportPage<T> = { vendas: T[]; total: number }

/**
 * Fim do período (`to`) de cada página da exportação. `ancora` é o `at` da
 * venda mais recente da 1ª página (relógio do servidor, não do navegador):
 * as páginas seguintes terminam nela, salvo se o filtro do usuário termina antes.
 * ISO-8601 UTC compara corretamente como texto.
 */
export function resolverFimExportacaoHistorico(toFiltro: string, ancora: string): string {
  if (!ancora) return toFiltro
  return !toFiltro || ancora < toFiltro ? ancora : toFiltro
}

export type HistoricoExportResult<T> = {
  linhas: T[]
  /** Total que o servidor informou para os filtros ativos. */
  totalServidor: number
  /** Havia mais vendas elegíveis do que o limite permitiu exportar. */
  truncado: boolean
}

export async function coletarVendasHistoricoParaExportacao<T extends { dbId: string }>(
  fetchPage: (skip: number, take: number) => Promise<HistoricoExportPage<T>>,
  opts: { max?: number; pageSize?: number } = {},
): Promise<HistoricoExportResult<T>> {
  const max = opts.max ?? HISTORICO_EXPORT_MAX
  const pageSize = opts.pageSize ?? HISTORICO_EXPORT_PAGE
  const linhas: T[] = []
  const vistos = new Set<string>()
  let skip = 0
  let totalServidor = Number.POSITIVE_INFINITY

  while (skip < totalServidor && linhas.length < max) {
    const page = await fetchPage(skip, pageSize)
    totalServidor = Number.isFinite(page.total) && page.total >= 0 ? page.total : 0
    for (const venda of page.vendas) {
      if (linhas.length >= max) break
      if (vistos.has(venda.dbId)) continue
      vistos.add(venda.dbId)
      linhas.push(venda)
    }
    if (page.vendas.length === 0) break
    skip += pageSize
  }

  if (!Number.isFinite(totalServidor)) totalServidor = linhas.length
  return { linhas, totalServidor, truncado: totalServidor > linhas.length && linhas.length >= max }
}
