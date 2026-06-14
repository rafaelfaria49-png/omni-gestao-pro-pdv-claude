/**
 * INVENTARIO_ASSISTIDO_V1 — Fase 5. Construção PURA das planilhas de exportação.
 *
 * Recebe um relatório já montado e devolve dados tabulares (arrays de arrays) para 4 abas:
 *   A - Conferidos · B - Divergências · C - Reconciliação · D - Não encontrados.
 * A camada de UI usa estes dados com `xlsx` (XLSX) para .xlsx e com `montarCsv` para .csv.
 * Sem IO/Prisma — testável isoladamente.
 */

export type CelulaPlanilha = string | number
export type AbaPlanilha = { nome: string; linhas: CelulaPlanilha[][] }

/** Subconjunto do RelatorioInventarioDTO necessário para exportar (evita acoplar ao server). */
export type RelatorioExportInput = {
  encontrados: ReadonlyArray<{
    nome: string
    sku: string | null
    codigo: string | null
    estoqueSistema: number
    quantidadeContada: number
    diferenca: number
    ajusteAplicado?: boolean
  }>
  divergencias: ReadonlyArray<{
    nome: string
    sku: string | null
    codigo: string | null
    estoqueSistema: number
    quantidadeContada: number
    diferenca: number
    ajusteAplicado?: boolean
  }>
  reconciliacao: ReadonlyArray<{
    codigoBipado: string
    quantidadeContada: number
    ultimoBipeEm: string
    classificacao?: string
  }>
  naoBipados: ReadonlyArray<{
    nome: string
    sku: string | null
    codigo: string | null
    estoqueSistema: number
    ajusteAplicado?: boolean
  }>
}

function simNao(v: boolean | undefined): string {
  return v ? "Sim" : "Não"
}

/** Monta as 4 abas (A/B/C/D) a partir do relatório. PURO. */
export function construirPlanilhasInventario(rel: RelatorioExportInput): AbaPlanilha[] {
  const abaA: CelulaPlanilha[][] = [
    ["Produto", "SKU", "Código", "Estoque sistema", "Contado", "Diferença", "Ajustado"],
    ...rel.encontrados.map((e) => [
      e.nome,
      e.sku ?? "",
      e.codigo ?? "",
      e.estoqueSistema,
      e.quantidadeContada,
      e.diferenca,
      simNao(e.ajusteAplicado),
    ]),
  ]

  const abaB: CelulaPlanilha[][] = [
    ["Produto", "SKU", "Código", "Estoque sistema", "Contado", "Diferença", "Ajustado"],
    ...rel.divergencias.map((e) => [
      e.nome,
      e.sku ?? "",
      e.codigo ?? "",
      e.estoqueSistema,
      e.quantidadeContada,
      e.diferenca,
      simNao(e.ajusteAplicado),
    ]),
  ]

  const abaC: CelulaPlanilha[][] = [
    ["Código bipado", "Qtd. observada", "Data/hora", "Classificação"],
    ...rel.reconciliacao.map((r) => [
      r.codigoBipado,
      r.quantidadeContada,
      r.ultimoBipeEm,
      r.classificacao ?? "pendente",
    ]),
  ]

  const abaD: CelulaPlanilha[][] = [
    ["Produto", "SKU", "Código", "Estoque atual", "Zerado por ausência"],
    ...rel.naoBipados.map((n) => [
      n.nome,
      n.sku ?? "",
      n.codigo ?? "",
      n.estoqueSistema,
      simNao(n.ajusteAplicado),
    ]),
  ]

  return [
    { nome: "A - Conferidos", linhas: abaA },
    { nome: "B - Divergências", linhas: abaB },
    { nome: "C - Reconciliação", linhas: abaC },
    { nome: "D - Não encontrados", linhas: abaD },
  ]
}

/** Escapa um campo CSV (aspas/; / quebras de linha). PURO. */
function escaparCsv(v: CelulaPlanilha): string {
  const s = String(v ?? "")
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Junta as abas num único CSV (separador `;` — padrão BR/Excel), com título de seção por aba e
 * linha em branco entre elas. PURO.
 */
export function montarCsv(abas: ReadonlyArray<AbaPlanilha>): string {
  const blocos = abas.map((aba) => {
    const titulo = `# ${aba.nome}`
    const corpo = aba.linhas.map((linha) => linha.map(escaparCsv).join(";")).join("\r\n")
    return `${titulo}\r\n${corpo}`
  })
  return blocos.join("\r\n\r\n")
}

/** Nome de arquivo seguro para a exportação de uma sessão. PURO. */
export function nomeArquivoExport(sessao: { nome?: string | null; id: string }, ext: "csv" | "xlsx"): string {
  const base = (sessao.nome ?? "").trim() || sessao.id
  const slug = base
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40)
  return `inventario-${slug || "sessao"}.${ext}`
}
