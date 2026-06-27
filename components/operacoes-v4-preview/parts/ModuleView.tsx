/**
 * Operações V4 Preview — telas de módulo do rail (Visão geral, Fila, Bancada, SLA, PDV).
 *
 * São PROTÓTIPO: não exibem clientes, OS, técnicos, SLA, fila nem números fabricados.
 * Cada módulo mostra um estado vazio honesto e direciona ao Workspace da OS, onde os
 * dados são REAIS (somente leitura). A conexão aos dados ao vivo de cada módulo virá
 * em fase posterior — até lá, nada operacional é inventado aqui.
 */
import { C, card } from "../tokens";
import type { V4Vals } from "../use-v4-preview";

export function ModuleView({ v }: { v: V4Vals }) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: C.appBg }}>
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 12, height: 46, padding: "0 18px", background: C.surface, borderBottom: `1px solid ${C.line}` }}>
        <span style={{ fontSize: 18 }}>{v.mod.icon}</span>
        <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.ink }}>{v.mod.title}</h1>
        <span style={{ flex: 1 }} />
        <span style={{ display: "inline-flex", alignItems: "center", height: 23, padding: "0 10px", background: C.warnBg, color: C.warnFg, borderRadius: 999, fontSize: 11, fontWeight: 600 }}>Protótipo</span>
        <button type="button" onClick={v.railWorkspace} style={{ height: 30, padding: "0 12px", border: `1px solid ${C.inputBd}`, background: C.surface, color: C.body, borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>Abrir OS Workspace →</button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 18px" }}>
        <div style={{ ...card, maxWidth: 520, textAlign: "center", padding: 28 }}>
          <div style={{ fontSize: 30, marginBottom: 10 }}>{v.mod.icon}</div>
          <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700, color: C.ink }}>Módulo em protótipo</h2>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: C.muted, lineHeight: 1.55 }}>
            Nenhum dado operacional é exibido aqui. Clientes, OS, técnicos, SLA e valores reais
            aparecem no Workspace da OS — conectado aos dados ao vivo da loja.
          </p>
          <button
            type="button"
            onClick={v.railWorkspace}
            style={{ height: 36, padding: "0 16px", border: "none", background: C.primary, color: C.white, borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Abrir OS Workspace →
          </button>
        </div>
      </div>
    </div>
  );
}
