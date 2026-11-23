"use client";

// ============================================================================
// Operações V3 — Retorno / Garantia pela OS original
// (GOAL OPERACOES-V3-NOVA-OS-SELETOR-003)
// ----------------------------------------------------------------------------
// Localiza a OS original na loja ativa (`buscarOrigensRetornoV3`, leitura) e,
// quando o enquadramento permite, abre o retorno pelo motor EXISTENTE
// `abrirRetornoV3`: o atendimento novo nasce vinculado à original nos dois
// lados. Idempotente por `operacaoId` — reenviar o MESMO relato (duplo clique,
// resposta perdida) devolve o atendimento já criado, nunca um segundo.
// Retorno já em andamento → abre o atendimento existente (não cria outro).
// Sem pagamento, sem estoque, sem Financeiro.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, RotateCcw, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { abrirRetornoV3, buscarOrigensRetornoV3 } from "@/lib/operacoes-v3/retorno-actions";
import {
  LIMITE_TEXTO_RETORNO_V4,
  operacaoDoRelatoV4,
  type OrigemRetornoResumoV4,
  type RascunhoRetornoV4,
  type ToneRetornoV4,
} from "@/lib/operacoes-v4/retorno-origem-v4";
import { ButtonV3 } from "./UiV3";
import { formatData } from "../lib/format";
import styles from "../operacoes-v3-skin.module.css";

const TONE: Record<ToneRetornoV4, string> = {
  success: "border-success/30 bg-success/10 text-success",
  info: "border-primary/30 bg-primary/10 text-primary",
  warn: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  neutro: "border-border bg-muted text-muted-foreground",
};

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

interface Props {
  open: boolean;
  storeId: string | null;
  onClose: () => void;
  /** Abre uma OS no workspace (atendimento de retorno criado/existente ou a original). */
  onAbrirOS: (osId: string) => void;
  /** Retorno aberto agora: recarregar a lista e avisar. */
  onRetornoAberto: (atendimentoId: string, situacao: "criado" | "recuperado") => void;
}

export function RetornoOrigemV3Modal(props: Props) {
  if (!props.open) return null;
  return <Conteudo {...props} />;
}

function Conteudo({ storeId, onClose, onAbrirOS, onRetornoAberto }: Props) {
  const [termo, setTermo] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<OrigemRetornoResumoV4[] | null>(null);
  const [erroBusca, setErroBusca] = useState<string | null>(null);
  const [origem, setOrigem] = useState<OrigemRetornoResumoV4 | null>(null);
  const [motivo, setMotivo] = useState("");
  const [observacao, setObservacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Identidade da operação por relato: retry do MESMO relato reusa o id (idempotência do motor).
  const operacaoRef = useRef<RascunhoRetornoV4["operacao"]>(undefined);
  const buscaRef = useRef<HTMLInputElement>(null);
  const motivoRef = useRef<HTMLTextAreaElement>(null);
  const [gatilho] = useState<HTMLElement | null>(() =>
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );

  useEffect(() => {
    buscaRef.current?.focus();
    return () => {
      if (gatilho?.isConnected) gatilho.focus();
    };
  }, [gatilho]);

  const fechar = useCallback(() => {
    if (!enviando) onClose();
  }, [enviando, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      fechar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fechar]);

  // Busca server-side com debounce; resposta velha não sobrescreve a nova.
  useEffect(() => {
    const sid = (storeId ?? "").trim();
    const q = termo.trim();
    if (!sid || q.length < 2) {
      setResultados(null);
      setErroBusca(null);
      setBuscando(false);
      return;
    }
    let vivo = true;
    setBuscando(true);
    const t = window.setTimeout(() => {
      buscarOrigensRetornoV3(sid, q)
        .then((rows) => {
          if (!vivo) return;
          setResultados(rows);
          setErroBusca(null);
        })
        .catch((e: unknown) => {
          if (!vivo) return;
          setResultados(null);
          setErroBusca(e instanceof Error && e.message ? e.message : "Não foi possível buscar as OS agora.");
        })
        .finally(() => {
          if (vivo) setBuscando(false);
        });
    }, 300);
    return () => {
      vivo = false;
      window.clearTimeout(t);
    };
  }, [storeId, termo]);

  const selecionar = (o: OrigemRetornoResumoV4) => {
    setOrigem(o);
    setMotivo("");
    setObservacao("");
    setErro(null);
    operacaoRef.current = undefined;
    if (o.enquadramento.acao === "abrir_retorno") requestAnimationFrame(() => motivoRef.current?.focus());
  };

  const voltar = () => {
    if (enviando) return;
    setOrigem(null);
    setErro(null);
    requestAnimationFrame(() => buscaRef.current?.focus());
  };

  const abrirRetorno = async () => {
    const sid = (storeId ?? "").trim();
    if (!sid || !origem) return;
    const m = motivo.trim();
    if (!m) {
      setErro("Informe o motivo do retorno.");
      motivoRef.current?.focus();
      return;
    }
    const relato = { motivo: m, observacao: observacao.trim(), acessorios: [] as string[] };
    const operacao = operacaoDoRelatoV4(operacaoRef.current, relato);
    operacaoRef.current = operacao;
    setEnviando(true);
    setErro(null);
    try {
      const r = await abrirRetornoV3(sid, origem.osId, {
        motivo: m,
        observacao: relato.observacao || undefined,
        operacaoId: operacao.id,
      });
      const atendimentoId = r.atendimento?.id;
      if (!atendimentoId) {
        setErro("O retorno foi registrado, mas o atendimento não voltou na resposta. Abra a OS original para conferir.");
        return;
      }
      onRetornoAberto(atendimentoId, r.situacao);
    } catch (e) {
      setErro(
        e instanceof Error && e.message
          ? e.message
          : "Não foi possível abrir o retorno. Tente de novo — o mesmo relato não cria outro atendimento.",
      );
    } finally {
      setEnviando(false);
    }
  };

  const acao = origem?.enquadramento.acao;
  const atendimentoEmAndamento = origem?.retornoAberto?.osRetornoId;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6">
      <button type="button" aria-label="Fechar" tabIndex={-1} className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={fechar} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="v3-retorno-titulo"
        className={`${styles.popIn} relative flex max-h-[92vh] w-full min-w-0 flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:max-w-xl sm:rounded-2xl`}
      >
        <header className="flex flex-none items-start gap-2.5 border-b border-border px-4 py-3">
          {origem ? (
            <button
              type="button"
              onClick={voltar}
              disabled={enviando}
              aria-label="Voltar para a busca"
              className="mt-0.5 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </button>
          ) : (
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <RotateCcw className="h-4 w-4" aria-hidden />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 id="v3-retorno-titulo" className="truncate text-base font-semibold text-foreground">
              Retorno / Garantia
            </h2>
            <p className="text-xs text-muted-foreground">
              {origem ? "Confira a OS original antes de abrir o retorno." : "Localize a OS original por número, cliente, telefone ou aparelho."}
            </p>
          </div>
          <button type="button" onClick={fechar} disabled={enviando} aria-label="Fechar" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!origem ? (
            <div className="space-y-3">
              <label className="relative block">
                <span className="sr-only">Buscar OS original</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  ref={buscaRef}
                  className={cn(inputCls, "pl-9")}
                  value={termo}
                  onChange={(e) => setTermo(e.target.value)}
                  placeholder="Ex.: OS-00025, Maria, 11 9…, iPhone 11"
                  maxLength={80}
                  autoComplete="off"
                />
              </label>
              {buscando ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Buscando…
                </p>
              ) : erroBusca ? (
                <p role="alert" className="text-xs text-destructive">{erroBusca}</p>
              ) : resultados === null ? (
                <p className="text-xs text-muted-foreground">Digite ao menos 2 caracteres.</p>
              ) : resultados.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma OS encontrada nesta unidade.</p>
              ) : (
                <ul className="space-y-2" aria-label="OS encontradas">
                  {resultados.map((o) => (
                    <li key={o.osId}>
                      <button
                        type="button"
                        onClick={() => selecionar(o)}
                        className="w-full min-w-0 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      >
                        <span className="flex min-w-0 items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-foreground">
                            {o.codigo} · {o.cliente.nome || "Cliente"}
                          </span>
                          <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium", TONE[o.enquadramento.tone])}>
                            {o.enquadramento.label}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {o.aparelho.descricao || "Equipamento"}
                          {o.entregueEm ? ` · entregue ${formatData(o.entregueEm)}` : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <section className="rounded-xl border border-border bg-background/40 p-3">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">OS original {origem.codigo}</span>
                  <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium", TONE[origem.enquadramento.tone])}>
                    {origem.enquadramento.label}
                  </span>
                </div>
                <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                  <Linha rotulo="Cliente" valor={[origem.cliente.nome, origem.cliente.telefone].filter(Boolean).join(" · ")} />
                  <Linha rotulo="Aparelho" valor={origem.aparelho.descricao} />
                  <Linha rotulo="Serviço" valor={origem.servicoExecutado.join(", ")} />
                  <Linha rotulo="Entregue" valor={origem.entregueEm ? formatData(origem.entregueEm) : ""} />
                  <Linha rotulo="Garantia" valor={origem.garantia.label} />
                  <Linha rotulo="Retornos" valor={origem.retornos.length ? String(origem.retornos.length) : "Nenhum"} />
                </dl>
                <p className="mt-2 text-xs text-muted-foreground">{origem.enquadramento.descricao}</p>
              </section>

              {acao === "abrir_retorno" ? (
                <section className="space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">Motivo do retorno *</span>
                    <textarea
                      ref={motivoRef}
                      className={cn(inputCls, "min-h-[72px] resize-y")}
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      maxLength={LIMITE_TEXTO_RETORNO_V4}
                      placeholder="O que o cliente relata agora?"
                      disabled={enviando}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">Observação (opcional)</span>
                    <input
                      className={inputCls}
                      value={observacao}
                      onChange={(e) => setObservacao(e.target.value)}
                      maxLength={LIMITE_TEXTO_RETORNO_V4}
                      disabled={enviando}
                    />
                  </label>
                  <p className="text-[11px] text-muted-foreground">
                    Abre um atendimento de retorno vinculado a {origem.codigo}, sem recadastrar cliente nem aparelho. Nada é cobrado aqui.
                  </p>
                </section>
              ) : null}

              {erro ? (
                <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {erro}
                </p>
              ) : null}
            </div>
          )}
        </div>

        {origem ? (
          <footer className="flex flex-none flex-col-reverse gap-2 border-t border-border px-4 py-3 sm:flex-row sm:justify-end">
            <ButtonV3 variant="ghost" onClick={() => onAbrirOS(origem.osId)} disabled={enviando}>
              Ver OS original
            </ButtonV3>
            {acao === "abrir_retorno" ? (
              <ButtonV3 variant="primary" onClick={abrirRetorno} disabled={enviando || !motivo.trim()}>
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RotateCcw className="h-4 w-4" aria-hidden />}
                {enviando ? "Abrindo…" : "Abrir retorno"}
              </ButtonV3>
            ) : acao === "continuar_atendimento" && atendimentoEmAndamento ? (
              <ButtonV3 variant="primary" onClick={() => onAbrirOS(atendimentoEmAndamento)}>
                Abrir atendimento em andamento
                {origem.retornoAberto?.osRetornoCodigo ? ` (${origem.retornoAberto.osRetornoCodigo})` : ""}
              </ButtonV3>
            ) : null}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex min-w-0 gap-1.5">
      <dt className="shrink-0 text-muted-foreground">{rotulo}:</dt>
      <dd className="min-w-0 truncate text-foreground">{valor || "—"}</dd>
    </div>
  );
}
