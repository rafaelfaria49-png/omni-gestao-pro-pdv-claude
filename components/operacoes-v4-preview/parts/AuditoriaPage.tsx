/** Operações V4 Preview — página "Auditoria de UX" (documento de revisão do redesign). */
import { C, card } from "../tokens";
import type { V4Vals } from "../use-v4-preview";

const h2: React.CSSProperties = {
  fontSize: 19,
  fontWeight: 700,
  color: C.ink,
  paddingBottom: 9,
  borderBottom: `2px solid ${C.line2}`,
};

export function AuditoriaPage({ v }: { v: V4Vals }) {
  return (
    <div style={{ flex: 1, minWidth: 0, overflowY: "auto", background: C.appBg }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "30px 44px 90px" }}>
        <button type="button" onClick={v.goCockpit} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 13px", border: `1px solid ${C.inputBd2}`, background: C.surface, color: C.body, borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", marginBottom: 24 }}>← Voltar ao cockpit</button>
        <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em", color: C.primary, fontWeight: 700, marginBottom: 6 }}>Auditoria · Operações V4 · iteração 3</div>
        <h1 style={{ margin: "0 0 10px", fontSize: 30, fontWeight: 700, letterSpacing: "-.02em", color: C.ink }}>Layout fluido, modos de uso e paridade total</h1>
        <p style={{ margin: "0 0 26px", fontSize: 15, lineHeight: 1.65, color: C.bodySoft2, maxWidth: 800 }}>
          Esta iteração mantém a arquitetura do cockpit e resolve os pontos pendentes: <b>rolagem horizontal eliminada</b> (layout 100% fluido), <b>laterais recolhíveis de verdade</b> com 3 modos de uso, <b>abas completas</b> (Financeiro, Entrega, Pós-venda) e <b>rail de ícones funcional</b> com telas reais de módulo.
        </p>

        <h2 style={{ ...h2, margin: "0 0 14px" }}>Resolvido nesta iteração</h2>
        <div style={{ border: `1px solid ${C.line2}`, borderRadius: 12, overflow: "hidden" }}>
          {v.resolved.map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1.6fr) minmax(0,0.5fr)", borderTop: `1px solid ${C.line2}`, fontSize: 12.5, color: C.body, background: r.bg }}>
              <div style={{ padding: "11px 14px", fontWeight: 600 }}>{r.feat}</div>
              <div style={{ padding: "11px 14px", color: C.bodySoft2 }}>{r.detail}</div>
              <div style={{ padding: "11px 14px", color: C.successFg, fontWeight: 700 }}>{r.status}</div>
            </div>
          ))}
        </div>

        <h2 style={{ ...h2, margin: "32px 0 14px" }}>Os 3 modos de uso</h2>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)", gap: 12 }}>
          <div style={{ ...card, padding: 15 }}><div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, marginBottom: 6 }}>🛎 Recepção</div><p style={{ margin: 0, fontSize: 12.5, color: C.bodySoft2, lineHeight: 1.6 }}>Cliente aberto + Atividade aberta. Para abrir OS, conferir dados e dar baixa de entrada no balcão.</p></div>
          <div style={{ ...card, padding: 15 }}><div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, marginBottom: 6 }}>🔧 Bancada</div><p style={{ margin: 0, fontSize: 12.5, color: C.bodySoft2, lineHeight: 1.6 }}>Ambas as laterais recolhidas, workspace máximo. Foco total na execução do reparo, sem rolagem horizontal.</p></div>
          <div style={{ ...card, padding: 15 }}><div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, marginBottom: 6 }}>🔍 Auditoria</div><p style={{ margin: 0, fontSize: 12.5, color: C.bodySoft2, lineHeight: 1.6 }}>Cliente recolhido + Atividade aberta. Revisar a linha do tempo e o histórico sem distração com os dados do cliente.</p></div>
        </div>

        <h2 style={{ ...h2, margin: "32px 0 14px" }}>Pendências (próxima fase)</h2>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 12 }}>
          {v.pending.map((p, i) => (
            <div key={i} style={{ ...card }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.warn }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{p.title}</span>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: C.bodySoft2, lineHeight: 1.55 }}>{p.text}</p>
            </div>
          ))}
        </div>

        <div style={{ height: 32 }} />
        <button type="button" onClick={v.goCockpit} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 16px", border: "none", background: C.primary, color: C.white, borderRadius: 9, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>← Voltar ao cockpit interativo</button>
      </div>
    </div>
  );
}
