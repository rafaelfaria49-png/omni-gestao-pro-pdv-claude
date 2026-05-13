/** Score 0–100 a partir de completude do cadastro (sem IA). */
export function catalogQualityScore(p: {
  nome: string
  sku: string
  barras: string
  categoria: string
  preco: number
  fornecedor: string
  marca: string
  garantia: number
}): number {
  let s = 35
  if (p.nome?.trim()) s += 15
  if (p.sku && p.sku !== "—") s += 12
  if (p.barras?.trim()) s += 10
  if (p.categoria && p.categoria !== "—") s += 8
  if (p.preco > 0) s += 10
  if (p.fornecedor && p.fornecedor !== "—") s += 5
  if (p.marca && p.marca !== "—") s += 5
  if (p.garantia > 0) s += 5
  return Math.min(100, Math.round(s))
}
