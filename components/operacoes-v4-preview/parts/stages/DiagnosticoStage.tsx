/** Operações V4 Preview — etapa Diagnóstico técnico + histórico do aparelho. */
import { C, card, cardTitle, upLabel } from "../../tokens";
import type { V4Vals } from "../../use-v4-preview";

const fieldBox = {
  border: `1px solid ${C.line2}`,
  borderRadius: 8,
  background: C.surface2,
  padding: 9,
  fontSize: 12,
  lineHeight: 1.5,
  color: C.body,
} as const;

export function DiagnosticoStage({ v }: { v: V4Vals }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr)", gap: 12, alignItems: "start" }}>
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
          <span style={cardTitle}>🩺 Diagnóstico técnico</span>
          <span style={{ fontSize: 10.5, color: C.subtle }}>Atualizado 20/06 11:10 · Bruno</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 10 }}>
          <div><div style={{ ...upLabel, marginBottom: 4 }}>Diagnóstico inicial</div><div style={{ ...fieldBox, minHeight: 64 }}>{v.diag.inicial}</div></div>
          <div><div style={{ ...upLabel, marginBottom: 4 }}>Diagnóstico final</div><div style={{ ...fieldBox, minHeight: 64 }}>{v.diag.final}</div></div>
          <div><div style={{ ...upLabel, marginBottom: 4 }}>Causa encontrada</div><div style={{ ...fieldBox, minHeight: 44 }}>{v.diag.causa}</div></div>
          <div><div style={{ ...upLabel, marginBottom: 4 }}>Solução aplicada</div><div style={{ ...fieldBox, minHeight: 44 }}>{v.diag.solucao}</div></div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button type="button" onClick={v.act.salvarDiag} style={{ height: 32, padding: "0 13px", border: "none", background: C.primary, color: C.white, borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Salvar diagnóstico</button>
          <button type="button" onClick={v.act.gerarOrc} style={{ height: 32, padding: "0 13px", border: `1px solid ${C.inputBd}`, background: C.surface, color: C.body, borderRadius: 8, fontSize: 12.5, fontWeight: 500, cursor: "pointer" }}>Gerar orçamento do laudo →</button>
        </div>
      </div>
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={cardTitle}>Histórico do aparelho</span>
          <span style={{ fontSize: 10.5, color: C.subtle }}>IMEI …045398 9 · 2 OS</span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 6, border: `1px solid ${C.successBd}`, background: "#f6fbf7", borderRadius: 8, padding: "8px 10px", marginBottom: 9 }}>
          <span style={{ color: C.successFg }}>🛡</span>
          <span style={{ fontSize: 11.5, color: C.successFg, fontWeight: 500, lineHeight: 1.4 }}>Aparelho ainda em garantia de troca de bateria (08/2025).</span>
        </div>
        <button type="button" onClick={v.act.abrirOSant} style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", border: `1px solid ${C.line2}`, borderRadius: 9, padding: 10, marginBottom: 8, background: C.surface, cursor: "pointer", textAlign: "left" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: C.body }}>OS-2025-2207</span>
              <span style={{ fontSize: 10, color: C.successFg, background: C.successBg, padding: "1px 7px", borderRadius: 999, fontWeight: 600 }}>Entregue</span>
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Troca de bateria · 08/2025</div>
          </div>
          <span style={{ color: C.subtle }}>›</span>
        </button>
        <button type="button" onClick={v.act.verTimelineAp} style={{ width: "100%", height: 30, border: "none", background: "transparent", color: C.muted, borderRadius: 7, fontSize: 12, cursor: "pointer", textAlign: "left", padding: "0 4px" }}>🕑 Ver linha do tempo do aparelho (4)</button>
      </div>
    </div>
  );
}
