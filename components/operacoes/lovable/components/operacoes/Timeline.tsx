import {
  Bot,
  CheckCircle2,
  FileText,
  MessageSquare,
  Paperclip,
  PlayCircle,
  ShieldCheck,
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
  orcamento_aprovado: CheckCircle2,
  orcamento_recusado: XCircle,
  anexo_adicionado: Paperclip,
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
              <p className="mt-1 text-sm text-foreground/90">{ev.conteudo}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
