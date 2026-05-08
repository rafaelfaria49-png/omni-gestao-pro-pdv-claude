/**
 * Origens canônicas de lançamentos financeiros (contrato de rastreabilidade / idempotência).
 */

export const FINANCEIRO_ORIGEM = {
  OS: "os",
  PDV: "pdv",
  MANUAL: "manual",
  MARKETPLACE: "marketplace",
  AJUSTE: "ajuste",
  IMPORTACAO: "importacao",
  SISTEMA: "sistema",
  LEGADO: "legado",
} as const

export type FinanceiroOrigem = (typeof FINANCEIRO_ORIGEM)[keyof typeof FINANCEIRO_ORIGEM]

const ORIGEM_ALIASES = new Map<string, FinanceiroOrigem>([
  ["os", FINANCEIRO_ORIGEM.OS],
  ["ordem_servico", FINANCEIRO_ORIGEM.OS],
  ["ordem-servico", FINANCEIRO_ORIGEM.OS],
  ["pdv", FINANCEIRO_ORIGEM.PDV],
  ["venda", FINANCEIRO_ORIGEM.PDV],
  ["manual", FINANCEIRO_ORIGEM.MANUAL],
  ["marketplace", FINANCEIRO_ORIGEM.MARKETPLACE],
  ["ajuste", FINANCEIRO_ORIGEM.AJUSTE],
  ["importacao", FINANCEIRO_ORIGEM.IMPORTACAO],
  ["importação", FINANCEIRO_ORIGEM.IMPORTACAO],
  ["sistema", FINANCEIRO_ORIGEM.SISTEMA],
  ["legado", FINANCEIRO_ORIGEM.LEGADO],
])

function normKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
}

export function normalizeFinanceiroOrigem(raw: string | null | undefined): FinanceiroOrigem | null {
  if (raw == null || raw === "") return null
  const k = normKey(raw)
  return ORIGEM_ALIASES.get(k) ?? null
}

const ORIGEM_LABELS: Record<FinanceiroOrigem, string> = {
  [FINANCEIRO_ORIGEM.OS]: "Ordem de serviço",
  [FINANCEIRO_ORIGEM.PDV]: "PDV",
  [FINANCEIRO_ORIGEM.MANUAL]: "Manual",
  [FINANCEIRO_ORIGEM.MARKETPLACE]: "Marketplace",
  [FINANCEIRO_ORIGEM.AJUSTE]: "Ajuste",
  [FINANCEIRO_ORIGEM.IMPORTACAO]: "Importação",
  [FINANCEIRO_ORIGEM.SISTEMA]: "Sistema",
  [FINANCEIRO_ORIGEM.LEGADO]: "Legado",
}

export function getFinanceiroOrigemLabel(origem: FinanceiroOrigem | string | null | undefined): string {
  if (!origem) return "—"
  const o = normalizeFinanceiroOrigem(origem)
  if (o) return ORIGEM_LABELS[o]
  return String(origem)
}

/** Valor já usado no adapter OS → receber (`buildContaReceberFromOS`). */
export const FINANCEIRO_CREATED_FROM_OPERACOES_HUB_V2 = "operacoes-hub-v2" as const
