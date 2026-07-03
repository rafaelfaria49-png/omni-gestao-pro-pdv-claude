/**
 * Operações V4 — recebimento real da OS (slice PDV-SERVICO-OS-RECEBIMENTO-REAL-001).
 *
 * UI fina sobre o motor único da V3: lê/escreve por `v.pdvServico`
 * (`usePdvServicoV3` → `receberOSV3`/`lerPagamentoOSV3`, sem motor novo). Exige
 * sessão de caixa ABERTA (nunca abre caixa por aqui); permite valor parcial
 * (validado pelo mesmo `validarRecebimentoV3` da V3); só usa formas já
 * suportadas pelo contrato real. Sem estoque, sem venda, sem services
 * financeiros diretos — tudo passa por `receberOSV3`.
 */
"use client";

import { useState } from "react";
import { C, fmt } from "../tokens";
import type { V4Vals } from "../use-v4-preview";
import { FORMAS_RECEBIMENTO_V3, validarRecebimentoV3, type FormaRecebimentoV3 } from "@/lib/operacoes-v3/payment-model";

const box = {
  marginTop: 12,
  padding: 11,
  border: `1px solid ${C.line2}`,
  borderRadius: 9,
  background: C.surface2,
} as const;

const cellInput: React.CSSProperties = {
  height: 32,
  padding: "0 10px",
  border: `1px solid ${C.inputBd}`,
  borderRadius: 7,
  fontSize: 12.5,
  color: C.body,
  background: C.surface,
};

const btnPrimary: React.CSSProperties = {
  height: 34,
  padding: "0 16px",
  border: "none",
  background: C.primary,
  color: C.white,
  borderRadius: 8,
  fontSize: 12.5,
  fontWeight: 600,
};

const btnGhost: React.CSSProperties = {
  height: 34,
  padding: "0 14px",
  border: `1px solid ${C.inputBd2}`,
  background: C.surface,
  color: C.body,
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
};

const FORMAS_SUPORTADAS = FORMAS_RECEBIMENTO_V3.filter((f) => f.suportada);

function num(s: string): number {
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function ReceberPagamentoV4({ v }: { v: V4Vals }) {
  const pdv = v.pdvServico;
  const [open, setOpen] = useState(false);
  const [valor, setValor] = useState("");
  const [forma, setForma] = useState<FormaRecebimentoV3>("dinheiro");
  const [observacao, setObservacao] = useState("");

  if (!v.osSelected) return null;
  if (pdv.loading) {
    return <div style={box}><div style={{ fontSize: 11.5, color: C.subtle }}>Carregando pagamento…</div></div>;
  }

  const pagamento = pdv.pagamento;
  if (!pagamento) return null;

  // Gating vem pré-computado de `buildVals` (mesma regra do servidor — ver
  // `v.recebimento` em use-v4-preview.ts) para ficar testável sem renderizar React.
  const { semTotal, previaNaoMaterializada, quitado, caixaAberto } = v.recebimento;

  const openForm = () => {
    setValor(String(pagamento.saldo));
    setForma("dinheiro");
    setObservacao("");
    setOpen(true);
  };
  const cancelar = () => {
    setOpen(false);
    setValor("");
    setObservacao("");
  };

  if (semTotal) {
    return (
      <div style={box}>
        <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5 }}>
          {previaNaoMaterializada
            ? "O valor em “Total da OS” ainda é uma prévia. Gere e aprove um orçamento real antes de receber."
            : "Esta OS não tem valor a cobrar. Gere e aprove o orçamento antes de receber."}
        </div>
        {previaNaoMaterializada && (
          <div style={{ fontSize: 10.5, color: C.subtle, marginTop: 6, lineHeight: 1.5 }}>
            Nenhuma cobrança foi feita — o recebimento só fica disponível depois que o orçamento for materializado e aprovado.
          </div>
        )}
      </div>
    );
  }

  if (quitado) {
    return (
      <div style={box}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 11.5, color: C.muted }}>Recebimento desta OS</span>
          <span style={{ height: 21, padding: "0 9px", display: "inline-flex", alignItems: "center", background: C.successBg, color: C.successFg, borderRadius: 999, fontSize: 11, fontWeight: 600 }}>✓ Quitado</span>
        </div>
      </div>
    );
  }

  if (!caixaAberto) {
    return (
      <div style={box}>
        <div style={{ fontSize: 11.5, color: C.warnFg, lineHeight: 1.5, fontWeight: 500 }}>
          Caixa fechado — abra o caixa no PDV/Caixa antes de receber esta OS.
        </div>
        <div style={{ fontSize: 10.5, color: C.subtle, marginTop: 5 }}>Saldo a receber: {fmt(pagamento.saldo)}</div>
      </div>
    );
  }

  if (!open) {
    return (
      <div style={box}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, color: C.muted }}>Saldo a receber: <b style={{ color: C.warnFg }}>{fmt(pagamento.saldo)}</b></span>
          <button type="button" onClick={openForm} style={{ ...btnPrimary, height: 32, padding: "0 14px", fontSize: 12 }}>Receber pagamento</button>
        </div>
      </div>
    );
  }

  const veredito = validarRecebimentoV3(num(valor), pagamento.saldo);
  const podeConfirmar = veredito.ok && !pdv.recebendo;

  const onConfirmar = async () => {
    if (!podeConfirmar || !pdv.sessao?.sessaoId) return;
    const ok = await pdv.receber({
      valor: num(valor),
      forma,
      sessaoId: pdv.sessao.sessaoId,
      observacao: observacao.trim() || undefined,
    });
    if (ok) {
      cancelar();
      v.openRecibo();
    }
  };

  return (
    <div style={box}>
      <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 9 }}>Saldo a receber: <b style={{ color: C.warnFg }}>{fmt(pagamento.saldo)}</b></div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 8, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 10, color: C.subtle, marginBottom: 3 }}>Valor a receber</div>
          <input
            type="text"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="0,00"
            style={{ ...cellInput, width: "100%" }}
          />
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.subtle, marginBottom: 3 }}>Forma de pagamento</div>
          <select value={forma} onChange={(e) => setForma(e.target.value as FormaRecebimentoV3)} style={{ ...cellInput, width: "100%", cursor: "pointer" }}>
            {FORMAS_SUPORTADAS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: 9 }}>
        <div style={{ fontSize: 10, color: C.subtle, marginBottom: 3 }}>Observação (opcional)</div>
        <input
          type="text"
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          maxLength={200}
          placeholder="Ex.: sinal para retirar peça"
          style={{ ...cellInput, width: "100%" }}
        />
      </div>
      {valor.trim() !== "" && !veredito.ok && (
        <div style={{ fontSize: 11, color: C.dangerFg, marginBottom: 9 }}>{veredito.motivo}</div>
      )}
      {pdv.error && <div style={{ fontSize: 11, color: C.dangerFg, marginBottom: 9 }}>{pdv.error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={onConfirmar}
          disabled={!podeConfirmar}
          style={{ ...btnPrimary, flex: 1, cursor: podeConfirmar ? "pointer" : "default", opacity: podeConfirmar ? 1 : 0.6 }}
        >
          {pdv.recebendo ? "Confirmando…" : "Confirmar recebimento"}
        </button>
        <button type="button" onClick={cancelar} disabled={pdv.recebendo} style={{ ...btnGhost, flex: "none" }}>Cancelar</button>
      </div>
    </div>
  );
}
