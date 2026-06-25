/** Operações V4 Preview — telas de módulo do rail (Dashboard, Fila, Bancada, SLA, PDV). */
import { C, card, cardTitle } from "../tokens";
import type { V4Vals } from "../use-v4-preview";
import styles from "../operacoes-v4-preview.module.css";

export function ModuleView({ v }: { v: V4Vals }) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: C.appBg }}>
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 12, height: 46, padding: "0 18px", background: C.surface, borderBottom: `1px solid ${C.line}` }}>
        <span style={{ fontSize: 18 }}>{v.mod.icon}</span>
        <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.ink }}>{v.mod.title}</h1>
        <span style={{ fontSize: 12, color: C.subtle }}>{v.mod.subtitle}</span>
        <span style={{ flex: 1 }} />
        <span style={{ display: "inline-flex", alignItems: "center", height: 23, padding: "0 10px", background: C.warnBg, color: C.warnFg, borderRadius: 999, fontSize: 11, fontWeight: 600 }}>Protótipo</span>
        <button type="button" onClick={v.railWorkspace} style={{ height: 30, padding: "0 12px", border: `1px solid ${C.inputBd}`, background: C.surface, color: C.body, borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>Abrir OS Workspace →</button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 18px" }}>
        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12, marginBottom: 14 }}>
          {v.mod.kpis.map((k, i) => (
            <div key={i} style={{ ...card, padding: 15 }}>
              <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".03em", color: C.subtle, fontWeight: 600 }}>{k.label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 11, color: C.subtle, marginTop: 2 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {v.modFila && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: 11, alignItems: "start" }}>
            {v.filaCols.map((col, ci) => (
              <div key={ci} style={{ ...card, padding: 11 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.body }}>{col.title}</span>
                  <span style={{ fontSize: 11, color: C.subtle, background: C.muted50, borderRadius: 999, padding: "1px 8px", fontWeight: 600 }}>{col.count}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {col.items.map((cardItem, ii) => (
                    <button key={ii} type="button" onClick={v.railWorkspace} className={styles.hoverBorder} style={{ textAlign: "left", border: `1px solid ${C.line2}`, background: C.surface, borderRadius: 9, padding: 9, cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: C.ink }}>{cardItem.codigo}</span>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: cardItem.dot }} />
                      </div>
                      <div style={{ fontSize: 11.5, color: C.body, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cardItem.cliente}</div>
                      <div style={{ fontSize: 10.5, color: C.subtle, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cardItem.aparelho}</div>
                      <div style={{ fontSize: 10, color: cardItem.slaColor, fontWeight: 600, marginTop: 4 }}>{cardItem.sla}</div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {v.modBancada && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12, alignItems: "start" }}>
            {v.bancadaTec.map((t, ti) => (
              <div key={ti} style={card}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 11 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: t.avBg, color: t.avFg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, flex: "none" }}>{t.ini}</div>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{t.nome}</div><div style={{ fontSize: 11, color: C.subtle }}>{t.os} OS · {t.carga}</div></div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: t.statusColor }}>{t.status}</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: C.line3, overflow: "hidden", marginBottom: 11 }}><div style={{ height: "100%", width: t.pct, background: t.barColor, borderRadius: 3 }} /></div>
                {t.lista.map((o, oi) => (
                  <button key={oi} type="button" onClick={v.railWorkspace} className={styles.hoverSurface} style={{ display: "flex", width: "100%", alignItems: "center", gap: 8, textAlign: "left", border: "none", background: "transparent", borderRadius: 7, padding: 6, cursor: "pointer" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: o.dot, flex: "none" }} />
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: C.ink }}>{o.codigo}</span>
                    <span style={{ fontSize: 11, color: C.muted, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.desc}</span>
                    <span style={{ fontSize: 10.5, color: o.slaColor, fontWeight: 600 }}>{o.sla}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}

        {v.modSla && (
          <div style={{ background: C.surface, border: `1px solid ${C.line2}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,0.7fr) minmax(0,1.3fr) minmax(0,1fr) minmax(0,0.8fr) minmax(0,0.8fr)", background: C.muted50, fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".03em", color: C.muted, fontWeight: 700 }}>
              <div style={{ padding: "10px 14px" }}>OS</div><div style={{ padding: "10px 14px" }}>Cliente / aparelho</div><div style={{ padding: "10px 14px" }}>Etapa</div><div style={{ padding: "10px 14px" }}>Restante</div><div style={{ padding: "10px 14px" }}>SLA</div>
            </div>
            {v.slaRows.map((r, ri) => (
              <button key={ri} type="button" onClick={v.railWorkspace} className={styles.hoverSoft} style={{ display: "grid", gridTemplateColumns: "minmax(0,0.7fr) minmax(0,1.3fr) minmax(0,1fr) minmax(0,0.8fr) minmax(0,0.8fr)", width: "100%", textAlign: "left", border: "none", borderTop: `1px solid ${C.line2}`, background: r.bg, cursor: "pointer" }}>
                <div style={{ padding: "11px 14px", fontSize: 12, fontWeight: 700, color: C.ink }}>{r.codigo}</div>
                <div style={{ padding: "11px 14px", fontSize: 12, color: C.body, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.cliente} · <span style={{ color: C.subtle }}>{r.aparelho}</span></div>
                <div style={{ padding: "11px 14px", fontSize: 12, color: C.muted }}>{r.etapa}</div>
                <div style={{ padding: "11px 14px", fontSize: 12, fontWeight: 600, color: r.restColor }}>{r.restante}</div>
                <div style={{ padding: "11px 14px" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 21, padding: "0 9px", background: r.tagBg, color: r.tagFg, borderRadius: 999, fontSize: 11, fontWeight: 600 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: r.tagFg }} />{r.tag}</span></div>
              </button>
            ))}
          </div>
        )}

        {v.modPdv && (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.6fr)", gap: 12, alignItems: "start" }}>
            <div style={{ ...card, padding: 15 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={cardTitle}>Caixa do dia</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 21, padding: "0 9px", background: C.successBg, color: C.successFg, borderRadius: 999, fontSize: 11, fontWeight: 600 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: C.success }} />Aberto</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}><span style={{ color: C.subtle }}>Operador</span><span style={{ color: C.body, fontWeight: 500 }}>Rafael Souza</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}><span style={{ color: C.subtle }}>Abertura</span><span style={{ color: C.body, fontWeight: 500 }}>08:02 · R$ 200,00</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}><span style={{ color: C.subtle }}>Recebido (serviços)</span><span style={{ color: C.successFg, fontWeight: 600 }}>R$ 1.840,00</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, borderTop: `1px solid ${C.line2}`, paddingTop: 9, marginTop: 3 }}><span style={{ fontWeight: 700, color: C.ink }}>Saldo em caixa</span><span style={{ fontWeight: 700, color: C.ink }}>R$ 2.040,00</span></div>
              </div>
              <button type="button" onClick={v.act.pdv} style={{ width: "100%", height: 34, marginTop: 13, border: "none", background: C.primary, color: C.white, borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Receber OS atual no PDV →</button>
            </div>
            <div style={{ ...card, padding: 15 }}>
              <div style={{ ...cardTitle, marginBottom: 11 }}>Contas a receber (serviço)</div>
              {v.pdvReceber.map((p, pi) => (
                <div key={pi} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${C.line4}` }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: C.ink, width: 92 }}>{p.codigo}</span>
                  <span style={{ flex: 1, fontSize: 12, color: C.body, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.cliente}</span>
                  <span style={{ fontSize: 11, color: C.muted, width: 84 }}>{p.forma}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: C.warnFg, width: 84, textAlign: "right" }}>{p.saldo}</span>
                  <button type="button" onClick={v.act.pdv} style={{ height: 26, padding: "0 11px", border: "none", background: C.primaryBg, color: C.primaryHover, borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Receber</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {v.modDash && (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.4fr)", gap: 12, alignItems: "start" }}>
            <div style={{ ...card, padding: 15 }}>
              <div style={{ ...cardTitle, marginBottom: 13 }}>Distribuição por etapa</div>
              {v.dashDist.map((d, di) => (
                <div key={di} style={{ marginBottom: 11 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}><span style={{ color: C.body }}>{d.label}</span><span style={{ color: C.muted, fontWeight: 600 }}>{d.n}</span></div>
                  <div style={{ height: 7, borderRadius: 4, background: C.line3, overflow: "hidden" }}><div style={{ height: "100%", width: d.pct, background: d.color, borderRadius: 4 }} /></div>
                </div>
              ))}
            </div>
            <div style={{ ...card, padding: 15 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
                <span style={cardTitle}>Fila do dia</span>
                <button type="button" onClick={v.railFila} style={{ border: "none", background: "transparent", color: C.primary, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>Ver fila completa →</button>
              </div>
              {v.dashFila.map((o, oi) => (
                <button key={oi} type="button" onClick={v.railWorkspace} className={styles.hoverSoft} style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, textAlign: "left", border: "none", borderBottom: `1px solid ${C.line4}`, background: "transparent", padding: "9px 4px", cursor: "pointer" }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: C.ink, width: 92 }}>{o.codigo}</span>
                  <span style={{ flex: 1, fontSize: 12, color: C.body, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.cliente} · <span style={{ color: C.subtle }}>{o.aparelho}</span></span>
                  <span style={{ display: "inline-flex", alignItems: "center", height: 21, padding: "0 9px", background: o.tagBg, color: o.tagFg, borderRadius: 999, fontSize: 10.5, fontWeight: 600 }}>{o.etapa}</span>
                  <span style={{ fontSize: 10.5, color: o.slaColor, fontWeight: 600, width: 64, textAlign: "right" }}>{o.sla}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
