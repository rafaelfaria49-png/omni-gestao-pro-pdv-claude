/**
 * Operações V4 — recebimento real da OS (slice PDV-SERVICO-OS-RECEBIMENTO-REAL-001).
 * GOAL OPS-V4-RECEBER-SPLIT-PARIDADE-002: paridade com o split imediato que a V3
 * já expõe — múltiplas formas (dinheiro/PIX/débito/crédito) num único recebimento.
 *
 * UI fina sobre o motor único da V3: lê/escreve por `v.pdvServico`
 * (`usePdvServicoV3` → `receberOSV3`/`lerPagamentoOSV3`, sem motor novo). Exige
 * sessão de caixa ABERTA (nunca abre caixa por aqui); permite valor parcial
 * (validado pelo mesmo `validarSplitV3` da V3); só usa formas já suportadas
 * pelo contrato real. Sem estoque, sem venda, sem services financeiros
 * diretos — tudo passa por `receberOSV3`.
 *
 * As formas ainda não suportadas seguem fora do split imediato (`suportada: false`
 * em `FORMAS_RECEBIMENTO_V3`, inalterado). GOAL OPS-V4-RECEBIMENTO-A-PRAZO-MINIMO-006
 * adiciona um caminho SEPARADO — "Lançar a prazo" (`v.lancarAPrazo`) — que NÃO é
 * recebimento: formaliza o saldo como Conta a Receber pendente (vencimento) e
 * autoriza a entrega, sem exigir caixa aberto e sem mover dinheiro nenhum.
 */
"use client";

import { useState } from "react";
import { C, fmt } from "../tokens";
import type { V4Vals } from "../use-v4-preview";
import { RealActionNotice } from "./RealActionNotice";
import {
  FORMAS_RECEBIMENTO_V3,
  somaSplitV3,
  validarSplitV3,
  type APrazoV3,
  type FormaRecebimentoV3,
  type SplitLinhaV3,
} from "@/lib/operacoes-v3/payment-model";

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

const btnGhostSm: React.CSSProperties = {
  ...btnGhost,
  height: 32,
  padding: "0 9px",
  fontSize: 10.5,
};

const FORMAS_SUPORTADAS = FORMAS_RECEBIMENTO_V3.filter((f) => f.suportada);

function num(s: string): number {
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

type LinhaDraft = { forma: FormaRecebimentoV3; valorStr: string };

function linhaVazia(valorStr = ""): LinhaDraft {
  return { forma: "pix", valorStr };
}

function fmtDataBR(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-BR");
}

/** Resumo persistente da autorização "a prazo" — nunca mostra como recebido/quitado. */
function APrazoResumo({ aPrazo }: { aPrazo: APrazoV3 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, background: C.infoBg, border: `1px solid ${C.infoBd}`, borderRadius: 9, padding: "9px 11px", marginBottom: 12 }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: C.infoFg }}>Conta a receber criada — lançamento a prazo</span>
      <span style={{ fontSize: 11, color: C.infoFg }}>Valor: {fmt(aPrazo.valor)} · Vencimento: {fmtDataBR(aPrazo.vencimento)}</span>
      <span style={{ fontSize: 10.5, color: C.infoFg }}>Esta operação não movimentou caixa.</span>
    </div>
  );
}

export function ReceberPagamentoV4({ v }: { v: V4Vals }) {
  const pdv = v.pdvServico;
  const [open, setOpen] = useState(false);
  const [linhas, setLinhas] = useState<LinhaDraft[]>([{ forma: "dinheiro", valorStr: "" }]);
  const [observacao, setObservacao] = useState("");
  const [openAPrazo, setOpenAPrazo] = useState(false);
  const [vencimento, setVencimento] = useState("");
  const [obsAPrazo, setObsAPrazo] = useState("");
  const [busyAPrazo, setBusyAPrazo] = useState(false);
  const [erroAPrazo, setErroAPrazo] = useState<string | null>(null);

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
    setLinhas([{ forma: "dinheiro", valorStr: String(pagamento.saldo) }]);
    setObservacao("");
    setOpen(true);
    setOpenAPrazo(false);
  };
  const cancelar = () => {
    setOpen(false);
    setLinhas([{ forma: "dinheiro", valorStr: "" }]);
    setObservacao("");
  };
  const openFormAPrazo = () => {
    setVencimento("");
    setObsAPrazo("");
    setErroAPrazo(null);
    setOpenAPrazo(true);
    setOpen(false);
  };
  const cancelarAPrazo = () => {
    setOpenAPrazo(false);
    setVencimento("");
    setObsAPrazo("");
    setErroAPrazo(null);
  };
  const lancarAPrazoSubmit = async () => {
    if (busyAPrazo || !vencimento.trim()) return;
    setBusyAPrazo(true);
    setErroAPrazo(null);
    try {
      const ok = await v.lancarAPrazo({ vencimento: vencimento.trim(), observacao: obsAPrazo.trim() || undefined });
      if (ok) cancelarAPrazo();
      else setErroAPrazo("Não foi possível lançar a prazo.");
    } finally {
      setBusyAPrazo(false);
    }
  };

  if (openAPrazo) {
    const podeConfirmarAPrazo = vencimento.trim().length > 0 && !busyAPrazo;
    return (
      <div style={box}>
        <RealActionNotice kind="aPrazo" tone="warn" />
        <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 9 }}>Valor a lançar: <b style={{ color: C.warnFg }}>{fmt(pagamento.saldo)}</b></div>
        <div style={{ marginBottom: 9 }}>
          <div style={{ fontSize: 10, color: C.subtle, marginBottom: 3 }}>Vencimento *</div>
          <input
            type="date"
            value={vencimento}
            onChange={(e) => setVencimento(e.target.value)}
            style={{ ...cellInput, width: "100%" }}
          />
        </div>
        <div style={{ marginBottom: 9 }}>
          <div style={{ fontSize: 10, color: C.subtle, marginBottom: 3 }}>Observação (opcional)</div>
          <input
            type="text"
            value={obsAPrazo}
            onChange={(e) => setObsAPrazo(e.target.value)}
            maxLength={200}
            placeholder="Ex.: cliente combinou pagar dia 10"
            style={{ ...cellInput, width: "100%" }}
          />
        </div>
        <div style={{ fontSize: 10.5, color: C.subtle, marginBottom: 9, lineHeight: 1.5 }}>
          Não entra dinheiro no caixa agora. Será criada uma conta a receber para o cliente.
        </div>
        {erroAPrazo && <div style={{ fontSize: 11, color: C.dangerFg, marginBottom: 9 }}>{erroAPrazo}</div>}
        {pdv.error && <div style={{ fontSize: 11, color: C.dangerFg, marginBottom: 9 }}>{pdv.error}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => void lancarAPrazoSubmit()}
            disabled={!podeConfirmarAPrazo}
            style={{ ...btnPrimary, flex: 1, cursor: podeConfirmarAPrazo ? "pointer" : "default", opacity: podeConfirmarAPrazo ? 1 : 0.6 }}
          >
            {busyAPrazo ? "Lançando…" : "Lançar a prazo e liberar entrega"}
          </button>
          <button type="button" onClick={cancelarAPrazo} disabled={busyAPrazo} style={{ ...btnGhost, flex: "none" }}>Cancelar</button>
        </div>
      </div>
    );
  }

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
        {/* GOAL OPS-V4-ENTREGA-REAL-E-CTA-QUITADO-008: só navega — a ação real de
            entrega vive no botão dedicado da aba Entrega (v.confirmarEntrega). */}
        {!v.entrega.entregue && (
          <div style={{ marginTop: 9, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: C.subtle }}>OS pronta e paga — falta confirmar a entrega.</span>
            <button type="button" onClick={v.goEntrega} style={{ ...btnGhost, height: 30, padding: "0 12px", fontSize: 11.5 }}>Ir para Entrega →</button>
          </div>
        )}
      </div>
    );
  }

  if (!caixaAberto) {
    return (
      <div style={box}>
        {v.aPrazo && <APrazoResumo aPrazo={v.aPrazo} />}
        <div style={{ fontSize: 11.5, color: C.warnFg, lineHeight: 1.5, fontWeight: 500 }}>
          Caixa fechado — abra o caixa no PDV/Caixa antes de receber esta OS.
        </div>
        <div style={{ fontSize: 10.5, color: C.subtle, marginTop: 5, marginBottom: 9 }}>Saldo a receber: {fmt(pagamento.saldo)}</div>
        {/* "A prazo" NÃO exige caixa aberto — não movimenta caixa. */}
        {!v.aPrazo && (
          <button type="button" onClick={openFormAPrazo} style={{ ...btnGhost, height: 30, padding: "0 12px", fontSize: 11.5 }}>📄 Lançar a prazo</button>
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <div style={box}>
        {v.aPrazo && <APrazoResumo aPrazo={v.aPrazo} />}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, color: C.muted }}>Saldo a receber: <b style={{ color: C.warnFg }}>{fmt(pagamento.saldo)}</b></span>
          <div style={{ display: "flex", gap: 8 }}>
            {!v.aPrazo && (
              <button type="button" onClick={openFormAPrazo} style={{ ...btnGhost, height: 32, padding: "0 12px", fontSize: 11.5 }}>Lançar a prazo</button>
            )}
            <button type="button" onClick={openForm} style={{ ...btnPrimary, height: 32, padding: "0 14px", fontSize: 12 }}>Receber pagamento</button>
          </div>
        </div>
      </div>
    );
  }

  // Linha com valor <= 0 bloqueia a confirmação mesmo que outras linhas sejam
  // válidas — evita enviar um split com uma forma "esquecida" em branco.
  const algumaLinhaInvalida = linhas.some((l) => !(num(l.valorStr) > 0));
  const linhasValidas: SplitLinhaV3[] = linhas
    .map((l) => ({ forma: l.forma, valor: num(l.valorStr) }))
    .filter((l) => l.valor > 0);
  const totalInformado = somaSplitV3(linhasValidas);
  const saldoRestante = Math.max(0, pagamento.saldo - totalInformado);
  const veredito = validarSplitV3(linhasValidas, pagamento.saldo);
  const podeConfirmar = veredito.ok && !algumaLinhaInvalida && !pdv.recebendo;

  const addLinha = () => {
    const restanteAtual = Math.max(0, pagamento.saldo - totalInformado);
    setLinhas((arr) => [...arr, linhaVazia(restanteAtual > 0 ? String(restanteAtual) : "")]);
  };
  const removeLinha = (i: number) => {
    setLinhas((arr) => (arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr));
  };
  const usarRestante = (i: number) => {
    setLinhas((arr) => {
      const outros = arr.reduce((acc, l, idx) => (idx === i ? acc : acc + Math.max(0, num(l.valorStr))), 0);
      const restante = Math.max(0, money2(pagamento.saldo - outros));
      return arr.map((l, idx) => (idx === i ? { ...l, valorStr: restante > 0 ? String(restante) : "" } : l));
    });
  };

  const onConfirmar = async () => {
    if (!podeConfirmar || !pdv.sessao?.sessaoId) return;
    const ok = await pdv.receber({
      linhas: linhasValidas,
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
      <RealActionNotice kind="pagamento" />
      <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 9 }}>Saldo a receber: <b style={{ color: C.warnFg }}>{fmt(pagamento.saldo)}</b></div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
        {linhas.map((l, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr) auto auto", gap: 6, alignItems: "end" }}>
            <div>
              {i === 0 && <div style={{ fontSize: 10, color: C.subtle, marginBottom: 3 }}>Forma</div>}
              <select
                value={l.forma}
                onChange={(e) => setLinhas((arr) => arr.map((x, idx) => (idx === i ? { ...x, forma: e.target.value as FormaRecebimentoV3 } : x)))}
                style={{ ...cellInput, width: "100%", cursor: "pointer" }}
              >
                {FORMAS_SUPORTADAS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
            <div>
              {i === 0 && <div style={{ fontSize: 10, color: C.subtle, marginBottom: 3 }}>Valor</div>}
              <input
                type="text"
                inputMode="decimal"
                value={l.valorStr}
                onChange={(e) => setLinhas((arr) => arr.map((x, idx) => (idx === i ? { ...x, valorStr: e.target.value } : x)))}
                placeholder="0,00"
                style={{ ...cellInput, width: "100%" }}
              />
            </div>
            <button type="button" onClick={() => usarRestante(i)} style={btnGhostSm}>Usar restante</button>
            <button
              type="button"
              onClick={() => removeLinha(i)}
              disabled={linhas.length <= 1}
              style={{ ...btnGhostSm, opacity: linhas.length <= 1 ? 0.5 : 1, cursor: linhas.length <= 1 ? "default" : "pointer" }}
              aria-label="Remover forma"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <button type="button" onClick={addLinha} style={{ ...btnGhost, marginBottom: 9 }}>+ Adicionar forma</button>

      <div style={{ marginBottom: 9, display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11 }}>
        <span style={{ color: C.subtle }}>Total informado: <b style={{ color: C.body }}>{fmt(totalInformado)}</b></span>
        <span style={{ color: saldoRestante <= 0.009 ? C.successFg : C.warnFg }}>Saldo restante: <b>{fmt(saldoRestante)}</b></span>
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
      {(algumaLinhaInvalida || !veredito.ok) && (
        <div style={{ fontSize: 11, color: C.dangerFg, marginBottom: 9 }}>
          {algumaLinhaInvalida ? "Informe um valor maior que zero em todas as formas adicionadas." : veredito.motivo}
        </div>
      )}
      {pdv.error && <div style={{ fontSize: 11, color: C.dangerFg, marginBottom: 9 }}>{pdv.error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={onConfirmar}
          disabled={!podeConfirmar}
          style={{ ...btnPrimary, flex: 1, cursor: podeConfirmar ? "pointer" : "default", opacity: podeConfirmar ? 1 : 0.6 }}
        >
          {pdv.recebendo ? "Confirmando…" : "Confirmar recebimento real"}
        </button>
        <button type="button" onClick={cancelar} disabled={pdv.recebendo} style={{ ...btnGhost, flex: "none" }}>Cancelar</button>
      </div>
    </div>
  );
}

function money2(v: number): number {
  return Math.round(v * 100) / 100;
}
