"use client";

// ============================================================================
// Operações V3 — Fase 2A/2B · PDV de Serviço (recebimento REAL da OS)
// ----------------------------------------------------------------------------
// Recebe pagamento de uma OS via serviços financeiros existentes (Conta a
// Receber + Caixa). Exige caixa aberto. Fase 2B: split (várias formas), rótulo
// sinal/entrada/parcial/quitação, comprovante imprimível, estorno auditado e
// avanço de status pós-quitação (Recebida → Entregue). Formas não suportadas
// ficam "a conectar".
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CreditCard, Loader2, Lock, Plus, Receipt, RotateCcw, Trash2, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FORMAS_RECEBIMENTO_V3,
  INTENCOES_RECEBIMENTO_V3,
  PAGAMENTO_STATUS_META_V3,
  lerPagamentoV3,
  somaSplitV3,
  validarRecebimentoV3,
  validarSplitV3,
  type FormaRecebimentoV3,
  type RecebimentoIntencaoV3,
  type SplitLinhaV3,
} from "@/lib/operacoes-v3/payment-model";
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

function num(v: string): number {
  const n = Number(v.replace(/[^\d,.-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

type SplitDraft = { forma: FormaRecebimentoV3; valorStr: string };

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
  const { pagamento, sessao, loading, recebendo, estornando, error, ultimoRecibo, reload, receber, estornar, limparRecibo } =
    usePdvServicoV3(storeId, osId || null);

  const [intencao, setIntencao] = useState<RecebimentoIntencaoV3>("parcial");
  const [splitMode, setSplitMode] = useState(false);
  // Forma única
  const [forma, setForma] = useState<FormaRecebimentoV3>("dinheiro");
  const [valorStr, setValorStr] = useState("");
  // Split
  const [splitLinhas, setSplitLinhas] = useState<SplitDraft[]>([{ forma: "dinheiro", valorStr: "" }]);
  // Comprovante
  const [reciboAberto, setReciboAberto] = useState(false);
  // Estorno
  const [motivoEstorno, setMotivoEstorno] = useState("");

  const saldo = pagamento?.saldo ?? 0;

  // Ao trocar de OS / recarregar o saldo, sugere o saldo como valor padrão (forma única).
  useEffect(() => {
    setValorStr(saldo > 0 ? saldo.toFixed(2) : "");
  }, [saldo, osId]);

  if (!storeId) {
    return (
      <SectionShellV3 titulo={SCREEN_COPY["pdv-servico"].titulo} subtitulo={SCREEN_COPY["pdv-servico"].subtitulo}>
        <NoStoreBlockV3 />
      </SectionShellV3>
    );
  }

  const caixaAberto = sessao?.aberta === true;
  const osStatus = os ? statusV3FromOS(os) : null;

  // Linhas de split válidas (number) e validação.
  const splitLinhasNum: SplitLinhaV3[] = splitLinhas
    .map((l) => ({ forma: l.forma, valor: num(l.valorStr) }))
    .filter((l) => l.valor > 0);
  const somaSplit = somaSplitV3(splitLinhasNum);

  const valorUnico = num(valorStr);
  const formaUnicaSuportada = FORMAS_RECEBIMENTO_V3.find((f) => f.value === forma)?.suportada ?? false;

  const veredito = splitMode ? validarSplitV3(splitLinhasNum, saldo) : validarRecebimentoV3(valorUnico, saldo);
  const valorAReceber = splitMode ? somaSplit : valorUnico;
  const podeReceber = !!os && caixaAberto && (splitMode || formaUnicaSuportada) && veredito.ok && !recebendo;

  const onReceber = async () => {
    if (!os || !sessao?.sessaoId) return;
    const ok = await receber(
      splitMode
        ? { linhas: splitLinhasNum, sessaoId: sessao.sessaoId, intencao }
        : { valor: valorUnico, forma, sessaoId: sessao.sessaoId, intencao },
    );
    if (ok) {
      reloadLista();
      notificar(veredito.op === "liquidar" ? "OS quitada." : "Pagamento registrado.");
      // Reseta os campos de entrada do split; forma única é re-sugerida pelo efeito do saldo.
      setSplitLinhas([{ forma: "dinheiro", valorStr: "" }]);
    }
  };

  const onEstornar = async () => {
    if (!os || !sessao?.sessaoId) return;
    const ok = await estornar({ sessaoId: sessao.sessaoId, motivo: motivoEstorno.trim() || undefined });
    if (ok) {
      reloadLista();
      reload();
      setMotivoEstorno("");
      notificar("Último recebimento estornado.");
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
                  {veredito.op === "liquidar" ? (
                    <p className="mt-1.5 text-[11px] text-success">Este valor cobre o saldo → será registrado como <strong>Quitação</strong>.</p>
                  ) : null}
                </div>

                {!splitMode ? (
                  /* ---- Forma única ---- */
                  <div className="mt-4">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">Forma de pagamento</span>
                    <div className="flex flex-wrap gap-2">
                      {FORMAS_RECEBIMENTO_V3.map((f) => (
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
                    </div>
                    <label className="mt-3 block">
                      <span className="mb-1 block text-xs font-medium text-muted-foreground">Valor a receber (R$)</span>
                      <input className={inputCls} value={valorStr} onChange={(e) => setValorStr(e.target.value)} placeholder="0,00" inputMode="decimal" />
                    </label>
                    {!formaUnicaSuportada ? (
                      <p className="mt-2 text-xs text-warning">Esta forma ainda não está conectada ao recebimento real — escolha Dinheiro, PIX, Débito ou Crédito.</p>
                    ) : null}
                  </div>
                ) : (
                  /* ---- Split (várias formas) ---- */
                  <div className="mt-4 space-y-2">
                    {splitLinhas.map((l, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <select
                          className={cn(inputCls, "max-w-[150px]")}
                          value={l.forma}
                          onChange={(e) => setSplitLinhas((arr) => arr.map((x, idx) => (idx === i ? { ...x, forma: e.target.value as FormaRecebimentoV3 } : x)))}
                        >
                          {FORMAS_SUPORTADAS.map((f) => (
                            <option key={f.value} value={f.value}>{f.label}</option>
                          ))}
                        </select>
                        <input
                          className={inputCls}
                          value={l.valorStr}
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
                    <div className="flex items-center justify-between">
                      <ButtonV3 variant="outline" onClick={() => setSplitLinhas((arr) => [...arr, { forma: "pix", valorStr: "" }])}>
                        <Plus className="h-4 w-4" /> Adicionar forma
                      </ButtonV3>
                      <span className={cn("text-xs tabular-nums", Math.abs(somaSplit - saldo) < 0.01 ? "text-success" : "text-muted-foreground")}>
                        Soma: <strong>{formatBRL(somaSplit)}</strong> / saldo {formatBRL(saldo)}
                      </span>
                    </div>
                  </div>
                )}
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

              {os && veredito.motivo && valorAReceber > 0 ? (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-warning"><AlertTriangle className="h-3.5 w-3.5" /> {veredito.motivo}</p>
              ) : null}

              <ButtonV3 variant="primary" className="mt-4 w-full" disabled={!podeReceber} onClick={onReceber}>
                {recebendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                {veredito.op === "liquidar" ? "Quitar OS" : "Receber"}
                {valorAReceber > 0 ? ` · ${formatBRL(valorAReceber)}` : ""}
              </ButtonV3>

              {!caixaAberto ? (
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

            {/* Comprovante do último recebimento */}
            {ultimoRecibo ? (
              <div className="rounded-xl border border-success/30 bg-success/5 p-4 shadow-sm">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <CheckCircle2 className="h-4 w-4 text-success" /> {ultimoRecibo.intencaoLabel} de {formatBRL(ultimoRecibo.valorPago)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Saldo restante: {formatBRL(ultimoRecibo.saldoRestante)} · {ultimoRecibo.statusLabel}</p>
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
