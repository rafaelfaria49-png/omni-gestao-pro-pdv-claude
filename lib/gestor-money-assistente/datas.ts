/**
 * Datas civis no fuso financeiro canônico (America/Sao_Paulo — mesmo do G005).
 * Puras: recebem o instante "agora" por parâmetro; nunca leem Date.now().
 */
export const FUSO_ASSISTENTE = "America/Sao_Paulo"

export function diaCivil(instante: Date, fuso = FUSO_ASSISTENTE): string {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(instante)
  const campo = (t: Intl.DateTimeFormatPartTypes) => partes.find(p => p.type === t)?.value
  return `${campo("year")}-${campo("month")}-${campo("day")}`
}

export function somarDias(dia: string, dias: number): string {
  const d = new Date(dia + "T12:00:00Z")
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export function diaValido(dia: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false
  const d = new Date(dia + "T00:00:00Z")
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === dia
}

/** 0 = domingo … 6 = sábado, para o dia civil. */
export function diaDaSemana(dia: string): number {
  return new Date(dia + "T12:00:00Z").getUTCDay()
}

export function inicioSemana(dia: string): string {
  const dow = diaDaSemana(dia)
  return somarDias(dia, dow === 0 ? -6 : 1 - dow) // semana começa na segunda
}

export function inicioMes(dia: string): string { return dia.slice(0, 7) + "-01" }

export function fimMes(dia: string): string {
  const [a, m] = dia.split("-").map(Number)
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)
}

export function mesAnterior(dia: string): { inicio: string; fim: string } {
  const [a, m] = dia.split("-").map(Number)
  const inicio = new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 10)
  return { inicio, fim: fimMes(inicio) }
}

/** Mesmo dia do mês anterior, limitado ao último dia daquele mês. */
export function mesmoDiaMesAnterior(dia: string): string {
  const { inicio, fim } = mesAnterior(dia)
  const alvo = inicio.slice(0, 8) + dia.slice(8, 10)
  return diaValido(alvo) && alvo <= fim ? alvo : fim
}

/** Instante ISO (com offset -03:00) representando meio-dia do dia civil — para datas retroativas. */
export function meioDiaSaoPaulo(dia: string): string {
  return `${dia}T12:00:00-03:00`
}

export type SentidoData = "PASSADO" | "FUTURO"

/**
 * Interpreta referências de data em texto normalizado.
 * PASSADO: "dia 10" no futuro deste mês vira o mês anterior (gasto já ocorrido).
 * FUTURO: "dia 10" já passado vira o próximo mês (vencimento).
 */
export function extrairData(texto: string, hoje: string, sentido: SentidoData): { dia: string; trecho: string } | null {
  const relativos: Array<[RegExp, number]> = [
    [/\bdepois de amanha\b/, 2], [/\banteontem\b/, -2], [/\bontem\b/, -1], [/\bamanha\b/, 1], [/\bhoje\b/, 0],
  ]
  for (const [re, delta] of relativos) {
    const m = texto.match(re)
    if (m) return { dia: somarDias(hoje, delta), trecho: m[0] }
  }
  const completa = texto.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)
  if (completa) {
    const d = completa[1].padStart(2, "0"), mes = completa[2].padStart(2, "0")
    let ano = completa[3] ? (completa[3].length === 2 ? "20" + completa[3] : completa[3]) : hoje.slice(0, 4)
    let dia = `${ano}-${mes}-${d}`
    if (!completa[3]) {
      if (sentido === "FUTURO" && dia < hoje) { ano = String(Number(ano) + 1); dia = `${ano}-${mes}-${d}` }
      if (sentido === "PASSADO" && dia > hoje) { ano = String(Number(ano) - 1); dia = `${ano}-${mes}-${d}` }
    }
    return diaValido(dia) ? { dia, trecho: completa[0] } : null
  }
  const doDia = texto.match(/\bdia (\d{1,2})\b/)
  if (doDia) {
    const d = doDia[1].padStart(2, "0")
    let dia = `${hoje.slice(0, 7)}-${d}`
    if (sentido === "FUTURO" && dia < hoje) {
      const [a, m] = hoje.split("-").map(Number)
      dia = new Date(Date.UTC(a, m, Number(d))).toISOString().slice(0, 10)
      if (dia.slice(8, 10) !== d) return null
    }
    if (sentido === "PASSADO" && dia > hoje) {
      dia = mesAnterior(hoje).inicio.slice(0, 8) + d
    }
    return diaValido(dia) ? { dia, trecho: doDia[0] } : null
  }
  return null
}
