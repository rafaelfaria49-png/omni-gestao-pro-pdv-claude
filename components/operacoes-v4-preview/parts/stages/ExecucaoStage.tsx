/** Operações V4 Preview — etapa Execução (produção, checklist técnico, timer, apontamentos, estoque). */
import { C, card, cardTitle, upLabel } from "../../tokens";
import type { V4Vals } from "../../use-v4-preview";

const col3 = "minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)";

export function ExecucaoStage({ v }: { v: V4Vals }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: col3, gap: 12, alignItems: "start" }}>
        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: 10 }}>⚙ Produção / Técnico</div>
          <div style={{ ...upLabel, marginBottom: 5 }}>Técnico responsável</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 11 }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", height: 30, padding: "0 10px", border: `1px solid ${C.inputBd}`, borderRadius: 8, fontSize: 12.5, color: C.body }}>{v.os.tecnico}</div>
            <button type="button" onClick={v.act.alterarTec} style={{ height: 30, padding: "0 10px", border: `1px solid ${C.inputBd}`, background: C.surface, color: C.body, borderRadius: 8, fontSize: 11.5, fontWeight: 500, cursor: "pointer" }}>Alterar</button>
          </div>
          <div style={{ ...upLabel, marginBottom: 6 }}>Prioridade</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
            {v.prioridades.map((p) => (
              <button key={p.label} type="button" onClick={p.onClick} style={{ height: 26, padding: "0 11px", border: `1px solid ${p.bd}`, background: p.bg, color: p.fg, borderRadius: 999, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>{p.label}</button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 10, borderTop: `1px solid ${C.line3}`, paddingTop: 11 }}>
            <div><div style={upLabel}>Localização</div><div style={{ fontSize: 12.5, color: C.body, fontWeight: 500 }}>📍 Bancada 02</div></div>
            <div><div style={upLabel}>SLA</div><div style={{ fontSize: 12.5, color: C.successFg, fontWeight: 600 }}>No prazo · 6h</div></div>
            <div><div style={upLabel}>Status de bancada</div><div style={{ fontSize: 12.5, color: C.body, fontWeight: 500 }}>Em execução</div></div>
          </div>
        </div>
        <div style={{ ...card, border: `1px solid ${C.primaryBd2}`, background: "#fbfbff" }}>
          <div style={{ ...cardTitle, marginBottom: 11 }}>Checklist técnico (pós-reparo)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {v.tech.map((t, i) => (
              <button key={i} type="button" onClick={t.onToggle} style={{ display: "flex", alignItems: "center", gap: 9, textAlign: "left", border: "none", background: "transparent", padding: "2px 0", cursor: "pointer", fontSize: 12.5, color: t.color }}>
                {t.ok
                  ? <span style={{ width: 18, height: 18, borderRadius: 5, background: C.success, color: C.white, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flex: "none" }}>✓</span>
                  : <span style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${C.dashed}`, flex: "none" }} />}
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 12, padding: 9, background: C.primaryBg, borderRadius: 9, fontSize: 11.5, color: C.primaryHover, lineHeight: 1.5 }}>Ação primária <b>Marcar pronta</b> no topo — <kbd style={{ background: C.surface, border: `1px solid ${C.primaryBd2}`, borderRadius: 4, padding: "0 5px" }}>↵</kbd>.</div>
        </div>
        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: 10 }}>Serviços &amp; peças executados</div>
          <div style={{ ...upLabel, marginBottom: 3 }}>Serviços</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 0", borderBottom: `1px solid ${C.line4}` }}><span style={{ color: C.body }}>Troca de tela</span><span style={{ fontWeight: 600, color: C.ink }}>R$ 220,00</span></div>
          <div style={{ ...upLabel, margin: "9px 0 3px" }}>Peças</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 0", borderBottom: `1px solid ${C.line4}` }}><span style={{ color: C.body }}>Tela OLED <span style={{ color: C.subtle }}>1×</span></span><span style={{ fontWeight: 600, color: C.ink }}>R$ 620,00</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 0" }}><span style={{ color: C.body }}>Película 3D <span style={{ color: C.subtle }}>1×</span></span><span style={{ fontWeight: 600, color: C.ink }}>R$ 50,00</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, paddingTop: 8, marginTop: 4, borderTop: `2px solid ${C.line2}` }}><span style={{ fontWeight: 700, color: C.ink }}>Total ao cliente</span><span style={{ fontWeight: 700, color: C.ink }}>R$ 890,00</span></div>
          <div style={{ fontSize: 10, color: C.subtle, marginTop: 7 }}>Custo interno é oculto nesta visão.</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,0.8fr) minmax(0,1.6fr) minmax(0,1fr)", gap: 12, alignItems: "start" }}>
        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: 11 }}>⏱ Tempo de bancada</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 30, fontWeight: 700, color: C.ink, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>02:14</span>
            <span style={{ fontSize: 12, color: C.subtle }}>h ativas</span>
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>Iniciado 20/06 09:16 · 2 pausas</div>
          <div style={{ display: "flex", gap: 7 }}>
            <button type="button" onClick={v.act.pausarTimer} style={{ flex: 1, height: 30, border: `1px solid ${C.inputBd}`, background: C.surface, color: C.body, borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>⏸ Pausar</button>
            <button type="button" onClick={v.act.pararTimer} style={{ flex: 1, height: 30, border: `1px solid ${C.dangerBd2}`, background: C.surface, color: C.danger, borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>■ Encerrar</button>
          </div>
        </div>
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
            <span style={cardTitle}>Apontamentos de produção</span>
            <button type="button" onClick={v.act.novoApontamento} style={{ height: 26, padding: "0 10px", border: `1px solid ${C.inputBd}`, background: C.surface, color: C.body, borderRadius: 7, fontSize: 11.5, fontWeight: 500, cursor: "pointer" }}>+ Apontamento</button>
          </div>
          {v.apontamentos.map((ap, i) => (
            <div key={i} style={{ display: "flex", gap: 10, paddingBottom: 10 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: ap.dot, flex: "none", marginTop: 3 }} />
                <span style={{ flex: 1, width: 2, background: C.line2, marginTop: 3 }} />
              </div>
              <div><div style={{ fontSize: 12, color: C.body }}>{ap.text}</div><div style={{ fontSize: 10.5, color: C.subtle }}>{ap.meta}</div></div>
            </div>
          ))}
        </div>
        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: 11 }}>Consumo de estoque</div>
          <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12, padding: "6px 0", borderBottom: `1px solid ${C.line4}` }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: C.success, flex: "none" }} /><span style={{ flex: 1, color: C.body }}>Tela OLED (conjunto)</span><span style={{ color: C.successFg, fontWeight: 600 }}>baixado</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12, padding: "6px 0", borderBottom: `1px solid ${C.line4}` }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: C.success, flex: "none" }} /><span style={{ flex: 1, color: C.body }}>Película 3D</span><span style={{ color: C.successFg, fontWeight: 600 }}>baixado</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12, padding: "6px 0" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: C.warn, flex: "none" }} /><span style={{ flex: 1, color: C.body }}>Adesivo de vedação</span><span style={{ color: C.warnFg, fontWeight: 600 }}>reservar</span></div>
          <div style={{ fontSize: 10, color: C.subtle, marginTop: 9, lineHeight: 1.4 }}>A baixa definitiva de estoque é confirmada ao marcar a OS como <b>Pronta</b>.</div>
        </div>
      </div>
    </div>
  );
}
