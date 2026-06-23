/** Operações V4 Preview — etapa Orçamento (itens cobrado/brinde/desconto + totais + peças). */
import { C, card, cardTitle, upLabel } from "../../tokens";
import type { V4Vals } from "../../use-v4-preview";

export function OrcamentoStage({ v }: { v: V4Vals }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.55fr) minmax(0,1fr)", gap: 12, alignItems: "start" }}>
      <div style={{ ...card, border: `1px solid ${C.primaryBd2}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={cardTitle}>🔧 Orçamento</span>
            <span style={{ height: 21, padding: "0 9px", display: "inline-flex", alignItems: "center", background: C.successBg, color: C.successFg, borderRadius: 999, fontSize: 11, fontWeight: 600 }}>{v.orc.status}</span>
          </div>
          <button type="button" onClick={v.act.verVersoes} style={{ border: "none", background: "transparent", color: C.muted, fontSize: 11.5, cursor: "pointer" }}>🕑 {v.orc.versoes} versões</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".03em", color: C.subtle, fontWeight: 700, paddingBottom: 5, borderBottom: `1px solid ${C.line3}` }}>
          <span style={{ flex: 1 }}>Item</span><span style={{ width: 90 }}>Tipo</span><span style={{ width: 72, textAlign: "right" }}>Valor</span><span style={{ width: 20 }} />
        </div>
        {v.orcItens.map((it, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, padding: "8px 0", borderBottom: `1px solid ${C.line4}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: C.body, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.nome}</div>
              <div style={{ fontSize: 10, color: C.subtle }}>{it.cat} · {it.qtd}×</div>
            </div>
            <button type="button" onClick={it.onCycle} title="Alternar tipo: Cobrado / Brinde / Desconto" style={{ width: 90, height: 22, border: "none", background: it.kindBg, color: it.kindFg, borderRadius: 999, fontSize: 10.5, fontWeight: 700, cursor: "pointer" }}>{it.kindLabel}</button>
            <span style={{ width: 72, textAlign: "right", fontWeight: 600, color: C.ink }}>{it.valor}</span>
            <button type="button" onClick={it.onDel} title="Remover" style={{ width: 20, height: 20, border: "none", background: "transparent", color: C.faint, borderRadius: 5, fontSize: 13, cursor: "pointer" }}>×</button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 7, marginTop: 11, flexWrap: "wrap" }}>
          <button type="button" onClick={v.act.addServico} style={btnSecondary}>+ Mão de obra</button>
          <button type="button" onClick={v.act.addPeca} style={btnSecondary}>+ Peça</button>
          <button type="button" onClick={v.addManual} style={btnSecondary}>+ Item manual</button>
          <button type="button" onClick={v.act.catalogo} style={btnSecondary}>📦 Catálogo</button>
        </div>
        <div style={{ display: "flex", gap: 7, marginTop: 8, flexWrap: "wrap", alignItems: "center", borderTop: `1px dashed ${C.inputBd}`, paddingTop: 10 }}>
          <button type="button" onClick={v.act.aprovarOrc} style={{ height: 30, padding: "0 13px", border: "none", background: C.success, color: C.white, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>✓ Aprovar</button>
          <button type="button" onClick={v.act.enviarOrc} style={btnSecondary}>Reenviar ao cliente</button>
          <button type="button" onClick={v.act.recusarOrc} style={{ height: 30, padding: "0 11px", border: `1px solid ${C.dangerBd2}`, background: C.surface, color: C.danger, borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>Recusar</button>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={v.act.verVersoes} style={{ height: 30, padding: "0 11px", border: "none", background: "transparent", color: C.muted, fontSize: 11.5, cursor: "pointer" }}>🕑 Versões</button>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: 10 }}>Totais</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "4px 0" }}><span style={{ color: C.muted }}>Subtotal (cobrado)</span><span style={{ color: C.body, fontWeight: 500 }}>{v.orcTotais.subtotal}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "4px 0" }}><span style={{ color: C.muted }}>Desconto</span><span style={{ color: C.warnFg, fontWeight: 500 }}>{v.orcTotais.desconto}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "4px 0" }}><span style={{ color: C.muted }}>Brindes (cortesia)</span><span style={{ color: C.successFg, fontWeight: 500 }}>{v.orcTotais.brinde}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "8px 0 5px", borderTop: `1px solid ${C.line2}`, marginTop: 4 }}><span style={{ fontWeight: 700, color: C.ink }}>Total ao cliente</span><span style={{ fontWeight: 700, color: C.ink }}>{v.orcTotais.total}</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 8, borderTop: `1px dashed ${C.inputBd}`, marginTop: 8, paddingTop: 9 }}>
            <div><div style={upLabel}>Custo interno</div><div style={{ fontSize: 13, fontWeight: 600, color: C.body }}>{v.orcTotais.custo}</div></div>
            <div><div style={upLabel}>Lucro estimado</div><div style={{ fontSize: 13, fontWeight: 700, color: C.successFg }}>{v.orcTotais.lucro}</div></div>
          </div>
          <div style={{ fontSize: 10, color: C.subtle, marginTop: 8 }}>Brinde reduz o lucro (custo lançado, valor não cobrado). Desconto abate do total ao cliente. Toque no tipo para alternar.</div>
        </div>
        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: 9 }}>Disponibilidade de peças</div>
          <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12, padding: "5px 0" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: C.success, flex: "none" }} /><span style={{ flex: 1, color: C.body }}>Tela OLED iPhone 13 Pro</span><span style={{ color: C.successFg, fontWeight: 600 }}>3 un.</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12, padding: "5px 0" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: C.success, flex: "none" }} /><span style={{ flex: 1, color: C.body }}>Adesivo de vedação</span><span style={{ color: C.successFg, fontWeight: 600 }}>ok</span></div>
          <button type="button" onClick={v.act.pedirPeca} style={{ width: "100%", height: 30, marginTop: 9, border: `1px solid ${C.inputBd}`, background: C.surface, color: C.body, borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>Pedir / reservar peça</button>
        </div>
      </div>
    </div>
  );
}

const btnSecondary = {
  height: 30,
  padding: "0 11px",
  border: `1px solid ${C.inputBd}`,
  background: C.surface,
  color: C.body,
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
} as const;
