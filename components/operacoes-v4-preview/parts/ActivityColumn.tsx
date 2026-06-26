/** Operações V4 Preview — coluna de atividade (timeline + comunicação), recolhível. */
import { C, HATCH } from "../tokens";
import type { V4Vals } from "../use-v4-preview";

export function ActivityColumn({ v }: { v: V4Vals }) {
  if (!v.rightOpen) {
    return (
      <button
        type="button"
        onClick={v.toggleRight}
        title="Abrir atividade"
        style={{
          flex: "none",
          width: 32,
          background: C.surface,
          border: "none",
          borderLeft: `1px solid ${C.line}`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 9,
          paddingTop: 9,
          cursor: "pointer",
        }}
      >
        <span style={{ width: 23, height: 23, borderRadius: 6, background: C.muted50, color: C.subtle, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>‹</span>
        <span style={{ writingMode: "vertical-rl", fontSize: 10.5, fontWeight: 600, color: C.subtle, letterSpacing: ".04em", marginTop: 4 }}>ATIVIDADE</span>
      </button>
    );
  }

  return (
    <aside style={{ flex: "none", width: 288, background: C.surface, borderLeft: `1px solid ${C.line}`, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between", height: 36, padding: "0 12px", borderBottom: `1px solid ${C.line3}` }}>
        <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", color: C.subtle, fontWeight: 700 }}>Atividade</span>
        <button type="button" onClick={v.toggleRight} title="Recolher" style={{ width: 23, height: 23, border: "none", background: C.muted50, borderRadius: 6, color: C.subtle, cursor: "pointer", fontSize: 13 }}>›</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 12 }}>
        <div style={{ marginBottom: 14 }}>
          {v.steps.map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 10 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                {s.reached && (
                  <span style={{ width: 20, height: 20, borderRadius: "50%", background: C.success, color: C.white, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flex: "none" }}>✓</span>
                )}
                {s.current && (
                  <span style={{ width: 20, height: 20, borderRadius: "50%", background: C.primary, color: C.white, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flex: "none", boxShadow: `0 0 0 3px ${C.primaryBg}` }}>●</span>
                )}
                {s.pending && (
                  <span style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${C.inputBd}`, background: C.surface, flex: "none" }} />
                )}
                <span style={{ flex: 1, minHeight: 12, width: 2, background: C.line2, margin: "2px 0" }} />
              </div>
              <div style={{ paddingBottom: 11 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.body }}>{s.label}</div>
                {s.time && <div style={{ fontSize: 10.5, color: C.subtle }}>{s.time} · {s.resp}</div>}
                {s.empty && <div style={{ fontSize: 10.5, color: C.faint }}>pendente</div>}
              </div>
            </div>
          ))}
        </div>
        <div style={{ border: `1px solid ${C.line2}`, borderRadius: 10, padding: 11, marginBottom: 11 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.body, marginBottom: 7 }}>Comunicação</div>
          <button type="button" onClick={v.act.whatsapp} style={{ width: "100%", height: 32, border: `1px solid ${C.inputBd}`, background: C.surface, color: C.body, borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>💬 Enviar atualização (WhatsApp)</button>
        </div>
        <div style={{ border: `1px solid ${C.line2}`, borderRadius: 10, padding: 11, marginBottom: 11 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.body }}>Anexos</span>
            <span style={{ fontSize: 11, color: C.subtle }}>{v.anexos.length}</span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {v.anexos.slice(0, 3).map((ax) => (
              <div key={ax.id} title={ax.name} style={{ width: 46, height: 46, borderRadius: 8, background: HATCH }} />
            ))}
            <div onClick={v.act.addFoto} style={{ width: 46, height: 46, borderRadius: 8, border: `1px dashed ${C.hatch}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.subtle, cursor: "pointer" }}>+</div>
          </div>
        </div>
        <button type="button" onClick={v.act.novaObs} style={{ width: "100%", height: 32, border: `1px dashed ${C.dashed}`, background: C.surface, color: C.muted, borderRadius: 8, fontSize: 12, cursor: "pointer", marginBottom: 9 }}>+ Nova observação</button>
        <button type="button" onClick={v.toHistCliente} style={{ width: "100%", height: 32, border: `1px solid ${C.inputBd}`, background: C.surface, color: C.body, borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>Abrir histórico do cliente</button>
      </div>
    </aside>
  );
}
