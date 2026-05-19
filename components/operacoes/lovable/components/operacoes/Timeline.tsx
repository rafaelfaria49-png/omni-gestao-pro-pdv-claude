import { useMemo } from "react";
import {
  Bot,
  Banknote,
  Ban,
  CheckCircle2,
  Clock,
  FileText,
  ListChecks,
  MessageSquare,
  MinusCircle,
  Paperclip,
  PlayCircle,
  PlusCircle,
  PackageCheck,
  PackageX,
  Printer,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  Truck,
  UserCheck,
  UserPlus,
  XCircle,
} from "lucide-react";
import type { EventoTimeline, EventoTipo } from "@/types/os";
import { cn } from "@/lib/utils";

/* ── icon por tipo ── */
const ICON: Record<EventoTipo, typeof FileText> = {
  criacao: FileText,
  mudanca_status: PlayCircle,
  atribuicao_tecnico: UserPlus,
  orcamento_criado: FileText,
  orcamento_enviado: MessageSquare,
  orcamento_item_adicionado: PlusCircle,
  orcamento_item_removido: MinusCircle,
  orcamento_atualizado: FileText,
  orcamento_aprovado: CheckCircle2,
  orcamento_aprovado_editado_sem_valor: FileText,
  orcamento_aprovado_revisado: RefreshCw,
  orcamento_recusado: XCircle,
  diagnostico_registrado: Stethoscope,
  servico_iniciado: PlayCircle,
  servico_concluido: CheckCircle2,
  entrega_cliente: Truck,
  os_cancelada: Ban,
  faturamento_os_pendente: Banknote,
  faturamento_os_cancelado: Banknote,
  faturamento_os_revisado: RefreshCw,
  estoque_consumido: PackageCheck,
  estoque_item_consumido: PackageCheck,
  estoque_sync_erro: PackageX,
  estoque_restaurado: PackageX,
  estoque_restaurado_automaticamente: PackageX,
  estoque_delta_aplicado: RefreshCw,
  estoque_delta_erro: PackageX,
  financeiro_conta_receber_criada: Receipt,
  financeiro_conta_receber_atualizada: RefreshCw,
  financeiro_conta_receber_cancelada: Receipt,
  financeiro_sync_erro: RefreshCw,
  operacao_cobranca_gerada: Banknote,
  anexo_adicionado: Paperclip,
  anexo_removido: Paperclip,
  observacao: FileText,
  mensagem_cliente: MessageSquare,
  mensagem_interna: MessageSquare,
  peca_adicionada: FileText,
  garantia_acionada: ShieldCheck,
  garantia_gerada: ShieldCheck,
  checklist_finalizado: ListChecks,
  retirada_confirmada: UserCheck,
  documento_impresso: Printer,
  ia_sugestao: Bot,
};

/* ── cor do ícone ── */
const ICON_COLOR: Partial<Record<EventoTipo, string>> = {
  orcamento_aprovado: "text-emerald-500",
  orcamento_recusado: "text-rose-500",
  diagnostico_registrado: "text-sky-500",
  servico_iniciado: "text-indigo-500",
  servico_concluido: "text-emerald-500",
  entrega_cliente: "text-emerald-600",
  os_cancelada: "text-rose-600",
  orcamento_aprovado_editado_sem_valor: "text-muted-foreground",
  orcamento_aprovado_revisado: "text-amber-500",
  faturamento_os_pendente: "text-amber-500",
  faturamento_os_cancelado: "text-muted-foreground",
  faturamento_os_revisado: "text-amber-500",
  estoque_consumido: "text-emerald-500",
  estoque_item_consumido: "text-emerald-500",
  estoque_sync_erro: "text-rose-500",
  estoque_restaurado: "text-muted-foreground",
  estoque_restaurado_automaticamente: "text-muted-foreground",
  estoque_delta_aplicado: "text-amber-500",
  estoque_delta_erro: "text-rose-500",
  financeiro_conta_receber_criada: "text-emerald-500",
  financeiro_conta_receber_atualizada: "text-sky-500",
  financeiro_conta_receber_cancelada: "text-muted-foreground",
  financeiro_sync_erro: "text-rose-500",
  operacao_cobranca_gerada: "text-emerald-500",
  garantia_acionada: "text-emerald-500",
  garantia_gerada: "text-emerald-500",
  checklist_finalizado: "text-sky-500",
  retirada_confirmada: "text-emerald-600",
  documento_impresso: "text-muted-foreground",
  ia_sugestao: "text-violet-500",
  mensagem_cliente: "text-sky-500",
};

/* ── ring semântico do dot por categoria de evento ── */
const DOT_RING: Partial<Record<EventoTipo, string>> = {
  /* sucesso */
  orcamento_aprovado: "ring-emerald-500/40",
  servico_concluido: "ring-emerald-500/40",
  entrega_cliente: "ring-emerald-500/40",
  garantia_gerada: "ring-emerald-500/40",
  garantia_acionada: "ring-emerald-500/40",
  financeiro_conta_receber_criada: "ring-emerald-500/40",
  operacao_cobranca_gerada: "ring-emerald-500/40",
  retirada_confirmada: "ring-emerald-500/40",
  /* erro / cancelamento */
  orcamento_recusado: "ring-rose-500/40",
  os_cancelada: "ring-rose-500/40",
  estoque_sync_erro: "ring-rose-500/40",
  estoque_delta_erro: "ring-rose-500/40",
  financeiro_sync_erro: "ring-rose-500/40",
  /* informativo */
  diagnostico_registrado: "ring-sky-500/40",
  financeiro_conta_receber_atualizada: "ring-sky-500/40",
  mensagem_cliente: "ring-sky-500/40",
  checklist_finalizado: "ring-sky-500/40",
  /* em andamento */
  servico_iniciado: "ring-indigo-500/40",
  /* atenção */
  faturamento_os_pendente: "ring-amber-500/40",
  faturamento_os_revisado: "ring-amber-500/40",
  orcamento_aprovado_revisado: "ring-amber-500/40",
  /* ia */
  ia_sugestao: "ring-violet-500/40",
};

/* ── badge inline para eventos-chave ── */
type BadgeTone = "success" | "danger" | "warning" | "info";

const EVENT_BADGE: Partial<Record<EventoTipo, { label: string; tone: BadgeTone }>> = {
  orcamento_aprovado: { label: "Aprovado", tone: "success" },
  orcamento_recusado: { label: "Recusado", tone: "danger" },
  servico_concluido: { label: "Concluído", tone: "success" },
  entrega_cliente: { label: "Entregue", tone: "success" },
  os_cancelada: { label: "Cancelada", tone: "danger" },
  garantia_gerada: { label: "Garantia", tone: "info" },
  garantia_acionada: { label: "Garantia acionada", tone: "info" },
  faturamento_os_pendente: { label: "Faturamento", tone: "warning" },
  checklist_finalizado: { label: "Checklist", tone: "info" },
  retirada_confirmada: { label: "Retirada", tone: "success" },
};

const BADGE_CLASS: Record<BadgeTone, string> = {
  success:
    "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-500/30",
  danger:
    "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-500/30",
  warning:
    "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-500/30",
  info:
    "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-950/30 dark:text-sky-400 dark:ring-sky-500/30",
};

/* ── chip de autor-tipo ── */
const AUTOR_CHIP_LABEL: Record<EventoTimeline["autorTipo"], string | null> = {
  usuario: null,
  cliente: "Cliente",
  sistema: "Sistema",
  ia: "IA",
};

const AUTOR_CHIP_CLASS: Record<EventoTimeline["autorTipo"], string> = {
  usuario: "",
  cliente:
    "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-950/30 dark:text-sky-400",
  sistema: "bg-muted text-muted-foreground ring-border",
  ia:
    "bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-950/30 dark:text-violet-400",
};

/* ══════════════════════════════════════════════════════════════ */

function TimelineEmpty() {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground ring-1 ring-border">
        <Clock className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm font-semibold tracking-tight text-foreground">
        Nenhum evento registrado
      </p>
      <p className="mt-1 max-w-[240px] text-xs text-muted-foreground">
        As alterações nesta OS serão auditadas aqui conforme aconteçam.
      </p>
    </div>
  );
}

export function Timeline({ eventos }: { eventos: EventoTimeline[] }) {
  if (eventos.length === 0) return <TimelineEmpty />;

  const ordenados = useMemo(
    () => [...eventos].sort((a, b) => +new Date(b.criadoEm) - +new Date(a.criadoEm)),
    [eventos]
  );

  const grupos = useMemo(() => {
    const map = new Map<string, EventoTimeline[]>();
    for (const ev of ordenados) {
      const key = new Date(ev.criadoEm).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return Array.from(map.entries());
  }, [ordenados]);

  return (
    <div className="space-y-8">
      {grupos.map(([data, evs]) => (
        <div key={data}>
          {/* separador de data */}
          <div className="mb-4 flex items-center justify-center">
            <span className="rounded-full border border-border/50 bg-background/80 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-sm">
              {data}
            </span>
          </div>

          {/* eventos do dia */}
          <ol className="relative ml-3 space-y-3 border-l border-border/40 pl-6 dark:border-white/5">
            {evs.map((ev) => {
              const Icon = ICON[ev.tipo] ?? FileText;
              const iconColor = ICON_COLOR[ev.tipo] ?? "text-muted-foreground";
              const dotRing = DOT_RING[ev.tipo] ?? "ring-border/60";
              const badge = EVENT_BADGE[ev.tipo];
              const chipLabel = AUTOR_CHIP_LABEL[ev.autorTipo];
              const chipClass = AUTOR_CHIP_CLASS[ev.autorTipo];

              return (
                <li key={ev.id} className="relative">
                  {/* dot com ring semântico */}
                  <span
                    className={cn(
                      "absolute -left-[35px] flex h-[26px] w-[26px] items-center justify-center rounded-full border border-border/50 bg-card ring-4 ring-background",
                      dotRing
                    )}
                  >
                    <Icon className={cn("h-3 w-3", iconColor)} />
                  </span>

                  {/* card premium */}
                  <div className="rounded-xl bg-card px-3.5 py-3 ring-1 ring-slate-900/5 shadow-sm transition-shadow hover:shadow-md dark:ring-white/10">
                    {/* linha de meta: autor · chips · timestamp */}
                    <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                      <span className="text-xs font-semibold text-foreground">
                        {ev.autor}
                      </span>

                      {chipLabel && (
                        <span
                          className={cn(
                            "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                            chipClass
                          )}
                        >
                          {chipLabel}
                        </span>
                      )}

                      {badge && (
                        <span
                          className={cn(
                            "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                            BADGE_CLASS[badge.tone]
                          )}
                        >
                          {badge.label}
                        </span>
                      )}

                      <time className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
                        {new Date(ev.criadoEm).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>

                    {/* título (hierarquia 1) */}
                    {ev.titulo && (
                      <p className="mt-1.5 text-xs font-medium leading-snug text-foreground/90">
                        {ev.titulo}
                      </p>
                    )}

                    {/* conteúdo (hierarquia 2) */}
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {ev.conteudo}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}
