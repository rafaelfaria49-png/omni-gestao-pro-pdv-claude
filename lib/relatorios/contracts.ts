import type { EnterprisePermissions } from "@/lib/auth/enterprise-permissions"

export const REPORT_KINDS = ["produtos", "fluxo-caixa", "dre", "clientes", "os", "tecnicos", "whatsapp"] as const
export type ReportKind = typeof REPORT_KINDS[number]
export type Cell = string | number | null
export type Column = { key: string; label: string; format?: "money" | "number" | "percent" | "date" | "hours" }
export type Metric = { key: string; label: string; value: number | null; format?: Column["format"]; reason?: string }
export type ReportQuery = {
  from: string; to: string; start: Date; end: Date; page: number; pageSize: number
  search: string; category: string; brand: string; status: string; technician: string; wallet: string
  entity: string; source: string
  sort: "value" | "quantity" | "name"; grain: "day" | "week" | "month"; compare: "previous" | "year"
}
export type Report = {
  kind: ReportKind; title: string; basis: string; source: string; limitations: string[]
  metrics: Metric[]; columns: Column[]; rows: Record<string, Cell>[]; total: number
  trend: { label: string; value: number; secondary?: number }[]
  options?: { categories?: { value: string; label: string }[]; brands?: string[]; wallets?: { value: string; label: string }[] }
}
export type ReportResponse = Report & {
  storeId: string; generatedAt: string; period: { from: string; to: string }; previousPeriod: { from: string; to: string }
  previousMetrics: Metric[]; page: number; pageSize: number; durationMs: number
}
export const REPORT_TITLES: Record<ReportKind, string> = {
  produtos: "Produtos mais vendidos", "fluxo-caixa": "Fluxo de caixa", dre: "DRE gerencial parcial",
  clientes: "Clientes", os: "Ordens de serviço", tecnicos: "Desempenho de técnicos", whatsapp: "WhatsApp HUB",
}
export function isReportKind(value: string): value is ReportKind {
  return REPORT_KINDS.includes(value as ReportKind)
}
export function canReadReport(p: EnterprisePermissions, kind: ReportKind): boolean {
  if (!p.hubs.relatorios) return false
  switch (kind) {
    case "produtos": return p.hubs.vendas
    case "clientes": return p.hubs.cadastros && p.hubs.vendas
    case "fluxo-caixa": case "dre": return p.hubs.financeiro && p.financeiro.view
    case "os": case "tecnicos": return p.hubs.operacoes
    case "whatsapp": return p.hubs.whatsapp
  }
}
const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" })
export function saoPauloDay(date = new Date()): string { return dayFormatter.format(date) }
function validDay(value: string): boolean {
  return /^20\d{2}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}
const DAY = 86_400_000
const addDays = (day: string, count: number) => new Date(Date.parse(day) + count * DAY).toISOString().slice(0, 10)
/** First instant of the civil day, including historical DST days whose midnight did not exist. */
export function saoPauloDayStart(day: string): Date {
  let low = Date.parse(day) - 12 * 3600000, high = Date.parse(day) + 36 * 3600000
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (saoPauloDay(new Date(middle)) < day) low = middle + 1
    else high = middle
  }
  return new Date(low)
}
/** ISO dates are interpreted in Sao Paulo, irrespective of the browser/server timezone. */
export function parseReportQuery(params: URLSearchParams): ReportQuery {
  const from = params.get("from") ?? ""
  const to = params.get("to") ?? ""
  if (!validDay(from) || !validDay(to) || from > to) throw new Error("Informe datas válidas, com início anterior ao fim.")
  const start = saoPauloDayStart(from)
  const end = saoPauloDayStart(addDays(to, 1))
  if ((Date.parse(to) - Date.parse(from)) / DAY + 1 > 366) throw new Error("O período máximo é de 366 dias.")
  const integer = (key: string, fallback: number, max: number) => {
    const raw = params.get(key) ?? String(fallback)
    if (!/^[1-9]\d*$/.test(raw) || Number(raw) > max) throw new Error(`Parâmetro ${key} inválido.`)
    return Number(raw)
  }
  const filter = (key: string, max = 120) => {
    const raw = (params.get(key) ?? "").trim()
    if (raw.length > max || /[\u0000-\u001f]/.test(raw)) throw new Error(`Filtro ${key} inválido.`)
    return raw
  }
  const sort = params.get("sort") ?? "value"
  const grain = params.get("grain") ?? "day"
  const compare = params.get("compare") ?? "previous"
  if (!["value", "quantity", "name"].includes(sort) || !["day", "week", "month"].includes(grain) || !["previous", "year"].includes(compare)) throw new Error("Ordenação ou agrupamento inválido.")
  return { from, to, start, end, page: integer("page", 1, 10000), pageSize: integer("pageSize", 20, 100),
    search: filter("q"), category: filter("category"), brand: filter("brand"), status: filter("status"), technician: filter("technician"), wallet: filter("wallet"), entity: filter("entity"), source: filter("source",512),
    sort: sort as ReportQuery["sort"], grain: grain as ReportQuery["grain"], compare: compare as ReportQuery["compare"] }
}
export function previousQuery(q: ReportQuery): ReportQuery {
  let start: Date, end: Date
  if (q.compare === "year") {
    const shift = (day: string) => {
      const year = Number(day.slice(0, 4)) - 1
      // Feb 29 compares with Feb 28 when the preceding year has no leap day.
      const value = `${year}${day.slice(4)}`
      return !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value ? value : `${year}-02-28`
    }
    start = saoPauloDayStart(shift(q.from))
    end = saoPauloDayStart(addDays(shift(q.to), 1))
  } else {
    end = q.start
    start = saoPauloDayStart(addDays(q.from, -((Date.parse(q.to) - Date.parse(q.from)) / DAY + 1)))
  }
  return { ...q, start, end, from: saoPauloDay(start), to: saoPauloDay(new Date(end.getTime() - 1)), page: 1 }
}
export function money(value: unknown): number { return Math.round(Number(value ?? 0) * 100) / 100 }
