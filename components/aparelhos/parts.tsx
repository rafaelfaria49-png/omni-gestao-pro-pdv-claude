"use client"

import type { ReactNode } from "react"
import { Check, CircleSlash, Minus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { APARELHO_CONDICAO_LABEL, APARELHO_ORIGEM_LABEL, APARELHO_STATUS_LABEL, type AparelhoCondicao, type AparelhoOrigem, type AparelhoStatus } from "@/lib/aparelhos/lifecycle"
import { CHECKLIST_ITENS, CHECKLIST_VALOR_LABEL, type Checklist, type ChecklistValor } from "@/lib/aparelhos/checklist"
import { formatImei, normalizeImei, validateImei } from "@/lib/aparelhos/imei"
import { calcularGarantia, formatDateKeyBr, rotuloPrazo } from "@/lib/aparelhos/warranty"

export const brl = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }))
export const dataBr = (iso: string | Date | null | undefined) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—")
export const dataHoraBr = (iso: string | Date | null | undefined) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—")

/** Tom semântico (tokens do tema: success/warning/info/destructive). */
type Tone = "neutral" | "success" | "warning" | "info" | "danger" | "primary"
const TONE: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-[color-mix(in_oklab,var(--success)_16%,transparent)] text-[color:color-mix(in_oklab,var(--success)_70%,var(--foreground))]",
  warning: "bg-[color-mix(in_oklab,var(--warning)_18%,transparent)] text-[color:color-mix(in_oklab,var(--warning)_50%,var(--foreground))]",
  info: "bg-[color-mix(in_oklab,var(--info)_16%,transparent)] text-[color:color-mix(in_oklab,var(--info)_75%,var(--foreground))]",
  danger: "bg-[color-mix(in_oklab,var(--destructive)_16%,transparent)] text-[color:var(--destructive)]",
  primary: "bg-primary/12 text-primary",
}

export function Pill({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium", TONE[tone], className)}>{children}</span>
}

const STATUS_TONE: Record<AparelhoStatus, Tone> = {
  aguardando_conferencia: "warning", em_avaliacao: "info", disponivel: "success", reservado: "warning",
  em_revisao: "info", vendido: "neutral", devolvido: "info", bloqueado: "danger", baixado: "neutral",
}

export function StatusPill({ status }: { status: string }) {
  const s = status as AparelhoStatus
  return (
    <Pill tone={STATUS_TONE[s] ?? "neutral"}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {APARELHO_STATUS_LABEL[s] ?? status}
    </Pill>
  )
}

export function CondicaoPill({ condicao }: { condicao: string }) {
  const novo = condicao === "novo_lacrado" || condicao === "novo_aberto"
  return <Pill tone={novo ? "primary" : "info"}>{APARELHO_CONDICAO_LABEL[condicao as AparelhoCondicao] ?? condicao}</Pill>
}

export const origemLabel = (o: string) => APARELHO_ORIGEM_LABEL[o as AparelhoOrigem] ?? o

/** Identidade da unidade: IMEI agrupado TAC/série/DV e verificação do dígito. */
export function ImeiStrip({ imei, label = "IMEI", masked = false }: { imei: string | null | undefined; label?: string; masked?: boolean }) {
  if (!imei) return null
  const digits = normalizeImei(imei)
  const valid = !masked && validateImei(digits).ok
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate font-mono text-sm tabular-nums tracking-wide text-foreground">{masked ? imei : formatImei(digits)}</span>
      {valid && <Check aria-label="Dígito verificador confere" className="h-3.5 w-3.5 shrink-0 text-[color:var(--success)]" />}
    </div>
  )
}

/** Campo de IMEI com validação ao vivo do dígito verificador. */
export function ImeiInput({ id, value, onChange, label, required }: { id: string; value: string; onChange: (v: string) => void; label: string; required?: boolean }) {
  const d = normalizeImei(value)
  const check = d.length === 0 ? null : validateImei(d)
  const msgId = `${id}-msg`
  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium text-foreground">{label}{required && <span className="text-primary"> *</span>}</label>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d\s]/g, "").slice(0, 19))}
        aria-invalid={check ? !check.ok : undefined}
        aria-describedby={msgId}
        placeholder="15 dígitos (*#06#)"
        className={cn(
          "h-10 w-full rounded-lg border bg-background px-3 font-mono text-sm tabular-nums tracking-wide text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
          check && !check.ok ? "border-destructive" : check?.ok ? "border-[color:var(--success)]" : "border-input",
        )}
      />
      <p id={msgId} className={cn("text-xs", check && !check.ok ? "text-destructive" : "text-muted-foreground")}>
        {!check ? "Leitor de código de barras ou digitação." : check.ok ? `Válido — ${formatImei(d)}` : check.message}
      </p>
    </div>
  )
}

const CHECK_ICON: Record<ChecklistValor, typeof Check> = { PASS: Check, FAIL: X, NAO_TESTADO: Minus, NAO_APLICAVEL: CircleSlash }
const CHECK_ON: Record<ChecklistValor, string> = {
  PASS: "border-[color:var(--success)] bg-[color-mix(in_oklab,var(--success)_14%,transparent)] text-[color:var(--success)]",
  FAIL: "border-destructive bg-destructive/10 text-destructive",
  NAO_TESTADO: "border-border bg-muted text-foreground",
  NAO_APLICAVEL: "border-border bg-muted text-muted-foreground",
}

/** Checklist com 4 estados explícitos; item sem marcação conta como "não testado". */
export function ChecklistEditor({ value, onChange, readOnly = false }: { value: Checklist; onChange?: (c: Checklist) => void; readOnly?: boolean }) {
  return (
    <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      {CHECKLIST_ITENS.map((item) => {
        const current = value[item.key] ?? "NAO_TESTADO"
        return (
          <li key={item.key} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5">
            <span className="min-w-0 truncate text-sm text-foreground">{item.label}</span>
            {readOnly ? (
              <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs", CHECK_ON[current])}>{CHECKLIST_VALOR_LABEL[current]}</span>
            ) : (
              <div role="radiogroup" aria-label={item.label} className="flex shrink-0 gap-1">
                {(Object.keys(CHECK_ICON) as ChecklistValor[]).map((v) => {
                  const Icon = CHECK_ICON[v]
                  const on = current === v
                  return (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-label={`${item.label}: ${CHECKLIST_VALOR_LABEL[v]}`}
                      title={CHECKLIST_VALOR_LABEL[v]}
                      onClick={() => onChange?.({ ...value, [item.key]: v })}
                      className={cn("grid h-7 w-7 place-items-center rounded-md border text-muted-foreground transition-colors focus-visible:outline-2 focus-visible:outline-ring", on ? CHECK_ON[v] : "border-transparent hover:bg-muted")}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </button>
                  )
                })}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Régua de cobertura: garantia contratual (da entrega) seguida da legal de 90 dias.
 * É o elemento de destaque das duas telas — mostra ao cliente e ao operador o que está coberto.
 */
export function CoberturaRegua({ dataEntrega, contratualDias, compact = false }: { dataEntrega: string; contratualDias: number; compact?: boolean }) {
  const g = calcularGarantia(dataEntrega, contratualDias)
  const total = g.totalDias
  const pc = (contratualDias / total) * 100
  return (
    <figure className="min-w-0" aria-label={`Cobertura até ${formatDateKeyBr(g.coberturaFim)}`}>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        {contratualDias > 0 && <div className="h-full bg-primary" style={{ width: `${pc}%` }} />}
        <div className="h-full flex-1 bg-[color:var(--info)]" />
      </div>
      <figcaption className={cn("mt-2 grid gap-x-4 gap-y-1 text-xs", compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-3")}>
        <span className="min-w-0 text-muted-foreground">Entrega <b className="font-semibold text-foreground">{formatDateKeyBr(g.dataEntrega)}</b></span>
        <span className="min-w-0 text-muted-foreground">
          <span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-full bg-primary align-middle" />
          Contratual {contratualDias > 0 ? <b className="font-semibold text-foreground">{rotuloPrazo(contratualDias)}{contratualDias % 30 !== 0 || contratualDias > 90 ? ` (${contratualDias} d)` : ""}</b> : <b className="font-semibold text-foreground">sem adicional</b>}
        </span>
        <span className="min-w-0 text-muted-foreground">
          <span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-full bg-[color:var(--info)] align-middle" />
          Legal <b className="font-semibold text-foreground">90 dias</b> — até <b className="font-semibold text-foreground">{formatDateKeyBr(g.coberturaFim)}</b>
        </span>
      </figcaption>
    </figure>
  )
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
      <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">{icon}</div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {children && <p className="max-w-md text-sm text-muted-foreground">{children}</p>}
      {action}
    </div>
  )
}

export function FieldLabel({ htmlFor, children, required }: { htmlFor?: string; children: ReactNode; required?: boolean }) {
  return <label htmlFor={htmlFor} className="block text-xs font-medium text-foreground">{children}{required && <span className="text-primary"> *</span>}</label>
}

export const inputCls = "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
