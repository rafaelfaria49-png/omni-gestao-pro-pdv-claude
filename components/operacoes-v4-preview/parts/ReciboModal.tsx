/** Operações V4 Preview — modal de recibo de pagamento. */
import { C } from "../tokens";
import type { V4Vals } from "../use-v4-preview";

const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "5px 0" };

export function ReciboModal({ v }: { v: V4Vals }) {
  if (!v.reciboOpen) return null;
  const r = v.reciboData;
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 70, background: "rgba(17,19,26,.42)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: 380, maxWidth: "100%", background: C.surface, borderRadius: 14, boxShadow: "0 24px 60px rgba(17,19,26,.3)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${C.line2}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>🧾 Recibo de pagamento</div>
          <button type="button" onClick={v.closeRecibo} style={{ width: 26, height: 26, border: "none", background: C.muted50, borderRadius: 7, color: C.muted, fontSize: 15, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ textAlign: "center", borderBottom: `1px dashed ${C.inputBd}`, paddingBottom: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>OmniGestão · Unidade Centro</div>
            <div style={{ fontSize: 11, color: C.subtle }}>{r.codigo} · {r.data}</div>
          </div>
          <div style={row}><span style={{ color: C.subtle }}>Cliente</span><span style={{ color: C.body, fontWeight: 500 }}>{r.cliente}</span></div>
          <div style={row}><span style={{ color: C.subtle }}>Forma de pagamento</span><span style={{ color: C.body, fontWeight: 500 }}>{r.forma}</span></div>
          <div style={row}><span style={{ color: C.subtle }}>Total da OS</span><span style={{ color: C.body, fontWeight: 500 }}>{r.total}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, padding: "8px 0 5px", borderTop: `1px solid ${C.line2}`, marginTop: 5 }}><span style={{ fontWeight: 700, color: C.ink }}>Valor recebido</span><span style={{ fontWeight: 700, color: C.successFg }}>{r.valor}</span></div>
          <div style={row}><span style={{ color: C.warnFg }}>Saldo devedor</span><span style={{ color: C.warnFg, fontWeight: 700 }}>{r.saldo}</span></div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button type="button" onClick={v.act.imprimirTermo} style={{ flex: 1, height: 34, border: "none", background: C.primary, color: C.white, borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>🖨 Imprimir recibo</button>
            <button type="button" onClick={v.closeRecibo} style={{ flex: "none", height: 34, padding: "0 14px", border: `1px solid ${C.inputBd}`, background: C.surface, color: C.body, borderRadius: 9, fontSize: 12.5, fontWeight: 500, cursor: "pointer" }}>Fechar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
