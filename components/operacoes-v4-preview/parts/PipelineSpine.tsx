/** Operações V4 Preview — trilha horizontal das etapas (52px). */
import { C } from "../tokens";
import type { V4Vals } from "../use-v4-preview";

export function PipelineSpine({ v }: { v: V4Vals }) {
  return (
    <div
      style={{
        flex: "none",
        display: "flex",
        alignItems: "stretch",
        height: 52,
        padding: "0 8px",
        background: C.surface,
        borderBottom: `1px solid ${C.line}`,
      }}
    >
      {v.pipeline.map((n) => (
        <button
          key={n.id}
          type="button"
          onClick={n.onClick}
          style={{
            flex: 1,
            minWidth: 0,
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "0 10px",
            border: "none",
            background: n.bg,
            cursor: "pointer",
            textAlign: "left",
            borderBottom: `2.5px solid ${n.underline}`,
          }}
        >
          {n.done && (
            <span style={{ width: 16, height: 16, borderRadius: "50%", background: C.success, color: C.white, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, flex: "none" }}>✓</span>
          )}
          {n.current && (
            <span style={{ width: 16, height: 16, borderRadius: "50%", background: C.primary, color: C.white, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, flex: "none", boxShadow: `0 0 0 3px ${C.primaryBg}` }}>●</span>
          )}
          {n.pending && (
            <span style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${C.inputBd}`, background: C.surface, flex: "none" }} />
          )}
          {n.ref && (
            <span style={{ width: 16, height: 16, borderRadius: 5, background: C.line3, color: C.subtle, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flex: "none" }}>≡</span>
          )}
          <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: n.labelColor, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.label}</span>
            {n.sub && <span style={{ fontSize: 10, color: C.subtle, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.sub}</span>}
          </div>
        </button>
      ))}
    </div>
  );
}
