/** Operações V4 Preview — modal de recibo de pagamento.
 *
 * GOAL OPS-V4-P0-008: o recibo fabricado (cliente/valor/PIX/data fixos) foi
 * removido. A OS não carrega recibo real (a baixa é registrada no PDV de
 * Serviço), então o modal exibe um empty state honesto — nunca um recibo falso. */
import { C } from "../tokens";
import type { V4Vals } from "../use-v4-preview";

export function ReciboModal({ v }: { v: V4Vals }) {
  if (!v.reciboOpen) return null;
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 70, background: "rgba(17,19,26,.42)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: 380, maxWidth: "100%", background: C.surface, borderRadius: 14, boxShadow: "0 24px 60px rgba(17,19,26,.3)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${C.line2}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>🧾 Recibo de pagamento</div>
          <button type="button" onClick={v.closeRecibo} style={{ width: 26, height: 26, border: "none", background: C.muted50, borderRadius: 7, color: C.muted, fontSize: 15, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ padding: 22 }}>
          <div style={{ textAlign: "center", color: C.subtle, fontSize: 12.5, lineHeight: 1.6, padding: "10px 4px 18px" }}>
            Não existe recibo registrado para esta Ordem de Serviço.
            <div style={{ fontSize: 11, color: C.faint2, marginTop: 8 }}>
              A baixa do recebimento é feita no <b>PDV de Serviço</b> (Conta a Receber + caixa do dia).
            </div>
          </div>
          <button type="button" onClick={v.closeRecibo} style={{ width: "100%", height: 34, border: `1px solid ${C.inputBd}`, background: C.surface, color: C.body, borderRadius: 9, fontSize: 12.5, fontWeight: 500, cursor: "pointer" }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
