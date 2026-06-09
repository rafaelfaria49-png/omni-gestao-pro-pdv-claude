"use client";

// ============================================================================
// Operações V3 — SPRINT_3E.3 · Painel HISTÓRICO DO APARELHO (Workspace)
// ----------------------------------------------------------------------------
// Mostra, para o aparelho da OS atual (IMEI/Serial): alertas operacionais, OS
// anteriores (número/data/status/defeito/serviço/garantia) e timeline
// cronológica do aparelho. Derivado da lista de OS já carregada no Shell —
// sem fetch novo. Funcionalidade > polimento (conforme a sprint).
// ============================================================================

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, History, ShieldCheck, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrdemServico } from "@/types/os";
import {
  ETAPA_APARELHO_LABEL_V3,
  construirHistoricoAparelhoV3,
  timelineAparelhoV3,
  type AlertaAparelhoV3,
} from "@/lib/operacoes-v3/historico-aparelho-model";
import { GARANTIA_SITUACAO_META_V3 } from "@/lib/operacoes-v3/pos-venda-model";
import { StatusBadgeV3 } from "./StatusBadgeV3";
import { ButtonV3 } from "./UiV3";
import { formatData } from "../lib/format";

const ALERTA_CLS: Record<AlertaAparelhoV3["tom"], string> = {
  info: "border-info/30 bg-info/10 text-info",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
};

export function HistoricoAparelhoV3({
  os,
  ordens,
  onOpen,
}: {
  os: OrdemServico;
  ordens: OrdemServico[];
  onOpen: (osId: string) => void;
}) {
  const [verTimeline, setVerTimeline] = useState(false);

  const hist = useMemo(() => construirHistoricoAparelhoV3(os, ordens), [os, ordens]);
  const timeline = useMemo(() => {
    const mapa = new Map<string, OrdemServico>(ordens.map((o) => [o.id, o]));
    mapa.set(os.id, os);
    return timelineAparelhoV3(hist, mapa);
  }, [hist, ordens, os]);

  const idLabel =
    hist.chave.tipo === "imei"
      ? `IMEI ${hist.chave.imei}`
      : hist.chave.tipo === "serial"
        ? `Serial ${hist.chave.serial}`
        : "Sem IMEI/Serial cadastrado";

  return (
    <section id="historico-aparelho" className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Smartphone className="h-4 w-4" aria-hidden />
          </span>
          <h3 className="truncate text-sm font-semibold text-foreground">Histórico do aparelho</h3>
        </div>
        <span className="truncate text-[11px] text-muted-foreground">{idLabel} · {hist.totalOS} OS</span>
      </div>

      <div className="space-y-3 px-4 py-4">
        {/* Alertas */}
        {hist.alertas.length > 0 ? (
          <div className="space-y-1.5">
            {hist.alertas.map((a) => (
              <p key={a.tipo} className={cn("flex items-start gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium", ALERTA_CLS[a.tom])}>
                {a.tipo === "em_garantia" ? <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />}
                <span>{a.mensagem}</span>
              </p>
            ))}
          </div>
        ) : null}

        {hist.chave.tipo === "nenhum" ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-3 text-center text-xs text-muted-foreground">
            Cadastre o IMEI ou Serial na <strong>Prova de entrada</strong> para cruzar o histórico deste aparelho.
          </p>
        ) : !hist.temHistorico ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-3 text-center text-xs text-muted-foreground">
            Primeira passagem deste aparelho pela assistência.
          </p>
        ) : (
          <>
            {/* OS anteriores */}
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Passagens anteriores ({hist.anteriores.length})</p>
              <ul className="space-y-2">
                {hist.anteriores.map((l) => {
                  const g = GARANTIA_SITUACAO_META_V3[l.garantia.situacao];
                  return (
                    <li key={l.osId}>
                      <button
                        type="button"
                        onClick={() => onOpen(l.osId)}
                        className="flex w-full items-start gap-2 rounded-lg border border-border bg-background p-2.5 text-left hover:border-border-hover hover:bg-muted/30"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">{l.codigo}</span>
                            <StatusBadgeV3 status={l.status} />
                            <span className="text-[11px] text-muted-foreground">{l.criadoEm ? formatData(l.criadoEm) : "—"}</span>
                            {l.garantia.situacao !== "nenhuma" ? (
                              <span className="text-[11px] text-muted-foreground">· Garantia: {g.label}</span>
                            ) : null}
                            {l.retornos.length > 0 ? <span className="text-[11px] text-destructive">· {l.retornos.length} retorno(s)</span> : null}
                          </div>
                          {l.defeito ? <p className="mt-0.5 truncate text-xs text-foreground">Defeito: {l.defeito}</p> : null}
                          {l.servicos.length > 0 ? <p className="truncate text-[11px] text-muted-foreground">Serviço: {l.servicos.join(", ")}</p> : null}
                        </div>
                        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Timeline cronológica do aparelho */}
            <div>
              <ButtonV3 variant="ghost" onClick={() => setVerTimeline((v) => !v)}>
                <History className="h-4 w-4" /> {verTimeline ? "Ocultar" : "Ver"} linha do tempo do aparelho ({timeline.length})
              </ButtonV3>
              {verTimeline ? (
                timeline.length > 0 ? (
                  <ol className="mt-2 space-y-2 border-l border-border pl-4">
                    {timeline.map((e, i) => (
                      <li key={i} className="relative">
                        <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-primary/60" aria-hidden />
                        <p className="text-xs text-foreground">
                          <strong>{ETAPA_APARELHO_LABEL_V3[e.etapa]}</strong>
                          <span className="text-muted-foreground"> · {e.osCodigo}{e.em ? ` · ${formatData(e.em)}` : ""}</span>
                        </p>
                        {e.detalhe ? <p className="truncate text-[11px] text-muted-foreground">{e.detalhe}</p> : null}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">Sem eventos cronológicos registrados.</p>
                )
              ) : null}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
