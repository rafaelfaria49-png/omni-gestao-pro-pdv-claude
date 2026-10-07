"use client";

// ============================================================================
// Operações V3 — Fase 2A/2B · PDV de Serviço (recebimento REAL da OS)
// ----------------------------------------------------------------------------
// Recebe pagamento de uma OS via serviços financeiros existentes (Conta a
// Receber + Caixa). Exige caixa aberto. Fase 2B: split (várias formas), rótulo
// sinal/entrada/parcial/quitação, comprovante imprimível, estorno auditado e
// avanço de status pós-quitação (Recebida → Entregue). Formas não suportadas
// ficam "a conectar".
// GOAL OPS-V3-RECEBIMENTO-MISTO-A-PRAZO-001: "A prazo / crediário" combina, numa
// única confirmação, o dinheiro recebido agora + o saldo restante a prazo (com
// vencimento) no MESMO título — via `registrarMisto` (uma transação no servidor).
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, CreditCard, Loader2, Lock, Plus, Receipt, RotateCcw, Trash2, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FORMAS_RECEBIMENTO_V3,
  INTENCOES_RECEBIMENTO_V3,
  PAGAMENTO_STATUS_META_V3,
  formaLabelRecebimentoV3,
  lerPagamentoV3,
  somaSplitV3,
  validarRecebimentoV3,
  validarSplitV3,
  type FormaRecebimentoV3,
  type RecebimentoIntencaoV3,
  type SplitLinhaV3,
} from "@/lib/operacoes-v3/payment-model";
import {
  avaliarRascunhoMistoV3,
  formatarCentavosBRLV3,
  formatarVencimentoV3,
  hojeLojaV3,
  parseValorDigitadoV3,
  rotuloBotaoRecebimentoMistoV3,
  sugestaoAPrazoCentavosV3,
  type LinhaRascunhoMistoV3,
} from "@/lib/operacoes-v3/recebimento-misto-model";
import { statusV3FromOS } from "@/lib/operacoes-v3/status-machine";
import { SectionShellV3 } from "../components/SectionShellV3";
import { NoStoreBlockV3 } from "../components/ScreenStateV3";
import { ButtonV3 } from "../components/UiV3";
import { StatusBadgeV3 } from "../components/StatusBadgeV3";
import { ReciboPreviewV3 } from "../components/print/ReciboPreviewV3";
import { useOperacoesV3 } from "../context/OperacoesV3Context";
import { usePdvServicoV3 } from "../hooks/use-pdv-servico-v3";
import { SCREEN_COPY } from "../data/screen-copy";
import { formatBRL } from "../lib/format";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

const TONE_CLS: Record<string, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  warning: "border-warning/30 bg-warning/10 text-warning",
  info: "border-info/30 bg-info/10 text-info",
  success: "border-success/30 bg-success/10 text-success",
};

const FORMAS_SUPORTADAS = FORMAS_RECEBIMENTO_V3.filter((f) => f.suportada);

/** Sentinela de UI: "a prazo" NÃO é forma de dinheiro recebido (nunca vira SplitLinhaV3). */
const A_PRAZO = "a_prazo" as const;
const A_PRAZO_LABEL = "A prazo / crediário";
// "Crediário (a conectar)" do catálogo de formas é substituído pela opção real de a prazo.
const FORMAS_UNICAS_UI = FORMAS_RECEBIMENTO_V3.filter((f) => f.value !== "crediario");

function num(v: string): number {
  const n = Number(v.replace(/[^\d,.-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function centavosParaCampo(centavos: number): string {
  return centavos > 0 ? (centavos / 100).toFixed(2).replace(".", ",") : "";
}

type SplitDraft = { forma: FormaRecebimentoV3 | typeof A_PRAZO; valorStr: string };

export function PdvServicoV3() {
  const { ordens, storeId, selectedOsId, openOS, notificar, reload: reloadLista, mudarStatus } = useOperacoesV3();

  // OS candidatas: não canceladas com algum valor previsto (orçamento ou espelho).
  const cobravel = useMemo(
    () => ordens.filter((o) => statusV3FromOS(o) !== "cancelada" && lerPagamentoV3(o).total > 0),
    [ordens],
  );
  const [osId, setOsId] = useState<string>(selectedOsId ?? "");
  useEffect(() => {
    if (selectedOsId) setOsId(selectedOsId);
  }, [selectedOsId]);

  const os = ordens.find((o) => o.id === osId) ?? null;
  const {
    pagamento,
    sessao,
    loading,
    recebendo,
    estornando,
    error,
    ultimoRecibo,
    reload,
    receber,
    estornar,
    limparRecibo,
    aPrazo,
    registrandoMisto,
    pendenciaMisto,
    registrarMisto,
  } = usePdvServicoV3(storeId, osId || null);

  const [intencao, setIntencao] = useState<RecebimentoIntencaoV3>("parcial");
  const [splitMode, setSplitMode] = useState(false);
  // Forma única ("a_prazo" = todo o saldo a prazo)
  const [forma, setForma] = useState<FormaRecebimentoV3 | typeof A_PRAZO>("dinheiro");
  const [valorStr, setValorStr] = useState("");
  // Split
  const [splitLinhas, setSplitLinhas] = useState<SplitDraft[]>([{ forma: "dinheiro", valorStr: "" }]);
  // Parte a prazo (vencimento obrigatório; observação opcional)
  const [vencimentoAPrazo, setVencimentoAPrazo] = useState("");
  const [obsAPrazo, setObsAPrazo] = useState("");
  // Comprovante
  const [reciboAberto, setReciboAberto] = useState(false);
  // Estorno
  const [motivoEstorno, setMotivoEstorno] = useState("");
  // Loja/OS selecionada AGORA (atualizada no render): a resposta de uma operação iniciada em
  // outra OS só pode mexer no rascunho/recarga desta tela se o alvo ainda for o mesmo.
  const alvoAtual = JSON.stringify([storeId ?? "", osId]);
  const alvoAtualRef = useRef(alvoAtual);
  alvoAtualRef.current = alvoAtual;

  const saldo = pagamento?.saldo ?? 0;

  // Ao trocar de OS / recarregar o saldo, sugere o saldo como valor padrão (forma única).
  useEffect(() => {
    setValorStr(saldo > 0 ? saldo.toFixed(2) : "");
  }, [saldo, osId]);

  // Trocar de OS/loja nunca reaproveita valores digitados para outra OS. Refresh da
  // MESMA OS (Atualizar saldo, recarga) não apaga o que o operador digitou.
  useEffect(() => {
    setSplitLinhas([{ forma: "dinheiro", valorStr: "" }]);
    setForma("dinheiro");
    setVencimentoAPrazo("");
    setObsAPrazo("");
    setReciboAberto(false);
  }, [storeId, osId]);

  if (!storeId) {
    return (
      <SectionShellV3 titulo={SCREEN_COPY["pdv-servico"].titulo} subtitulo={SCREEN_COPY["pdv-servico"].subtitulo}>
        <NoStoreBlockV3 />
      </SectionShellV3>
    );
  }

  const caixaAberto = sessao?.aberta === true;
  const osStatus = os ? statusV3FromOS(os) : null;
  const hoje = hojeLojaV3();

  // Recebimento MISTO: existe linha "A prazo / crediário" (split) ou a forma única é a prazo.
  const temAPrazo = splitMode ? splitLinhas.some((l) => l.forma === A_PRAZO) : forma === A_PRAZO;
  const linhasMisto: LinhaRascunhoMistoV3[] = splitMode
    ? splitLinhas
    : [{ forma: A_PRAZO, valorStr: saldo > 0 ? saldo.toFixed(2) : "" }];
  const misto = temAPrazo ? avaliarRascunhoMistoV3({ linhas: linhasMisto, vencimento: vencimentoAPrazo, saldo, hoje }) : null;
  const precisaCaixaMisto = (misto?.receberAgoraCentavos ?? 0) > 0;
  const podeRegistrarMisto =
    !!os && !!pagamento && !loading && !!misto?.ok && (!precisaCaixaMisto || caixaAberto) && !registrandoMisto && !pendenciaMisto;

  // Linhas de split válidas (number) e validação — caminho IMEDIATO (sem a prazo), inalterado.
  const splitLinhasNum: SplitLinhaV3[] = splitLinhas
    .flatMap((l) => (l.forma === A_PRAZO ? [] : [{ forma: l.forma, valor: num(l.valorStr) }]))
    .filter((l) => l.valor > 0);
  const somaSplit = somaSplitV3(splitLinhasNum);

  const valorUnico = num(valorStr);
  const formaUnica: FormaRecebimentoV3 | null = forma === A_PRAZO ? null : forma;
  const formaUnicaSuportada = FORMAS_RECEBIMENTO_V3.find((f) => f.value === formaUnica)?.suportada ?? false;

  const veredito = splitMode ? validarSplitV3(splitLinhasNum, saldo) : validarRecebimentoV3(valorUnico, saldo);
  const valorAReceber = splitMode ? somaSplit : valorUnico;
  const podeReceber = !temAPrazo && !!os && caixaAberto && (splitMode || formaUnicaSuportada) && veredito.ok && !recebendo;

  /** Captura o alvo ANTES do await; `aindaNoAlvo()` diz se a tela continua nessa loja/OS. */
  const capturarAlvo = () => {
    const alvo = alvoAtual;
    const codigo = os?.codigo ?? os?.id ?? "OS";
    return {
      aindaNoAlvo: () => alvoAtualRef.current === alvo,
      // Mensagem de uma OS que não está mais na tela nomeia a OS de origem.
      notificar: (mensagem: string) => notificar(alvoAtualRef.current === alvo ? mensagem : `${codigo}: ${mensagem}`),
    };
  };

  const onReceber = async () => {
    if (!os || !sessao?.sessaoId || temAPrazo) return;
    if (!splitMode && !formaUnica) return;
    const alvo = capturarAlvo();
    const ok = await receber(
      splitMode
        ? { linhas: splitLinhasNum, sessaoId: sessao.sessaoId, intencao }
        : { valor: valorUnico, forma: formaUnica!, sessaoId: sessao.sessaoId, intencao },
    );
    if (ok) {
      reloadLista();
      alvo.notificar(veredito.op === "liquidar" ? "OS quitada." : "Pagamento registrado.");
      // Reseta os campos de entrada do split (só na MESMA OS); forma única é re-sugerida pelo efeito do saldo.
      if (alvo.aindaNoAlvo()) setSplitLinhas([{ forma: "dinheiro", valorStr: "" }]);
    }
  };

  /** Limpa o rascunho misto — só chamado quando a tela ainda está na OS da operação. */
  const limparRascunhoMisto = () => {
    setSplitLinhas([{ forma: "dinheiro", valorStr: "" }]);
    setForma("dinheiro");
    setVencimentoAPrazo("");
    setObsAPrazo("");
  };

  const onRegistrarMisto = async () => {
    if (!os || !pagamento || !misto?.ok) return;
    const alvo = capturarAlvo();
    const r = await registrarMisto({
      sessaoId: misto.receberAgoraCentavos > 0 ? sessao?.sessaoId : undefined,
      pagamentosAgora: misto.pagamentosAgora,
      saldoAPrazo: { valor: misto.aPrazoCentavos / 100, vencimento: vencimentoAPrazo, observacao: obsAPrazo.trim() || undefined },
      saldoEsperado: saldo,
      intencao,
    });
    if (r.status === "ok") {
      reloadLista();
      const res = r.resultado;
      alvo.notificar(
        res.jaRegistrado
          ? "Esta operação já estava registrada — nada foi lançado de novo."
          : res.valorRecebidoAgora > 0
            ? `Registrado: ${formatBRL(res.valorRecebidoAgora)} recebido + ${formatBRL(res.valorAPrazo)} a prazo.`
            : `Saldo de ${formatBRL(res.valorAPrazo)} formalizado a prazo.`,
      );
      if (alvo.aindaNoAlvo()) limparRascunhoMisto();
    } else if (r.status === "recusado" && r.code === "saldo_divergente" && alvo.aindaNoAlvo()) {
      // Conflito recuperável: relê o saldo real DESTA OS; os valores digitados ficam para revisão.
      reload();
    }
  };

  /** Resultado anterior desconhecido: reenvia a MESMA operação (mesma chave) — o servidor deduplica. */
  const onReenviarPendente = async () => {
    if (!pendenciaMisto) return;
    const alvo = capturarAlvo();
    const { operacaoId: _chave, ...dados } = pendenciaMisto.input;
    void _chave;
    const r = await registrarMisto(dados);
    if (r.status === "ok") {
      reloadLista();
      alvo.notificar(r.resultado.jaRegistrado ? "Confirmado: a operação já estava registrada (sem duplicidade)." : "Operação registrada.");
      if (alvo.aindaNoAlvo()) limparRascunhoMisto();
    }
  };

  /** Escolher "A prazo" numa linha sugere o restante ainda não distribuído. */
  const escolherFormaLinha = (i: number, nova: SplitDraft["forma"]) => {
    setSplitLinhas((arr) =>
      arr.map((x, idx) => {
        if (idx !== i) return x;
        if (nova === A_PRAZO && !(parseValorDigitadoV3(x.valorStr) ?? 0)) {
          return { forma: nova, valorStr: centavosParaCampo(sugestaoAPrazoCentavosV3(arr, i, saldo)) };
        }
        return { ...x, forma: nova };
      }),
    );
  };

  const adicionarLinhaAPrazo = () => {
    setSplitLinhas((arr) => {
      if (arr.some((l) => l.forma === A_PRAZO)) return arr;
      const proximas = [...arr, { forma: A_PRAZO, valorStr: "" } as SplitDraft];
      const i = proximas.length - 1;
      proximas[i] = { forma: A_PRAZO, valorStr: centavosParaCampo(sugestaoAPrazoCentavosV3(proximas, i, saldo)) };
      return proximas;
    });
  };

  const onEstornar = async () => {
    if (!os || !sessao?.sessaoId) return;
    const alvo = capturarAlvo();
    const ok = await estornar({ sessaoId: sessao.sessaoId, motivo: motivoEstorno.trim() || undefined });
    if (ok) {
      reloadLista();
      if (alvo.aindaNoAlvo()) {
        reload();
        setMotivoEstorno("");
      }
      alvo.notificar("Último recebimento estornado.");
    }
  };

  const onAvancarStatus = async (to: "recebida" | "entregue") => {
    if (!os) return;
    const ok = await mudarStatus(os.id, to);
    if (ok) reloadLista();
  };

  const statusMeta = pagamento ? PAGAMENTO_STATUS_META_V3[pagamento.status] : null;
  const quitado = pagamento?.status === "quitado";
  // OS sem valor cobrável (sem orçamento aprovado / sem total): orienta a gerar o orçamento.
  const semValor = !!os && !loading && (pagamento?.total ?? 0) <= 0;

  return (
    <SectionShellV3 titulo={SCREEN_COPY["pdv-servico"].titulo} subtitulo={SCREEN_COPY["pdv-servico"].subtitulo}>
      <div className="space-y-4">
        {/* Estado do caixa */}
        <div
          className={cn(
            "flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm",
            caixaAberto ? "border-success/30 bg-success/5 text-foreground" : "border-warning/40 bg-warning/10 text-foreground",
          )}
        >
          {caixaAberto ? <Wallet className="h-4 w-4 text-success" aria-hidden /> : <Lock className="h-4 w-4 text-warning" aria-hidden />}
          {caixaAberto ? (
            <span>Caixa <strong>aberto</strong>{sessao?.operador ? ` · ${sessao.operador}` : ""} — recebimento liberado.</span>
          ) : (
            <span>Caixa <strong>fechado</strong>. Abra o caixa no PDV para receber pagamentos de OS.</span>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            {/* Seleção da OS */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Ordem de serviço</span>
                <select className={inputCls} value={osId} onChange={(e) => setOsId(e.target.value)}>
                  <option value="">Selecione uma OS com valor…</option>
                  {cobravel.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.codigo} · {o.cliente?.nome ?? "Cliente"} · {formatBRL(lerPagamentoV3(o).total)}
                    </option>
                  ))}
                </select>
              </label>
              {cobravel.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">Nenhuma OS com valor a receber nesta unidade.</p>
              ) : null}
            </div>

            {/* Dados da OS */}
            {os ? (
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{os.codigo} · {os.cliente?.nome ?? "Cliente"}</h3>
                  <StatusBadgeV3 status={statusV3FromOS(os)} />
                </div>
                <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                  <KV label="Equipamento" value={[os.equipamento?.marca, os.equipamento?.modelo].filter(Boolean).join(" ") || os.equipamento?.tipo} />
                  <KV label="Total da OS" value={formatBRL(pagamento?.total ?? 0)} />
                  <KV label="Recebido" value={formatBRL(pagamento?.recebido ?? 0)} />
                </dl>
                <button type="button" onClick={() => openOS(os.id)} className="mt-3 text-xs text-primary hover:underline">
                  Abrir prontuário da OS →
                </button>
              </div>
            ) : null}

            {/* Recebimento */}
            {os ? (
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground">Recebimento</h3>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input type="checkbox" checked={splitMode} onChange={(e) => setSplitMode(e.target.checked)} className="accent-primary" />
                    Pagamento dividido (split)
                  </label>
                </div>

                {/* Intenção / rótulo */}
                <div className="mt-3">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">Tipo</span>
                  <div className="flex flex-wrap gap-2">
                    {INTENCOES_RECEBIMENTO_V3.map((it) => (
                      <button
                        key={it.value}
                        type="button"
                        onClick={() => setIntencao(it.value)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                          intencao === it.value ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {it.label}
                      </button>
                    ))}
                  </div>
                  {!temAPrazo && veredito.op === "liquidar" ? (
                    <p className="mt-1.5 text-[11px] text-success">Este valor cobre o saldo → será registrado como <strong>Quitação</strong>.</p>
                  ) : null}
                </div>

                {!splitMode ? (
                  /* ---- Forma única ---- */
                  <div className="mt-4">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">Forma de pagamento</span>
                    <div className="flex flex-wrap gap-2">
                      {FORMAS_UNICAS_UI.map((f) => (
                        <button
                          key={f.value}
                          type="button"
                          disabled={!f.suportada}
                          onClick={() => setForma(f.value)}
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                            forma === f.value && f.suportada ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:text-foreground",
                          )}
                          title={f.suportada ? undefined : "A conectar nesta fase"}
                        >
                          {f.label}
                          {!f.suportada ? <span className="ml-1 text-[10px] uppercase">(a conectar)</span> : null}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setForma(A_PRAZO)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                          forma === A_PRAZO ? "border-warning/40 bg-warning/10 text-warning" : "border-border bg-background text-muted-foreground hover:text-foreground",
                        )}
                        title="Deixar todo o saldo a prazo, com vencimento (não é dinheiro recebido)"
                      >
                        {A_PRAZO_LABEL}
                      </button>
                    </div>
                    {forma === A_PRAZO ? (
                      <p className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
                        Todo o saldo ({formatBRL(saldo)}) fica <strong>a prazo</strong> no mesmo título da OS. Nenhum valor é recebido agora e o caixa não é usado.
                      </p>
                    ) : (
                      <>
                        <label className="mt-3 block">
                          <span className="mb-1 block text-xs font-medium text-muted-foreground">Valor a receber (R$)</span>
                          <input className={inputCls} value={valorStr} onChange={(e) => setValorStr(e.target.value)} placeholder="0,00" inputMode="decimal" />
                        </label>
                        {!formaUnicaSuportada ? (
                          <p className="mt-2 text-xs text-warning">Esta forma ainda não está conectada ao recebimento real — escolha Dinheiro, PIX, Débito ou Crédito.</p>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : (
                  /* ---- Split (várias formas) ---- */
                  <div className="mt-4 space-y-2">
                    {splitLinhas.map((l, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <select
                          className={cn(inputCls, "max-w-[190px]", l.forma === A_PRAZO && "border-warning/50")}
                          value={l.forma}
                          aria-label={`Forma da linha ${i + 1}`}
                          onChange={(e) => escolherFormaLinha(i, e.target.value as SplitDraft["forma"])}
                        >
                          {FORMAS_SUPORTADAS.map((f) => (
                            <option key={f.value} value={f.value}>{f.label}</option>
                          ))}
                          <option value={A_PRAZO} disabled={l.forma !== A_PRAZO && splitLinhas.some((x) => x.forma === A_PRAZO)}>
                            {A_PRAZO_LABEL}
                          </option>
                        </select>
                        <input
                          className={cn(inputCls, l.forma === A_PRAZO && "border-warning/50")}
                          value={l.valorStr}
                          aria-label={`Valor da linha ${i + 1}`}
                          onChange={(e) => setSplitLinhas((arr) => arr.map((x, idx) => (idx === i ? { ...x, valorStr: e.target.value } : x)))}
                          placeholder="0,00"
                          inputMode="decimal"
                        />
                        <button
                          type="button"
                          onClick={() => setSplitLinhas((arr) => (arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr))}
                          disabled={splitLinhas.length <= 1}
                          className="shrink-0 rounded-md border border-border p-2 text-muted-foreground hover:text-destructive disabled:opacity-40"
                          aria-label="Remover forma"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-2">
                        <ButtonV3 variant="outline" onClick={() => setSplitLinhas((arr) => [...arr, { forma: "pix", valorStr: "" }])}>
                          <Plus className="h-4 w-4" /> Adicionar forma
                        </ButtonV3>
                        <ButtonV3
                          variant="outline"
                          onClick={adicionarLinhaAPrazo}
                          disabled={splitLinhas.some((l) => l.forma === A_PRAZO)}
                          title="Deixar o restante do saldo a prazo, com vencimento"
                        >
                          <CalendarClock className="h-4 w-4" /> {A_PRAZO_LABEL}
                        </ButtonV3>
                      </div>
                      {temAPrazo && misto ? (
                        <span className={cn("text-xs tabular-nums", misto.restanteCentavos === 0 ? "text-success" : "text-muted-foreground")}>
                          Agora <strong>{formatarCentavosBRLV3(misto.receberAgoraCentavos)}</strong> + a prazo{" "}
                          <strong>{formatarCentavosBRLV3(misto.aPrazoCentavos)}</strong> / saldo {formatBRL(saldo)}
                        </span>
                      ) : (
                        <span className={cn("text-xs tabular-nums", Math.abs(somaSplit - saldo) < 0.01 ? "text-success" : "text-muted-foreground")}>
                          Soma: <strong>{formatBRL(somaSplit)}</strong> / saldo {formatBRL(saldo)}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* ---- Parte a prazo: vencimento obrigatório, observação opcional ---- */}
                {temAPrazo ? (
                  <div className="mt-4 space-y-3 rounded-lg border border-warning/40 bg-warning/5 p-3" data-testid="bloco-a-prazo">
                    <p className="flex items-start gap-1.5 text-xs text-foreground">
                      <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
                      <span>
                        <strong>{A_PRAZO_LABEL}: valor NÃO recebido agora.</strong> Fica em aberto no mesmo título da OS, com vencimento —
                        não entra no caixa, não é pagamento, desconto nem quitação.
                      </span>
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block min-w-0">
                        <span className="mb-1 block text-xs font-medium text-muted-foreground">Vencimento (obrigatório)</span>
                        <input
                          type="date"
                          className={inputCls}
                          value={vencimentoAPrazo}
                          min={hoje}
                          onChange={(e) => setVencimentoAPrazo(e.target.value)}
                          aria-label="Vencimento da parte a prazo"
                          required
                        />
                      </label>
                      <label className="block min-w-0">
                        <span className="mb-1 block text-xs font-medium text-muted-foreground">Observação (opcional)</span>
                        <input
                          className={inputCls}
                          value={obsAPrazo}
                          onChange={(e) => setObsAPrazo(e.target.value)}
                          placeholder="Ex.: combinado pagar no dia do salário"
                          maxLength={500}
                          aria-label="Observação da parte a prazo"
                        />
                      </label>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Resumo + recebimento */}
          <aside className="space-y-3">
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Pagamento</h3>
                {statusMeta ? (
                  <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", TONE_CLS[statusMeta.tone])}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                    {statusMeta.label}
                  </span>
                ) : null}
              </div>

              {loading && !pagamento ? (
                <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
              ) : (
                <dl className="mt-3 space-y-2 text-sm">
                  <Row label="Total da OS" value={formatBRL(pagamento?.total ?? 0)} />
                  <Row label="Recebido" value={formatBRL(pagamento?.recebido ?? 0)} />
                  <div className="flex items-center justify-between border-t border-border pt-2">
                    <dt className="font-semibold text-foreground">Saldo a receber</dt>
                    <dd className="text-lg font-semibold tabular-nums text-primary">{formatBRL(saldo)}</dd>
                  </div>
                </dl>
              )}

              {os && temAPrazo && misto && pagamento ? (
                /* ---- Resumo da confirmação mista (antes de confirmar) ---- */
                <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3" data-testid="resumo-misto">
                  <p className="text-xs font-semibold text-foreground">Resumo antes de confirmar</p>
                  <dl className="mt-2 space-y-1.5 text-xs">
                    <Row label="Total da OS" value={formatBRL(pagamento.total)} />
                    <Row label="Recebido anteriormente" value={formatBRL(pagamento.recebido)} />
                    <Row
                      label="Receber agora"
                      value={
                        misto.receberAgoraCentavos > 0
                          ? `${formatarCentavosBRLV3(misto.receberAgoraCentavos)} — ${misto.pagamentosAgora.map((l) => formaLabelRecebimentoV3(l.forma)).join(" + ")}`
                          : formatBRL(0)
                      }
                    />
                    <Row label="Deixar a prazo" value={formatarCentavosBRLV3(misto.aPrazoCentavos)} />
                    <Row label="Vencimento" value={vencimentoAPrazo ? formatarVencimentoV3(vencimentoAPrazo) : "—"} />
                    <div className="flex items-center justify-between border-t border-border pt-1.5">
                      <dt className="font-semibold text-foreground">Saldo que continuará em aberto</dt>
                      <dd className="font-semibold tabular-nums text-warning">{formatarCentavosBRLV3(misto.aPrazoCentavos)} (a prazo)</dd>
                    </div>
                  </dl>
                  {misto.erros.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {misto.erros.map((e) => (
                        <li key={e} className="flex items-start gap-1.5 text-xs text-warning">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {e}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : os && veredito.motivo && valorAReceber > 0 ? (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-warning"><AlertTriangle className="h-3.5 w-3.5" /> {veredito.motivo}</p>
              ) : null}

              {pendenciaMisto ? (
                <div className="mt-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-foreground" role="alert">
                  <p>
                    <strong>Resultado não confirmado</strong> da operação anterior. Reenvie a <strong>mesma</strong> operação para
                    verificar — o servidor reconhece a chave e não lança em dobro.
                  </p>
                  <ButtonV3 variant="outline" className="mt-2 w-full" disabled={registrandoMisto} onClick={onReenviarPendente}>
                    {registrandoMisto ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    Reenviar a mesma operação
                  </ButtonV3>
                </div>
              ) : null}

              {temAPrazo ? (
                <ButtonV3 variant="primary" className="mt-4 w-full" disabled={!podeRegistrarMisto} onClick={onRegistrarMisto}>
                  {registrandoMisto ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
                  {rotuloBotaoRecebimentoMistoV3(misto?.receberAgoraCentavos ?? 0, misto?.aPrazoCentavos ?? 0)}
                </ButtonV3>
              ) : (
                <ButtonV3 variant="primary" className="mt-4 w-full" disabled={!podeReceber} onClick={onReceber}>
                  {recebendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                  {veredito.op === "liquidar" ? "Quitar OS" : "Receber"}
                  {valorAReceber > 0 ? ` · ${formatBRL(valorAReceber)}` : ""}
                </ButtonV3>
              )}

              {temAPrazo && !precisaCaixaMisto ? (
                <p className="mt-2 text-center text-[11px] text-muted-foreground">100% a prazo: nenhum valor entra no caixa — não exige caixa aberto.</p>
              ) : temAPrazo && caixaAberto ? (
                <p className="mt-2 text-center text-[11px] text-muted-foreground">Só o valor recebido agora entra no caixa; a parte a prazo fica em aberto no título da OS.</p>
              ) : !caixaAberto ? (
                <p className="mt-2 text-center text-[11px] text-warning">Abra o caixa para liberar o recebimento.</p>
              ) : semValor ? (
                <p className="mt-2 flex items-center justify-center gap-1 text-center text-[11px] text-warning"><AlertTriangle className="h-3.5 w-3.5" /> Esta OS não tem valor a cobrar. Gere/aprove o orçamento antes de receber.</p>
              ) : quitado ? (
                <p className="mt-2 flex items-center justify-center gap-1 text-center text-[11px] text-success"><CheckCircle2 className="h-3.5 w-3.5" /> OS quitada.</p>
              ) : (
                <p className="mt-2 text-center text-[11px] text-muted-foreground">Recebimento real: baixa em Conta a Receber + caixa do dia.</p>
              )}
              {error ? <p className="mt-2 text-center text-xs text-destructive">{error}</p> : null}
              <button type="button" onClick={reload} className="mt-2 w-full text-center text-[11px] text-muted-foreground hover:text-foreground">
                Atualizar saldo
              </button>
            </div>

            {/* Saldo a prazo PERSISTIDO (reabrir/reselecionar a OS mostra valor e vencimento) */}
            {os && aPrazo && saldo > 0 ? (
              <div className="rounded-xl border border-warning/40 bg-warning/5 p-4 shadow-sm" data-testid="a-prazo-persistido">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <CalendarClock className="h-4 w-4 text-warning" /> Saldo a prazo: {formatBRL(aPrazo.valor)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Vencimento {formatarVencimentoV3(aPrazo.vencimento)}
                  {aPrazo.autorizadoPor ? ` · autorizado por ${aPrazo.autorizadoPor}` : ""}
                  {aPrazo.observacao ? ` · ${aPrazo.observacao}` : ""}
                </p>
                {aPrazo.valor + 0.009 < saldo ? (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-warning">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> A autorização a prazo ({formatBRL(aPrazo.valor)}) não cobre o saldo
                    atual ({formatBRL(saldo)}): a entrega segue bloqueada até receber ou formalizar o restante.
                  </p>
                ) : (
                  <p className="mt-2 text-[11px] text-muted-foreground">Não é dinheiro recebido. A retirada é confirmada no prontuário da OS.</p>
                )}
              </div>
            ) : null}

            {/* Comprovante do último recebimento */}
            {ultimoRecibo ? (
              <div className="rounded-xl border border-success/30 bg-success/5 p-4 shadow-sm">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <CheckCircle2 className="h-4 w-4 text-success" />{" "}
                  {ultimoRecibo.aPrazo
                    ? ultimoRecibo.valorPago > 0
                      ? `Recebido ${formatBRL(ultimoRecibo.valorPago)} + ${formatBRL(ultimoRecibo.aPrazo.valor)} a prazo`
                      : `${formatBRL(ultimoRecibo.aPrazo.valor)} formalizado a prazo`
                    : `${ultimoRecibo.intencaoLabel} de ${formatBRL(ultimoRecibo.valorPago)}`}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {ultimoRecibo.aPrazo
                    ? `${ultimoRecibo.situacaoLabel ?? ultimoRecibo.statusLabel} · vence ${formatarVencimentoV3(ultimoRecibo.aPrazo.vencimento)}`
                    : `Saldo restante: ${formatBRL(ultimoRecibo.saldoRestante)} · ${ultimoRecibo.statusLabel}`}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ButtonV3 variant="outline" onClick={() => setReciboAberto(true)}>
                    <Receipt className="h-4 w-4" /> Imprimir comprovante
                  </ButtonV3>
                  <ButtonV3 variant="ghost" onClick={limparRecibo}>Dispensar</ButtonV3>
                </div>
              </div>
            ) : null}

            {/* Avanço de status pós-quitação (sem baixar estoque) */}
            {quitado && (osStatus === "pronta" || osStatus === "recebida") ? (
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <p className="text-xs font-medium text-muted-foreground">Próxima etapa</p>
                {osStatus === "pronta" ? (
                  <ButtonV3 variant="primary" className="mt-2 w-full" onClick={() => onAvancarStatus("recebida")}>
                    Avançar para Recebida
                  </ButtonV3>
                ) : (
                  <ButtonV3 variant="primary" className="mt-2 w-full" onClick={() => onAvancarStatus("entregue")}>
                    Marcar como Entregue
                  </ButtonV3>
                )}
                <p className="mt-2 text-[11px] text-muted-foreground">Avanço de status apenas — sem baixa de estoque nesta fase.</p>
              </div>
            ) : null}

            {/* Estorno / correção do último recebimento */}
            {os && (pagamento?.recebido ?? 0) > 0 ? (
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <RotateCcw className="h-3.5 w-3.5" /> Estornar último recebimento
                </p>
                <input
                  className={cn(inputCls, "mt-2")}
                  value={motivoEstorno}
                  onChange={(e) => setMotivoEstorno(e.target.value)}
                  placeholder="Motivo (opcional)"
                />
                <ButtonV3 variant="outline" className="mt-2 w-full" disabled={!caixaAberto || estornando} onClick={onEstornar}>
                  {estornando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  Estornar último recebimento
                </ButtonV3>
                {!caixaAberto ? <p className="mt-2 text-center text-[11px] text-warning">Abra o caixa para estornar.</p> : null}
              </div>
            ) : null}
          </aside>
        </div>
      </div>

      <ReciboPreviewV3 recibo={reciboAberto ? ultimoRecibo : null} onClose={() => setReciboAberto(false)} />
    </SectionShellV3>
  );
}

function KV({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm text-foreground">{value || "—"}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
