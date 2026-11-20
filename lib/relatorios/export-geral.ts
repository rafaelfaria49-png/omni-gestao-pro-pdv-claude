/**
 * Exportação do Relatório Geral (PDF tabular econômico + seções no CSV).
 * PDF: A4 paisagem, Courier 7 pt (largura fixa → colunas exatas), cabeçalho de tabela
 * repetido a cada página, células com quebra de linha (nunca cortadas) e rodapé paginado.
 */
import type { Cell, Column, ReportResponse, ReportSection } from "./contracts"
import { formatCell } from "./format"

const WIDTH = 180, LINES = 56
const TYPO: Record<string, string> = { "−": "-", "–": "-", "—": "-", "‘": "'", "’": "'", "“": '"', "”": '"', "…": "...", "→": "->", " ": " " }
const clean = (s: string) => s.normalize("NFC").replace(/[−–—‘’“”…→ ]/g, c => TYPO[c]).replace(/[^\x20-\x7e\xa0-\xff]/g, " ")
const escape = (s: string) => clean(s).replace(/([\\()])/g, "\\$1")

export function wrapText(text: string, width: number): string[] {
  const out: string[] = []
  for (const paragraph of clean(text).split(/\r?\n/)) {
    let rest = paragraph
    while (rest.length > width) { let cut = rest.lastIndexOf(" ", width); if (cut < width / 2) cut = width; out.push(rest.slice(0, cut).trimEnd()); rest = rest.slice(cut).trimStart() }
    out.push(rest)
  }
  return out
}

const numeric = (c: Column) => c.format === "money" || c.format === "number" || c.format === "percent"
/** Tabela em texto de largura fixa. Retorna cabeçalho e blocos (um por linha de dados, nunca partido entre páginas quando cabe). */
export function textTable(columns: Column[], rows: Record<string, Cell>[], width = WIDTH): { header: string[]; blocks: string[][] } {
  const cells = rows.map(r => columns.map(c => clean(formatCell(r[c.key], c.format))))
  const natural = columns.map((c, i) => Math.max(Math.min(clean(c.label).length, 24), ...cells.map(r => r[i].length), 4))
  const widths = [...natural], gap = 2
  // Reduz as colunas mais largas até caber; nada é truncado, a célula quebra em várias linhas.
  while (widths.reduce((s, w) => s + w, 0) + gap * (columns.length - 1) > width) {
    const max = Math.max(...widths), i = widths.indexOf(max)
    if (max <= 6) break
    widths[i] = max - 1
  }
  const line = (parts: string[][]) => {
    const height = Math.max(...parts.map(p => p.length)), out: string[] = []
    for (let k = 0; k < height; k++) out.push(parts.map((p, i) => numeric(columns[i]) ? (p[k] ?? "").padStart(widths[i]) : (p[k] ?? "").padEnd(widths[i])).join(" ".repeat(gap)).trimEnd())
    return out
  }
  const header = [...line(columns.map((c, i) => wrapText(c.label, widths[i]))), "-".repeat(Math.min(width, widths.reduce((s, w) => s + w, 0) + gap * (columns.length - 1)))]
  return { header, blocks: cells.map(r => line(r.map((v, i) => wrapText(v, widths[i])))) }
}

function sectionLines(s: ReportSection): { lead: string[]; table?: { header: string[]; blocks: string[][] } } {
  const lead = ["", `== ${s.title.toUpperCase()} ==`, ...(s.note ? wrapText(s.note, WIDTH) : [])]
  const metrics = s.metrics.map(m => `${m.label}: ${formatCell(m.value, m.format)}${m.value === null ? ` (${m.reason ?? "sem cobertura suficiente"})` : ""}`)
  // Indicadores em duas colunas quando cabem.
  for (let i = 0; i < metrics.length; i += 2) {
    const a = metrics[i], b = metrics[i + 1]
    if (b && a.length <= 88 && b.length <= 88) lead.push(clean(a).padEnd(90) + clean(b))
    else { lead.push(...wrapText(a, WIDTH)); if (b) lead.push(...wrapText(b, WIDTH)) }
  }
  return { lead, ...(s.columns && s.rows?.length ? { table: textTable(s.columns, s.rows) } : {}) }
}

export function pdfGeneralReport(report: ReportResponse): Uint8Array {
  const pages: string[][] = [[]]
  const room = () => LINES - pages.at(-1)!.length
  const push = (lines: string[]) => { for (const l of lines) { if (!room()) pages.push([]); pages.at(-1)!.push(l) } }
  const keep = (lines: string[]) => { if (lines.length <= LINES && lines.length > room()) pages.push([]); push(lines) }
  /** Título/indicadores ficam junto do cabeçalho e da 1ª linha; cabeçalho repete em cada página. */
  const table = (t: { header: string[]; blocks: string[][] }, title: string, lead: string[] = []) => {
    keep([...lead, ...t.header, ...(t.blocks[0] ?? [])])
    for (const block of t.blocks.slice(1)) {
      if (block.length > room()) { pages.push([]); push([`${title} (continuação)`, ...t.header]) }
      push(block)
    }
  }
  push([report.title.toUpperCase(), `Loja: ${report.storeId}   Período: ${report.period.from} a ${report.period.to} (America/Sao_Paulo)   Gerado: ${formatCell(report.generatedAt, "date")}`,
    ...wrapText(`Base: ${report.basis}`, WIDTH), ...wrapText(`Fontes: ${report.source}`, WIDTH)])
  for (const section of report.sections ?? []) {
    const { lead, table: t } = sectionLines(section)
    if (t) table(t, section.title, lead)
    else keep(lead)
  }
  keep(["", "== LIMITAÇÕES ==", ...report.limitations.flatMap(l => wrapText(`- ${l}`, WIDTH))])
  const detail = textTable(report.columns, report.rows)
  const detailLead = ["", `== DETALHAMENTO: ${report.total} registro(s) — exportação completa do recorte ==`]
  if (report.rows.length) table(detail, "Detalhamento", detailLead)
  else keep([...detailLead, "Nenhum registro corresponde aos filtros do detalhamento."])

  const objects: string[] = ["", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>"]
  const pageIds: number[] = []
  pages.forEach((page, index) => {
    const pageId = objects.length + 1, streamId = pageId + 1
    pageIds.push(pageId)
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`)
    const footer = `Relatorio Geral da Loja | ${report.storeId} | ${report.period.from} a ${report.period.to} | Pagina ${index + 1}/${pages.length}`
    const text = `BT /F1 7 Tf 28 566 Td 9 TL ${page.map((l, i) => `${i ? "T* " : ""}(${escape(l)}) Tj`).join("\n")} ET\nBT /F1 7 Tf 28 18 Td (${escape(footer)}) Tj ET`
    objects.push(`<< /Length ${Buffer.byteLength(text, "latin1")} >>\nstream\n${text}\nendstream`)
  })
  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>"
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`
  let pdf = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
  const offsets: number[] = []
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(pdf, "latin1")); pdf += `${i + 1} 0 obj\n${object}\nendobj\n` })
  const xref = Buffer.byteLength(pdf, "latin1")
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(n => String(n).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new Uint8Array(Buffer.from(pdf, "latin1"))
}

/** Linhas CSV das seções (antes do detalhamento). Mesmo formato de célula do CSV genérico. */
export function csvSectionRows(sections: ReportSection[]): Cell[][] {
  return sections.flatMap(s => [[`Seção: ${s.title}`], ...(s.note ? [["Nota", s.note]] : []),
    ["Indicador", "Valor", "Motivo"], ...s.metrics.map(m => [m.label, m.value, m.value === null ? m.reason ?? "Sem cobertura suficiente" : ""]),
    ...(s.columns && s.rows?.length ? [s.columns.map(c => c.label), ...s.rows.map(r => s.columns!.map(c => r[c.key] ?? null))] : []), []])
}
