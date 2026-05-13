import type { EnterprisePermissions } from "@/lib/auth/enterprise-permissions"

export type OmniAgentIntentKind =
  | "OS_OPEN"
  | "CLIENT_SEARCH"
  | "PRODUCT_SEARCH"
  | "REMINDER_CREATE"
  | "CASHBOX_QUERY"
  | "FINANCE_SUMMARY"
  | "UNKNOWN"

export type OmniAgentInterpretacao = {
  intent: OmniAgentIntentKind
  action: string
  confidence: number
  fields: Record<string, string>
  /** Quando true, exige confirmação humana antes de efeitos colaterais (OS, lembrete). */
  requiresConfirmation: boolean
}

export type OmniAgentExecutorResult =
  | { ok: true; actionLabel: string; payload: Record<string, unknown> }
  | { ok: false; actionLabel: string; error: string }

export type OmniAgentModuleGate = (p: EnterprisePermissions) => boolean

export const INTENT_MODULE: Record<OmniAgentIntentKind, OmniAgentModuleGate | null> = {
  OS_OPEN: (p) => p.workspace.omniAgent && p.hubs.operacoes && p.operacoes.criarOs,
  CLIENT_SEARCH: (p) => p.workspace.omniAgent && p.hubs.cadastros,
  PRODUCT_SEARCH: (p) => p.workspace.omniAgent && p.hubs.cadastros,
  REMINDER_CREATE: (p) => p.workspace.omniAgent,
  CASHBOX_QUERY: (p) => p.workspace.omniAgent && p.hubs.caixaHistorico,
  FINANCE_SUMMARY: (p) => p.workspace.omniAgent && p.hubs.financeiro && p.financeiro.view,
  UNKNOWN: null,
}
