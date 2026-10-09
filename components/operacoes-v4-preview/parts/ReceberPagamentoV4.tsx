/** UI V4 sobre receber/registrarMisto do hook V3: imediato e crédito no mesmo sheet. */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { C, fmt } from "../tokens";
import type { V4Vals } from "../use-v4-preview";
import { RealActionNotice } from "./RealActionNotice";
import sheetStyles from "./receber-pagamento.module.css";
import { FORMAS_RECEBIMENTO_V3 } from "@/lib/operacoes-v3/payment-model";
import {
  deCentavosV3, formatarVencimentoV3, hojeLojaV3, rotuloBotaoRecebimentoMistoV3,
  sugestaoAPrazoCentavosV3, SITUACAO_PARCIAL_A_PRAZO_V3, SITUACAO_INTEGRAL_A_PRAZO_V3,
} from "@/lib/operacoes-v3/recebimento-misto-model";
import { avaliarRecebimentoV4, buildRecebimentoMistoV4, INTENCOES_RECEBIMENTO_V4, valorSugeridoRecebimentoV4, type IntencaoRecebimentoV4, type LinhaRecebimentoV4 } from "@/lib/operacoes-v4/receber-pagamento-form";
import { pagamentoEmConferenciaV4, situacaoAtendimentoDe } from "@/lib/operacoes-v4/situacao-atendimento-v4";

const box = { marginTop: 0, padding: 11, border: `1px solid ${C.line2}`, borderRadius: 9, background: C.surface2 } as const;
const cellInput: React.CSSProperties = { height: 32, padding: "0 10px", border: `1px solid ${C.inputBd}`, borderRadius: 7, fontSize: 12.5, color: C.body, background: C.surface };
const btnPrimary: React.CSSProperties = { minHeight: 34, padding: "7px 16px", border: "none", background: C.primary, color: C.white, borderRadius: 8, fontSize: 12.5, fontWeight: 600 };
const btnGhost: React.CSSProperties = { minHeight: 34, padding: "7px 14px", border: `1px solid ${C.inputBd2}`, background: C.surface, color: C.body, borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer" };
const btnGhostSm: React.CSSProperties = { ...btnGhost, minHeight: 32, padding: "6px 9px", fontSize: 10.5 };
const FORMAS = [...FORMAS_RECEBIMENTO_V3.filter((f) => f.suportada).map(({ value, label }) => ({ value, label })), { value: "a_prazo" as const, label: "A prazo / crediário" }];
const valorStr = (centavos: number) => deCentavosV3(centavos).toFixed(2).replace(".", ",");

function APrazoResumo({ amount, dueAt }: { amount: number; dueAt: string | null }) {
  return <div data-testid="a-prazo-persistido" style={{ background: C.infoBg, border: `1px solid ${C.infoBd}`, borderRadius: 9, padding: "9px 11px", marginBottom: 12, fontSize: 11.5, color: C.infoFg }}>
    <b>Saldo a prazo: {fmt(amount)}</b><div>Vencimento: {formatarVencimentoV3(dueAt)}</div>
  </div>;
}

/**
 * `somenteSheet` (GOAL OPS-V4-FLUXO-CURTO-006): o MESMO componente/contrato,
 * hospedado na etapa Entrega só para abrir o sheet ali (`v.openReceberPagamentoAqui`)
 * — sem o card inline do Financeiro e sem nenhuma regra nova.
 */
export function ReceberPagamentoV4({ v, somenteSheet = false }: { v: V4Vals; somenteSheet?: boolean }) {
  if (!v.osSelected) return null;
  return <ReceberPagamentoFormV4 key={v.recebimentoContextKey} v={v} somenteSheet={somenteSheet} />;
}

function ReceberPagamentoFormV4({ v, somenteSheet }: { v: V4Vals; somenteSheet: boolean }) {
  const pdv = v.pdvServico;
  const [open, setOpen] = useState(false);
  const [linhas, setLinhas] = useState<LinhaRecebimentoV4[]>([]);
  const [observacao, setObservacao] = useState("");
  const [intencao, setIntencao] = useState<IntencaoRecebimentoV4>("quitacao");
  const [vencimento, setVencimento] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ativo = useRef(true);
  const envio = useRef(false);
  const sheet = useRef<HTMLDivElement>(null);
  const projection = v.financial.projection;
  const saldo = projection?.balance ?? (projection?.financialStatus === "CHARGE_NOT_CREATED" ? projection.expectedTotal : 0) ?? 0;
  const pendencia = pdv.pendenciaMisto;
  const formAberto = open || v.receberPagamentoOpen;
  const busy = enviando || pdv.recebendo || !!pdv.registrandoMisto;
  const travado = busy || !!pendencia;
  const seedForm = useCallback(() => {
    const p = pendencia?.input;
    setLinhas(p ? [...p.pagamentosAgora.map((l) => ({ forma: l.forma, valorStr: String(l.valor) })), { forma: "a_prazo", valorStr: String(p.saldoAPrazo.valor) }] : [{ forma: "pix", valorStr: saldo > 0 ? String(saldo) : "" }]);
    setVencimento(p?.saldoAPrazo.vencimento ?? "");
    setObservacao(p?.observacao ?? "");
    setIntencao(p?.intencao ?? "quitacao");
    setErro(null);
  }, [pendencia, saldo]);
  useEffect(() => { ativo.current = true; setMounted(true); return () => { ativo.current = false; }; }, []);
  useEffect(() => {
    if (v.receberPagamentoOpen && !open && !v.financial.loading && !v.financial.error && projection?.expectedTotal != null) { seedForm(); setOpen(true); }
  }, [v.receberPagamentoOpen, open, v.financial.loading, v.financial.error, projection?.expectedTotal, seedForm]);
  // Hospedado na Entrega: só um estado TERMINAL (quitada por outra sessão ou sem
  // valor a cobrar) encerra o pedido de abertura. Leitura bloqueada/inconsistente
  // ou em releitura após uma recusa só esconde o sheet: rascunho e mensagem ficam
  // e voltam com a leitura (mesma regra do Financeiro).
  const nadaAReceber = !!projection && !pendencia && (v.recebimento.semTotal || v.recebimento.quitado);
  useEffect(() => {
    if (somenteSheet && formAberto && !busy && !v.financial.loading && nadaAReceber) { setOpen(false); v.closeReceberPagamento(); }
  }, [somenteSheet, formAberto, busy, v.financial.loading, nadaAReceber, v]);
  // Teclado: toda vez que o sheet (re)aparece — inclusive depois de sumir numa
  // releitura — o foco entra nele, para Tab/Escape funcionarem. O controle de
  // origem é guardado na PRIMEIRA aparição e recebe o foco de volta no fechamento.
  const origemFoco = useRef<Element | null>(null);
  const sheetRef = useCallback((el: HTMLDivElement | null) => {
    sheet.current = el;
    if (!el) return;
    if (!origemFoco.current) origemFoco.current = document.activeElement;
    if (el.contains(document.activeElement)) return;
    // Com uma operação ainda em voo os controles estão desabilitados: o foco vai ao
    // próprio sheet (tabIndex -1), que segue recebendo Tab/Escape quando liberar.
    (el.querySelector<HTMLElement>("select:not(:disabled), input:not(:disabled), button:not(:disabled)") ?? el).focus();
  }, []);
  useEffect(() => {
    if (!formAberto) return;
    return () => {
      const origem = origemFoco.current;
      origemFoco.current = null;
      if (origem instanceof HTMLElement && origem.isConnected) origem.focus();
    };
  }, [formAberto]);

  const cancelar = () => { setOpen(false); v.closeReceberPagamento(); };
  const openForm = () => { seedForm(); setOpen(true); };
  // Hospedado na Entrega: nada inline — só o sheet quando aberto e pronto (a
  // mesma instância mantém o rascunho vivo durante a releitura após recusa).
  if (somenteSheet && (!formAberto || v.financial.loading || v.financial.error || !projection || projection.expectedTotal == null || pdv.loading)) return null;
  if (v.financial.loading) return <div style={box}>Carregando projeção financeira…</div>;
  if (v.financial.error || !projection || projection.expectedTotal == null) return <div style={box}>Recebimento bloqueado: situação financeira indisponível ou incompleta.</div>;
  const pagamento = { total: projection.expectedTotal, recebido: projection.receivedTotal ?? 0, saldo };
  const authorizedCredit = projection.financialStatus === "AUTHORIZED_CREDIT";
  const creditInstallment = authorizedCredit ? projection.installments[0] ?? null : null;
  const { semTotal, previaNaoMaterializada, quitado, caixaAberto } = v.recebimento;

  if (!pendencia && semTotal) return <div style={box}>{previaNaoMaterializada ? "O valor em “Total da OS” ainda é uma prévia. Gere e aprove um orçamento real antes de receber." : "Esta OS não tem valor a cobrar. Gere e aprove o orçamento antes de receber."}</div>;
  // GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001: "quitado" legado com histórico que a
  // leitura estrita não comprova não é mostrado como quitação.
  if (!pendencia && quitado && pagamentoEmConferenciaV4(situacaoAtendimentoDe(v))) {
    return <div style={box}>Sem ação de recebimento enquanto o histórico do título está em conferência.</div>;
  }
  if (!pendencia && quitado) return <div style={box}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span>Recebimento desta OS</span><b style={{ color: C.successFg }}>Quitado</b></div>
    {!v.entrega.entregue && <div style={{ marginTop: 9 }}><span style={{ fontSize: 11, color: C.subtle }}>OS pronta e paga — falta confirmar a entrega.</span> <button type="button" onClick={v.goEntrega} style={btnGhost}>Ir para Entrega →</button></div>}
  </div>;
  // GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001: título VERIFICADO e liquidado não é
  // "recebimento bloqueado" — não há nada a receber; o que falta (comercial) é outra coisa.
  const situacao = situacaoAtendimentoDe(v);
  if (!pendencia && !projection.canReceive && situacao.pagamento.verificavel && situacao.pagamento.liquidado) {
    return <div style={box}>Nada a receber — título liquidado ({fmt(situacao.pagamento.recebidoLiquido ?? 0)}).</div>;
  }
  if (!pendencia && !projection.canReceive && projection.financialStatus !== "CHARGE_NOT_CREATED") return <div style={box}>Recebimento bloqueado: {projection.consistencyIssues[0] ?? "revise a cobrança desta OS."}</div>;
  if (pdv.loading) return <div style={box}>Carregando sessão de caixa…</div>;

  const credito = authorizedCredit ? <APrazoResumo amount={creditInstallment?.amount ?? pagamento.saldo} dueAt={creditInstallment?.dueAt ?? null} /> : null;
  if (!formAberto) return <div style={box}>
    {credito}
    {!caixaAberto && <div style={{ fontSize: 11.5, color: C.warnFg, marginBottom: 9 }}>Caixa fechado — o recebimento imediato exige caixa aberto. Você pode formalizar 100% a prazo.</div>}
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 11.5, color: C.muted }}>Saldo a receber: <b style={{ color: C.warnFg }}>{fmt(pagamento.saldo)}</b></span>
      <button type="button" onClick={openForm} style={btnPrimary}>{pendencia ? "Verificar registro pendente" : `Receber ${fmt(pagamento.saldo)}`}</button>
    </div>
  </div>;

  const rascunho = avaliarRecebimentoV4({ linhas, saldo: pagamento.saldo, vencimento, intencao, caixaAberto: caixaAberto && !!pdv.sessao?.sessaoId, aPrazoExistente: authorizedCredit });
  const receberAgora = deCentavosV3(rascunho.receberAgoraCentavos);
  const deixarAPrazo = deCentavosV3(rascunho.aPrazoCentavos);
  const saldoRestante = Math.max(0, pagamento.saldo - receberAgora);
  const podeConfirmar = !busy && (!!pendencia || (rascunho.ok && (!rascunho.temAPrazo || !!pdv.registrarMisto)));
  const usarRestante = (i: number) => setLinhas((arr) => arr.map((l, idx) => idx === i ? { ...l, valorStr: valorStr(sugestaoAPrazoCentavosV3(arr, i, pagamento.saldo)) } : l));
  const escolherForma = (i: number, value: string) => {
    const forma = FORMAS.find((f) => f.value === value)?.value;
    if (!forma) return;
    setLinhas((arr) => arr.map((l, idx) => idx === i ? { forma, valorStr: forma === "a_prazo" ? valorStr(sugestaoAPrazoCentavosV3(arr, i, pagamento.saldo)) : l.valorStr } : l));
  };
  const escolherIntencao = (next: IntencaoRecebimentoV4) => {
    setIntencao(next);
    if (next === "quitacao" && !rascunho.temAPrazo) setLinhas([{ forma: linhas[0]?.forma ?? "pix", valorStr: String(valorSugeridoRecebimentoV4(next, pagamento.saldo)) }]);
  };
  const onConfirmar = async () => {
    if (!podeConfirmar || envio.current) return;
    envio.current = true; setEnviando(true); setErro(null);
    try {
      if (pendencia || rascunho.temAPrazo) {
        if (!pdv.registrarMisto) return;
        // Pendência do hook é a confirmação original, mesmo se saldo/data/caixa mudaram.
        const resultado = await pdv.registrarMisto(pendencia?.input ?? buildRecebimentoMistoV4({ rascunho, saldo: pagamento.saldo, vencimento, sessaoId: pdv.sessao?.sessaoId, intencao, observacao }));
        if (!ativo.current) return;
        if (resultado.status === "ok") { cancelar(); v.openRecibo(); }
        else if (resultado.status === "incerto" || resultado.status === "recusado") setErro(resultado.mensagem);
      } else {
        if (!pdv.sessao?.sessaoId) return;
        const linhasValidas = rascunho.pagamentosAgora;
        const ok = await pdv.receber({ linhas: linhasValidas, sessaoId: pdv.sessao.sessaoId, intencao: intencao === "quitacao" ? undefined : intencao, observacao: observacao.trim() || undefined });
        if (ativo.current && ok) { cancelar(); v.openRecibo(); }
      }
    } catch {
      if (ativo.current) setErro("Não foi possível confirmar o registro. Confira a mensagem do recebimento antes de reenviar.");
    } finally {
      envio.current = false;
      if (ativo.current) setEnviando(false);
    }
  };

  if (!mounted) return null;
  return createPortal(
    <div className={sheetStyles.overlay} role="dialog" aria-modal="true" aria-labelledby="receber-os-title">
      <div ref={sheetRef} tabIndex={-1} className={sheetStyles.sheet} onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) { e.preventDefault(); cancelar(); }
        if (e.key !== "Tab") return;
        const itens = sheet.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]');
        // Sem controle habilitado (operação em voo), o foco fica no próprio sheet.
        if (!itens?.length) { e.preventDefault(); return; }
        const primeiro = itens[0], ultimo = itens[itens.length - 1];
        if (document.activeElement === sheet.current) { e.preventDefault(); (e.shiftKey ? ultimo : primeiro).focus(); }
        else if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
      }}>
        <div className={sheetStyles.head}>
          <div id="receber-os-title" style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>Receber pagamento</div>
          <button type="button" aria-label="Fechar recebimento" onClick={cancelar} disabled={busy} style={btnGhostSm}>×</button>
        </div>
        <div className={sheetStyles.body}>
          <RealActionNotice kind={rascunho.temAPrazo && receberAgora === 0 ? "aPrazo" : "pagamento"} />
          {credito}
          <div style={{ fontSize: 10, color: C.subtle }}>Saldo da OS</div>
          <div className={sheetStyles.money} style={{ fontSize: 22, fontWeight: 700, color: C.warnFg, marginBottom: 12 }}>{fmt(pagamento.saldo)}</div>
          <div style={{ fontSize: 10, color: C.subtle, marginBottom: 6 }}>Tipo</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {INTENCOES_RECEBIMENTO_V4.filter((item) => !rascunho.temAPrazo || item.value !== "quitacao").map((item) => <button key={item.value} type="button" disabled={travado} aria-pressed={intencao === item.value || (rascunho.temAPrazo && intencao === "quitacao" && item.value === "parcial")} onClick={() => escolherIntencao(item.value)} style={btnGhostSm}>{item.label}</button>)}
          </div>
          {rascunho.temAPrazo && <div style={{ fontSize: 11.5, color: C.infoFg, marginBottom: 9 }}>{receberAgora > 0 ? SITUACAO_PARCIAL_A_PRAZO_V3 : SITUACAO_INTEGRAL_A_PRAZO_V3}</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
            {linhas.map((l, i) => <div key={i} className={sheetStyles.linha}>
              <label style={{ fontSize: 10, color: C.subtle }}>Forma {i + 1}
                <select aria-label={`Forma da linha ${i + 1}`} value={l.forma} disabled={travado} onChange={(e) => escolherForma(i, e.target.value)} style={{ ...cellInput, width: "100%" }}>
                  {FORMAS.map((f) => <option key={f.value} value={f.value} disabled={f.value === "a_prazo" && (authorizedCredit || (l.forma !== "a_prazo" && rascunho.temAPrazo))}>{f.label}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 10, color: C.subtle }}>Valor
                <input aria-label={`Valor da linha ${i + 1}`} type="text" inputMode="decimal" value={l.valorStr} disabled={travado} onChange={(e) => setLinhas((arr) => arr.map((x, idx) => idx === i ? { ...x, valorStr: e.target.value } : x))} className={sheetStyles.money} style={{ ...cellInput, width: "100%" }} />
              </label>
              <div className={sheetStyles.linhaActions}>
                <button type="button" disabled={travado} onClick={() => usarRestante(i)} style={btnGhostSm}>Usar restante</button>
                <button type="button" aria-label={`Remover forma ${i + 1}`} disabled={travado || linhas.length <= 1} onClick={() => setLinhas((arr) => arr.filter((_, idx) => idx !== i))} style={btnGhostSm}>×</button>
              </div>
            </div>)}
          </div>
          <button type="button" disabled={travado} onClick={() => setLinhas((arr) => [...arr, { forma: "pix", valorStr: valorStr(sugestaoAPrazoCentavosV3(arr, -1, pagamento.saldo)) }])} style={{ ...btnGhost, marginBottom: 9 }}>+ Dividir pagamento</button>
          {rascunho.temAPrazo && <div style={{ marginBottom: 9 }}>
            <label style={{ fontSize: 11, color: C.subtle }}>Vencimento da parte a prazo
              <input aria-label="Vencimento da parte a prazo" type="date" min={hojeLojaV3()} value={vencimento} disabled={travado} onChange={(e) => setVencimento(e.target.value)} style={{ ...cellInput, width: "100%" }} />
            </label>
            <div style={{ fontSize: 10.5, color: C.infoFg, marginTop: 5 }}>Crédito da loja com um vencimento. O valor a prazo não é recebido agora.</div>
          </div>}
          <div data-testid="resumo-misto" aria-live="polite" style={{ fontSize: 11.5, display: "flex", flexDirection: "column", gap: 4, borderTop: `1px solid ${C.line2}`, paddingTop: 9, marginBottom: 9 }}>
            {[["Total da OS", pagamento.total], ["Já recebido", pagamento.recebido], ["Receber agora", receberAgora], ["Deixar a prazo", deixarAPrazo], ["Saldo em aberto", saldoRestante]].map(([label, value]) => <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span>{label}</span><b className={sheetStyles.money}>{fmt(Number(value))}</b></div>)}
            {rascunho.temAPrazo && rascunho.restanteCentavos > 0 && <div style={{ color: C.warnFg }}>Ainda falta distribuir: {fmt(deCentavosV3(rascunho.restanteCentavos))}</div>}
          </div>
          <label style={{ fontSize: 10, color: C.subtle }}>Observação (opcional)
            <input aria-label="Observação (opcional)" type="text" value={observacao} disabled={travado} onChange={(e) => setObservacao(e.target.value)} maxLength={200} style={{ ...cellInput, width: "100%" }} />
          </label>
          {!pendencia && rascunho.erros.map((mensagem) => <div key={mensagem} role="alert" style={{ fontSize: 11, color: C.dangerFg, marginTop: 8 }}>{mensagem}</div>)}
          {!caixaAberto && receberAgora > 0 && !pendencia && <a href="/dashboard/vendas" style={{ display: "inline-block", color: C.primary, marginTop: 8, fontSize: 11 }}>Abrir Caixa</a>}
          {(erro || pdv.error || pendencia) && <div role="alert" style={{ fontSize: 11, color: C.dangerFg, marginTop: 9 }}>{erro ?? pdv.error ?? "Resultado ainda desconhecido. Reenvie a mesma confirmação para verificar o registro."}</div>}
        </div>
        <div className={sheetStyles.footer}>
          <button type="button" onClick={() => void onConfirmar()} disabled={!podeConfirmar} style={{ ...btnPrimary, flex: 1, cursor: podeConfirmar ? "pointer" : "default", opacity: podeConfirmar ? 1 : 0.6 }}>
            {busy ? "Confirmando…" : pendencia ? "Reenviar mesma confirmação" : rascunho.temAPrazo ? rotuloBotaoRecebimentoMistoV3(rascunho.receberAgoraCentavos, rascunho.aPrazoCentavos) : `Confirmar ${fmt(receberAgora)}`}
          </button>
          <button type="button" onClick={cancelar} disabled={busy} style={btnGhost}>Cancelar</button>
        </div>
      </div>
    </div>, document.body,
  );
}
