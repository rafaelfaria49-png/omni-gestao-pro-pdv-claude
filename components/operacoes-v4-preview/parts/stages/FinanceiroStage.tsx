/** Operações V4 Preview — etapa Financeiro (KPIs, recebimentos, forma de pagamento, histórico). */
import { C, card, cardTitle, upLabel } from "../../tokens";
import type { V4Vals } from "../../use-v4-preview";

const col3 = "minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)";

export function FinanceiroStage({ v }: { v: V4Vals }) {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)", gap: 12, marginBottom: 12 }}>
        <div style={card}><div style={{ ...upLabel, fontSize: 10.5 }}>Total da OS</div><div style={{ fontSize: 21, fontWeight: 700, color: C.ink, marginTop: 3 }}>R$ 890,00</div><div style={{ fontSize: 11, color: C.subtle, marginTop: 2 }}>serviços + peças</div></div>
        <div style={card}><div style={{ ...upLabel, fontSize: 10.5 }}>Recebido</div><div style={{ fontSize: 21, fontWeight: 700, color: C.successFg, marginTop: 3 }}>R$ 300,00</div><div style={{ fontSize: 11, color: C.subtle, marginTop: 2 }}>1 recebimento</div></div>
        <div style={{ ...card, border: `1px solid ${C.warnBd}`, background: C.warnBg2 }}><div style={{ ...upLabel, fontSize: 10.5, color: C.warnFg }}>Saldo a receber</div><div style={{ fontSize: 21, fontWeight: 700, color: C.warnFg, marginTop: 3 }}>R$ 590,00</div><div style={{ fontSize: 11, color: C.warnFg2, marginTop: 2 }}>no ato da entrega</div></div>
        <div style={card}><div style={{ ...upLabel, fontSize: 10.5 }}>Pagamento previsto</div><div style={{ fontSize: 16, fontWeight: 700, color: C.ink, marginTop: 5 }}>Cartão de crédito</div><div style={{ fontSize: 11, color: C.subtle, marginTop: 2 }}>até 3× sem juros</div></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: col3, gap: 12, alignItems: "start" }}>
        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: 10 }}>Recebimentos</div>
          <div style={{ display: "flex", alignItems: "center", fontSize: 12.5, padding: "8px 0", borderBottom: `1px solid ${C.line4}` }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: C.success, flex: "none", marginRight: 9 }} /><span style={{ flex: 1, color: C.body }}>Sinal — PIX</span><span style={{ color: C.subtle, fontSize: 11, marginRight: 10 }}>14/06</span><span style={{ fontWeight: 600, color: C.successFg }}>R$ 300,00</span></div>
          <div style={{ display: "flex", alignItems: "center", fontSize: 12.5, padding: "8px 0", color: C.subtle }}><span style={{ width: 7, height: 7, borderRadius: "50%", border: `1.5px solid ${C.dashed}`, flex: "none", marginRight: 9 }} /><span style={{ flex: 1 }}>Saldo na entrega</span><span style={{ fontSize: 11, marginRight: 10 }}>previsto</span><span style={{ fontWeight: 600 }}>R$ 590,00</span></div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13, padding: "10px 0 0", borderTop: `1px solid ${C.line2}`, marginTop: 4 }}><span style={{ color: C.ink, fontWeight: 700 }}>Saldo devedor</span><span style={{ color: C.warnFg, fontWeight: 700 }}>R$ 590,00</span></div>
          <div style={{ fontSize: 10.5, color: C.subtle, marginTop: 2 }}>após pagamento parcial de R$ 300,00</div>
          <div style={{ marginTop: 11, padding: 11, border: `1px dashed ${C.inputBd}`, borderRadius: 9, background: C.surface2 }}>
            <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5, marginBottom: 9 }}>A baixa real do recebimento acontece no <b>PDV de Serviço</b> (Conta a Receber + caixa do dia). Exige caixa aberto.</div>
            <div style={{ display: "flex", gap: 7 }}>
              <button type="button" onClick={v.act.pdv} style={{ flex: 1, height: 34, border: "none", background: C.primary, color: C.white, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Receber no PDV →</button>
              <button type="button" onClick={v.openRecibo} style={{ flex: "none", height: 34, padding: "0 12px", border: `1px solid ${C.inputBd}`, background: C.surface, color: C.body, borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>🧾 Recibo</button>
            </div>
          </div>
        </div>
        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: 10 }}>Forma de pagamento</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "6px 0", borderBottom: `1px solid ${C.line4}` }}><span style={{ color: C.subtle }}>Status</span><span style={{ color: C.warnFg, fontWeight: 600 }}>{v.pag.statusPagamento}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "6px 0", borderBottom: `1px solid ${C.line4}` }}><span style={{ color: C.subtle }}>Última forma</span><span style={{ color: C.body, fontWeight: 500 }}>PIX</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "6px 0", borderBottom: `1px solid ${C.line4}` }}><span style={{ color: C.subtle }}>Previsto (saldo)</span><span style={{ color: C.body, fontWeight: 500 }}>Cartão de crédito</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "6px 0" }}><span style={{ color: C.subtle }}>Parcelamento</span><span style={{ color: C.body, fontWeight: 500 }}>3× R$ 196,67</span></div>
          <div style={{ ...upLabel, margin: "11px 0 6px" }}>Plano de pagamento</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${C.line2}`, borderRadius: 8, padding: "7px 9px" }}><span style={{ width: 16, height: 16, borderRadius: "50%", background: C.success, color: C.white, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flex: "none" }}>✓</span><span style={{ flex: 1, fontSize: 12, color: C.body }}>Entrada (sinal)</span><span style={{ fontSize: 12, fontWeight: 600, color: C.ink }}>R$ 300,00</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${C.line2}`, borderRadius: 8, padding: "7px 9px" }}><span style={{ width: 16, height: 16, borderRadius: "50%", border: `1.5px solid ${C.dashed}`, flex: "none" }} /><span style={{ flex: 1, fontSize: 12, color: C.body }}>Saldo na entrega</span><span style={{ fontSize: 12, fontWeight: 600, color: C.ink }}>R$ 590,00</span></div>
          </div>
        </div>
        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: 11 }}>Histórico financeiro</div>
          {v.finHist.map((f, i) => (
            <div key={i} style={{ display: "flex", gap: 10, paddingBottom: 11 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: f.dot, flex: "none", marginTop: 3 }} />
                <span style={{ flex: 1, width: 2, background: C.line2, marginTop: 3 }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span style={{ fontSize: 12, color: C.body }}>{f.text}</span><span style={{ fontSize: 12, fontWeight: 600, color: f.amtColor, whiteSpace: "nowrap" }}>{f.amt}</span></div>
                <div style={{ fontSize: 10.5, color: C.subtle }}>{f.meta}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
