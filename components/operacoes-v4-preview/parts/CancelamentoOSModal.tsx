/** Operações V4 Preview — modal de confirmação do cancelamento de OS.
 *
 * GOAL OPS-V4-CANCELAR-OS-CONNECT-021: UI fina sobre o contrato único da V3 —
 * escreve via `v.cancelarOS` (`aplicarTransicaoStatusV3(sid, osId, "cancelada",
 * { motivo })`, já blindada no commit f825867: exige motivo, bloqueia qualquer
 * pagamento recebido, nunca ignora o retorno do cancelamento do CR). Motivo
 * obrigatório (mín. caracteres — `validarMotivoCancelamentoV4`, mesmo mínimo do
 * servidor, aqui só para feedback client-side). Bloqueio honesto quando o status
 * não permite (entregue/já cancelada) ou há pagamento recebido — nesses casos a
 * confirmação fica desabilitada e a mensagem explica o motivo real, nunca
 * inventado. Sem estado otimista: o modal só fecha via `after` do `runWrite`,
 * ou seja, só depois do servidor confirmar (ver `cancelarOS` em use-v4-preview). */
"use client";

import { useState } from "react";
import { C } from "../tokens";
import type { V4Vals } from "../use-v4-preview";
import { validarMotivoCancelamentoV4 } from "@/lib/operacoes-v4/cancelamento-form";

const overlay: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 73,
  background: "rgba(17,19,26,.42)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};

const inputBase: React.CSSProperties = {
  width: "100%",
  minHeight: 64,
  padding: "9px 11px",
  border: `1px solid ${C.inputBd}`,
  borderRadius: 8,
  fontSize: 12.5,
  color: C.body,
  background: C.surface,
  resize: "vertical",
  fontFamily: "inherit",
};

export function CancelamentoOSModal({ v }: { v: V4Vals }) {
  if (!v.cancelamentoOSOpen) return null;
  return <CancelamentoOSModalContent v={v} />;
}

function CancelamentoOSModalContent({ v }: { v: V4Vals }) {
  // GOAL 026: link honesto pós-recusa/expiração pode sugerir um motivo — o
  // operador ainda confirma/edita antes de cancelar de verdade.
  const [motivo, setMotivo] = useState(() => v.cancelamentoMotivoPrefill ?? "");
  const [busy, setBusy] = useState(false);

  const fechar = () => {
    if (busy) return;
    setMotivo("");
    v.closeCancelamentoOS();
  };

  const { statusPermite, statusMotivoBloqueio, semPagamento, podeCancelar } = v.cancelamento;
  const veredito = validarMotivoCancelamentoV4(motivo);
  const podeConfirmar = v.osSelected && podeCancelar && veredito.ok && !busy;

  const onConfirmar = async () => {
    if (!podeConfirmar) return;
    setBusy(true);
    try {
      await v.cancelarOS(motivo.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={overlay}>
      <div style={{ width: 400, maxWidth: "100%", background: C.surface, borderRadius: 14, boxShadow: "0 24px 60px rgba(17,19,26,.3)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${C.line2}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>✕ Cancelar OS</div>
          <button type="button" onClick={fechar} disabled={busy} style={{ width: 26, height: 26, border: "none", background: C.muted50, borderRadius: 7, color: C.muted, fontSize: 15, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ padding: 22 }}>
          {!v.osSelected ? (
            <div style={{ textAlign: "center", color: C.subtle, fontSize: 12.5, lineHeight: 1.6, padding: "10px 4px 6px" }}>
              Nenhuma OS selecionada.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11.5, color: C.dangerFg, fontWeight: 500, marginBottom: 14, lineHeight: 1.5, padding: 10, background: C.dangerBg, border: `1px solid ${C.dangerBd}`, borderRadius: 8 }}>
Cancelamento real: esta ação altera o status da OS no sistema e ficará registrada no histórico. Não pode ser desfeita depois de confirmada.
              </div>

              {!statusPermite && (
                <div style={{ fontSize: 11.5, color: C.warnFg, fontWeight: 500, marginBottom: 14, lineHeight: 1.5 }}>
                  {statusMotivoBloqueio ?? "Esta OS não pode ser cancelada no status atual."}
                </div>
              )}

              {statusPermite && !semPagamento && (
                <div style={{ fontSize: 11.5, color: C.warnFg, fontWeight: 500, marginBottom: 14, lineHeight: 1.5 }}>
                  Esta OS possui pagamento recebido. Estorne o recebimento antes de cancelar.
                </div>
              )}

              <div style={{ marginBottom: 9 }}>
                <div style={{ fontSize: 10, color: C.subtle, marginBottom: 3 }}>Motivo do cancelamento (obrigatório)</div>
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  maxLength={300}
                  disabled={!podeCancelar}
                  placeholder="Ex.: cliente desistiu do serviço, engano no cadastro…"
                  style={{ ...inputBase, opacity: podeCancelar ? 1 : 0.6 }}
                />
              </div>
              {motivo.trim() !== "" && !veredito.ok && (
                <div style={{ fontSize: 11, color: C.dangerFg, marginBottom: 9 }}>{veredito.erro}</div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={onConfirmar}
                  disabled={!podeConfirmar}
                  style={{
                    flex: 1,
                    height: 34,
                    border: "none",
                    background: C.danger,
                    color: C.white,
                    borderRadius: 8,
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: podeConfirmar ? "pointer" : "default",
                    opacity: podeConfirmar ? 1 : 0.6,
                  }}
                >
                  {busy ? "Cancelando…" : "Cancelar OS real"}
                </button>
                <button
                  type="button"
                  onClick={fechar}
                  disabled={busy}
                  style={{ flex: "none", height: 34, padding: "0 14px", border: `1px solid ${C.inputBd2}`, background: C.surface, color: C.body, borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer" }}
                >
                  Voltar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
