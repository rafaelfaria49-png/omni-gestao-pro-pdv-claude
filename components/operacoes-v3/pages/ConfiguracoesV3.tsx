"use client";

import {
  FileText,
  KanbanSquare,
  ListChecks,
  MessageSquare,
  Smartphone,
  Timer,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SectionShellV3 } from "../components/SectionShellV3";
import { ConstructionBadgeV3 } from "../components/ConstructionBadgeV3";
import { SCREEN_COPY } from "../data/screen-copy";

interface ConfigBlock {
  icon: LucideIcon;
  titulo: string;
  descricao: string;
}

const BLOCKS: ConfigBlock[] = [
  { icon: KanbanSquare, titulo: "Status & workflow", descricao: "Defina as etapas da OS, a ordem do funil e a ação primária de cada status." },
  { icon: Smartphone, titulo: "Campos por tipo de equipamento", descricao: "Campos específicos para celular, notebook, videogame e outros tipos." },
  { icon: Timer, titulo: "SLA & prazos", descricao: "Prazo padrão por tipo de serviço e gatilhos de alerta de atraso." },
  { icon: ListChecks, titulo: "Modelos de checklist", descricao: "Checklists de entrada e de bancada reaproveitáveis por categoria." },
  { icon: Wallet, titulo: "Formas de pagamento", descricao: "Formas aceitas no balcão e regras de entrada/sinal." },
  { icon: MessageSquare, titulo: "Mensagens & WhatsApp", descricao: "Templates automáticos por etapa da OS." },
  { icon: FileText, titulo: "Documentos & impressão", descricao: "Layout de OS, etiqueta, recibo e termo de garantia." },
];

export function ConfiguracoesV3() {
  return (
    <SectionShellV3
      titulo={SCREEN_COPY.configuracoes.titulo}
      subtitulo={SCREEN_COPY.configuracoes.subtitulo}
      badge={<ConstructionBadgeV3 />}
    >
      <p className="mb-4 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Estrutura de configuração do módulo. Os blocos abaixo desenham o que será configurável —
        <strong> nada é salvo</strong> nesta fase.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {BLOCKS.map((b) => {
          const Icon = b.icon;
          return (
            <div key={b.titulo} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <h3 className="min-w-0 truncate text-sm font-semibold text-foreground">{b.titulo}</h3>
                </div>
                <ConstructionBadgeV3 />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{b.descricao}</p>
            </div>
          );
        })}
      </div>
    </SectionShellV3>
  );
}
