/**
 * Operações V4 — fluxo Retorno / Garantia (GOAL OPS-V4-FLUXO-CURTO-007).
 *
 * Seletor da OS original (busca server-side na loja ativa), dados herdados,
 * enquadramento da garantia e o NOVO relato. Não cria nada sozinho: a abertura
 * chama `v.abrirRetornoDaOrigem` (motor V3 `abrirRetornoV3`, idempotente por
 * `operacaoId` — retry do mesmo relato reusa a operação). OS não entregue leva à
 * observação interna da própria OS; nada aqui recebe, cobra ou mexe em garantia.
 */
"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { C } from "../tokens";
import type { V4Vals } from "../use-v4-preview";
import {
  LIMITE_TEXTO_RETORNO_V4,
  normalizarAcessoriosRetornoV4,
  operacaoDoRelatoV4,
  type OrigemRetornoResumoV4,
  type RelatoRetornoV4,
  type SenhaTipoRetornoV4,
  type ToneRetornoV4,
} from "@/lib/operacoes-v4/retorno-origem-v4";
import styles from "./retorno-origem-v4.module.css";

const TONE: Record<ToneRetornoV4, { background: string; color: string; border: string }> = {
  success: { background: C.successBg, color: C.successFg, border: C.successBd },
  info: { background: C.infoBg, color: C.infoFg, border: C.line2 },
  warn: { background: C.warnBg, color: C.warnFg, border: C.warnBd },
  danger: { background: C.dangerBg, color: C.dangerFg, border: C.dangerBd },
  neutro: { background: C.muted100, color: C.muted, border: C.line2 },
};

const btnPrimario: CSSProperties = {
  minHeight: 36,
  padding: "0 14px",
  border: 0,
  borderRadius: 8,
  background: C.primary,
  color: C.white,
  fontSize: 12.5,
  fontWeight: 700,
  cursor: "pointer",
};
const btnSecundario: CSSProperties = {
  minHeight: 36,
  padding: "0 14px",
  border: `1px solid ${C.inputBd}`,
  borderRadius: 8,
  background: C.surface,
  color: C.body,
  fontSize: 12.5,
  fontWeight: 650,
  cursor: "pointer",
};
const campo: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  minWidth: 0,
  padding: "8px 10px",
  border: `1px solid ${C.inputBd}`,
  borderRadius: 8,
  background: C.surface,
  color: C.body,
  font: "inherit",
  fontSize: 12.5,
  lineHeight: 1.5,
};
const rotulo: CSSProperties = { display: "block", marginBottom: 5, color: C.body, fontSize: 12, fontWeight: 700 };
const FOCO = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function dataCurta(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : new Intl.DateTimeFormat("pt-BR").format(d);
}

function Badge({ tone, children }: { tone: ToneRetornoV4; children: ReactNode }) {
  const t = TONE[tone] ?? TONE.neutro;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, minHeight: 22, padding: "0 8px", border: `1px solid ${t.border}`, borderRadius: 999, background: t.background, color: t.color, fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap" }}>
      <span aria-hidden style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} />
      {children}
    </span>
  );
}

function Dado({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".04em", color: C.subtle, fontWeight: 700 }}>{label}</div>
      <div style={{ marginTop: 3, color: C.body, fontSize: 12.5, lineHeight: 1.4, fontWeight: 600, overflowWrap: "anywhere" }}>{children}</div>
    </div>
  );
}

function garantiaTexto(item: OrigemRetornoResumoV4): string {
  const g = item.garantia;
  if (g.situacao === "ativa") return `${g.label} · válida até ${dataCurta(g.vencimento)}`;
  if (g.situacao === "vencida") return `${g.label} · vencida em ${dataCurta(g.vencimento)}`;
  if (g.situacao === "sem_garantia") return "Sem cobertura";
  if (g.situacao === "prevista") return `${g.label} · prevista (aguardando entrega)`;
  return "Garantia não informada";
}

type BuscaEstado =
  | { estado: "ocioso" }
  | { estado: "carregando"; termo: string }
  | { estado: "ok"; termo: string; itens: OrigemRetornoResumoV4[] }
  | { estado: "erro"; termo: string; mensagem: string };

type DetalheEstado =
  | { estado: "nenhum" }
  | { estado: "carregando"; osId: string }
  | { estado: "ok"; item: OrigemRetornoResumoV4 }
  | { estado: "nao_encontrada"; osId: string }
  | { estado: "erro"; osId: string; mensagem: string };

export function RetornoOrigemPickerV4({ v }: { v: V4Vals }) {
  const fluxo = v.retornoFluxo;
  if (!fluxo) return null;
  return <RetornoOrigemConteudo key={`${fluxo.lojaId}::${fluxo.origemOsId ?? ""}`} v={v} lojaId={fluxo.lojaId} origemInicial={fluxo.origemOsId} />;
}

function RetornoOrigemConteudo({ v, lojaId, origemInicial }: { v: V4Vals; lojaId: string; origemInicial: string | null }) {
  const uid = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const buscaRef = useRef<HTMLInputElement>(null);
  const motivoRef = useRef<HTMLTextAreaElement>(null);
  const ocorrenciaRef = useRef<HTMLTextAreaElement>(null);
  const vivo = useRef(true);
  const focoOrigem = useRef<HTMLElement | null | undefined>(undefined);
  const buscaGen = useRef(0);
  const detalheGen = useRef(0);
  const vRef = useRef(v);
  vRef.current = v;

  const [termo, setTermo] = useState("");
  const [busca, setBusca] = useState<BuscaEstado>({ estado: "ocioso" });
  const [ativo, setAtivo] = useState(-1);
  const [detalhe, setDetalhe] = useState<DetalheEstado>(origemInicial ? { estado: "carregando", osId: origemInicial } : { estado: "nenhum" });
  const [motivo, setMotivo] = useState("");
  const [observacao, setObservacao] = useState("");
  const [acessorios, setAcessorios] = useState<string[]>([]);
  const [acessorioNovo, setAcessorioNovo] = useState("");
  const [senha, setSenha] = useState("");
  const [senhaTipo, setSenhaTipo] = useState<SenhaTipoRetornoV4>("numerica");
  const [ocorrencia, setOcorrencia] = useState("");
  const [busy, setBusy] = useState<null | "abrir" | "ocorrencia">(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Foco: entra no diálogo e volta ao controle que o abriu.
  useEffect(() => {
    vivo.current = true;
    if (focoOrigem.current === undefined) focoOrigem.current = document.activeElement as HTMLElement | null;
    if (!origemInicial) buscaRef.current?.focus();
    else dialogRef.current?.focus();
    return () => {
      vivo.current = false;
      const origem = focoOrigem.current;
      if (origem && origem.isConnected) origem.focus();
    };
  }, [origemInicial]);

  const item = detalhe.estado === "ok" ? detalhe.item : null;
  // Retorno legado em aberto sem atendimento: o atendimento abre com o relato JÁ registrado.
  const legado = item?.enquadramento.id === "retorno_sem_atendimento";

  const aplicarRascunho = useCallback((osId: string) => {
    const r = vRef.current.rascunhoRetorno(osId);
    setMotivo(r?.motivo ?? "");
    setObservacao(r?.observacao ?? "");
    setAcessorios(r?.acessorios ?? []);
    setSenha("");
    setErro(null);
    setAviso(null);
  }, []);

  const carregarDetalhe = useCallback(
    async (osId: string, opcoes?: { manterRascunho?: boolean; silencioso?: boolean }) => {
      const gen = ++detalheGen.current;
      // Silencioso: relê no servidor mantendo o detalhe atual na tela (sem piscar o formulário).
      if (!opcoes?.silencioso) setDetalhe({ estado: "carregando", osId });
      try {
        const resp = await vRef.current.lerOrigemRetorno(osId);
        if (!vivo.current || gen !== detalheGen.current || resp.lojaId !== lojaId || resp.osId !== osId) return;
        if (!resp.item) {
          setDetalhe({ estado: "nao_encontrada", osId });
          return;
        }
        setDetalhe({ estado: "ok", item: resp.item });
        if (!opcoes?.manterRascunho) aplicarRascunho(osId);
      } catch (e) {
        if (!vivo.current || gen !== detalheGen.current) return;
        setDetalhe({ estado: "erro", osId, mensagem: e instanceof Error ? e.message : "Não foi possível ler a OS original." });
      }
    },
    [lojaId, aplicarRascunho],
  );

  useEffect(() => {
    if (origemInicial) void carregarDetalhe(origemInicial);
  }, [origemInicial, carregarDetalhe]);

  // Foco no campo certo quando a OS selecionada fica pronta.
  const itemId = item?.osId ?? null;
  const itemAcao = item?.enquadramento.acao ?? null;
  useEffect(() => {
    if (!itemId) return;
    if (itemAcao === "abrir_retorno") motivoRef.current?.focus();
    else if (itemAcao === "registrar_ocorrencia") ocorrenciaRef.current?.focus();
  }, [itemId, itemAcao]);

  const buscar = useCallback(
    async (texto: string) => {
      const q = texto.trim();
      const gen = ++buscaGen.current;
      if (q.length < 2) {
        setBusca({ estado: "ocioso" });
        setAtivo(-1);
        return;
      }
      setBusca({ estado: "carregando", termo: q });
      try {
        const resp = await vRef.current.buscarOrigensRetorno(q);
        // Resposta de outra busca, de outra loja ou após fechar: descartada.
        if (!vivo.current || gen !== buscaGen.current || resp.lojaId !== lojaId) return;
        setBusca({ estado: "ok", termo: q, itens: resp.itens });
        setAtivo(resp.itens.length > 0 ? 0 : -1);
      } catch (e) {
        if (!vivo.current || gen !== buscaGen.current) return;
        setBusca({ estado: "erro", termo: q, mensagem: e instanceof Error ? e.message : "Não foi possível buscar." });
        setAtivo(-1);
      }
    },
    [lojaId],
  );

  // Busca enquanto digita (com pausa curta); Enter busca/seleciona na hora.
  useEffect(() => {
    if (termo.trim().length < 2) {
      buscaGen.current += 1;
      setBusca({ estado: "ocioso" });
      setAtivo(-1);
      return;
    }
    const t = setTimeout(() => void buscar(termo), 300);
    return () => clearTimeout(t);
  }, [termo, buscar]);

  const selecionar = useCallback(
    (escolhido: OrigemRetornoResumoV4) => {
      if (busy) return;
      detalheGen.current += 1;
      setDetalhe({ estado: "ok", item: escolhido });
      aplicarRascunho(escolhido.osId);
      // Releitura server-side da escolhida (a lista pode estar velha).
      void carregarDetalhe(escolhido.osId, { manterRascunho: true, silencioso: true });
    },
    [busy, aplicarRascunho, carregarDetalhe],
  );

  const itens = busca.estado === "ok" ? busca.itens : [];
  const listboxId = `${uid}-origens`;
  const onBuscaKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && itens.length > 0) {
      e.preventDefault();
      setAtivo((i) => Math.min(itens.length - 1, i + 1));
    } else if (e.key === "ArrowUp" && itens.length > 0) {
      e.preventDefault();
      setAtivo((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (busca.estado === "ok" && busca.termo === termo.trim() && itens[ativo]) selecionar(itens[ativo]!);
      else void buscar(termo);
    }
  };

  const fechar = useCallback(() => {
    if (busy) return;
    vRef.current.closeRetornoFluxo();
  }, [busy]);

  // Contenção de foco (Tab/Shift+Tab) e Escape no próprio diálogo — sem listener global.
  const onDialogKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      fechar();
      return;
    }
    if (e.key !== "Tab" || !dialogRef.current) return;
    const focaveis = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'),
    ).filter((el) => (typeof el.checkVisibility === "function" ? el.checkVisibility() : true));
    if (focaveis.length === 0) return;
    const primeiro = focaveis[0]!;
    const ultimo = focaveis[focaveis.length - 1]!;
    const atual = document.activeElement as HTMLElement | null;
    if (e.shiftKey && (atual === primeiro || atual === dialogRef.current || !dialogRef.current.contains(atual))) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && (atual === ultimo || !dialogRef.current.contains(atual))) {
      e.preventDefault();
      primeiro.focus();
    }
  };

  const salvarRascunho = (patch: Partial<RelatoRetornoV4>) => {
    if (!item) return;
    const atual = vRef.current.rascunhoRetorno(item.osId);
    vRef.current.salvarRascunhoRetorno(item.osId, {
      motivo: patch.motivo ?? motivo,
      observacao: patch.observacao ?? observacao,
      acessorios: patch.acessorios ?? acessorios,
      ...(atual?.operacao ? { operacao: atual.operacao } : {}),
    });
  };

  const alternarAcessorio = (nome: string) => {
    const proximo = acessorios.some((a) => a.toLocaleLowerCase("pt-BR") === nome.toLocaleLowerCase("pt-BR"))
      ? acessorios.filter((a) => a.toLocaleLowerCase("pt-BR") !== nome.toLocaleLowerCase("pt-BR"))
      : normalizarAcessoriosRetornoV4([...acessorios, nome]);
    setAcessorios(proximo);
    salvarRascunho({ acessorios: proximo });
  };

  const abrir = async () => {
    if (busy || !item || item.enquadramento.acao !== "abrir_retorno") return;
    const relato: RelatoRetornoV4 = legado
      ? { motivo: item.retornoAberto?.motivo ?? "", observacao: item.retornoAberto?.observacao, acessorios: normalizarAcessoriosRetornoV4(acessorios) }
      : { motivo: motivo.trim(), observacao: observacao.trim() || undefined, acessorios: normalizarAcessoriosRetornoV4(acessorios) };
    if (!relato.motivo) {
      setErro("Informe o motivo do retorno.");
      motivoRef.current?.focus();
      return;
    }
    const anterior = vRef.current.rascunhoRetorno(item.osId)?.operacao;
    const operacao = operacaoDoRelatoV4(anterior, relato);
    vRef.current.salvarRascunhoRetorno(item.osId, {
      motivo: legado ? motivo : relato.motivo,
      observacao: legado ? observacao : relato.observacao ?? "",
      acessorios: relato.acessorios,
      operacao,
    });
    setBusy("abrir");
    setErro(null);
    setAviso(null);
    const osId = item.osId;
    try {
      const r = await vRef.current.abrirRetornoDaOrigem(osId, {
        ...relato,
        ...(senha.trim() ? { senha: senha.trim(), senhaTipo } : {}),
        operacaoId: operacao.id,
      });
      if (!vivo.current) return;
      if (r.ok) {
        // Navegou = o fluxo fechou; sem navegação (contexto mudou) só informa.
        if (!r.navegou) setAviso(`Retorno registrado: atendimento ${r.atendimentoCodigo}.`);
        return;
      }
      setErro(r.mensagem);
      // A autoridade é o servidor: relê a OS original para mostrar o estado real.
      void carregarDetalhe(osId, { manterRascunho: true, silencioso: true });
    } finally {
      if (vivo.current) setBusy(null);
    }
  };

  const registrarOcorrencia = async () => {
    if (busy || !item || item.enquadramento.acao !== "registrar_ocorrencia") return;
    const texto = ocorrencia.trim();
    if (!texto) {
      setErro("Descreva a ocorrência.");
      ocorrenciaRef.current?.focus();
      return;
    }
    setBusy("ocorrencia");
    setErro(null);
    try {
      const ok = await vRef.current.adicionarObservacaoInterna(item.osId, `Ocorrência antes da entrega: ${texto}`);
      if (!vivo.current) return;
      if (ok) {
        setOcorrencia("");
        setAviso(`Ocorrência registrada como observação interna da ${item.codigo}. Nenhum retorno foi aberto.`);
      } else {
        setErro("Não foi possível registrar a ocorrência. O texto foi mantido.");
      }
    } finally {
      if (vivo.current) setBusy(null);
    }
  };

  const continuarNoAtendimento = (osRetornoId: string) => {
    if (busy) return;
    vRef.current.closeRetornoFluxo();
    vRef.current.abrirOsVinculada(osRetornoId);
  };

  const selecionado = detalhe.estado !== "nenhum";
  const tituloId = `${uid}-titulo`;

  return (
    <div className={styles.overlay} role="presentation" style={{ background: "rgba(17,19,26,.42)" }} onMouseDown={(e) => { if (e.target === e.currentTarget) fechar(); }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        onKeyDown={onDialogKeyDown}
        className={`${styles.dialog} ${selecionado ? styles.comSelecao : ""}`}
        data-og-retorno-dialog=""
        style={{ background: C.surface, border: `1px solid ${C.line2}`, borderRadius: 14, boxShadow: "0 28px 64px rgba(17,19,26,.28)", outline: "none" }}
      >
        <div className={styles.header} style={{ borderBottom: `1px solid ${C.line2}` }}>
          <div style={{ minWidth: 0 }}>
            <div id={tituloId} style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em", color: C.ink }}>Retorno / Garantia</div>
            <div style={{ marginTop: 3, fontSize: 12.5, color: C.subtle, lineHeight: 1.45 }}>Localize a OS original. Cliente, aparelho e histórico vêm dela — você registra só o novo relato.</div>
          </div>
          <button type="button" onClick={fechar} disabled={!!busy} aria-label="Fechar retorno" className={FOCO} style={{ width: 30, height: 30, flex: "none", border: 0, borderRadius: 8, background: C.muted50, color: C.muted, fontSize: 16, cursor: busy ? "not-allowed" : "pointer" }}>×</button>
        </div>

        <div className={styles.body}>
          <div className={styles.lista} style={{ borderRight: `1px solid ${C.line2}` }}>
            <label htmlFor={`${uid}-busca`} style={rotulo}>Buscar OS original</label>
            <input
              id={`${uid}-busca`}
              ref={buscaRef}
              type="search"
              value={termo}
              disabled={!!busy}
              onChange={(e) => setTermo(e.target.value)}
              onKeyDown={onBuscaKeyDown}
              placeholder="Nº da OS, cliente, telefone, aparelho ou IMEI"
              role="combobox"
              aria-expanded={itens.length > 0}
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={ativo >= 0 && itens[ativo] ? `${listboxId}-${itens[ativo]!.osId}` : undefined}
              className={FOCO}
              style={{ ...campo, height: 36 }}
            />
            <div aria-live="polite" style={{ fontSize: 11.5, color: C.subtle, minHeight: 16 }}>
              {busca.estado === "ocioso" ? "Digite ao menos 2 caracteres." : null}
              {busca.estado === "carregando" ? "Buscando na loja ativa…" : null}
              {busca.estado === "ok" ? (busca.itens.length ? `${busca.itens.length} OS encontrada(s).` : "Nenhuma OS encontrada nesta loja.") : null}
            </div>
            {busca.estado === "erro" ? (
              <div role="alert" style={{ padding: 10, border: `1px solid ${C.dangerBd}`, borderRadius: 8, background: C.dangerBg, color: C.dangerFg, fontSize: 12 }}>
                {busca.mensagem}
                <button type="button" onClick={() => void buscar(termo)} className={FOCO} style={{ ...btnSecundario, minHeight: 30, marginTop: 8, width: "100%" }}>Tentar de novo</button>
              </div>
            ) : null}
            <div id={listboxId} role="listbox" aria-label="OS encontradas" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {itens.map((o, i) => {
                const sel = item?.osId === o.osId;
                return (
                  <div
                    key={o.osId}
                    id={`${listboxId}-${o.osId}`}
                    role="option"
                    aria-selected={sel}
                    data-ativo={i === ativo ? "" : undefined}
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selecionar(o)}
                    className={styles.resultado}
                    style={{ border: `1px solid ${sel ? C.primaryBd : i === ativo ? C.inputBd : C.line2}`, borderRadius: 9, background: sel ? C.primaryBg : i === ativo ? C.surface2 : C.surface }}
                  >
                    <span style={{ display: "flex", justifyContent: "space-between", gap: 8, minWidth: 0 }}>
                      <strong style={{ color: C.ink, fontSize: 12.5 }}>{o.codigo}</strong>
                      <Badge tone={o.enquadramento.tone}>{o.enquadramento.label}</Badge>
                    </span>
                    <span style={{ color: C.body, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.cliente.nome}</span>
                    <span style={{ color: C.subtle, fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.aparelho.descricao}{o.entregueEm ? ` · entregue ${dataCurta(o.entregueEm)}` : ""}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={styles.detalhe}>
            <button type="button" className={`${styles.voltar} ${FOCO}`} disabled={!!busy} onClick={() => { detalheGen.current += 1; setDetalhe({ estado: "nenhum" }); }} style={{ ...btnSecundario, minHeight: 30, marginBottom: 10 }}>← Trocar OS</button>
            {detalhe.estado === "nenhum" ? <Vazio texto="Busque e selecione a OS original para ver os dados herdados." /> : null}
            {detalhe.estado === "carregando" ? <Vazio texto="Lendo a OS original no servidor…" /> : null}
            {detalhe.estado === "nao_encontrada" ? <Vazio tom="danger" texto="OS não encontrada na loja ativa." /> : null}
            {detalhe.estado === "erro" ? (
              <div role="alert">
                <Vazio tom="danger" texto={detalhe.mensagem} />
                <button type="button" onClick={() => void carregarDetalhe(detalhe.osId, { manterRascunho: true })} className={FOCO} style={{ ...btnSecundario, marginTop: 8 }}>Tentar de novo</button>
              </div>
            ) : null}
            {item ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 15, fontWeight: 750, color: C.ink }}>{item.codigo}</div>
                  <Badge tone={item.enquadramento.tone}>{item.enquadramento.label}</Badge>
                </div>
                <div className={styles.grid2}>
                  <Dado label="Cliente">{item.cliente.nome}{item.cliente.telefone ? <span style={{ display: "block", color: C.subtle, fontWeight: 500 }}>{item.cliente.telefone}</span> : null}</Dado>
                  <Dado label="Aparelho">{item.aparelho.descricao}{item.aparelho.identificacao ? <span style={{ display: "block", color: C.subtle, fontWeight: 500 }}>IMEI/série {item.aparelho.identificacao}</span> : null}</Dado>
                  <Dado label="Serviço executado">{item.servicoExecutado.length ? item.servicoExecutado.join(" · ") : "Não informado"}</Dado>
                  <Dado label="Defeito original">{item.defeitoOriginal || "Não informado"}</Dado>
                  <Dado label="Entrega">{item.entregueEm ? dataCurta(item.entregueEm) : "Não entregue"}</Dado>
                  <Dado label="Garantia">{garantiaTexto(item)}</Dado>
                </div>

                <div style={{ padding: "10px 12px", border: `1px solid ${TONE[item.enquadramento.tone].border}`, borderRadius: 9, background: TONE[item.enquadramento.tone].background, color: C.body, fontSize: 12, lineHeight: 1.5 }}>
                  {item.enquadramento.descricao}
                  {item.aberturaInterrompida ? <div style={{ marginTop: 6, color: C.subtle }}>Uma abertura anterior foi interrompida sem atendimento; ela será descartada (com registro) ao abrir este retorno.</div> : null}
                </div>

                {item.retornos.length > 0 ? (
                  <div>
                    <div style={{ ...rotulo, marginBottom: 6 }}>Retornos anteriores</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {item.retornos.map((r) => (
                        <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", padding: "8px 10px", border: `1px solid ${C.line2}`, borderRadius: 8, background: C.surface2, fontSize: 12 }}>
                          <span style={{ minWidth: 0, color: C.body }}>
                            <strong>{r.status === "aberto" ? (r.emAbertura ? "Abertura em processamento" : "Em andamento") : "Concluído"}</strong> · {dataCurta(r.criadoEm)} · {r.motivo || "Motivo não informado"}
                          </span>
                          {r.osRetornoId ? (
                            <button type="button" onClick={() => continuarNoAtendimento(r.osRetornoId!)} disabled={!!busy} className={FOCO} style={{ ...btnSecundario, minHeight: 30, fontSize: 11.5 }}>
                              Abrir atendimento {r.osRetornoCodigo || ""}
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {item.enquadramento.acao === "abrir_retorno" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div>
                      <label htmlFor={`${uid}-motivo`} style={rotulo}>Motivo do retorno / novo defeito</label>
                      <textarea
                        id={`${uid}-motivo`}
                        ref={motivoRef}
                        rows={3}
                        maxLength={LIMITE_TEXTO_RETORNO_V4}
                        value={legado ? item.retornoAberto?.motivo ?? "" : motivo}
                        readOnly={legado}
                        disabled={!!busy}
                        onChange={(e) => { setMotivo(e.target.value); salvarRascunho({ motivo: e.target.value }); }}
                        placeholder="O que voltou a acontecer com o aparelho"
                        className={FOCO}
                        style={{ ...campo, resize: "vertical", minHeight: 72 }}
                      />
                      {legado ? <div style={{ marginTop: 4, fontSize: 11.5, color: C.subtle }}>Relato já registrado no retorno em aberto — o atendimento é aberto com ele.</div> : null}
                    </div>
                    {!legado ? (
                      <div>
                        <label htmlFor={`${uid}-obs`} style={rotulo}>Observação <span style={{ color: C.subtle, fontWeight: 500 }}>(opcional)</span></label>
                        <textarea id={`${uid}-obs`} rows={2} maxLength={LIMITE_TEXTO_RETORNO_V4} value={observacao} disabled={!!busy} onChange={(e) => { setObservacao(e.target.value); salvarRascunho({ observacao: e.target.value }); }} placeholder="Contexto novo, combinados com o cliente" className={FOCO} style={{ ...campo, resize: "vertical", minHeight: 56 }} />
                      </div>
                    ) : null}
                    <fieldset style={{ margin: 0, padding: 0, border: 0, minWidth: 0 }}>
                      <legend style={rotulo}>Acessórios entregues agora</legend>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {Array.from(new Set([...item.acessoriosOriginais, ...acessorios])).map((nome) => {
                          const marcado = acessorios.some((a) => a.toLocaleLowerCase("pt-BR") === nome.toLocaleLowerCase("pt-BR"));
                          return (
                            <label key={nome} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 9px", border: `1px solid ${marcado ? C.primaryBd : C.line2}`, borderRadius: 999, background: marcado ? C.primaryBg : C.surface, color: C.body, fontSize: 12, cursor: busy ? "default" : "pointer" }}>
                              <input type="checkbox" checked={marcado} disabled={!!busy} onChange={() => alternarAcessorio(nome)} />
                              {nome}
                            </label>
                          );
                        })}
                      </div>
                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <input aria-label="Outro acessório entregue agora" value={acessorioNovo} disabled={!!busy} onChange={(e) => setAcessorioNovo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (acessorioNovo.trim()) { alternarAcessorio(acessorioNovo.trim()); setAcessorioNovo(""); } } }} placeholder="Outro acessório" className={FOCO} style={{ ...campo, height: 32, padding: "0 10px" }} />
                        <button type="button" disabled={!!busy || !acessorioNovo.trim()} onClick={() => { alternarAcessorio(acessorioNovo.trim()); setAcessorioNovo(""); }} className={FOCO} style={{ ...btnSecundario, minHeight: 32 }}>Adicionar</button>
                      </div>
                      <div style={{ marginTop: 4, fontSize: 11.5, color: C.subtle }}>Os acessórios da entrada original são só sugestão: marque o que veio agora.</div>
                    </fieldset>
                    <div className={styles.grid2}>
                      <div>
                        <label htmlFor={`${uid}-senha`} style={rotulo}>Senha do aparelho <span style={{ color: C.subtle, fontWeight: 500 }}>(opcional)</span></label>
                        <input id={`${uid}-senha`} value={senha} disabled={!!busy} autoComplete="off" onChange={(e) => setSenha(e.target.value)} placeholder="Informada agora pelo cliente" className={FOCO} style={{ ...campo, height: 34, padding: "0 10px" }} />
                      </div>
                      <div>
                        <label htmlFor={`${uid}-senha-tipo`} style={rotulo}>Tipo da senha</label>
                        <select id={`${uid}-senha-tipo`} value={senhaTipo} disabled={!!busy || !senha.trim()} onChange={(e) => setSenhaTipo(e.target.value as SenhaTipoRetornoV4)} className={FOCO} style={{ ...campo, height: 34, padding: "0 8px" }}>
                          <option value="numerica">Numérica / PIN</option>
                          <option value="texto">Texto</option>
                          <option value="padrao">Padrão (desenho)</option>
                        </select>
                      </div>
                    </div>
                    <p style={{ margin: 0, fontSize: 11.5, color: C.subtle, lineHeight: 1.5 }}>
                      Abre um atendimento novo vinculado à {item.codigo}. A OS original não é alterada; nenhuma venda, cobrança, estoque ou garantia nova é criada.
                      {item.enquadramento.id === "fora_cobertura" ? " Sem cobertura confirmada: qualquer serviço cobrável é decidido no orçamento do atendimento." : ""}
                    </p>
                  </div>
                ) : null}

                {item.enquadramento.acao === "registrar_ocorrencia" ? (
                  <div>
                    <label htmlFor={`${uid}-ocorrencia`} style={rotulo}>Ocorrência (observação interna desta OS)</label>
                    <textarea id={`${uid}-ocorrencia`} ref={ocorrenciaRef} rows={3} maxLength={2000} value={ocorrencia} disabled={!!busy} onChange={(e) => setOcorrencia(e.target.value)} placeholder="O que o cliente relatou antes da retirada" className={FOCO} style={{ ...campo, resize: "vertical", minHeight: 72 }} />
                  </div>
                ) : null}

                {item.enquadramento.acao === "continuar_atendimento" && item.retornoAberto?.osRetornoId ? (
                  <button type="button" onClick={() => continuarNoAtendimento(item.retornoAberto!.osRetornoId!)} disabled={!!busy} className={FOCO} style={btnPrimario}>
                    Continuar no atendimento {item.retornoAberto.osRetornoCodigo || ""}
                  </button>
                ) : null}

                {item.enquadramento.acao === "aguardar" ? (
                  <button type="button" onClick={() => void carregarDetalhe(item.osId, { manterRascunho: true })} disabled={!!busy} className={FOCO} style={btnSecundario}>
                    Verificar novamente
                  </button>
                ) : null}

                {erro ? <div role="alert" style={{ padding: "9px 11px", border: `1px solid ${C.dangerBd}`, borderRadius: 8, background: C.dangerBg, color: C.dangerFg, fontSize: 12.5 }}>{erro}</div> : null}
                {aviso ? <div role="status" style={{ padding: "9px 11px", border: `1px solid ${C.successBd}`, borderRadius: 8, background: C.successBg, color: C.body, fontSize: 12.5 }}>{aviso}</div> : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className={styles.footer} style={{ borderTop: `1px solid ${C.line2}` }}>
          <button type="button" onClick={fechar} disabled={!!busy} className={FOCO} style={btnSecundario}>Fechar</button>
          {item?.enquadramento.acao === "abrir_retorno" ? (
            <button type="button" onClick={() => void abrir()} disabled={!!busy || (!legado && !motivo.trim())} className={FOCO} style={{ ...btnPrimario, opacity: busy || (!legado && !motivo.trim()) ? 0.55 : 1 }}>
              {busy === "abrir" ? "Abrindo atendimento…" : legado ? "Abrir atendimento deste retorno" : "Abrir atendimento de retorno"}
            </button>
          ) : null}
          {item?.enquadramento.acao === "registrar_ocorrencia" ? (
            <button type="button" onClick={() => void registrarOcorrencia()} disabled={!!busy || !ocorrencia.trim()} className={FOCO} style={{ ...btnPrimario, opacity: busy || !ocorrencia.trim() ? 0.55 : 1 }}>
              {busy === "ocorrencia" ? "Registrando…" : "Registrar ocorrência"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Vazio({ texto, tom }: { texto: string; tom?: "danger" }) {
  return (
    <div style={{ padding: "26px 12px", textAlign: "center", color: tom === "danger" ? C.dangerFg : C.subtle, fontSize: 12.5, border: `1px dashed ${C.line2}`, borderRadius: 10 }}>{texto}</div>
  );
}
