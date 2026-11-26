"use client";

/**
 * Resumo da estação: o que está em vigor e o que vai mudar (“em vigor → novo”), com a prévia do cupom.
 * - `StationStrip`: faixa compacta no topo, nas larguras estreitas (a CSS esconde em ≥ 960 px de conteúdo).
 * - `StationPanel`: painel lateral, nas larguras largas.
 */
import type { ReactNode } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/configuracoes-v3/components/ui/button";
import type { PdvImpressaoConfig } from "@/lib/pdv-impressao-config";
import type { AnchorId, PrintMode, StationSpec } from "./pdv-station-model";
import { Diff, PendingDot } from "./pdv-station-controls";

const reduceMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Rolagem até a seção correspondente a um item do resumo. */
const goTo = (id: AnchorId) => {
  document.getElementById(`pdv-${id}`)?.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
};

export function StationStrip({ specs }: { specs: StationSpec[] }) {
  return (
    <div className="cx-strip mb-8" role="list" aria-label="Resumo da estação">
      {specs.map((s) => (
        <div role="listitem" key={s.label} className="min-w-0">
          <button
            type="button"
            onClick={() => goTo(s.anchor)}
            className="flex h-full w-full min-w-0 flex-col items-start gap-0.5 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-accent/40"
          >
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              {s.label}
              {s.from !== s.to ? <PendingDot /> : null}
            </span>
            <span className="cx-mono w-full break-words text-xs text-foreground">{s.to}</span>
          </button>
        </div>
      ))}
    </div>
  );
}

export function StationPanel({
  lojaNome,
  noLoja,
  hasData,
  loadFailed,
  anyDirty,
  pendingCount,
  specs,
  printMode,
  desktop,
  imp,
  receipt,
  onBrowserPreview,
  disabled,
}: {
  lojaNome: string;
  noLoja: boolean;
  /** Já houve leitura confirmada desta unidade (recargas não escondem o resumo). */
  hasData: boolean;
  loadFailed: boolean;
  anyDirty: boolean;
  pendingCount: number;
  specs: StationSpec[];
  printMode: PrintMode;
  desktop: boolean;
  imp: PdvImpressaoConfig;
  receipt: ReactNode;
  onBrowserPreview: () => void;
  disabled: boolean;
}) {
  return (
    <aside className="cx-aside" aria-label="Estação de caixa: resumo e prévia do cupom">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Estação de caixa</p>
          <p className="truncate text-sm font-semibold text-foreground">{lojaNome}</p>
        </div>
        {anyDirty ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <PendingDot /> {pendingCount} não salva{pendingCount > 1 ? "s" : ""}
          </span>
        ) : hasData && !noLoja ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden /> Em vigor
          </span>
        ) : null}
      </div>
      {noLoja ? (
        <p className="px-4 py-5 text-xs leading-relaxed text-muted-foreground">
          Escolha uma unidade para ver a configuração em vigor e a prévia do cupom.
        </p>
      ) : hasData ? (
        <div className="py-1.5" role="list" aria-label="Valores em vigor e pendentes">
          {specs.map((s) => (
            <div role="listitem" key={s.label}>
              <button
                type="button"
                className="cx-spec-btn"
                onClick={() => goTo(s.anchor)}
                aria-label={`${s.label}: ${s.to}${s.from !== s.to ? ` (não salvo; em vigor: ${s.from})` : ""}. Ir para a seção`}
              >
                <span className="text-xs text-muted-foreground">{s.label}</span>
                <span className="cx-mono min-w-0 text-xs text-foreground">
                  <Diff from={s.from} to={s.to} />
                </span>
                {s.from !== s.to ? <PendingDot /> : <span aria-hidden className="w-[7px]" />}
              </button>
            </div>
          ))}
        </div>
      ) : loadFailed ? (
        <p className="px-4 py-5 text-xs leading-relaxed text-muted-foreground">
          A configuração em vigor desta unidade não pôde ser lida agora.
        </p>
      ) : (
        <div className="grid gap-2 px-4 py-4" aria-hidden>
          {[70, 55, 62, 48].map((w) => (
            <div key={w} className="cx-skel h-3" style={{ width: `${w}%` }} />
          ))}
        </div>
      )}
      {printMode && !noLoja && !(loadFailed && !hasData) ? (
        <div className="flex min-h-0 flex-1 flex-col border-t border-border">
          <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Prévia do cupom</p>
              <p className="text-xs text-muted-foreground">Venda de exemplo, sem valor fiscal</p>
            </div>
            {printMode === "browser" ? (
              <Button type="button" variant="ghost" size="sm" className="cx-touch h-8 shrink-0 px-2 text-xs" onClick={onBrowserPreview} disabled={disabled}>
                <Eye className="h-3.5 w-3.5" aria-hidden />
                No navegador
              </Button>
            ) : null}
          </div>
          <div className="cx-stage min-h-0 flex-1 overflow-y-auto">
            {hasData ? receipt : <div className="cx-skel h-64 w-[80mm]" aria-hidden />}
            {hasData && (imp.imprimirAutomatico || (printMode === "platform" && imp.abrirGaveta)) ? (
              <ul className="m-0 flex list-none flex-wrap justify-center gap-1.5 p-0">
                {imp.imprimirAutomatico && (printMode === "platform" || desktop) ? (
                  <li className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-muted-foreground">Sai sozinho ao confirmar a venda</li>
                ) : null}
                {printMode === "platform" && imp.abrirGaveta ? (
                  <li className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-muted-foreground">Abre a gaveta após imprimir</li>
                ) : null}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
