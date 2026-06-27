/**
 * Operações V4 Preview — estado local + derivação de "vals".
 *
 * Porta o `class Component extends DCLogic` do protótipo Cloud Design para
 * React: o estado vira `useState`, e `buildVals()` espelha o `renderVals()`
 * original (produz o objeto consumido pela UI). Os STAGES leem a OS REAL
 * (somente leitura, via `useOrdensV4`/`useOrdemV4`); o restante (rail,
 * dashboards, Nova OS) segue protótipo. Nenhum handler persiste nada — as
 * ações de escrita apenas pré-visualizam e disparam um toast honesto
 * (`PREVIEW_NOOP`): a Preview NÃO grava no banco.
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BANCADA_TEC,
  CLIENTES_BUSCA,
  DASH_DIST,
  DASH_FILA,
  EQUIP_DEF,
  FILA_COLS,
  HIST_FILTER_DEF,
  MODE_DEF,
  MODULE_KPIS,
  MODULE_META,
  ORDER,
  ORIGEM_DEF,
  PDV_RECEBER,
  PENDING,
  PRIMARY,
  PRIO,
  RAIL_DEF,
  RESOLVED_RAW,
  SLA_ROWS,
  STAGE_DEF,
  STATUS_LABEL,
  STEPS_DEF,
  TONE,
} from "./mock-data";
import { C, fmt } from "./tokens";
import type { V4State, V4Status, V4Stage } from "./types";
import { useLojaAtiva } from "@/lib/loja-ativa";
import type { OrdemServico } from "@/types/os";
import { useOrdensV4, useOrdemV4 } from "./use-ordens-v4";
import {
  adaptAcessoriosEntrada,
  adaptAnexos,
  adaptChecklist,
  adaptDiagnostico,
  adaptEntrega,
  adaptExecucao,
  adaptFinanceiro,
  adaptFotosEntrada,
  adaptObservacoes,
  adaptOrcamento,
  adaptOsHeader,
  adaptPag,
  adaptPosVenda,
  adaptSegurancaEntrada,
  adaptTimeline,
  EMPTY_DIAGNOSTICO_VIEW,
  EMPTY_ENTREGA_VIEW,
  EMPTY_POSVENDA_VIEW,
  EMPTY_EXECUCAO_VIEW,
  EMPTY_FINANCEIRO_VIEW,
  EMPTY_ORCAMENTO_VIEW,
  EMPTY_OS_VIEW,
  EMPTY_PAG_VIEW,
  EMPTY_SEGURANCA_ENTRADA,
  realPrioridadeToV4,
  realStatusToV4,
  stageForStatus,
} from "./os-adapter";

/** Dados reais injetados no `buildVals` (somente leitura, vindos das Server Actions). */
export interface V4DataCtx {
  ordens: OrdemServico[];
  ordensLoading: boolean;
  ordensPrimeiraCarga: boolean;
  ordensError: string | null;
  reloadOrdens: () => void;
  /** OS selecionada já hidratada (detalhe) ou linha da lista enquanto carrega. */
  realOS: OrdemServico | null;
  detailLoading: boolean;
}

const INITIAL: V4State = {
  view: "cockpit",
  module: "workspace",
  stage: "execucao",
  status: "em_execucao",
  left: true,
  right: true,
  menu: null,
  toast: "",
  prioridade: "alta",
  histFilter: "todos",
  novaOS: false,
  novaTab: "buscar",
  novaEquip: "celular",
  novaOrigem: "balcao",
  recibo: false,
  selectedOsId: null,
};

type Patch = Partial<V4State> | ((s: V4State) => Partial<V4State>);

/**
 * Mensagem honesta para qualquer ação que NÃO persiste nada nesta Preview (somente leitura).
 * Os botões de escrita do protótipo (avançar status, recibo, WhatsApp, exportar, "Abrir OS"…)
 * apenas pré-visualizam o fluxo — nunca confirmam uma operação real. Trocar OS / Histórico /
 * Configurações também não navegam de verdade na Preview.
 */
const PREVIEW_NOOP = "Indisponível na Preview — nenhuma alteração foi salva.";

function buildVals(
  st: V4State,
  update: (p: Patch) => void,
  notify: (msg: string) => void,
  ctx: V4DataCtx,
) {
  // OS real selecionada → identidade/financeiro reais (vazio honesto quando ausente).
  const realOS = ctx.realOS;
  const osView = realOS ? adaptOsHeader(realOS) : EMPTY_OS_VIEW;
  const pagView = realOS ? adaptPag(realOS) : EMPTY_PAG_VIEW;
  const timelineReal = realOS ? adaptTimeline(realOS) : [];
  const anexosReais = realOS ? adaptAnexos(realOS) : [];
  const observacoesReais = realOS ? adaptObservacoes(realOS) : [];
  // Financeiro REAL da OS (faturamento/parcelas) + histórico financeiro real
  // derivado da própria timeline. Sem baixa fabricada, sem recibo inventado.
  const financeiroReal = realOS ? adaptFinanceiro(realOS) : EMPTY_FINANCEIRO_VIEW;
  const finHistReal = timelineReal.filter((e) => e.type === "financeiro");
  // Diagnóstico REAL (defeito/observações/anexos/eventos); vazio honesto sem dado.
  const diagnosticoReal = realOS ? adaptDiagnostico(realOS) : EMPTY_DIAGNOSTICO_VIEW;
  // Execução REAL (técnico/checklist técnico/apontamentos/estoque/anexos de bancada);
  // vazio honesto quando não houver execução registrada. Sem técnico/timer/mock.
  const execucaoReal = realOS ? adaptExecucao(realOS) : EMPTY_EXECUCAO_VIEW;
  // Entrega REAL (retirada/assinatura/acessórios/eventos + garantia real); vazio
  // honesto quando a OS ainda não foi entregue. Sem retirada/garantia/checklist mock.
  const entregaReal = realOS ? adaptEntrega(realOS) : EMPTY_ENTREGA_VIEW;
  // Pós-venda REAL (garantia/retornos em garantia/eventos de pós-venda); vazio
  // honesto quando não houver registro. Sem NPS/satisfação/follow-up fabricados.
  const posVendaReal = realOS ? adaptPosVenda(realOS) : EMPTY_POSVENDA_VIEW;
  const curIdx = (() => {
    let i = ORDER.indexOf(st.status);
    if (i < 0) i = ORDER.indexOf("em_execucao");
    return i;
  })();

  const go = (stage: V4Stage) =>
    update({ stage, view: "cockpit", module: "workspace", menu: null });
  const setModule = (m: V4State["module"]) =>
    update({ module: m, view: "cockpit", menu: null });
  const setView = (v: V4State["view"]) => update({ view: v, menu: null });
  const toggleMenu = (m: "print" | "more") =>
    update((s) => ({ menu: s.menu === m ? null : m }));
  // Transições só pré-visualizam o fluxo no estado local — nada é persistido. O toast é honesto.
  const advance = () => {
    const p = PRIMARY[st.status];
    if (p) {
      update({ status: p.to, stage: p.stage });
      notify(PREVIEW_NOOP);
    }
  };
  const setStatusTo = (s: V4Status) => {
    update({ status: s });
    notify(PREVIEW_NOOP);
  };
  const setMode = (mode: "recepcao" | "bancada" | "auditoria") => {
    const map = {
      recepcao: [true, true],
      bancada: [false, false],
      auditoria: [false, true],
    } as const;
    const lr = map[mode] || [true, true];
    update({ left: lr[0], right: lr[1], module: "workspace", view: "cockpit", menu: null });
    notify("Modo: " + { recepcao: "Recepção", bancada: "Bancada", auditoria: "Auditoria" }[mode]);
  };

  // ---- rail ----
  const rail = RAIL_DEF.map(([id, label]) => {
    const active =
      id === "workspace"
        ? st.view === "cockpit" && st.module === "workspace"
        : st.view === "cockpit" && st.module === id;
    return {
      id,
      label,
      bg: active ? C.black : "transparent",
      fg: active ? C.white : C.subtle,
      onClick: () => setModule(id === "workspace" ? "workspace" : (id as V4State["module"])),
    };
  });

  // ---- modos ----
  let curMode = "custom";
  if (st.left && st.right) curMode = "recepcao";
  else if (!st.left && !st.right) curMode = "bancada";
  else if (!st.left && st.right) curMode = "auditoria";
  const modeBtns = MODE_DEF.map(([k, label, icon, hint]) => {
    const sel = curMode === k && st.view === "cockpit" && st.module === "workspace";
    return {
      label,
      icon,
      hint,
      onClick: () => setMode(k),
      bg: sel ? C.surface : "transparent",
      fg: sel ? C.primaryHover : C.muted,
      shadow: sel ? "0 1px 2px rgba(17,19,26,.12)" : "none",
    };
  });

  // ---- checklist de entrada (REAL da OS; vazio honesto quando não registrado) ----
  // Exibição somente-leitura do estado real de cada item; nada de tri-estado mock.
  const checklistReal = realOS ? adaptChecklist(realOS) : [];
  const checklist = checklistReal.map((it) => {
    const m =
      it.estado === "ok"
        ? { label: "OK", bg: C.successBg, fg: C.successFg, bd: C.successBd }
        : it.estado === "ruim"
          ? { label: "RUIM", bg: C.dangerBg, fg: C.dangerFg, bd: C.dangerBd }
          : { label: "N/T", bg: C.infoBg, fg: C.infoFg, bd: C.infoBd };
    return {
      id: it.id,
      label: it.label,
      observacao: it.observacao,
      estadoLabel: m.label,
      bg: m.bg,
      fg: m.fg,
      bd: m.bd,
    };
  });
  const check = {
    ok: checklistReal.filter((c) => c.estado === "ok").length,
    ruim: checklistReal.filter((c) => c.estado === "ruim").length,
    nt: checklistReal.filter((c) => c.estado === "nao_testado").length,
  };
  const checklistVazio = checklistReal.length === 0;

  // ---- Entrada: acessórios / fotos / segurança REAIS (vazio honesto) ----
  // Leitura direta da OS real selecionada; quando ausente, listas vazias /
  // segurança sem credencial — nada de valor inventado.
  const entradaAcessorios = realOS ? adaptAcessoriosEntrada(realOS) : [];
  const entradaFotos = realOS ? adaptFotosEntrada(realOS) : [];
  const entradaSeguranca = realOS ? adaptSegurancaEntrada(realOS) : EMPTY_SEGURANCA_ENTRADA;

  // ---- pipeline ----
  // Legendas (sub) das etapas do fluxo eram placeholders fabricados ("Bancada 02",
  // "saldo R$ 590"…) → removidas. Só o nó Histórico exibe um sub REAL derivado da
  // OS (contagem de eventos/anexos), ocultado quando vazio.
  const pipeline = STAGE_DEF.map(([id, label, rep]) => {
    const ri = ORDER.indexOf(rep);
    const after = id === "posvenda";
    const done = after ? false : ri < curIdx;
    const current = after ? false : ri === curIdx;
    const pending = after ? true : ri > curIdx;
    const selected = st.stage === id;
    return {
      id, label, sub: "", done, current, pending, ref: false, selected, onClick: () => go(id),
      bg: selected ? C.primarySoft : C.surface,
      underline: selected ? C.primary : "transparent",
      labelColor: selected ? C.primaryHover : pending ? C.muted : C.ink,
    };
  });
  const histSelected = st.stage === "historico";
  const histSubParts: string[] = [];
  if (timelineReal.length) histSubParts.push(`${timelineReal.length} ${timelineReal.length === 1 ? "evento" : "eventos"}`);
  if (anexosReais.length) histSubParts.push(`${anexosReais.length} ${anexosReais.length === 1 ? "anexo" : "anexos"}`);
  pipeline.push({
    id: "historico", label: "Histórico", sub: histSubParts.join(" · "),
    done: false, current: false, pending: false, ref: true, selected: histSelected,
    onClick: () => go("historico"),
    bg: histSelected ? C.primarySoft : C.surface,
    underline: histSelected ? C.primary : "transparent",
    labelColor: histSelected ? C.primaryHover : C.muted,
  });

  // ---- atividade (steps) ----
  // Progressão do pipeline é derivada do status REAL; não inventamos data/responsável
  // por etapa (sem timeline fake). O histórico real fica na etapa "Histórico".
  const steps = STEPS_DEF.map(([label, s]) => {
    const si = ORDER.indexOf(s);
    const reached = si < curIdx, current = si === curIdx, pending = si > curIdx;
    return { label, reached, current, pending, time: "", resp: "", empty: pending };
  });

  // ---- histórico real (filtrável) ----
  const hist = st.histFilter === "todos" ? timelineReal : timelineReal.filter((h) => h.type === st.histFilter);
  const histFilters = HIST_FILTER_DEF.map(([k, label]) => {
    const sel = st.histFilter === k;
    return {
      label, onClick: () => update({ histFilter: k }),
      bg: sel ? C.primaryBg : C.surface, fg: sel ? C.primaryHover : C.muted, bd: sel ? C.primaryBd : C.inputBd,
    };
  });

  // ---- menus ----
  // Documentos são protótipo: não geram/abrem nada na Preview → toast honesto.
  const printItems = [
    { icon: "📄", label: "Imprimir OS (cliente)", onClick: () => notify(PREVIEW_NOOP) },
    { icon: "🛡", label: "Termo de Garantia", onClick: () => notify(PREVIEW_NOOP) },
    { icon: "📦", label: "Termo de Entrega", onClick: () => notify(PREVIEW_NOOP) },
    { icon: "🔒", label: "Via Interna", onClick: () => notify(PREVIEW_NOOP) },
    { icon: "🏷", label: "Etiqueta", onClick: () => notify(PREVIEW_NOOP) },
    { icon: "🌐", label: "Portal do cliente", onClick: () => notify(PREVIEW_NOOP) },
  ];
  const moreItems: Array<{ icon: string; label: string; color: string; onClick: () => void }> = [
    { icon: "✏", label: "Editar OS", color: C.body, onClick: () => notify(PREVIEW_NOOP) },
    { icon: "⇄", label: "Trocar OS", color: C.body, onClick: () => notify(PREVIEW_NOOP) },
  ];
  if (st.status === "em_execucao" || st.status === "aprovado")
    moreItems.push({ icon: "⏸", label: "Marcar “Aguardando peça”", color: C.body, onClick: () => setStatusTo("aguardando_peca") });
  if (st.status === "aguardando_peca")
    moreItems.push({ icon: "▶", label: "Peça chegou — retomar", color: C.body, onClick: () => setStatusTo("em_execucao") });
  if (st.status !== "entregue" && st.status !== "cancelada")
    moreItems.push({ icon: "✕", label: "Cancelar OS", color: C.danger, onClick: () => setStatusTo("cancelada") });

  // ---- módulos ----
  const mod = {
    ...(MODULE_META[st.module] || MODULE_META.dashboard),
    kpis: MODULE_KPIS[st.module] || MODULE_KPIS.dashboard,
  };

  // ---- auditoria ----
  const resolved = RESOLVED_RAW.map((r, i) => ({
    feat: r[0], detail: r[1], status: "✓", bg: i % 2 ? C.surface2 : C.surface,
  }));

  // ---- Nova OS ----
  const novaEquipBtns = EQUIP_DEF.map(([k, label]) => {
    const sel = st.novaEquip === k;
    return {
      label, onClick: () => update({ novaEquip: k }),
      bg: sel ? C.black : C.surface, fg: sel ? C.white : C.muted, bd: sel ? C.black : C.inputBd,
    };
  });
  const novaOrigemBtns = ORIGEM_DEF.map(([k, label]) => {
    const sel = st.novaOrigem === k;
    return {
      label, onClick: () => update({ novaOrigem: k }),
      bg: sel ? C.primaryBg : C.surface, fg: sel ? C.primaryHover : C.muted, bd: sel ? C.primaryBd : C.inputBd,
    };
  });
  const clientesBusca = CLIENTES_BUSCA.map((c) => ({
    ...c,
    onClick: () => {
      update({ novaTab: "novo" });
      notify("Cliente: " + c.nome);
    },
  }));

  // ---- orçamento REAL da OS (somente leitura; vazio honesto quando ausente) ----
  // Persistido (status enum real) / prévia sintetizada / ausente. Sem edição,
  // sem toggle cobrado/brinde/desconto, sem custo/lucro inventado.
  const orcamentoReal = realOS ? adaptOrcamento(realOS) : EMPTY_ORCAMENTO_VIEW;

  const prim = PRIMARY[st.status];
  const tone = TONE[st.status] || TONE.em_execucao;
  const prioM = PRIO[st.prioridade];

  // ---- handlers "visuais" (não persistem nada → toast honesto de Preview) ----
  const act = {
    addFoto: () => notify(PREVIEW_NOOP),
    pdv: () => notify(PREVIEW_NOOP),
    whatsapp: () => notify(PREVIEW_NOOP),
    novaObs: () => notify(PREVIEW_NOOP),
    exportHist: () => notify(PREVIEW_NOOP),
  };

  return {
    view: st.view,
    isAuditoria: st.view === "auditoria",
    isWorkspace: st.view === "cockpit" && st.module === "workspace",
    isModule: st.view === "cockpit" && st.module !== "workspace",
    goCockpit: () => setModule("workspace"),
    goAuditoria: () => setView("auditoria"),
    railWorkspace: () => setModule("workspace"),
    railFila: () => setModule("fila"),
    railSettings: () => notify(PREVIEW_NOOP),

    rail, modeBtns,
    mod,
    modDash: st.module === "dashboard", modFila: st.module === "fila",
    modBancada: st.module === "bancada", modSla: st.module === "sla", modPdv: st.module === "pdv",
    filaCols: FILA_COLS, bancadaTec: BANCADA_TEC, slaRows: SLA_ROWS,
    pdvReceber: PDV_RECEBER, dashDist: DASH_DIST, dashFila: DASH_FILA,

    stage: st.stage, pipeline,
    isEntrada: st.stage === "entrada", isDiag: st.stage === "diagnostico", isOrc: st.stage === "orcamento",
    isExec: st.stage === "execucao", isFin: st.stage === "financeiro", isEntrega: st.stage === "entrega",
    isPos: st.stage === "posvenda", isHist: st.stage === "historico",

    leftOpen: st.left, leftClosed: !st.left, rightOpen: st.right, rightClosed: !st.right,
    toggleLeft: () => update((s) => ({ left: !s.left })),
    toggleRight: () => update((s) => ({ right: !s.right })),
    onTrocar: () => notify(PREVIEW_NOOP),
    toHistCliente: () => notify(PREVIEW_NOOP),

    menu: st.menu, menuPrint: st.menu === "print", menuMore: st.menu === "more",
    togglePrint: () => toggleMenu("print"), toggleMore: () => toggleMenu("more"),
    closeMenus: () => update({ menu: null }),
    printItems, moreItems,

    statusLabel: STATUS_LABEL[st.status], tone,
    primaryLabel: prim ? prim.label : "Concluído", hasPrimary: !!prim, noPrimary: !prim,
    onPrimary: () => advance(), showKbd: true,

    prio: { label: prioM.label, fg: prioM.fg, dot: prioM.dot },
    steps, checklist, check, checklistVazio,
    entradaAcessorios, entradaFotos, entradaSeguranca,
    financeiro: financeiroReal, finHist: finHistReal, posVenda: posVendaReal,
    hist, histCount: hist.length, histFilters, anexos: anexosReais, observacoes: observacoesReais,
    resolved, pending: PENDING, act,

    openNovaOS: () => update({ novaOS: true }), closeNovaOS: () => update({ novaOS: false }), novaOSOpen: st.novaOS,
    novaBuscar: st.novaTab === "buscar", novaNovo: st.novaTab === "novo",
    setNovaBuscar: () => update({ novaTab: "buscar" }), setNovaNovo: () => update({ novaTab: "novo" }),
    buscarBg: st.novaTab === "buscar" ? C.surface : "transparent",
    buscarFg: st.novaTab === "buscar" ? C.primaryHover : C.muted,
    novoBg: st.novaTab === "novo" ? C.surface : "transparent",
    novoFg: st.novaTab === "novo" ? C.primaryHover : C.muted,
    novaEquipBtns, novaOrigemBtns, clientesBusca,
    abrirOS: () => { update({ novaOS: false }); notify(PREVIEW_NOOP); },

    openRecibo: () => update({ recibo: true }), closeRecibo: () => update({ recibo: false }), reciboOpen: st.recibo,

    diag: diagnosticoReal, execucao: execucaoReal, orcamento: orcamentoReal, entrega: entregaReal,
    os: osView, pag: pagView,

    toast: st.toast, showToast: !!st.toast,

    // ---- seleção de OS real ----
    osSelected: !!st.selectedOsId,
    selectedOsId: st.selectedOsId,
    selectOS: (o: OrdemServico) => {
      update({
        selectedOsId: o.id,
        status: realStatusToV4(o.status),
        prioridade: realPrioridadeToV4(o.prioridade),
        stage: stageForStatus(o.status),
        module: "workspace",
        view: "cockpit",
        menu: null,
      });
      notify("OS " + (o.codigo || "") + " carregada");
    },
    clearSelection: () => update({ selectedOsId: null }),
    // lista real para o seletor
    ordens: ctx.ordens,
    ordensLoading: ctx.ordensLoading,
    ordensPrimeiraCarga: ctx.ordensPrimeiraCarga,
    ordensError: ctx.ordensError,
    reloadOrdens: ctx.reloadOrdens,
    detailLoading: ctx.detailLoading,
  };
}

export type V4Vals = ReturnType<typeof buildVals>;

/** Hook principal do Preview: mantém o estado e devolve o objeto `vals`. */
export function useV4Preview(): V4Vals {
  const [st, setSt] = useState<V4State>(INITIAL);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { lojaAtivaId } = useLojaAtiva();
  const {
    ordens,
    loading: ordensLoading,
    primeiraCarga: ordensPrimeiraCarga,
    error: ordensError,
    reload: reloadOrdens,
  } = useOrdensV4(lojaAtivaId);
  const { ordem: ordemDetail, loading: detailLoading } = useOrdemV4(lojaAtivaId, st.selectedOsId);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const update = useCallback((p: Patch) => {
    setSt((prev) => ({ ...prev, ...(typeof p === "function" ? p(prev) : p) }));
  }, []);

  const notify = useCallback((msg: string) => {
    if (timer.current) clearTimeout(timer.current);
    setSt((prev) => ({ ...prev, toast: msg, menu: null }));
    timer.current = setTimeout(() => setSt((prev) => ({ ...prev, toast: "" })), 1900);
  }, []);

  // OS real: detalhe hidratado quando já carregou; senão, a linha da lista (identidade imediata).
  const realOS = useMemo<OrdemServico | null>(() => {
    if (!st.selectedOsId) return null;
    if (ordemDetail && ordemDetail.id === st.selectedOsId) return ordemDetail;
    return ordens.find((o) => o.id === st.selectedOsId) ?? null;
  }, [st.selectedOsId, ordemDetail, ordens]);

  const ctx = useMemo<V4DataCtx>(
    () => ({
      ordens,
      ordensLoading,
      ordensPrimeiraCarga,
      ordensError,
      reloadOrdens,
      realOS,
      detailLoading,
    }),
    [ordens, ordensLoading, ordensPrimeiraCarga, ordensError, reloadOrdens, realOS, detailLoading],
  );

  return useMemo(() => buildVals(st, update, notify, ctx), [st, update, notify, ctx]);
}
