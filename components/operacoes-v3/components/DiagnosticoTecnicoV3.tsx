"use client";

// ============================================================================
// Operações V3 — Diagnóstico técnico (item 6) · editável + persistível.
// Persiste em payload.diagnosticoV3 via workspace-actions. Sem efeitos colaterais.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { Loader2, Save, Stethoscope } from "lucide-react";
import type { OrdemServico } from "@/types/os";
import { lerDiagnosticoV3 } from "@/lib/operacoes-v3/workspace-model";
import { ButtonV3 } from "./UiV3";
import { formatDataHora } from "../lib/format";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

export function DiagnosticoTecnicoV3({
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
  salvar: (input: { inicial: string; final: string; causa: string; solucao: string }) => Promise<boolean>;
  pending: boolean;
  notificar: (msg: string) => void;
}) {
  const inicialData = useMemo(() => lerDiagnosticoV3(os), [os]);
  const [inicial, setInicial] = useState(inicialData.inicial);
  const [final, setFinal] = useState(inicialData.final);
  const [causa, setCausa] = useState(inicialData.causa);
  const [solucao, setSolucao] = useState(inicialData.solucao);
  const [dirty, setDirty] = useState(false);

  const editKey = `${os.id}:${os.atualizadoEm ?? ""}`;
  useEffect(() => {
    setInicial(inicialData.inicial);
    setFinal(inicialData.final);
    setCausa(inicialData.causa);
    setSolucao(inicialData.solucao);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editKey]);

  const onSalvar = async () => {
    if (!storeId) {
      notificar("Selecione uma unidade ativa.");
      return;
    }
    const ok = await salvar({ inicial, final, causa, solucao });
    if (ok) {
      setDirty(false);
      onChanged();
      notificar("Diagnóstico técnico salvo.");
    }
  };

  const campo = (label: string, value: string, set: (v: string) => void, placeholder: string) => (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <textarea
        className={inputCls}
        rows={3}
        value={value}
        onChange={(e) => { set(e.target.value); setDirty(true); }}
        placeholder={placeholder}
        maxLength={1200}
      />
    </label>
  );

  return (
    <section id="diagnostico" className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Stethoscope className="h-4 w-4" aria-hidden />
          </span>
          <h3 className="truncate text-sm font-semibold text-foreground">Diagnóstico técnico</h3>
        </div>
        {inicialData.atualizadoEm ? (
          <span className="text-[11px] text-muted-foreground">
            Atualizado {formatDataHora(inicialData.atualizadoEm)}{inicialData.atualizadoPor ? ` · ${inicialData.atualizadoPor}` : ""}
          </span>
        ) : null}
      </div>

      <div className="space-y-3 px-4 py-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {campo("Diagnóstico inicial", inicial, setInicial, "Primeira avaliação ao receber o aparelho")}
          {campo("Diagnóstico final", final, setFinal, "Conclusão após análise/reparo")}
          {campo("Causa encontrada", causa, setCausa, "Causa raiz do defeito")}
          {campo("Solução aplicada", solucao, setSolucao, "O que foi feito para resolver")}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ButtonV3 variant="primary" disabled={pending || !dirty} onClick={onSalvar}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
            Salvar diagnóstico
          </ButtonV3>
          {dirty ? (
            <ButtonV3 variant="ghost" disabled={pending} onClick={() => { setInicial(inicialData.inicial); setFinal(inicialData.final); setCausa(inicialData.causa); setSolucao(inicialData.solucao); setDirty(false); }}>
              Descartar
            </ButtonV3>
          ) : null}
        </div>
      </div>
    </section>
  );
}
