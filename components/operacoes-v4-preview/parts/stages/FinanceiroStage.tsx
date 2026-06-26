/** Operações V4 Preview — etapa Financeiro (faturamento REAL da OS).
 *
 * GOAL OPS-V4-P0-008: todos os valores fabricados ("R$ 890", "R$ 300",
 * "3× R$ 196,67", "Sinal — PIX 14/06"…) foram removidos. Exibe apenas o que a OS
 * carrega de fato: total, status do faturamento, forma/modo de cobrança, plano de
 * parcelas e o histórico financeiro real (derivado da timeline). A baixa do
 * recebimento vive no PDV/Caixa (fora do Preview) → "Nenhum pagamento registrado".
 * Sem fonte real → empty state honesto; nada de valor inventado. */
import { C, card, cardTitle, upLabel } from "../../tokens";
import type { V4Vals } from "../../use-v4-preview";

const col3 = "minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)";
const emptyText = { fontSize: 12, color: C.subtle, padding: "8px 2px", lineHeight: 1.5 } as const;

export function FinanceiroStage({ v }: { v: V4Vals }) {
  const f = v.financeiro;

  if (!f.temDados && v.finHist.length === 0) {
    return (
      <div style={card}>
        <div style={{ ...cardTitle, marginBottom: 6 }}>Financeiro</div>
        <div style={emptyText}>Nenhuma informação financeira disponível para esta OS.</div>
      </div>
    );
  }

  const statusBadge =
    f.statusTone === "cancelado"
      ? { bg: C.dangerBg, fg: C.dangerFg }
      : { bg: C.warnBg, fg: C.warnFg };

  return (
    <div style={{ display: "grid", gridTemplateColumns: col3, gap: 12, alignItems: "start" }}>
      {/* Faturamento da OS */}
      <div style={card}>
        <div style={{ ...cardTitle, marginBottom: 11 }}>Faturamento da OS</div>
        <div style={{ ...upLabel, fontSize: 10.5 }}>Total da OS</div>
        <div style={{ fontSize: 21, fontWeight: 700, color: f.temTotal ? C.ink : C.subtle, marginTop: 3, marginBottom: 11 }}>{f.total}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {f.statusTone !== "neutro" && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5 }}>
              <span style={{ color: C.subtle }}>Status</span>
              <span style={{ height: 21, padding: "0 9px", display: "inline-flex", alignItems: "center", background: statusBadge.bg, color: statusBadge.fg, borderRadius: 999, fontSize: 11, fontWeight: 600 }}>{f.statusFaturamento}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}><span style={{ color: C.subtle }}>Forma de pagamento</span><span style={{ color: C.body, fontWeight: 500 }}>{f.formaPagamento}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}><span style={{ color: C.subtle }}>Cobrança</span><span style={{ color: C.body, fontWeight: 500 }}>{f.modoCobranca}</span></div>
        </div>
        <div style={{ marginTop: 12, padding: 11, border: `1px dashed ${C.inputBd}`, borderRadius: 9, background: C.surface2 }}>
          <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5, marginBottom: 9 }}>Nenhum pagamento registrado nesta OS. A baixa do recebimento acontece no <b>PDV de Serviço</b> (Conta a Receber + caixa do dia). Exige caixa aberto.</div>
          <div style={{ display: "flex", gap: 7 }}>
            <button type="button" onClick={v.act.pdv} style={{ flex: 1, height: 34, border: "none", background: C.primary, color: C.white, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Receber no PDV →</button>
            <button type="button" onClick={v.openRecibo} style={{ flex: "none", height: 34, padding: "0 12px", border: `1px solid ${C.inputBd}`, background: C.surface, color: C.body, borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>🧾 Recibo</button>
          </div>
        </div>
      </div>

      {/* Plano de parcelas */}
      <div style={card}>
        <div style={{ ...cardTitle, marginBottom: 10 }}>Plano de parcelas</div>
        {f.parcelas.length === 0 ? (
          <div style={emptyText}>Nenhuma parcela registrada.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {f.parcelas.map((p, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${C.line2}`, borderRadius: 8, padding: "7px 9px" }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: C.ink, width: 34, flex: "none" }}>{p.numero}</span>
                <span style={{ flex: 1, fontSize: 11.5, color: C.subtle, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>vence {p.vencimento}</span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, flex: "none" }}>{p.valor}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Histórico financeiro (real, derivado da timeline) */}
      <div style={card}>
        <div style={{ ...cardTitle, marginBottom: 11 }}>Histórico financeiro</div>
        {v.finHist.length === 0 ? (
          <div style={emptyText}>Nenhum evento financeiro registrado.</div>
        ) : (
          v.finHist.map((h) => (
            <div key={h.id} style={{ display: "flex", gap: 10, paddingBottom: 11 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: h.dot, flex: "none", marginTop: 3 }} />
                <span style={{ flex: 1, width: 2, background: C.line2, marginTop: 3 }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: C.body }}>{h.text}</div>
                <div style={{ fontSize: 10.5, color: C.subtle }}>{h.meta}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
