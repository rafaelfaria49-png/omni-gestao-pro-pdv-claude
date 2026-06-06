"use client";

// ============================================================================
// Operações V3 — Fase 3B · Bloco PRODUÇÃO / TÉCNICO do Workspace (item 9)
// ----------------------------------------------------------------------------
// Técnico responsável (atribuir/alterar/remover), prioridade, SLA, localização
// física e status de bancada + próxima ação (máquina única). Sem novo fluxo de
// status; sem tocar Financeiro/estoque/V2.
// ============================================================================

import { useState } from "react";
import { ArrowRight, Loader2, MapPin, UserCog, UserMinus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrdemServico } from "@/types/os";
import { statusMetaV3, statusV3FromOS, type OperacaoStatusV3 } from "@/lib/operacoes-v3/status-machine";
import { lerRecepcaoV3 } from "@/lib/operacoes-v3/workspace-model";
import {
  PRIORIDADES_V3,
  PRIORIDADE_META_V3,
  lerPrioridadeV3,
  lerSlaV3,
  proximaAcaoV3,
  tecnicosConhecidosV3,
  type PrioridadeV3,
} from "@/lib/operacoes-v3/producao-model";
import { ButtonV3 } from "./UiV3";
import { StatusBadgeV3 } from "./StatusBadgeV3";
import { SlaBadgeV3 } from "./PrioridadeBadgeV3";
import { useProducaoV3 } from "../hooks/use-producao-v3";
import { formatData, formatRelativo } from "../lib/format";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

export function ProducaoTecnicoV3({
  os,
  storeId,
  ordens,
  onChanged,
  notificar,
  onMudarStatus,
}: {
  os: OrdemServico;
  storeId: string | null;
  ordens: OrdemServico[];
  onChanged: () => void;
  notificar: (msg: string) => void;
  onMudarStatus: (to: OperacaoStatusV3) => Promise<boolean>;
}) {
  const { pending, error, atribuirTecnico, removerTecnico, definirPrioridade } = useProducaoV3(storeId, os.id, onChanged);

  const status = statusV3FromOS(os);
  const prioridade = lerPrioridadeV3(os);
  const sla = lerSlaV3(os);
  const recepcao = lerRecepcaoV3(os);
  const proxima = proximaAcaoV3(os);
  const conhecidos = tecnicosConhecidosV3(ordens);

  const [nomeTec, setNomeTec] = useState(os.tecnico?.nome ?? "");
  const [avancando, setAvancando] = useState(false);

  const onAtribuir = async () => {
    const ok = await atribuirTecnico(nomeTec.trim());
    if (ok) notificar(os.tecnico?.id ? "Técnico atualizado." : "Técnico atribuído.");
  };
  const onRemover = async () => {
    const ok = await removerTecnico();
    if (ok) {
      setNomeTec("");
      notificar("Técnico removido.");
    }
  };
  const onPrioridade = async (p: PrioridadeV3) => {
    if (p === prioridade) return;
    const ok = await definirPrioridade(p);
    if (ok) notificar(`Prioridade: ${PRIORIDADE_META_V3[p].label}.`);
  };
  const onAvancar = async () => {
    if (!proxima) return;
    setAvancando(true);
    try {
      await onMudarStatus(proxima.to);
    } finally {
      setAvancando(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <UserCog className="h-4 w-4 text-primary" aria-hidden /> Produção / Técnico
        </h3>
        <div className="flex items-center gap-1.5">
          <StatusBadgeV3 status={status} />
          <SlaBadgeV3 os={os} />
        </div>
      </div>

      {/* Técnico responsável */}
      <div className="mt-3">
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Técnico responsável</label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={cn(inputCls, "max-w-xs")}
            value={nomeTec}
            onChange={(e) => setNomeTec(e.target.value)}
            placeholder="Nome do técnico…"
            list="tecnicos-conhecidos-v3"
          />
          <datalist id="tecnicos-conhecidos-v3">
            {conhecidos.map((t) => (
              <option key={t.id} value={t.nome} />
            ))}
          </datalist>
          <ButtonV3 variant="primary" disabled={!nomeTec.trim() || pending === "tecnico"} onClick={onAtribuir}>
            {pending === "tecnico" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCog className="h-4 w-4" />}
            {os.tecnico?.id ? "Alterar" : "Atribuir"}
          </ButtonV3>
          {os.tecnico?.id ? (
            <ButtonV3 variant="outline" disabled={pending === "tecnico"} onClick={onRemover}>
              <UserMinus className="h-4 w-4" /> Remover
            </ButtonV3>
          ) : null}
        </div>
      </div>

      {/* Prioridade */}
      <div className="mt-3">
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Prioridade</label>
        <div className="flex flex-wrap gap-1.5">
          {PRIORIDADES_V3.map((p) => (
            <button
              key={p}
              type="button"
              disabled={pending === "prioridade"}
              onClick={() => onPrioridade(p)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60",
                prioridade === p ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {PRIORIDADE_META_V3[p].label}
            </button>
          ))}
        </div>
      </div>

      {/* SLA + localização */}
      <dl className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">SLA</dt>
          <dd className="truncate text-sm text-foreground">
            {sla.prazo ? `${formatData(sla.prazo)} · ${formatRelativo(sla.prazo)}` : "Sem prazo definido"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Localização física</dt>
          <dd className="flex items-center gap-1 truncate text-sm text-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            {recepcao.localFisico || "—"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Status de bancada</dt>
          <dd className="truncate text-sm text-foreground">{statusMetaV3(status).label}</dd>
        </div>
      </dl>

      {/* Próxima ação (máquina única) */}
      {proxima ? (
        <ButtonV3 variant="primary" className="mt-3" disabled={avancando} onClick={onAvancar}>
          {avancando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          {proxima.label}
        </ButtonV3>
      ) : null}

      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
