"use client"

/**
 * Contador HUB · UI do checklist de fechamento (GOAL 007).
 *
 * Consome apenas o DTO puro `ChecklistFechamento` — sem reconsultar readers.
 * Estados: ok · atencao · pendente · nao_disponivel. Sem percentual inventado.
 * Botão «Fechar competência» desabilitado (fechamento real = GOAL 012).
 */
import { AlertTriangle, Check, Clock, HelpCircle, Minus } from "lucide-react"
import { cn } from "@/lib/utils"
import type {
  ChecklistFechamento,
  EstadoChecklistItem,
} from "@/lib/contador/fechamento"
import { labelCompetenciaCurta } from "@/lib/contador/competencia"

const ESTADO_LABEL: Record<EstadoChecklistItem, string> = {
  ok: "ok",
  atencao: "atenção",
  pendente: "pendente",
  nao_disponivel: "não disponível",
}

const ESTADO_CHIP: Record<EstadoChecklistItem, string> = {
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  atencao: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  pendente: "border-border bg-muted text-muted-foreground",
  nao_disponivel: "border-border bg-muted/60 text-muted-foreground",
}

const ESTADO_ICON_WRAP: Record<EstadoChecklistItem, string> = {
  ok: "border-emerald-500 bg-emerald-500 text-primary-foreground",
  atencao: "border-amber-500 bg-amber-500 text-primary-foreground",
  pendente: "border-border bg-card text-muted-foreground",
  nao_disponivel: "border-dashed border-border bg-muted/40 text-muted-foreground",
}

function EstadoIcon({ estado }: { estado: EstadoChecklistItem }) {
  if (estado === "ok") return <Check className="h-3 w-3" strokeWidth={3} />
  if (estado === "atencao") return <AlertTriangle className="h-3 w-3" strokeWidth={2.5} />
  if (estado === "pendente") return <Clock className="h-3 w-3" strokeWidth={2.5} />
  return <HelpCircle className="h-3 w-3" strokeWidth={2.5} />
}

function ContagemBar({ contagem }: { contagem: ChecklistFechamento["contagem"] }) {
  const cells: { key: EstadoChecklistItem; n: number }[] = [
    { key: "ok", n: contagem.ok },
    { key: "atencao", n: contagem.atencao },
    { key: "pendente", n: contagem.pendente },
    { key: "nao_disponivel", n: contagem.nao_disponivel },
  ]
  return (
    <div className="flex flex-wrap items-center gap-2">
      {cells.map(({ key, n }) => (
        <span
          key={key}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold",
            ESTADO_CHIP[key],
          )}
        >
          <span className="font-mono tabular-nums">{n}</span>
          {ESTADO_LABEL[key]}
        </span>
      ))}
      <span className="text-[12px] text-muted-foreground">
        · <span className="font-mono tabular-nums">{contagem.total}</span> sinais
      </span>
    </div>
  )
}

export function ContadorFechamentoChecklist({ checklist }: { checklist: ChecklistFechamento }) {
  const compShort = labelCompetenciaCurta(checklist.competencia)

  return (
    <div className="grid gap-4">
      <div className="flex items-start gap-2.5 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] px-3 py-2.5">
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="min-w-0 text-[13px] leading-relaxed text-foreground">
          <b className="text-foreground">Sinais reais · somente leitura</b>
          <span className="text-muted-foreground">
            {" "}
            — competência <b className="text-foreground">{compShort}</b>. Derivado do DTO já
            carregado (sem nova consulta). Contagem por estado; sem percentual inventado.
          </span>
        </div>
      </div>

      <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <b className="text-amber-600 dark:text-amber-400">Não é fechamento oficial.</b>{" "}
          {checklist.disclaimer}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-4 border-b border-border/60 p-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-2 border-border bg-muted/40">
            <Minus className="h-5 w-5 text-muted-foreground" strokeWidth={2} aria-hidden />
          </div>
          <div className="min-w-[160px] flex-1">
            <div className="font-semibold text-foreground">Sinais da competência {compShort}</div>
            <div className="mt-0.5 text-[12.5px] text-muted-foreground">
              Contagem honesta por estado — o sistema não marca a competência como pronta ou
              fechada.
            </div>
            <div className="mt-2.5">
              <ContagemBar contagem={checklist.contagem} />
            </div>
          </div>
        </div>

        <ul>
          {checklist.itens.map((it) => (
            <li
              key={it.id}
              className="flex items-start gap-3.5 border-b border-border/60 p-4 last:border-b-0"
            >
              <span
                className={cn(
                  "mt-0.5 grid h-[21px] w-[21px] shrink-0 place-items-center rounded-md border-2",
                  ESTADO_ICON_WRAP[it.estado],
                )}
                aria-hidden
              >
                <EstadoIcon estado={it.estado} />
              </span>
              <div className="min-w-0 flex-1">
                <b className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-foreground">
                  {it.titulo}
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                      ESTADO_CHIP[it.estado],
                    )}
                  >
                    {ESTADO_LABEL[it.estado]}
                  </span>
                </b>
                <p className="mt-1 text-[12.5px] leading-snug text-foreground/90">{it.explicacao}</p>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span>
                    <span className="font-medium text-muted-foreground/80">Origem:</span>{" "}
                    <span className="font-mono">{it.origem}</span>
                  </span>
                  {it.evidencia ? (
                    <span>
                      <span className="font-medium text-muted-foreground/80">Evidência:</span>{" "}
                      <span className="font-mono">{it.evidencia}</span>
                    </span>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** CTA desabilitado — fechamento real com snapshot no GOAL 012. */
export const FECHAR_COMPETENCIA_TITLE =
  "Fechamento real com snapshot será implementado no GOAL 012. Nesta fase o botão permanece desabilitado."
