import { GESTOR_MONEY_TIMEZONE, type CentavosString } from "./contracts"

const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const compactNumberFormatter = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
})

export function parseBigIntCentavos(value: CentavosString | bigint | number | null | undefined): bigint {
  if (typeof value === "bigint") return value
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return BigInt(0)
    return BigInt(Math.round(value))
  }
  if (typeof value !== "string") return BigInt(0)
  const cleaned = value.trim()
  if (!/^-?\d+$/.test(cleaned)) return BigInt(0)
  return BigInt(cleaned)
}

export function somarCentavos(values: Array<CentavosString | bigint>): CentavosString {
  let total = BigInt(0)
  for (const v of values) total += parseBigIntCentavos(v)
  return total.toString()
}

export function subtrairCentavos(a: CentavosString | bigint, b: CentavosString | bigint): CentavosString {
  return (parseBigIntCentavos(a) - parseBigIntCentavos(b)).toString()
}

export function centavosParaReais(value: CentavosString | bigint): number {
  return Number(parseBigIntCentavos(value)) / 100
}

export function formatarCentavosBRL(value: CentavosString | bigint | null | undefined): string {
  return brlFormatter.format(centavosParaReais(value ?? "0"))
}

export function formatarCentavosCompacto(value: CentavosString | bigint): string {
  const reais = centavosParaReais(value)
  if (Math.abs(reais) < 1000) return brlFormatter.format(reais)
  return `R$ ${compactNumberFormatter.format(reais)}`
}

/**
 * Converte entrada digitada pelo usuário (ex: "1.250,90", "45,5", "120", "R$ 89,99")
 * para string inteira de centavos ("125090"), retornando null se inválida.
 */
export function parseBRLParaCentavos(raw: string): CentavosString | null {
  const clean = raw
    .replace(/R\$/gi, "")
    .replace(/\s+/g, "")
    .trim()
  if (!clean) return null

  let normalized = clean
  if (clean.includes(",") && clean.includes(".")) {
    // Formato pt-BR: 1.234,56
    normalized = clean.replace(/\./g, "").replace(",", ".")
  } else if (clean.includes(",")) {
    normalized = clean.replace(",", ".")
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null
  const [inteiro, frac = ""] = normalized.split(".")
  const centavos = (BigInt(inteiro) * BigInt(100) + BigInt(frac.padEnd(2, "0"))).toString()
  return centavos
}

export function percentualCentavos(parte: CentavosString | bigint, total: CentavosString | bigint): number {
  const p = parseBigIntCentavos(parte)
  const t = parseBigIntCentavos(total)
  if (t <= BigInt(0) || p <= BigInt(0)) return 0
  const scaled = Number((p * BigInt(1000)) / t) / 10
  return Math.min(100, Math.max(0, scaled))
}

export function variacaoPercentual(atual: CentavosString | bigint, anterior: CentavosString | bigint): number | null {
  const a = parseBigIntCentavos(atual)
  const b = parseBigIntCentavos(anterior)
  if (b === BigInt(0)) return a === BigInt(0) ? 0 : null
  return Math.round(Number(((a - b) * BigInt(1000)) / (b < BigInt(0) ? -b : b))) / 10
}

/** Normalização NFKC pt-BR espelhando `lib/gastos/categorias.ts` (G002). */
export function normalizarNomeCategoria(nome: string): string {
  return nome.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR")
}

export function hojeSaoPaulo(agora = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: GESTOR_MONEY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(agora)
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? ""
  return `${get("year")}-${get("month")}-${get("day")}`
}

export function formatarDataBR(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate)
  if (!match) return isoDate
  return `${match[3]}/${match[2]}/${match[1]}`
}

export function diasEntreDatasCivil(origem: string, destino: string): number {
  const a = new Date(`${origem.slice(0, 10)}T00:00:00.000Z`).getTime()
  const b = new Date(`${destino.slice(0, 10)}T00:00:00.000Z`).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.round((b - a) / 86_400_000)
}

export function formatarTamanhoArquivo(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function rotuloMeioPagamento(meio: string): string {
  const mapa: Record<string, string> = {
    pix: "Pix",
    dinheiro: "Dinheiro",
    debito: "Débito",
    transferencia: "Transferência",
    boleto: "Boleto",
  }
  return mapa[meio] ?? meio
}

export function rotuloTipoConta(tipo: string): string {
  const mapa: Record<string, string> = {
    dinheiro: "Dinheiro",
    banco: "Banco",
    pix: "Pix",
    carteira_digital: "Carteira Digital",
    caixa: "Caixa",
    investimento: "Investimento",
  }
  return mapa[tipo] ?? tipo
}
