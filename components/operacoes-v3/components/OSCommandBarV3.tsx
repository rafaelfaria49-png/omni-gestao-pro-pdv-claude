"use client";

import { ChevronDown, MoreHorizontal, Wand2 } from "lucide-react";
import type { OrdemServico } from "@/types/os";
import { statusFlow } from "../data/status-flow";
import { ButtonV3 } from "./UiV3";

/**
 * Barra de comando da OS: ação primária CONTEXTUAL conforme o status +
 * "Mudar status" e "Mais ações". Nesta sprint, TODA ação é placeholder honesto
 * (onAcao dispara um toast; nenhum write-path é chamado).
 */
export function OSCommandBarV3({
  os,
  onAcao,
}: {
  os: OrdemServico;
  onAcao: (label: string) => void;
}) {
  const flow = statusFlow(os.status);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
      <ButtonV3 variant="primary" onClick={() => onAcao(flow.primaryAction)}>
        <Wand2 className="h-4 w-4" />
        {flow.primaryAction}
      </ButtonV3>
      <ButtonV3 variant="outline" onClick={() => onAcao("Mudar status")}>
        Mudar status
        <ChevronDown className="h-4 w-4" />
      </ButtonV3>
      <ButtonV3 variant="ghost" onClick={() => onAcao("Mais ações")}>
        <MoreHorizontal className="h-4 w-4" />
        Mais ações
      </ButtonV3>
      <span className="ml-auto text-xs text-muted-foreground">
        Ações em modo demonstração — execução real chega na próxima fase.
      </span>
    </div>
  );
}
