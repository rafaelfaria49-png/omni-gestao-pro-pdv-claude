"use client";

// ============================================================================
// Operações V3 — Checklist de entrada (item 4) · editável + persistível.
// Persiste em payload.checklist (compatível com o V2) via workspace-actions.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, HelpCircle, ListChecks, Loader2, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrdemServico } from "@/types/os";
import {
  lerChecklistEntradaV3,
  resumoChecklistV3,
  type ChecklistEntradaItemV3,
  type ChecklistEstadoV3,
} from "@/lib/operacoes-v3/workspace-model";
import { ButtonV3 } from "./UiV3";

const ESTADOS: { value: ChecklistEstadoV3; label: string; icon: typeof CheckCircle2; on: string }[] = [
  { value: "ok", label: "OK", icon: CheckCircle2, on: "border-success/50 bg-success/15 text-success" },
  { value: "ruim", label: "Ruim", icon: AlertTriangle, on: "border-destructive/50 bg-destructive/15 text-destructive" },
  { value: "nao_testado", label: "N/T", icon: HelpCircle, on: "border-info/50 bg-info/15 text-info" },
];

export function ChecklistEntradaV3({
  os,
  storeId,
  onChanged,
  salvar,
  pending,
  notificar,
}: {
  os: OrdemServico;
  storeId: string | null;
  onChanged: () => void;
  salvar: (itens: ChecklistEntradaItemV3[]) => Promise<boolean>;
  pending: boolean;
  notificar: (msg: string) => void;
}) {
  const inicial = useMemo(() => lerChecklistEntradaV3(os), [os]);
  const [itens, setItens] = useState<ChecklistEntradaItemV3[]>(inicial);
  const [dirty, setDirty] = useState(false);

  const editKey = `${os.id}:${os.atualizadoEm ?? ""}`;
  useEffect(() => {
    setItens(inicial);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editKey]);

  const resumo = resumoChecklistV3(itens);

  const setEstado = (id: string, estado: ChecklistEstadoV3) => {
    setItens((rows) => rows.map((r) => (r.id === id ? { ...r, estado } : r)));
    setDirty(true);
  };

  const onSalvar = async () => {
    if (!storeId) {
      notificar("Selecione uma unidade ativa.");
      return;
    }
    const ok = await salvar(itens);
    if (ok) {
      setDirty(false);
      onChanged();
      notificar("Checklist de entrada salvo.");
    }
  };

  return (
    <section id="checklist" className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ListChecks className="h-4 w-4" aria-hidden />
          </span>
          <h3 className="truncate text-sm font-semibold text-foreground">Checklist do aparelho</h3>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="text-success">{resumo.ok} OK</span>
          <span className="text-destructive">{resumo.ruim} ruim</span>
          <span>{resumo.naoTestado} N/T</span>
        </div>
      </div>

      <div className="space-y-3 px-4 py-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {itens.map((item) => (
            <div key={item.id} className="rounded-lg border border-border bg-background/40 p-2.5">
              <p className="mb-1.5 truncate text-sm font-medium text-foreground">{item.label}</p>
              <div className="grid grid-cols-3 gap-1">
                {ESTADOS.map((e) => {
                  const Icon = e.icon;
                  const sel = item.estado === e.value;
                  return (
                    <button
                      key={e.value}
                      type="button"
                      onClick={() => setEstado(item.id, e.value)}
                      className={cn(
                        "flex flex-col items-center gap-0.5 rounded-md border py-1.5 text-[10px] font-semibold uppercase tracking-wide transition-colors",
                        sel ? e.on : "border-transparent text-muted-foreground/60 hover:bg-muted",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden />
                      {e.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ButtonV3 variant="primary" disabled={pending || !dirty} onClick={onSalvar}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
            Salvar checklist
          </ButtonV3>
          {dirty ? (
            <ButtonV3 variant="ghost" disabled={pending} onClick={() => { setItens(inicial); setDirty(false); }}>
              Descartar
            </ButtonV3>
          ) : null}
        </div>
      </div>
    </section>
  );
}
