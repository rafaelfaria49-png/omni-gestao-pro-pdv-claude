// ============================================================
// lib/importador-avancado/smart-genius/normalizar.ts
// Helpers puros de normalização de células Smart Genius.
// Sem dependência de Prisma — testável isoladamente.
// ============================================================

/** Converte célula em string limpa (lida com number/Date do SheetJS). */
export function celula(v: unknown): string {
  if (v == null) return ""
  if (typeof v === "string") return v.trim()
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return ""
    // Evita notação científica em números grandes (telefones/códigos).
    if (Math.abs(v) >= 1e9 && Math.abs(v) < 1e15) return String(Math.round(v))
    return String(v)
  }
  if (typeof v === "boolean") return v ? "sim" : ""
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).trim()
}

/**
 * Converte valor monetário/numérico do Smart (number do SheetJS ou string BR)
 * em número. Smart normalmente exporta `199.9` (number) mas tratamos string
 * "1.234,56" / "R$ 199,90" por robustez. Retorna 0 quando vazio/inválido.
 */
export function numero(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v
  const s = celula(v).replace(/\s+/g, "")
  if (!s) return 0
  const cleaned = s.replace(/^r\$\s*/i, "").replace(/[^0-9,.\-]/g, "")
  if (!cleaned || cleaned === "-" || cleaned === "." || cleaned === ",") return 0
  const hasComma = cleaned.includes(",")
  const hasDot = cleaned.includes(".")
  let normalized = cleaned
  if (hasComma && hasDot) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      normalized = cleaned.replace(/\./g, "").replace(",", ".")
    } else {
      normalized = cleaned.replace(/,/g, "")
    }
  } else if (hasComma) {
    normalized = cleaned.replace(",", ".")
  }
  const n = parseFloat(normalized)
  return Number.isFinite(n) ? n : 0
}

/**
 * Normaliza telefone. Smart às vezes duplica o número na mesma célula
 * ("(14)99761-5509 (14)99761-5509") — mantém só a primeira ocorrência.
 */
export function telefone(v: unknown): string {
  const s = celula(v)
  if (!s) return ""
  // Quebra por espaço entre dois blocos com DDD; pega o primeiro não-vazio.
  const partes = s.split(/\s{1,}(?=\(?\d{2}\)?)/).map((p) => p.trim()).filter(Boolean)
  const primeiro = partes[0] ?? s
  return primeiro.trim()
}

/**
 * Converte data Smart (dd/mm/yyyy, Date do SheetJS, ou ISO) em ISO yyyy-mm-dd.
 * Retorna "" quando vazia/ inválida (diferente de parseDataBrFlex, que usa hoje
 * como fallback — aqui queremos preservar "sem vencimento" como vazio).
 */
export function dataIso(v: unknown): string {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10)
  }
  const s = celula(v)
  if (!s) return ""
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/)
  if (m) {
    const d = parseInt(m[1]!, 10)
    const mo = parseInt(m[2]!, 10)
    let y = parseInt(m[3]!, 10)
    if (y < 100) y += y >= 70 ? 1900 : 2000
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return ""
    return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`
  }
  return ""
}

/** Centavos inteiros — usado para compor localKey estável e comparar valores. */
export function centavos(v: number): number {
  return Math.round((Number.isFinite(v) ? v : 0) * 100)
}
