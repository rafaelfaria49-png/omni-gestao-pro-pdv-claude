import {
  Bot,
  Banknote,
  Ban,
  CheckCircle2,
  FileText,
  MessageSquare,
  MinusCircle,
  Paperclip,
  PlayCircle,
  PlusCircle,
  PackageCheck,
  PackageX,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  Truck,
  UserPlus,
  XCircle,
} from "lucide-react";
import type { EventoTimeline, EventoTipo } from "@/types/os";
import { dt } from "@/lib/os/format";
import { cn } from "@/lib/utils";

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
  anexo_adicionado: Paperclip,
  anexo_removido: Paperclip,
  observacao: FileText,
  mensagem_cliente: MessageSquare,
  mensagem_interna: MessageSquare,
  peca_adicionada: FileText,
  garantia_acionada: ShieldCheck,
  ia_sugestao: Bot,
};

const COLOR: Partial<Record<EventoTipo, string>> = {
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
  garantia_acionada: "text-emerald-500",
  ia_sugestao: "text-violet-500",
  mensagem_cliente: "text-sky-500",
};

export function Timeline({ eventos }: { eventos: EventoTimeline[] }) {
  const ordenados = [...eventos].sort((a, b) => +new Date(b.criadoEm) - +new Date(a.criadoEm));

  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {ordenados.map((ev) => {
        const Icon = ICON[ev.tipo] ?? FileText;
        return (
          <li key={ev.id} className="relative">
            <span className="absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card">
              <Icon className={cn("h-3 w-3 text-muted-foreground", COLOR[ev.tipo])} />
            </span>
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">{ev.autor}</span>
                <span>{dt(ev.criadoEm)}</span>
              </div>
              {ev.titulo && (
                <div className="mt-1 text-xs font-semibold text-foreground">{ev.titulo}</div>
              )}
              <p className="mt-1 text-sm text-foreground/90">{ev.conteudo}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
