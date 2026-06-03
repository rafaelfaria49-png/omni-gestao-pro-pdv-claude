"use client";

// ============================================================================
// Operações V3 — Histórico completo (item 10) · timeline auditável.
// Lista todos os eventos da OS (criação, edição, status, orçamento, garantia…),
// mais recentes primeiro. Somente leitura.
// ============================================================================

import { useState } from "react";
import { History } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EventoTipo, OrdemServico } from "@/types/os";
import { lerHistoricoV3 } from "@/lib/operacoes-v3/workspace-model";
import { ButtonV3 } from "./UiV3";
import { formatDataHora } from "../lib/format";

const TIPO_TONE: Partial<Record<EventoTipo, string>> = {
  criacao: "bg-info",
  mudanca_status: "bg-primary",
  orcamento_enviado: "bg-warning",
  orcamento_aprovado: "bg-success",
  orcamento_recusado: "bg-destructive",
  orcamento_atualizado: "bg-warning",
  orcamento_criado: "bg-warning",
  diagnostico_registrado: "bg-info",
  servico_iniciado: "bg-primary",
  servico_concluido: "bg-success",
  entrega_cliente: "bg-success",
  os_cancelada: "bg-destructive",
  garantia_gerada: "bg-success",
  garantia_acionada: "bg-warning",
  checklist_finalizado: "bg-info",
};

const PAGE = 12;

export function OSHistoricoV3({ os }: { os: OrdemServico }) {
  const eventos = lerHistoricoV3(os);
  const [todos, setTodos] = useState(false);
  const visiveis = todos ? eventos : eventos.slice(0, PAGE);

  return (
    <section id="historico" className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <History className="h-4 w-4" aria-hidden />
        </span>
        <h3 className="truncate text-sm font-semibold text-foreground">Histórico completo</h3>
        <span className="ml-auto text-[11px] text-muted-foreground">{eventos.length} evento(s)</span>
      </div>

      <div className="px-4 py-4">
        {eventos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum evento registrado ainda.</p>
        ) : (
          <>
            <ol className="space-y-3">
              {visiveis.map((ev) => (
                <li key={ev.id} className="relative pl-4">
                  <span className={cn("absolute left-0 top-1.5 h-2 w-2 rounded-full", TIPO_TONE[ev.tipo] ?? "bg-muted-foreground/50")} aria-hidden />
                  <p className="text-sm text-foreground">{ev.conteudo}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {ev.autor} · {formatDataHora(ev.criadoEm)}
                  </p>
                </li>
              ))}
            </ol>
            {eventos.length > PAGE ? (
              <ButtonV3 variant="ghost" className="mt-3" onClick={() => setTodos((v) => !v)}>
                {todos ? "Ver menos" : `Ver todos (${eventos.length})`}
              </ButtonV3>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
