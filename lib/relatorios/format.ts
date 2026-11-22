import type { Cell,Column } from "./contracts"

export function formatCell(value: Cell | undefined, format?: Column["format"]): string {
  if (value === null || value === undefined) return "Indisponível"
  if (format === "date") {
    if(typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value))return new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",dateStyle:"short"}).format(new Date(`${value}T12:00:00-03:00`))
    const date = new Date(String(value))
    return Number.isNaN(date.getTime()) ? "Data indisponível" : new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(date)
  }
  if (typeof value !== "number") return String(value)
  if (format === "money") return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value) + (format === "percent" ? "%" : format === "hours" ? " h" : "")
}
