import type { LucideIcon } from "lucide-react"
import {
  Banknote,
  CalendarClock,
  CreditCard,
  FileText,
  Landmark,
  Layers,
  QrCode,
  Wallet,
} from "lucide-react"

/** Tipos efetivos no fluxo de pagamento do PDV (PaymentModal / finalize). */
export type PdvRuntimePaymentType =
  | "dinheiro"
  | "pix"
  | "cartao_debito"
  | "cartao_credito"
  | "carne"
  | "a_prazo"
  | "credito_vale"

/** IDs persistidos em `printerConfig.pdvParams.formasPagamento`. */
export type FormaPagamentoConfigId =
  | "dinheiro"
  | "pix"
  | "cartao_debito"
  | "cartao_credito"
  | "carne"
  | "credito_vale"
  | "a_prazo"
  | "boleto"
  | "multiplo"

export type FormaPagamentoIconId =
  | "banknote"
  | "qr-code"
  | "credit-card"
  | "landmark"
  | "calendar-clock"
  | "wallet"
  | "file-text"
  | "layers"

export type FormaPagamentoColorToken =
  | "emerald"
  | "teal"
  | "cyan"
  | "slate"
  | "blue"
  | "indigo"
  | "violet"
  | "amber"
  | "orange"

export type FormaPagamentoConfig = {
  id: FormaPagamentoConfigId
  label: string
  shortLabel: string
  ativo: boolean
  ordem: number
  icon: FormaPagamentoIconId
  cor: FormaPagamentoColorToken
  exigirCliente: boolean
  exigirCpf: boolean
  exigirAutorizacao: boolean
  permitirTroco: boolean
  permitirNoMultiplo: boolean
  hotkey?: string
}

/** Métodos nativos do PDV Assistência (modal interno). */
export type AssistenciaPayMethodId =
  | "dinheiro"
  | "pix"
  | "credito"
  | "debito"
  | "a_prazo"
  | "multiplo"

const ALL_IDS: FormaPagamentoConfigId[] = [
  "dinheiro",
  "pix",
  "cartao_debito",
  "cartao_credito",
  "carne",
  "credito_vale",
  "a_prazo",
  "boleto",
  "multiplo",
]

const DEFAULT_META: Record<
  FormaPagamentoConfigId,
  Omit<FormaPagamentoConfig, "id" | "ordem">
> = {
  dinheiro: {
    label: "Dinheiro",
    shortLabel: "Dinheiro",
    ativo: true,
    icon: "banknote",
    cor: "emerald",
    exigirCliente: false,
    exigirCpf: false,
    exigirAutorizacao: false,
    permitirTroco: true,
    permitirNoMultiplo: true,
    hotkey: "F1",
  },
  pix: {
    label: "PIX",
    shortLabel: "PIX",
    ativo: true,
    icon: "qr-code",
    cor: "teal",
    exigirCliente: false,
    exigirCpf: false,
    exigirAutorizacao: false,
    permitirTroco: false,
    permitirNoMultiplo: true,
  },
  cartao_debito: {
    label: "Cartão Débito",
    shortLabel: "Débito",
    ativo: true,
    icon: "landmark",
    cor: "slate",
    exigirCliente: false,
    exigirCpf: false,
    exigirAutorizacao: false,
    permitirTroco: false,
    permitirNoMultiplo: true,
  },
  cartao_credito: {
    label: "Cartão Crédito",
    shortLabel: "Crédito",
    ativo: true,
    icon: "credit-card",
    cor: "blue",
    exigirCliente: false,
    exigirCpf: false,
    exigirAutorizacao: false,
    permitirTroco: false,
    permitirNoMultiplo: true,
  },
  carne: {
    label: "Carnê / Crediário",
    shortLabel: "Carnê",
    ativo: true,
    icon: "file-text",
    cor: "orange",
    exigirCliente: true,
    exigirCpf: true,
    exigirAutorizacao: false,
    permitirTroco: false,
    permitirNoMultiplo: false,
  },
  credito_vale: {
    label: "Crédito / Vale",
    shortLabel: "Créd./Vale",
    ativo: true,
    icon: "wallet",
    cor: "amber",
    exigirCliente: false,
    exigirCpf: false,
    exigirAutorizacao: false,
    permitirTroco: false,
    permitirNoMultiplo: true,
  },
  a_prazo: {
    label: "À prazo",
    shortLabel: "À prazo",
    ativo: true,
    icon: "calendar-clock",
    cor: "violet",
    exigirCliente: true,
    exigirCpf: true,
    exigirAutorizacao: false,
    permitirTroco: false,
    permitirNoMultiplo: false,
  },
  boleto: {
    label: "Boleto",
    shortLabel: "Boleto",
    ativo: true,
    icon: "file-text",
    cor: "orange",
    exigirCliente: true,
    exigirCpf: true,
    exigirAutorizacao: false,
    permitirTroco: false,
    permitirNoMultiplo: false,
  },
  multiplo: {
    label: "Pagamento Múltiplo",
    shortLabel: "Múltiplo",
    ativo: true,
    icon: "layers",
    cor: "violet",
    exigirCliente: false,
    exigirCpf: false,
    exigirAutorizacao: false,
    permitirTroco: true,
    permitirNoMultiplo: false,
    hotkey: "F12",
  },
}

export function defaultFormasPagamento(): FormaPagamentoConfig[] {
  return ALL_IDS.map((id, index) => ({
    id,
    ordem: index,
    ...DEFAULT_META[id],
  }))
}

function isConfigId(v: unknown): v is FormaPagamentoConfigId {
  return typeof v === "string" && ALL_IDS.includes(v as FormaPagamentoConfigId)
}

function isIconId(v: unknown): v is FormaPagamentoIconId {
  return (
    v === "banknote" ||
    v === "qr-code" ||
    v === "credit-card" ||
    v === "landmark" ||
    v === "calendar-clock" ||
    v === "wallet" ||
    v === "file-text" ||
    v === "layers"
  )
}

function isColorToken(v: unknown): v is FormaPagamentoColorToken {
  return (
    v === "emerald" ||
    v === "teal" ||
    v === "cyan" ||
    v === "slate" ||
    v === "blue" ||
    v === "indigo" ||
    v === "violet" ||
    v === "amber" ||
    v === "orange"
  )
}

function normalizeOne(raw: unknown, fallback: FormaPagamentoConfig): FormaPagamentoConfig {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const id = isConfigId(o.id) ? o.id : fallback.id
  const base = DEFAULT_META[id]
  return {
    id,
    label: typeof o.label === "string" && o.label.trim() ? o.label.trim() : base.label,
    shortLabel:
      typeof o.shortLabel === "string" && o.shortLabel.trim()
        ? o.shortLabel.trim()
        : base.shortLabel,
    ativo: typeof o.ativo === "boolean" ? o.ativo : fallback.ativo,
    ordem: typeof o.ordem === "number" && Number.isFinite(o.ordem) ? o.ordem : fallback.ordem,
    icon: isIconId(o.icon) ? o.icon : base.icon,
    cor: isColorToken(o.cor) ? o.cor : base.cor,
    exigirCliente: typeof o.exigirCliente === "boolean" ? o.exigirCliente : base.exigirCliente,
    exigirCpf: typeof o.exigirCpf === "boolean" ? o.exigirCpf : base.exigirCpf,
    exigirAutorizacao:
      typeof o.exigirAutorizacao === "boolean" ? o.exigirAutorizacao : base.exigirAutorizacao,
    permitirTroco: typeof o.permitirTroco === "boolean" ? o.permitirTroco : base.permitirTroco,
    permitirNoMultiplo:
      typeof o.permitirNoMultiplo === "boolean" ? o.permitirNoMultiplo : base.permitirNoMultiplo,
    hotkey: typeof o.hotkey === "string" && o.hotkey.trim() ? o.hotkey.trim() : base.hotkey,
  }
}

/** Mescla persistência parcial com defaults estáveis (ordem + campos ausentes). */
export function normalizeFormasPagamento(raw: unknown): FormaPagamentoConfig[] {
  const defaults = defaultFormasPagamento()
  if (!Array.isArray(raw) || raw.length === 0) return defaults

  const byId = new Map<FormaPagamentoConfigId, FormaPagamentoConfig>()
  for (const item of raw) {
    const fallback = defaults.find((d) => d.id === (item as { id?: string })?.id) ?? defaults[0]!
    const normalized = normalizeOne(item, fallback)
    byId.set(normalized.id, normalized)
  }

  const merged = ALL_IDS.map((id, index) => {
    const fb = defaults[index]!
    return byId.get(id) ?? fb
  })

  return merged.sort((a, b) => a.ordem - b.ordem || ALL_IDS.indexOf(a.id) - ALL_IDS.indexOf(b.id))
}

export function getActiveFormasPagamento(formas: FormaPagamentoConfig[]): FormaPagamentoConfig[] {
  return [...formas].filter((f) => f.ativo).sort((a, b) => a.ordem - b.ordem)
}

/** Formas exibidas como botões no PaymentModal (exclui meta `multiplo`). */
export function getFormasForPaymentModal(formas: FormaPagamentoConfig[]): FormaPagamentoConfig[] {
  return getActiveFormasPagamento(formas).filter((f) => f.id !== "multiplo")
}

export function getFormaMultiplo(formas: FormaPagamentoConfig[]): FormaPagamentoConfig | undefined {
  const m = formas.find((f) => f.id === "multiplo")
  return m?.ativo ? m : undefined
}

/** Tipo efetivo no array de pagamentos do modal. */
export function toPaymentMethodType(id: FormaPagamentoConfigId): PdvRuntimePaymentType | null {
  if (id === "multiplo") return null
  if (id === "boleto") return "carne"
  return id
}

export function paymentMethodTypeToConfigId(type: PdvRuntimePaymentType): FormaPagamentoConfigId {
  return type
}

export function findFormaByPaymentType(
  formas: FormaPagamentoConfig[],
  type: PdvRuntimePaymentType,
  preferId?: FormaPagamentoConfigId,
): FormaPagamentoConfig | undefined {
  if (preferId) {
    const direct = formas.find((f) => f.id === preferId && f.ativo)
    if (direct && toPaymentMethodType(direct.id) === type) return direct
  }
  if (type === "carne") {
    return formas.find((f) => f.ativo && (f.id === "carne" || f.id === "boleto"))
  }
  return formas.find((f) => f.ativo && f.id === type)
}

export function findFormaById(
  formas: FormaPagamentoConfig[],
  id: FormaPagamentoConfigId,
): FormaPagamentoConfig | undefined {
  return formas.find((f) => f.id === id)
}

const ICON_MAP: Record<FormaPagamentoIconId, LucideIcon> = {
  banknote: Banknote,
  "qr-code": QrCode,
  "credit-card": CreditCard,
  landmark: Landmark,
  "calendar-clock": CalendarClock,
  wallet: Wallet,
  "file-text": FileText,
  layers: Layers,
}

export function getFormaPagamentoIcon(icon: FormaPagamentoIconId): LucideIcon {
  return ICON_MAP[icon] ?? Banknote
}

/** Classes Tailwind para botões outline (PDV classic/supermercado). */
export function formaPagamentoOutlineClasses(
  cor: FormaPagamentoColorToken,
  selected?: boolean,
): string {
  const base =
    "border-2 bg-background shadow-sm transition-colors dark:bg-black/60 dark:backdrop-blur-md"
  const map: Record<FormaPagamentoColorToken, { border: string; hover: string; selected: string; icon: string }> = {
    emerald: {
      border: "border-emerald-500/40 dark:border-emerald-400/50",
      hover: "hover:bg-emerald-500/10 dark:hover:bg-emerald-500/15",
      selected: "border-emerald-500 bg-emerald-500/10 dark:border-emerald-400/70 dark:bg-emerald-500/20",
      icon: "text-emerald-600 dark:text-emerald-400",
    },
    teal: {
      border: "border-teal-500/40 dark:border-teal-400/50",
      hover: "hover:bg-teal-500/10 dark:hover:bg-teal-500/15",
      selected: "border-teal-500 bg-teal-500/10 dark:border-teal-400/70 dark:bg-teal-500/20",
      icon: "text-teal-600 dark:text-teal-400",
    },
    cyan: {
      border: "border-cyan-500/40 dark:border-cyan-400/50",
      hover: "hover:bg-cyan-500/10 dark:hover:bg-cyan-500/15",
      selected: "border-cyan-500 bg-cyan-500/10 dark:border-cyan-400/70 dark:bg-cyan-500/20",
      icon: "text-cyan-600 dark:text-cyan-400",
    },
    slate: {
      border: "border-slate-500/40 dark:border-slate-400/50",
      hover: "hover:bg-slate-500/10 dark:hover:bg-slate-500/15",
      selected: "border-slate-500 bg-slate-500/10 dark:border-slate-400/70 dark:bg-slate-500/20",
      icon: "text-slate-600 dark:text-slate-300",
    },
    blue: {
      border: "border-blue-500/40 dark:border-blue-400/50",
      hover: "hover:bg-blue-500/10 dark:hover:bg-blue-500/15",
      selected: "border-blue-500 bg-blue-500/10 dark:border-blue-400/70 dark:bg-blue-500/20",
      icon: "text-blue-600 dark:text-blue-400",
    },
    indigo: {
      border: "border-indigo-500/40 dark:border-indigo-400/50",
      hover: "hover:bg-indigo-500/10 dark:hover:bg-indigo-500/15",
      selected: "border-indigo-500 bg-indigo-500/10 dark:border-indigo-400/70 dark:bg-indigo-500/20",
      icon: "text-indigo-600 dark:text-indigo-400",
    },
    violet: {
      border: "border-violet-500/40 dark:border-violet-400/50",
      hover: "hover:bg-violet-500/10 dark:hover:bg-violet-500/15",
      selected: "border-violet-500 bg-violet-500/10 dark:border-violet-400/70 dark:bg-violet-500/20",
      icon: "text-violet-600 dark:text-violet-400",
    },
    amber: {
      border: "border-amber-500/40 dark:border-amber-400/50",
      hover: "hover:bg-amber-500/10 dark:hover:bg-amber-500/15",
      selected: "border-amber-500 bg-amber-500/10 dark:border-amber-400/70 dark:bg-amber-500/20",
      icon: "text-amber-600 dark:text-amber-400",
    },
    orange: {
      border: "border-orange-500/45 dark:border-orange-400/50",
      hover: "hover:bg-orange-500/10 dark:hover:bg-orange-500/15",
      selected: "border-orange-500 bg-orange-500/10 dark:border-orange-400/70 dark:bg-orange-500/20",
      icon: "text-orange-600 dark:text-orange-400",
    },
  }
  const c = map[cor]
  return selected
    ? `${base} ${c.selected} ${c.icon}`
    : `${base} ${c.border} ${c.hover} ${c.icon}`
}

/** Classes para botão filled do PDV Assistência. */
export function formaPagamentoAssistenciaColorClass(cor: FormaPagamentoColorToken): string {
  const map: Record<FormaPagamentoColorToken, string> = {
    emerald:
      "bg-emerald-600 hover:bg-emerald-500 shadow-[0_4px_12px_-2px_rgba(5,150,105,0.45)] hover:shadow-[0_4px_18px_-2px_rgba(5,150,105,0.62)]",
    teal: "bg-teal-600 hover:bg-teal-500 shadow-[0_4px_12px_-2px_rgba(13,148,136,0.45)] hover:shadow-[0_4px_18px_-2px_rgba(13,148,136,0.62)]",
    cyan: "bg-cyan-600 hover:bg-cyan-500 shadow-[0_4px_12px_-2px_rgba(8,145,178,0.45)] hover:shadow-[0_4px_18px_-2px_rgba(8,145,178,0.62)]",
    slate:
      "bg-slate-600 hover:bg-slate-500 shadow-[0_4px_12px_-2px_rgba(71,85,105,0.45)] hover:shadow-[0_4px_18px_-2px_rgba(71,85,105,0.62)]",
    blue: "bg-blue-600 hover:bg-blue-500 shadow-[0_4px_12px_-2px_rgba(37,99,235,0.45)] hover:shadow-[0_4px_18px_-2px_rgba(37,99,235,0.62)]",
    indigo:
      "bg-indigo-600 hover:bg-indigo-500 shadow-[0_4px_12px_-2px_rgba(79,70,229,0.45)] hover:shadow-[0_4px_18px_-2px_rgba(79,70,229,0.62)]",
    violet:
      "bg-violet-600 hover:bg-violet-500 shadow-[0_4px_12px_-2px_rgba(124,58,237,0.45)] hover:shadow-[0_4px_18px_-2px_rgba(124,58,237,0.62)]",
    amber:
      "bg-amber-600 hover:bg-amber-500 shadow-[0_4px_12px_-2px_rgba(217,119,6,0.45)] hover:shadow-[0_4px_18px_-2px_rgba(217,119,6,0.62)]",
    orange:
      "bg-orange-600 hover:bg-orange-500 shadow-[0_4px_12px_-2px_rgba(234,88,12,0.45)] hover:shadow-[0_4px_18px_-2px_rgba(234,88,12,0.62)]",
  }
  return map[cor]
}

/** Botões rápidos do PDV Supermercado (estilo soft filled). */
export function formaPagamentoSupermercadoQuickClasses(cor: FormaPagamentoColorToken): string {
  const map: Record<FormaPagamentoColorToken, string> = {
    emerald:
      "bg-emerald-500/[0.04] border-emerald-500/20 text-emerald-700 hover:bg-emerald-500/[0.08] hover:border-emerald-500/35 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400 dark:hover:bg-emerald-500/15",
    teal: "bg-teal-500/[0.04] border-teal-500/20 text-teal-700 hover:bg-teal-500/[0.08] dark:bg-teal-500/10 dark:border-teal-500/20 dark:text-teal-400 dark:hover:bg-teal-500/15",
    cyan: "bg-cyan-500/[0.04] border-cyan-500/20 text-cyan-700 hover:bg-cyan-500/[0.08] dark:bg-cyan-500/10 dark:border-cyan-500/20 dark:text-cyan-400 dark:hover:bg-cyan-500/15",
    slate:
      "bg-slate-500/[0.04] border-slate-500/20 text-slate-700 hover:bg-slate-500/[0.08] dark:bg-slate-500/10 dark:border-slate-500/20 dark:text-slate-300 dark:hover:bg-slate-500/15",
    blue: "bg-blue-500/[0.04] border-blue-500/20 text-blue-700 hover:bg-blue-500/[0.08] dark:bg-blue-500/10 dark:border-blue-500/20 dark:text-blue-400 dark:hover:bg-blue-500/15",
    indigo:
      "bg-indigo-500/[0.04] border-indigo-500/20 text-indigo-700 hover:bg-indigo-500/[0.08] dark:bg-indigo-500/10 dark:border-indigo-500/20 dark:text-indigo-400 dark:hover:bg-indigo-500/15",
    violet:
      "bg-violet-500/[0.04] border-violet-500/20 text-violet-700 hover:bg-violet-500/[0.08] dark:bg-violet-500/10 dark:border-violet-500/20 dark:text-violet-400 dark:hover:bg-violet-500/15",
    amber:
      "bg-amber-500/[0.04] border-amber-500/20 text-amber-700 hover:bg-amber-500/[0.08] dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-400 dark:hover:bg-amber-500/15",
    orange:
      "bg-orange-500/[0.04] border-orange-500/20 text-orange-700 hover:bg-orange-500/[0.08] dark:bg-orange-500/10 dark:border-orange-500/20 dark:text-orange-400 dark:hover:bg-orange-500/15",
  }
  return map[cor]
}

export function toAssistenciaPayMethodId(id: FormaPagamentoConfigId): AssistenciaPayMethodId | null {
  switch (id) {
    case "dinheiro":
      return "dinheiro"
    case "pix":
      return "pix"
    case "cartao_credito":
      return "credito"
    case "cartao_debito":
      return "debito"
    case "a_prazo":
      return "a_prazo"
    case "multiplo":
      return "multiplo"
    default:
      return null
  }
}

export type AssistenciaPayMethodRuntime = {
  id: AssistenciaPayMethodId
  label: string
  shortLabel: string
  Icon: LucideIcon
  color: string
  hotkey?: string
  configId: FormaPagamentoConfigId
}

export function buildAssistenciaPayMethods(
  formas: FormaPagamentoConfig[],
): AssistenciaPayMethodRuntime[] {
  return getActiveFormasPagamento(formas).flatMap((f) => {
    const payId = toAssistenciaPayMethodId(f.id)
    if (!payId) return []
    const item: AssistenciaPayMethodRuntime = {
      id: payId,
      label: f.label,
      shortLabel: f.shortLabel,
      Icon: getFormaPagamentoIcon(f.icon),
      color: formaPagamentoAssistenciaColorClass(f.cor),
      configId: f.id,
    }
    if (f.hotkey) item.hotkey = f.hotkey
    return [item]
  })
}

export function formasPagamentoEqual(a: FormaPagamentoConfig[], b: FormaPagamentoConfig[]): boolean {
  if (a.length !== b.length) return false
  const norm = (list: FormaPagamentoConfig[]) =>
    [...list]
      .sort((x, y) => x.ordem - y.ordem || ALL_IDS.indexOf(x.id) - ALL_IDS.indexOf(y.id))
      .map((f) => JSON.stringify(f))
      .join("|")
  return norm(a) === norm(b)
}

export const FORMA_PAGAMENTO_ICON_OPTIONS: { id: FormaPagamentoIconId; label: string }[] = [
  { id: "banknote", label: "Dinheiro" },
  { id: "qr-code", label: "PIX / QR" },
  { id: "credit-card", label: "Cartão" },
  { id: "landmark", label: "Débito" },
  { id: "calendar-clock", label: "Calendário" },
  { id: "wallet", label: "Carteira" },
  { id: "file-text", label: "Documento" },
  { id: "layers", label: "Camadas" },
]

export const FORMA_PAGAMENTO_COLOR_OPTIONS: { id: FormaPagamentoColorToken; label: string }[] = [
  { id: "emerald", label: "Verde" },
  { id: "teal", label: "Teal" },
  { id: "cyan", label: "Ciano" },
  { id: "slate", label: "Cinza" },
  { id: "blue", label: "Azul" },
  { id: "indigo", label: "Índigo" },
  { id: "violet", label: "Violeta" },
  { id: "amber", label: "Âmbar" },
  { id: "orange", label: "Laranja" },
]
