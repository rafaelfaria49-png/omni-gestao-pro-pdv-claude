/**
 * Utilidades puras de texto pt-BR do assistente Gestor Money.
 * Nenhuma dependência de banco, rede ou relógio.
 */

/** Minúsculas, sem acento, sem pontuação supérflua, espaços colapsados. */
export function normalizarTexto(input: string): string {
  return input
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[“”"'`´]/g, " ")
    .replace(/[!?;]+/g, " ")
    .replace(/[.,:](?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

const UNIDADES: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
  dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17,
  dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70,
  oitenta: 80, noventa: 90, cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300,
  quatrocentos: 400, quatrocentas: 400, quinhentos: 500, quinhentas: 500, seiscentos: 600, seiscentas: 600,
  setecentos: 700, setecentas: 700, oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900,
}
const PALAVRA_NUMERO = Object.keys(UNIDADES).join("|")

/**
 * Converte números por extenso (comuns em áudio transcrito) para dígitos.
 * "mil e quinhentos" → "1500"; "duzentos e cinquenta" → "250".
 * Só converte sequências compostas exclusivamente de palavras numéricas + "e" + "mil".
 */
export function extensoParaDigitos(texto: string): string {
  const seq = new RegExp(`\\b((?:(?:${PALAVRA_NUMERO}|mil)(?:\\s+e\\s+|\\s+)?)+)\\b`, "g")
  return texto.replace(seq, (trecho) => {
    const palavras = trecho.trim().split(/\s+/).filter(p => p !== "e")
    if (!palavras.length) return trecho
    // "um" isolado como artigo ("um cliente") não é valor.
    if (palavras.length === 1 && (palavras[0] === "um" || palavras[0] === "uma")) return trecho
    let total = 0, grupo = 0
    for (const p of palavras) {
      if (p === "mil") { total += (grupo || 1) * 1000; grupo = 0; continue }
      const v = UNIDADES[p]
      if (v === undefined) return trecho
      grupo += v
    }
    return String(total + grupo) + (trecho.endsWith(" ") ? " " : "")
  })
}

/**
 * Converte um literal monetário pt-BR em centavos (string de inteiro), ou null.
 * Aceita "1.500", "1.500,00", "250,5", "250", "1,5 mil", "2 mil", "2k".
 * Ponto seguido de exatamente 3 dígitos é milhar; vírgula é decimal.
 */
export function literalParaCentavos(literal: string, multiplicador?: string): string | null {
  const s = literal.trim()
  let inteiro: string, decimal = ""
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) {
    const [i, d] = s.split(","); inteiro = i.replace(/\./g, ""); decimal = d ?? ""
  } else if (/^\d+(,\d{1,2})?$/.test(s)) {
    const [i, d] = s.split(","); inteiro = i; decimal = d ?? ""
  } else if (/^\d+\.\d{1,2}$/.test(s)) {
    const [i, d] = s.split("."); inteiro = i; decimal = d
  } else return null
  if (inteiro.length > 13) return null
  let centavos = BigInt(inteiro) * BigInt(100) + BigInt((decimal + "00").slice(0, 2))
  const mult = multiplicador?.trim()
  if (mult === "mil" || mult === "k") centavos *= BigInt(1000)
  if (centavos <= BigInt(0)) return null
  return centavos.toString()
}

/** "R$ 1.234,56" a partir de centavos (string/bigint). Nunca usa float. */
export function formatarCentavos(centavos: string | bigint): string {
  const v = BigInt(centavos)
  const negativo = v < BigInt(0)
  const abs = negativo ? -v : v
  const reais = (abs / BigInt(100)).toString()
  const cents = (abs % BigInt(100)).toString().padStart(2, "0")
  const milhar = reais.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  return `${negativo ? "-" : ""}R$ ${milhar},${cents}`
}

/** "2026-11-27" → "27/11/2026". */
export function formatarDataCivil(dia: string): string {
  const [a, m, d] = dia.split("-")
  return `${d}/${m}/${a}`
}

export function contemPalavra(texto: string, palavras: readonly string[]): boolean {
  return palavras.some(p => new RegExp(`(^|\\s)${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|\\s)`).test(texto))
}
