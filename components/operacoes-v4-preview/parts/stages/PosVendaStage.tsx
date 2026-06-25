/** Operações V4 Preview — etapa Pós-venda (garantia, retornos, NPS, follow-up). */
import { C, card, cardTitle } from "../../tokens";
import type { V4Vals } from "../../use-v4-preview";

const col3 = "minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)";

export function PosVendaStage({ v }: { v: V4Vals }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: col3, gap: 12, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={cardTitle}>Situação da garantia</span>
            <span style={{ height: 21, padding: "0 9px", display: "inline-flex", alignItems: "center", gap: 5, background: C.infoBg, color: C.infoFg, borderRadius: 999, fontSize: 11, fontWeight: 600 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: C.info }} />Prevista</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}><span style={{ color: C.subtle }}>Tipo</span><span style={{ color: C.body, fontWeight: 500 }}>Tela — 90 dias</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}><span style={{ color: C.subtle }}>Início</span><span style={{ color: C.body, fontWeight: 500 }}>Na entrega</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}><span style={{ color: C.subtle }}>Vencimento</span><span style={{ color: C.body, fontWeight: 500 }}>—</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}><span style={{ color: C.subtle }}>Dias restantes</span><span style={{ color: C.body, fontWeight: 500 }}>90 (na entrega)</span></div>
          </div>
          <button type="button" onClick={v.act.termoEntrega} style={{ width: "100%", height: 30, marginTop: 11, border: `1px solid ${C.inputBd}`, background: C.surface, color: C.body, borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>🖨 Termo de Entrega</button>
        </div>
        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: 11 }}>Histórico de retornos</div>
          {v.retHist.map((r, i) => (
            <div key={i} style={{ display: "flex", gap: 10, paddingBottom: 11 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: r.dot, flex: "none", marginTop: 3 }} />
                <span style={{ flex: 1, width: 2, background: C.line2, marginTop: 3 }} />
              </div>
              <div><div style={{ fontSize: 12, color: C.body }}>{r.text}</div><div style={{ fontSize: 10.5, color: C.subtle }}>{r.meta}</div></div>
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: C.successFg, fontWeight: 600, textAlign: "center", padding: "4px 0" }}>Nenhum retorno em aberto nesta OS.</div>
        </div>
      </div>

      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={cardTitle}>Retornos em garantia</span>
          <span style={{ fontSize: 11, color: C.successFg, fontWeight: 600 }}>0 abertos</span>
        </div>
        <div style={{ border: `1px dashed ${C.inputBd}`, borderRadius: 9, padding: 16, textAlign: "center", color: C.subtle, fontSize: 11.5, marginBottom: 10 }}>Nenhum retorno registrado para esta OS.</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <input placeholder="Motivo do retorno…" style={{ flex: 1, minWidth: 0, height: 30, padding: "0 10px", border: `1px solid ${C.inputBd}`, borderRadius: 8, fontSize: 12, color: C.body }} />
          <button type="button" onClick={v.act.abrirRetorno} style={{ height: 30, padding: "0 11px", border: `1px solid ${C.inputBd}`, background: C.surface, color: C.body, borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}>↩ Abrir</button>
        </div>
        <button type="button" onClick={v.act.retornosCliente} style={{ width: "100%", height: 30, border: `1px solid ${C.line2}`, background: C.surface2, color: C.primary, fontSize: 11.5, borderRadius: 8, cursor: "pointer" }}>Cliente: 0 retorno(s) em 1 OS →</button>
        <div style={{ fontSize: 10.5, color: C.subtle, lineHeight: 1.5, marginTop: 10 }}>Retornos abertos aqui entram no fluxo de <b>retrabalho</b> sem gerar nova cobrança quando a garantia está ativa.</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: 10 }}>Satisfação / NPS</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 9 }}>
            <span style={{ fontSize: 30, fontWeight: 700, color: C.subtle, letterSpacing: "-.02em", lineHeight: 1 }}>—</span>
            <span style={{ fontSize: 11.5, color: C.subtle, paddingBottom: 5 }}>aguardando resposta</span>
          </div>
          <div style={{ display: "flex", gap: 4, marginBottom: 11 }}>
            {v.npsScale.map((ns, i) => (
              <div key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: ns.bg }} />
            ))}
          </div>
          <button type="button" onClick={v.act.pesquisa} style={{ width: "100%", height: 30, border: `1px solid ${C.inputBd}`, background: C.surface, color: C.body, borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>Enviar pesquisa de satisfação</button>
        </div>
        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: 10 }}>Follow-up</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: `1px solid ${C.line2}`, borderRadius: 9, padding: "9px 10px", marginBottom: 8 }}>
            <div><div style={{ fontSize: 12, color: C.body, fontWeight: 500 }}>Contato em +7 dias</div><div style={{ fontSize: 10.5, color: C.subtle }}>sugerido após a entrega</div></div>
            <span style={{ fontSize: 11, color: C.subtle }}>27/06</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={v.act.whatsappFollow} style={{ flex: 1, height: 30, border: `1px solid ${C.inputBd}`, background: C.surface, color: C.body, borderRadius: 8, fontSize: 11.5, fontWeight: 500, cursor: "pointer" }}>💬 WhatsApp</button>
            <button type="button" onClick={v.act.agendar} style={{ flex: 1, height: 30, border: `1px solid ${C.inputBd}`, background: C.surface, color: C.body, borderRadius: 8, fontSize: 11.5, fontWeight: 500, cursor: "pointer" }}>📅 Agendar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
