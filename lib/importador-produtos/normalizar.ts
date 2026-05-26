// ============================================================
// lib/importador-produtos/normalizar.ts
// Mapeia headers brutos → campo canônico + limpa/valida valores.
// Server-side puro (sem dependência de Prisma).
// ============================================================

import type { CampoCanonico } from "./types"

/** Remove acentos, baixa caso, colapsa espaços. */
function norm(s: unknown): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/**
 * Aliases por campo canônico. Quando um header (normalizado) bate exatamente
 * com qualquer um dos aliases, o header é mapeado ao campo.
 *
 * Mantemos aliases curtos e específicos para reduzir falsos positivos
 * (ex.: "valor" sozinho NÃO casa preço — pode ser "valor desconto").
 */
const ALIASES: Record<CampoCanonico, string[]> = {
  sku: [
    "sku",
    "codigo",
    "código",
    "cod",
    "cod produto",
    "codigo produto",
    "codigo interno",
    "referencia",
    "referência",
    "ref",
    "id produto",
    "id",
  ],
  barcode: [
    "barcode",
    "ean",
    "gtin",
    "codigo de barras",
    "codigo barras",
    "código de barras",
    "código barras",
    "codigo de barra",
    "cod barras",
    "cod barra",
  ],
  nome: [
    "nome",
    "produto",
    "descricao",
    "descrição",
    "descricao produto",
    "descrição produto",
    "descricao do produto",
    "descrição do produto",
    "nome produto",
    "nome do produto",
    "mercadoria",
    "item",
  ],
  custo: [
    "custo",
    "preco custo",
    "preço custo",
    "preco de custo",
    "preço de custo",
    "valor custo",
    "valor de custo",
    "custo unitario",
    "custo unitário",
  ],
  preco: [
    "preco",
    "preço",
    "preco venda",
    "preço venda",
    "preco de venda",
    "preço de venda",
    "valor venda",
    "valor de venda",
    "valor varejo",
    "preco varejo",
    "preço varejo",
    "valor unitario",
    "valor unitário",
    "valor",
    "preco unitario",
    "preço unitário",
  ],
  estoque: [
    "estoque",
    "estoque atual",
    "qtde",
    "qtd",
    "quantidade",
    "saldo",
    "saldo estoque",
    "estoque disponivel",
    "estoque disponível",
  ],
  categoria: [
    "categoria",
    "grupo",
    "categoria produto",
    "grupo produto",
    "tipo",
    "secao",
    "seção",
    "departamento",
  ],
}

/** Conjunto reverso: alias normalizado → campo canônico. */
const ALIAS_INDEX: Map<string, CampoCanonico> = (() => {
  const m = new Map<string, CampoCanonico>()
  for (const [campo, list] of Object.entries(ALIASES) as Array<[CampoCanonico, string[]]>) {
    for (const alias of list) m.set(norm(alias), campo)
  }
  return m
})()

/** Mapeia um header (cru) para campo canônico (ou null se desconhecido). */
export function mapearHeader(header: unknown): CampoCanonico | null {
  const n = norm(header)
  if (!n) return null
  // Match exato primeiro
  const exato = ALIAS_INDEX.get(n)
  if (exato) return exato
  // Match por contains controlado — só se o header for relativamente curto
  // e contiver um alias completo, para evitar "valor desconto" virar "preço".
  if (n.length <= 40) {
    for (const [alias, campo] of ALIAS_INDEX) {
      if (alias.length >= 4 && (n === alias || n.endsWith(" " + alias) || n.startsWith(alias + " "))) {
        return campo
      }
    }
  }
  return null
}

/** Mapeia um array inteiro de headers, devolvendo Record<headerOriginal, campo|null>. */
export function mapearHeaders(headers: string[]): Record<string, CampoCanonico | null> {
  const out: Record<string, CampoCanonico | null> = {}
  for (const h of headers) {
    out[h] = mapearHeader(h)
  }
  return out
}

/**
 * Converte célula da planilha em string limpa, lidando com Date e Number
 * (SheetJS pode entregar Date ou number quando `raw: false` ainda dá através).
 */
export function celulaParaString(v: unknown): string {
  if (v === null || v === undefined) return ""
  if (typeof v === "string") return v.trim()
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return ""
    // Evita notação científica para EAN longo guardado como número.
    if (Math.abs(v) >= 1e9 && Math.abs(v) < 1e15) return String(Math.round(v))
    return String(v)
  }
  if (typeof v === "boolean") return v ? "sim" : "nao"
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).trim()
}

/**
 * Converte valor monetário/quantitativo BR ou US para number.
 * Aceita "R$ 1.234,56", "1234.56", "1,5", "  12  ".
 * Retorna null se vazio ou inválido.
 */
export function parseNumeroBr(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw
  const s = celulaParaString(raw).replace(/\s+/g, "")
  if (!s) return null
  const cleaned = s.replace(/^r\$\s*/i, "").replace(/[^0-9,.\-]/g, "")
  if (!cleaned || cleaned === "-" || cleaned === "." || cleaned === ",") return null
  const hasComma = cleaned.includes(",")
  const hasDot = cleaned.includes(".")
  let normalized = cleaned
  if (hasComma && hasDot) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      // BR: "1.234,56" → "1234.56"
      normalized = cleaned.replace(/\./g, "").replace(",", ".")
    } else {
      // US: "1,234.56" → "1234.56"
      normalized = cleaned.replace(/,/g, "")
    }
  } else if (hasComma) {
    normalized = cleaned.replace(",", ".")
  }
  const n = parseFloat(normalized)
  return Number.isFinite(n) ? n : null
}

/** Identifica linhas-banner ("Relatório de produtos", "Loja: …", "Data: …", etc.). */
export function pareceBanner(linha: ReadonlyArray<unknown>): boolean {
  // Linha banner típica: tem 1-2 células preenchidas e o resto vazio,
  // OU contém palavras-chave de relatório no primeiro campo.
  const nonEmpty = linha.filter((c) => celulaParaString(c) !== "")
  if (nonEmpty.length === 0) return true // linha vazia
  const first = celulaParaString(linha[0]).toLowerCase()
  const palavrasBanner = [
    "relatorio",
    "relatório",
    "data:",
    "loja:",
    "empresa:",
    "periodo:",
    "período:",
    "emitido em",
    "gerado em",
    "filtros:",
    "totalizadores",
  ]
  if (palavrasBanner.some((p) => first.startsWith(p))) return true
  if (nonEmpty.length === 1 && first.length > 0) return true
  return false
}

/**
 * Avalia se uma linha "cheira" a cabeçalho: conta quantas células batem
 * com aliases conhecidos. Quanto maior, mais provável ser o header.
 */
export function pontuarLinhaComoCabecalho(linha: ReadonlyArray<unknown>): number {
  let score = 0
  let mapeados = 0
  for (const cell of linha) {
    const s = celulaParaString(cell)
    if (!s) continue
    const campo = mapearHeader(s)
    if (campo) {
      mapeados++
      // "nome" pesa mais que "categoria" — produto sem nome é inutilizável.
      score += campo === "nome" ? 3 : 1
    }
  }
  // Bônus por densidade: linhas com várias colunas conhecidas são mais confiáveis.
  if (mapeados >= 3) score += 2
  return score
}
