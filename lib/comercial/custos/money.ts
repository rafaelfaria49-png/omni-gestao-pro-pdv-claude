/**
 * Dinheiro exato em CENTAVOS inteiros para os contratos comerciais novos (ADR-0025).
 * Adapters para o legado (Float em reais) ficam aqui e só aqui. Puro.
 */

export const CENTAVOS_MAX = 2_000_000_000 // R$ 20 milhões — teto de sanidade por lançamento

/** Reais (number legado ou string "1.234,56"/"1234.56") → centavos inteiros. null = inválido. */
export function parseCentavos(raw: unknown): number | null {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw < 0) return null
    const c = Math.round(raw * 100)
    return c <= CENTAVOS_MAX ? c : null
  }
  if (typeof raw !== "string") return null
  const s = raw.trim().replace(/^R\$\s*/i, "")
  if (!s) return null
  let norm = s
  if (s.includes(",")) norm = s.replace(/\./g, "").replace(",", ".")
  if (!/^\d+(\.\d{1,2})?$/.test(norm)) return null
  const [int, frac = ""] = norm.split(".")
  const c = Number(int) * 100 + Number((frac + "00").slice(0, 2))
  return Number.isSafeInteger(c) && c <= CENTAVOS_MAX ? c : null
}

/** Centavos inteiros já validados (entrada de API em centavos). */
export function asCentavos(raw: unknown): number | null {
  return typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0 && raw <= CENTAVOS_MAX ? raw : null
}

/** Float legado em reais (ContaPagarTitulo.valor, AparelhoFisico.custo*) → centavos. */
export function reaisLegadoParaCentavos(valor: number | null | undefined): number {
  return typeof valor === "number" && Number.isFinite(valor) && valor > 0 ? Math.round(valor * 100) : 0
}

/** Centavos → reais para os campos Float legados (duas casas exatas). */
export function centavosParaReais(c: number): number {
  return Math.round(c) / 100
}

export function formatCentavos(c: number | null | undefined): string {
  if (c == null) return "—"
  return (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

/**
 * Rateio exato pelo maior resto: a soma das partes é SEMPRE igual ao total.
 * `pesos` vazios ou todos zero → divisão igual. Ex.: 50000 em 3 → [16667, 16667, 16666].
 */
export function ratearCentavos(total: number, pesos: readonly number[]): number[] {
  const n = pesos.length
  if (n === 0) return []
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("RATEIO_TOTAL_INVALIDO")
  const usados = pesos.every((p) => !(p > 0)) ? pesos.map(() => 1) : pesos.map((p) => (p > 0 ? p : 0))
  const soma = usados.reduce((a, b) => a + b, 0)
  const brutos = usados.map((p) => (total * p) / soma)
  const base = brutos.map((b) => Math.floor(b))
  let resto = total - base.reduce((a, b) => a + b, 0)
  const ordem = brutos.map((b, i) => ({ i, frac: b - Math.floor(b) })).sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (const { i } of ordem) {
    if (resto <= 0) break
    base[i] += 1
    resto -= 1
  }
  return base
}

export function somaCentavos(vals: ReadonlyArray<number | null | undefined>): number {
  return vals.reduce<number>((s, v) => s + (typeof v === "number" ? v : 0), 0)
}
