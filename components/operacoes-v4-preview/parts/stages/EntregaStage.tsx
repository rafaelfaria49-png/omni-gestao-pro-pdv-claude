/** Operações V4 Preview — etapa Entrega (registro, checklist final, acessórios devolvidos, garantia). */
import { C, card, cardTitle, HATCH_SOFT, upLabel } from "../../tokens";
import type { V4Vals } from "../../use-v4-preview";

const col3 = "minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)";
const col2 = "minmax(0,1fr) minmax(0,1fr)";

export function EntregaStage({ v }: { v: V4Vals }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: col3, gap: 12, alignItems: "start" }}>
      <div style={card}>
        <div style={{ ...cardTitle, marginBottom: 11 }}>📦 Registro de entrega</div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${C.warnBd}`, background: C.warnBg2, borderRadius: 9, padding: "9px 11px", marginBottom: 12 }}>
          <span style={{ color: C.warnFg }}>⚠</span>
          <span style={{ fontSize: 11.5, color: C.warnFg, lineHeight: 1.4 }}>A OS precisa estar <b>Pronta</b> para registrar a entrega.</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <div><div style={{ ...upLabel, marginBottom: 3 }}>Retirado por</div><input placeholder="Nome de quem retira" style={inputStyle} /></div>
          <div style={{ display: "grid", gridTemplateColumns: col2, gap: 9 }}>
            <div><div style={{ ...upLabel, marginBottom: 3 }}>Documento</div><input placeholder="CPF / RG" style={inputStyle} /></div>
            <div><div style={{ ...upLabel, marginBottom: 3 }}>Data / hora</div><div style={{ height: 30, display: "flex", alignItems: "center", padding: "0 10px", border: `1px solid ${C.inputBd}`, borderRadius: 8, fontSize: 12.5, color: C.subtle, background: C.surface2 }}>— ao registrar</div></div>
          </div>
        </div>
        <div style={{ ...upLabel, margin: "12px 0 6px" }}>Assinatura de retirada</div>
        <div style={{ height: 58, border: `1px dashed ${C.hatch}`, borderRadius: 8, background: HATCH_SOFT, display: "flex", alignItems: "center", justifyContent: "center", color: C.subtle, fontSize: 11, marginBottom: 9 }}>o cliente assina ao retirar o aparelho</div>
        <button type="button" onClick={v.act.assinarRetirada} style={{ width: "100%", height: 32, border: `1px solid ${C.inputBd}`, background: C.surface, color: C.body, borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>Capturar assinatura</button>
        <button type="button" onClick={v.act.registrarEntrega} style={{ width: "100%", height: 36, marginTop: 9, border: "none", background: C.primary, color: C.white, borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Registrar entrega</button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={cardTitle}>Checklist final de entrega</span>
            <span style={{ fontSize: 11, color: C.successFg, fontWeight: 600 }}>{v.entregaCheckResumo}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {v.entregaCheck.map((ec, i) => (
              <button key={i} type="button" onClick={ec.onToggle} style={{ display: "flex", alignItems: "center", gap: 9, textAlign: "left", border: "none", background: "transparent", padding: "2px 0", cursor: "pointer", fontSize: 12.5, color: ec.color }}>
                {ec.ok
                  ? <span style={{ width: 18, height: 18, borderRadius: 5, background: C.success, color: C.white, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flex: "none" }}>✓</span>
                  : <span style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${C.dashed}`, flex: "none" }} />}
                {ec.label}
              </button>
            ))}
          </div>
        </div>
        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: 9 }}>Acessórios devolvidos</div>
          <div style={{ display: "grid", gridTemplateColumns: col2, gap: 6 }}>
            {v.acessoriosDev.map((a, i) => (
              <button key={i} type="button" onClick={a.onToggle} style={{ display: "flex", alignItems: "center", gap: 7, textAlign: "left", border: `1px solid ${C.line2}`, background: C.surface, borderRadius: 7, padding: "6px 8px", cursor: "pointer" }}>
                {a.on
                  ? <span style={{ width: 15, height: 15, borderRadius: 4, background: C.success, color: C.white, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flex: "none" }}>✓</span>
                  : <span style={{ width: 15, height: 15, borderRadius: 4, border: `1.5px solid ${C.dashed}`, flex: "none" }} />}
                <span style={{ fontSize: 11.5, color: C.body }}>{a.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
          <span style={cardTitle}>🛡 Garantia da OS</span>
          <span style={{ height: 21, padding: "0 9px", display: "inline-flex", alignItems: "center", gap: 5, background: C.infoBg, color: C.infoFg, borderRadius: 999, fontSize: 11, fontWeight: 600 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: C.info }} />{v.garantia.situacao}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, border: `1px solid ${C.primaryBd2}`, background: C.primarySoft, borderRadius: 9, padding: "8px 10px", marginBottom: 11 }}>
          <span style={{ fontSize: 11.5, color: C.primaryHover }}>✦ Sugestão pelo serviço: <b>{v.garantia.sugestao}</b></span>
          <button type="button" onClick={v.act.aplicarSugestao} style={{ border: "none", background: C.primary, color: C.white, borderRadius: 6, padding: "4px 9px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Aplicar</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: col2, gap: 10, marginBottom: 11 }}>
          <div><div style={upLabel}>Modelo</div><div style={{ fontSize: 12.5, color: C.body, fontWeight: 500 }}>{v.garantia.modelo}</div></div>
          <div><div style={upLabel}>Prazo</div><div style={{ fontSize: 12.5, color: C.body, fontWeight: 500 }}>{v.garantia.prazo}</div></div>
          <div><div style={upLabel}>Validade</div><div style={{ fontSize: 12.5, color: C.body, fontWeight: 500 }}>{v.garantia.validade}</div></div>
          <div><div style={upLabel}>Prevista</div><div style={{ fontSize: 12.5, color: C.body, fontWeight: 500 }}>{v.garantia.prevista}</div></div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={v.act.salvarGarantia} style={{ flex: 1, height: 32, border: "none", background: C.primary, color: C.white, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Salvar</button>
          <button type="button" onClick={v.act.imprimirTermo} style={{ flex: 1, height: 32, border: `1px solid ${C.inputBd}`, background: C.surface, color: C.body, borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>🖨 Termo</button>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  height: 30,
  padding: "0 10px",
  border: `1px solid ${C.inputBd}`,
  borderRadius: 8,
  fontSize: 12.5,
  color: C.body,
} as const;
