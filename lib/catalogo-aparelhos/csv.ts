/**
 * Parser CSV puro (sem dependências) para os seeds do Catálogo de Aparelhos.
 *
 * Suporta o essencial do RFC-4180: campos entre aspas, vírgulas dentro de aspas,
 * aspas escapadas (`""`), BOM inicial e quebras de linha `\r\n`/`\n` (inclusive
 * dentro de campos entre aspas). Nunca lança — CSV malformado degrada em linhas
 * parciais, jamais em exceção.
 */

/** Divide o texto CSV em uma matriz de células (linhas × colunas). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  if (!text) return rows

  // Remove BOM inicial, se houver.
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  let field = ""
  let row: string[] = []
  let inQuotes = false
  let i = 0
  const n = s.length

  while (i < n) {
    const c = s[i]

    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += c
      i += 1
      continue
    }

    if (c === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (c === ",") {
      row.push(field)
      field = ""
      i += 1
      continue
    }
    if (c === "\r") {
      i += 1
      continue
    }
    if (c === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
      i += 1
      continue
    }
    field += c
    i += 1
  }

  // Último campo/linha (arquivo sem newline final).
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/**
 * Converte o CSV em objetos `{ coluna: valor }` usando a primeira linha como cabeçalho.
 * Todas as células são `trim()`-adas. Linhas totalmente vazias são ignoradas.
 */
export function parseCsvObjects(text: string): Record<string, string>[] {
  const rows = parseCsv(text)
  if (rows.length === 0) return []
  const header = rows[0].map((h) => h.trim())
  const out: Record<string, string>[] = []
  for (let r = 1; r < rows.length; r += 1) {
    const cells = rows[r]
    // Linha em branco (uma célula vazia).
    if (cells.length === 1 && cells[0].trim() === "") continue
    const obj: Record<string, string> = {}
    for (let c = 0; c < header.length; c += 1) {
      obj[header[c]] = (cells[c] ?? "").trim()
    }
    out.push(obj)
  }
  return out
}
