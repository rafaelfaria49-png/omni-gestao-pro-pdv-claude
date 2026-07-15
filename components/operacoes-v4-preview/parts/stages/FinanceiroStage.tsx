/** Operações V4 — leitura financeira única, projetada e reconciliada no servidor. */
import { C, card, cardTitle, fmt, upLabel } from "../../tokens";
import type { V4Vals } from "../../use-v4-preview";
import { ReceberPagamentoV4 } from "../ReceberPagamentoV4";

const col3 = "repeat(auto-fit, minmax(270px, 1fr))";
const emptyText = { fontSize: 12, color: C.subtle, padding: "8px 2px", lineHeight: 1.5 } as const;

function amount(value: number | null): string {
  return value == null ? "Indisponível" : fmt(value);
}

function dateTime(value: string | null): string {
  if (!value) return "Data não registrada";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("pt-BR");
}

export function FinanceiroStage({ v }: { v: V4Vals }) {
  const financial = v.financial;
  const projection = financial.projection;

  if (financial.loading) {
    return <div style={card}><div style={{ ...cardTitle, marginBottom: 6 }}>Financeiro</div><div style={emptyText}>Carregando a projeção financeira desta OS…</div></div>;
  }
  if (financial.error || !projection) {
    return (
      <div style={card}>
        <div style={{ ...cardTitle, marginBottom: 6 }}>Financeiro indisponível</div>
        <div style={{ ...emptyText, color: C.dangerFg }}>{financial.error ?? "Não foi possível determinar a situação financeira desta OS."}</div>
        <button type="button" onClick={financial.reload} style={{ height: 32, padding: "0 12px", border: `1px solid ${C.inputBd}`, background: C.surface, color: C.body, borderRadius: 8, fontSize: 12, cursor: "pointer" }}>Tentar novamente</button>
      </div>
    );
  }

  const inconsistent = projection.consistencyStatus === "INCONSISTENT" || projection.consistencyStatus === "UNKNOWN";
  const statusColors = inconsistent
    ? { bg: C.dangerBg, fg: C.dangerFg }
    : projection.financialStatus === "PAID" || projection.canDeliver
      ? { bg: C.successBg, fg: C.successFg }
      : { bg: C.warnBg, fg: C.warnFg };

  return (
    <div style={{ display: "grid", gridTemplateColumns: col3, gap: 12, alignItems: "start" }}>
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <div style={cardTitle}>Faturamento da OS</div>
          <span style={{ height: 22, padding: "0 9px", display: "inline-flex", alignItems: "center", background: statusColors.bg, color: statusColors.fg, borderRadius: 999, fontSize: 11, fontWeight: 700 }}>{financial.statusLabel}</span>
        </div>

        {projection.consistencyIssues.length > 0 && (
          <div style={{ padding: 10, marginBottom: 12, border: `1px solid ${inconsistent ? C.dangerBd : C.warnBd}`, borderRadius: 9, background: inconsistent ? C.dangerBg : C.warnBg, color: inconsistent ? C.dangerFg : C.warnFg, fontSize: 11.5, lineHeight: 1.45 }}>
            {projection.consistencyIssues.join(" ")}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8, marginBottom: 12 }}>
          {[
            ["Total esperado", amount(projection.expectedTotal)],
            ["Recebido", amount(projection.receivedTotal)],
            ["Saldo", amount(projection.balance)],
          ].map(([label, value]) => (
            <div key={label} style={{ padding: 9, border: `1px solid ${C.line2}`, borderRadius: 8, background: C.surface2 }}>
              <div style={{ ...upLabel, marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: value === "Indisponível" ? C.dangerFg : C.ink }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gap: 7, fontSize: 12.5 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span style={{ color: C.subtle }}>Conta a Receber</span><span style={{ color: C.body, fontWeight: 600 }}>{projection.receivableFound ? projection.receivableStatus ?? "Encontrada" : "Não criada"}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span style={{ color: C.subtle }}>Forma de pagamento</span><span style={{ color: C.body, fontWeight: 600, textAlign: "right" }}>{financial.paymentMethodSummary}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span style={{ color: C.subtle }}>Cobrança</span><span style={{ color: C.body, fontWeight: 600 }}>{projection.collectionMode ?? "Não registrada"}</span></div>
          {projection.authorizedNoCharge && <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span style={{ color: C.subtle }}>Sem cobrança</span><span style={{ color: C.body, fontWeight: 600 }}>{projection.noChargeCategory ?? "Autorizada"}</span></div>}
        </div>

        {projection.receivedTotal != null && projection.receivedTotal > 0 && (
          <div style={{ display: "flex", gap: 7, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" onClick={v.openRecibo} style={{ height: 34, padding: "0 12px", border: `1px solid ${C.inputBd}`, background: C.surface, color: C.body, borderRadius: 8, fontSize: 12, cursor: "pointer" }}>🧾 Recibo</button>
            <button type="button" onClick={v.openEstornoRecebimento} disabled={!v.estorno.podeEstornar} style={{ height: 34, padding: "0 12px", border: `1px solid ${C.dangerBd}`, background: C.surface, color: C.dangerFg, borderRadius: 8, fontSize: 12, cursor: v.estorno.podeEstornar ? "pointer" : "default", opacity: v.estorno.podeEstornar ? 1 : 0.55 }}>↩ Estornar</button>
          </div>
        )}
        <ReceberPagamentoV4 v={v} />
      </div>

      <div style={card}>
        <div style={{ ...cardTitle, marginBottom: 10 }}>Plano de parcelas</div>
        {projection.installments.length === 0 ? <div style={emptyText}>Nenhuma parcela registrada.</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {projection.installments.map((installment, index) => (
              <div key={`${installment.number}:${index}`} style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${C.line2}`, borderRadius: 8, padding: "7px 9px" }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: C.ink, width: 34 }}>{installment.number}</span>
                <span style={{ flex: 1, fontSize: 11.5, color: C.subtle }}>{installment.dueAt ?? "sem vencimento"}</span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>{amount(installment.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{ ...cardTitle, marginBottom: 11 }}>Histórico financeiro</div>
        {projection.financialEvents.length === 0 ? <div style={emptyText}>Nenhum evento financeiro registrado.</div> : projection.financialEvents.map((event) => (
          <div key={event.eventId} style={{ display: "flex", gap: 10, paddingBottom: 11 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: event.type.includes("estorno") ? C.danger : C.success, flex: "none", marginTop: 4 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: C.body }}>{event.description}{event.amount != null ? ` · ${fmt(event.amount)}` : ""}</div>
              <div style={{ fontSize: 10.5, color: C.subtle }}>{dateTime(event.occurredAt)} · origem {event.source === "RECEIVABLE" ? "Conta a Receber" : "OS"}{event.paymentMethod ? ` · ${event.paymentMethod}` : ""}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
