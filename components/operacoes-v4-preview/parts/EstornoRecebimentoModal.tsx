/** Operações V4 Preview — modal de confirmação do estorno de recebimento.
 *
 * GOAL OPS-V4-RECEBIMENTO-ESTORNO-016: UI fina sobre o motor único da V3 —
 * lê/escreve por `v.pdvServico` (`usePdvServicoV3` → `estornarRecebimentoOSV3`,
 * sem motor novo). Exige sessão de caixa ABERTA (nunca abre caixa por aqui) e
 * motivo obrigatório (mín. caracteres — `validarMotivoEstornoV4`, mais estrito
 * que a V3, que aceita motivo opcional). Reverte sempre o ÚLTIMO recebimento
 * registrado na OS (é o que a V3 suporta — não há escolha de qual recebimento
 * estornar); por isso o resumo mostra o estado atual (recebido/saldo), nunca
 * um valor de estorno fabricado. Sem estado otimista: fecha e deixa a lista/
 * detalhe real recarregar sozinha no sucesso (mesmo padrão do recebimento). */
"use client";

import { useState } from "react";
import { C, fmt } from "../tokens";
import type { V4Vals } from "../use-v4-preview";
import { buildEstornarRecebimentoInputV4, validarMotivoEstornoV4 } from "@/lib/operacoes-v4/estorno-recebimento-form";

const overlay: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 72,
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

export function EstornoRecebimentoModal({ v }: { v: V4Vals }) {
  if (!v.estornoRecebimentoOpen) return null;
  return <EstornoRecebimentoModalContent v={v} />;
}

function EstornoRecebimentoModalContent({ v }: { v: V4Vals }) {
  const pdv = v.pdvServico;
  const [motivo, setMotivo] = useState("");

  const fechar = () => {
    setMotivo("");
    v.closeEstornoRecebimento();
  };

  const pagamento = pdv.pagamento;
  const semRecebimento = !pagamento || !v.estorno.temRecebido;
  const veredito = validarMotivoEstornoV4(motivo);
  const podeConfirmar = v.estorno.podeEstornar && veredito.ok && !pdv.estornando;

  const onConfirmar = async () => {
    if (!podeConfirmar || !pdv.sessao?.sessaoId) return;
    const input = buildEstornarRecebimentoInputV4(pdv.sessao.sessaoId, motivo);
    const ok = await pdv.estornar(input);
    if (ok) fechar();
  };

  return (
    <div style={overlay}>
      <div style={{ width: 400, maxWidth: "100%", background: C.surface, borderRadius: 14, boxShadow: "0 24px 60px rgba(17,19,26,.3)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${C.line2}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>↩ Estornar recebimento</div>
          <button type="button" onClick={fechar} style={{ width: 26, height: 26, border: "none", background: C.muted50, borderRadius: 7, color: C.muted, fontSize: 15, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ padding: 22 }}>
          {semRecebimento ? (
            <div style={{ textAlign: "center", color: C.subtle, fontSize: 12.5, lineHeight: 1.6, padding: "10px 4px 6px" }}>
              Não há recebimento para estornar nesta OS.
            </div>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12, padding: 11, border: `1px solid ${C.line2}`, borderRadius: 9, background: C.surface2 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                  <span style={{ color: C.subtle }}>Recebido atual</span>
                  <span style={{ color: C.successFg, fontWeight: 600 }}>{fmt(pagamento.recebido)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                  <span style={{ color: C.subtle }}>Saldo atual</span>
                  <span style={{ color: pagamento.saldo > 0 ? C.warnFg : C.body, fontWeight: 600 }}>{fmt(pagamento.saldo)}</span>
                </div>
              </div>
              <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 12, lineHeight: 1.5 }}>
                Este estorno reverte o <b>último recebimento</b> registrado nesta OS (correção auditada) — a V3 não permite escolher um recebimento específico da história.
              </div>

              {!v.estorno.caixaAberto && (
                <div style={{ fontSize: 11.5, color: C.warnFg, fontWeight: 500, marginBottom: 12, lineHeight: 1.5 }}>
                  Caixa fechado — abra o caixa para estornar este recebimento.
                </div>
              )}

              <div style={{ marginBottom: 9 }}>
                <div style={{ fontSize: 10, color: C.subtle, marginBottom: 3 }}>Motivo do estorno (obrigatório)</div>
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  maxLength={300}
                  placeholder="Ex.: valor lançado errado, cliente pagou em duplicidade…"
                  style={inputBase}
                />
              </div>
              {motivo.trim() !== "" && !veredito.ok && (
                <div style={{ fontSize: 11, color: C.dangerFg, marginBottom: 9 }}>{veredito.erro}</div>
              )}
              {pdv.error && <div style={{ fontSize: 11, color: C.dangerFg, marginBottom: 9 }}>{pdv.error}</div>}

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
                  {pdv.estornando ? "Estornando…" : "Confirmar estorno"}
                </button>
                <button
                  type="button"
                  onClick={fechar}
                  disabled={pdv.estornando}
                  style={{ flex: "none", height: 34, padding: "0 14px", border: `1px solid ${C.inputBd2}`, background: C.surface, color: C.body, borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer" }}
                >
                  Cancelar
                </button>
              </div>
            </>
          )}
          {semRecebimento && (
            <button type="button" onClick={fechar} style={{ width: "100%", height: 34, marginTop: 14, border: `1px solid ${C.inputBd}`, background: C.surface, color: C.body, borderRadius: 9, fontSize: 12.5, fontWeight: 500, cursor: "pointer" }}>
              Fechar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
