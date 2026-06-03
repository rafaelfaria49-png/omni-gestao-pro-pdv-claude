"use client";

// ============================================================================
// Operações V3 — Garantia da OS (item 9) · SOMENTE LEITURA + preparo p/ impressão.
// Lê garantia efetiva (os.garantia / garantiasOperacionais) e a garantia PREVISTA
// da abertura (aberturaV3.garantiaPrevista). Impressão = placeholder honesto.
// ============================================================================

import { Printer, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrdemServico } from "@/types/os";
import { ButtonV3 } from "./UiV3";
import { formatData } from "../lib/format";

type Situacao = "ativa" | "expirada" | "prevista" | "sem";

function lerGarantiaPrevista(os: OrdemServico): { label?: string; prazoDias?: number; termo?: string } {
  const g = (os as { aberturaV3?: { garantiaPrevista?: { label?: unknown; prazoDias?: unknown; termo?: unknown } } }).aberturaV3?.garantiaPrevista;
  if (!g) return {};
  return {
    label: typeof g.label === "string" ? g.label : undefined,
    prazoDias: typeof g.prazoDias === "number" ? g.prazoDias : undefined,
    termo: typeof g.termo === "string" ? g.termo : undefined,
  };
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm text-foreground">{value || "—"}</dd>
    </div>
  );
}

const SITUACAO_META: Record<Situacao, { label: string; cls: string }> = {
  ativa: { label: "Ativa", cls: "border-success/30 bg-success/10 text-success" },
  expirada: { label: "Expirada", cls: "border-warning/30 bg-warning/10 text-warning" },
  prevista: { label: "Prevista", cls: "border-info/30 bg-info/10 text-info" },
  sem: { label: "Sem garantia", cls: "border-border bg-muted text-muted-foreground" },
};

export function GarantiaOSV3({ os, onAcao }: { os: OrdemServico; onAcao: (label: string) => void }) {
  const g = os.garantia;
  const operacionais = os.garantiasOperacionais ?? [];
  const prevista = lerGarantiaPrevista(os);

  let situacao: Situacao = "sem";
  let prazoDias: number | undefined;
  let inicio: string | undefined;
  let fim: string | undefined;
  let termo: string | undefined;
  let modelo: string | undefined;

  const opAtiva = operacionais.find((o) => o.status === "ativa");
  if (g?.ativa || opAtiva) {
    prazoDias = g?.prazoDias ?? opAtiva?.prazoDias;
    inicio = g?.inicioEm ?? opAtiva?.dataInicio;
    fim = g?.fimEm ?? opAtiva?.dataFim;
    termo = g?.termo ?? opAtiva?.cobertura;
    const fimMs = fim ? Date.parse(fim) : NaN;
    situacao = Number.isFinite(fimMs) && fimMs < Date.now() ? "expirada" : "ativa";
  } else if (prevista.label || prevista.prazoDias) {
    situacao = "prevista";
    prazoDias = prevista.prazoDias;
    termo = prevista.termo;
    modelo = prevista.label;
  }

  const meta = SITUACAO_META[situacao];

  return (
    <section id="garantia" className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="h-4 w-4" aria-hidden />
          </span>
          <h3 className="truncate text-sm font-semibold text-foreground">Garantia da OS</h3>
          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", meta.cls)}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
            {meta.label}
          </span>
        </div>
        <ButtonV3 variant="outline" onClick={() => onAcao("Imprimir termo de garantia")}>
          <Printer className="h-4 w-4" aria-hidden /> Imprimir termo
        </ButtonV3>
      </div>

      <div className="space-y-3 px-4 py-4">
        {situacao === "sem" ? (
          <p className="text-sm text-muted-foreground">Sem garantia registrada para esta OS. A garantia prevista é definida na abertura e passa a valer na entrega.</p>
        ) : (
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KV label="Modelo de garantia" value={modelo} />
            <KV label="Prazo" value={prazoDias ? `${prazoDias} dias` : ""} />
            <KV label="Início" value={inicio ? formatData(inicio) : situacao === "prevista" ? "Na entrega" : ""} />
            <KV label="Validade" value={fim ? formatData(fim) : ""} />
            {termo ? <KV label="Cobertura / termo" value={termo} /> : null}
          </dl>
        )}
        <p className="text-[11px] text-muted-foreground">A geração/impressão do termo será conectada em fase futura — os dados já estão prontos.</p>
      </div>
    </section>
  );
}
