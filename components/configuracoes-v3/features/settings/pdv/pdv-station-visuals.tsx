"use client";

/**
 * Peças visuais da aba PDV e impressão que não são a prévia do cupom (essa fica em `ReceiptPreview.tsx`):
 * - `FlowGlyph`: esquema da disposição de cada PDV (não é captura de tela);
 * - `SkeletonSections`: esqueleto da 1ª leitura da unidade.
 */
import type { PdvFlowId } from "./pdv-station-model";

/* ── Esquemas dos layouts do PDV ────────────────────────────────────────── */

function Lines({ n, last = "60%" }: { n: number; last?: string }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="cx-g cx-g--line" style={{ width: i === n - 1 ? last : "100%" }} />
      ))}
    </>
  );
}

export function FlowGlyph({ id, large = false }: { id: PdvFlowId; large?: boolean }) {
  const pad = large ? 16 : 8;
  const gap = large ? 10 : 5;
  const glyphClass = large ? "cx-glyph cx-glyph--active" : "cx-glyph";
  const head = <div className="cx-g cx-g--line" style={{ width: "38%", height: large ? 6 : 4 }} />;
  if (id === "classico") {
    return (
      <div className={glyphClass} style={{ padding: pad, gap, gridTemplateRows: "auto 1fr" }} aria-hidden>
        {head}
        <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr", gap, minHeight: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gridTemplateRows: "repeat(2, 1fr)", gap }}>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="cx-g" />
            ))}
          </div>
          <div className="cx-g" style={{ display: "flex", flexDirection: "column", gap: large ? 6 : 3, padding: large ? 8 : 4 }}>
            <Lines n={large ? 6 : 4} />
            <div style={{ flex: 1 }} />
            <div className="cx-g cx-g--accent" style={{ height: large ? 14 : 7 }} />
          </div>
        </div>
      </div>
    );
  }
  if (id === "assistencia") {
    const tones = ["cx-g--info", "cx-g--warn", "cx-g--ok", "cx-g--warn"];
    return (
      <div className={glyphClass} style={{ padding: pad, gap, gridTemplateRows: "auto 1fr" }} aria-hidden>
        {head}
        <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr", gap, minHeight: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: large ? 7 : 4 }}>
            {tones.map((t, i) => (
              <div key={i} className="cx-g" style={{ display: "flex", alignItems: "center", gap: 4, padding: large ? "6px 8px" : "3px 4px" }}>
                <div className={`cx-g ${t}`} style={{ width: large ? 22 : 10, height: large ? 6 : 4, borderRadius: 99 }} />
                <div className="cx-g cx-g--line" style={{ flex: 1 }} />
              </div>
            ))}
          </div>
          <div className="cx-g" style={{ display: "flex", flexDirection: "column", gap: large ? 6 : 3, padding: large ? 8 : 4 }}>
            <Lines n={large ? 5 : 3} />
            <div style={{ flex: 1 }} />
            <div className="cx-g cx-g--accent" style={{ height: large ? 14 : 7 }} />
          </div>
        </div>
      </div>
    );
  }
  if (id === "supermercado") {
    return (
      <div className={glyphClass} style={{ padding: pad, gap, gridTemplateRows: "auto 1fr auto" }} aria-hidden>
        {head}
        <div className="cx-g" style={{ display: "flex", flexDirection: "column", gap: large ? 6 : 3, padding: large ? 8 : 4 }}>
          {Array.from({ length: large ? 7 : 5 }, (_, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 22% 14%", gap: large ? 8 : 4, alignItems: "center" }}>
              <div className="cx-g cx-g--line" />
              <div className="cx-g cx-g--barcode" style={{ height: large ? 8 : 5 }} />
              <div className="cx-g cx-g--line" />
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap, alignItems: "center" }}>
          <div className="cx-g cx-g--strong" style={{ height: large ? 18 : 9, width: "52%" }} />
          <div className="cx-g cx-g--accent" style={{ height: large ? 18 : 9, width: large ? 90 : 40 }} />
        </div>
      </div>
    );
  }
  return (
    <div className={glyphClass} style={{ padding: pad, gap, gridTemplateColumns: "auto 1fr" }} aria-hidden>
      <div style={{ display: "flex", flexDirection: "column", gap: large ? 8 : 4 }}>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="cx-g cx-g--strong" style={{ width: large ? 14 : 7, height: large ? 14 : 7, borderRadius: 99 }} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateRows: "auto 1fr", gap, minHeight: 0 }}>
        <div className="cx-g cx-g--line" style={{ height: large ? 12 : 6 }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr) 0.9fr", gap }}>
          <div className="cx-g" />
          <div className="cx-g" />
          <div className="cx-g" style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: large ? 8 : 4 }}>
            <div className="cx-g cx-g--accent" style={{ height: large ? 14 : 7 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Esqueleto com a forma real das seções (1ª leitura da unidade). */
export function SkeletonSections() {
  return (
    <div className="grid gap-10" role="status" aria-label="Carregando configurações da unidade">
      {[0, 1, 2].map((i) => (
        <div key={i} className="grid gap-3">
          <div className="cx-skel h-4 w-40" />
          <div className="cx-skel h-3 w-72 max-w-full" />
          {i === 0 ? (
            <div className="cx-tiles mt-2">
              {[0, 1, 2].map((j) => (
                <div key={j} className="cx-skel aspect-[16/12]" />
              ))}
            </div>
          ) : (
            <div className="grid gap-2">
              {[0, 1, 2].map((j) => (
                <div key={j} className="cx-skel h-11" />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
