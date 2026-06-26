/**
 * Operações V4 Preview — estado local + derivação de "vals".
 *
 * Porta o `class Component extends DCLogic` do protótipo Cloud Design para
 * React: o estado vira `useState`, e `buildVals()` espelha o `renderVals()`
 * original (produz o objeto consumido pela UI). Tudo client-side, mock,
 * sem efeitos colaterais reais (handlers só trocam estado e disparam toast).
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ACC_DEF,
  ANEXOS,
  APONTAMENTOS,
  BANCADA_TEC,
  CAT_LABEL,
  CHECKLIST_DEF,
  CLIENTES_BUSCA,
  DASH_DIST,
  DASH_FILA,
  DIAG,
  ENTREGA_CHECK_DEF,
  EQUIP_DEF,
  FILA_COLS,
  FIN_HIST,
  FIS_DEF,
  GARANTIA,
  HIST_ALL,
  HIST_FILTER_DEF,
  KIND,
  MODE_DEF,
  MODULE_KPIS,
  MODULE_META,
  ORC_ITENS_INICIAIS,
  ORC_META,
  ORDER,
  ORIGEM_DEF,
  PDV_RECEBER,
  PENDING,
  PRIMARY,
  PRIO,
  RAIL_DEF,
  RESOLVED_RAW,
  RET_HIST,
  SEC_DEF,
  SLA_ROWS,
  STAGE_DEF,
  STATUS_LABEL,
  STEP_RESP,
  STEP_TIME,
  STEPS_DEF,
  TECH_DEF,
  TONE,
} from "./mock-data";
import { C, fmt } from "./tokens";
import type { V4FisEstado, V4State, V4Status, V4Stage, V4TriEstado } from "./types";
import { useLojaAtiva } from "@/lib/loja-ativa";
import type { OrdemServico } from "@/types/os";
import { useOrdensV4, useOrdemV4 } from "./use-ordens-v4";
import {
  adaptOsHeader,
  adaptPag,
  EMPTY_OS_VIEW,
  EMPTY_PAG_VIEW,
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
  estados: ["ok", "ruim", "ok", "ok", "ok", "ok", "nt", "ok"],
  tech: [true, true, true, false],
  estadoFis: ["avariado", "avariado", "ok", "ok", "ok"],
  faceId: false,
  bio: true,
  acessorios: [true, true, false, false],
  acessoriosDev: [true, true, false, false],
  entregaCheck: [true, true, false, false],
  histFilter: "todos",
  novaOS: false,
  novaTab: "buscar",
  novaEquip: "celular",
  novaOrigem: "balcao",
  secTipo: "padrao",
  pattern: [],
  recibo: false,
  orcItens: ORC_ITENS_INICIAIS,
  selectedOsId: null,
};

/** Cor de um botão segmentado tri-estado (ok / avaria / não-testado). */
function seg(active: boolean, kind: "ok" | "av" | "nt") {
  const map = {
    ok: { bg: C.successBg, fg: C.successFg, bd: C.successBd },
    av: { bg: C.dangerBg, fg: C.dangerFg, bd: C.dangerBd },
    nt: { bg: C.infoBg, fg: C.infoFg, bd: C.infoBd },
  } as const;
  return active ? map[kind] : { bg: C.surface, fg: C.subtle, bd: C.inputBd };
}

type Patch = Partial<V4State> | ((s: V4State) => Partial<V4State>);

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
  const advance = () => {
    const p = PRIMARY[st.status];
    if (p) {
      update({ status: p.to, stage: p.stage });
      notify("Status → " + (STATUS_LABEL[p.to] || p.to));
    }
  };
  const setStatusTo = (s: V4Status) => {
    update({ status: s });
    notify("Status → " + (STATUS_LABEL[s] || s));
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

  // ---- checklist entrada (tri-estado) ----
  const okCount = st.estados.filter((e) => e === "ok").length;
  const ruimCount = st.estados.filter((e) => e === "ruim").length;
  const ntCount = st.estados.filter((e) => e === "nt").length;
  const setEstado = (i: number, v: V4TriEstado) =>
    update((s) => {
      const a = s.estados.slice();
      a[i] = v;
      return { estados: a };
    });
  const checklist = CHECKLIST_DEF.map((label, i) => {
    const e = st.estados[i];
    const ok = seg(e === "ok", "ok"), ru = seg(e === "ruim", "av"), nt = seg(e === "nt", "nt");
    return {
      label,
      okBg: ok.bg, okFg: ok.fg, okBd: ok.bd,
      ruimBg: ru.bg, ruimFg: ru.fg, ruimBd: ru.bd,
      ntBg: nt.bg, ntFg: nt.fg, ntBd: nt.bd,
      onOk: () => setEstado(i, "ok"), onRuim: () => setEstado(i, "ruim"), onNt: () => setEstado(i, "nt"),
    };
  });

  const setFis = (i: number, v: V4FisEstado) =>
    update((s) => {
      const a = s.estadoFis.slice();
      a[i] = v;
      return { estadoFis: a };
    });
  const estadoFis = FIS_DEF.map((comp, i) => {
    const v = st.estadoFis[i];
    const ok = seg(v === "ok", "ok"), av = seg(v === "avariado", "av"), au = seg(v === "ausente", "nt");
    return {
      comp,
      okBg: ok.bg, okFg: ok.fg, okBd: ok.bd,
      avBg: av.bg, avFg: av.fg, avBd: av.bd,
      auBg: au.bg, auFg: au.fg, auBd: au.bd,
      onOk: () => setFis(i, "ok"), onAv: () => setFis(i, "avariado"), onAu: () => setFis(i, "ausente"),
    };
  });

  const toggleAcc = (i: number) =>
    update((s) => {
      const a = s.acessorios.slice();
      a[i] = !a[i];
      return { acessorios: a };
    });
  const acessorios = ACC_DEF.map((label, i) => ({
    label, on: st.acessorios[i], off: !st.acessorios[i], onToggle: () => toggleAcc(i),
  }));
  const toggleAccDev = (i: number) =>
    update((s) => {
      const a = s.acessoriosDev.slice();
      a[i] = !a[i];
      return { acessoriosDev: a };
    });
  const acessoriosDev = ACC_DEF.map((label, i) => ({
    label, on: st.acessoriosDev[i], off: !st.acessoriosDev[i], onToggle: () => toggleAccDev(i),
  }));

  const toggleEntregaCheck = (i: number) =>
    update((s) => {
      const a = s.entregaCheck.slice();
      a[i] = !a[i];
      return { entregaCheck: a };
    });
  const entregaCheck = ENTREGA_CHECK_DEF.map((label, i) => ({
    label,
    ok: st.entregaCheck[i],
    no: !st.entregaCheck[i],
    color: st.entregaCheck[i] ? C.body : C.subtle,
    onToggle: () => toggleEntregaCheck(i),
  }));
  const entregaCheckResumo = st.entregaCheck.filter(Boolean).length + "/" + ENTREGA_CHECK_DEF.length;

  const prioridades = (["baixa", "normal", "alta", "urgente"] as const).map((k) => {
    const sel = st.prioridade === k;
    const m = PRIO[k];
    return {
      label: m.label,
      onClick: () => {
        update({ prioridade: k });
        notify("Prioridade: " + m.label);
      },
      bg: sel ? C.primaryBg : C.surface,
      fg: sel ? C.primaryHover : C.muted,
      bd: sel ? C.primaryBd : C.inputBd,
    };
  });

  const toggleTech = (i: number) =>
    update((s) => {
      const t = s.tech.slice();
      t[i] = !t[i];
      return { tech: t };
    });
  const tech = TECH_DEF.map((label, i) => ({
    label, ok: st.tech[i], no: !st.tech[i], onToggle: () => toggleTech(i), color: st.tech[i] ? C.body : C.subtle,
  }));

  const cred = {
    faceMark: st.faceId ? "✓" : "＋", bioMark: st.bio ? "✓" : "＋",
    faceBg: st.faceId ? C.successBg : C.surface, faceFg: st.faceId ? C.successFg : C.muted, faceBd: st.faceId ? C.successBd : C.inputBd,
    bioBg: st.bio ? C.successBg : C.surface, bioFg: st.bio ? C.successFg : C.muted, bioBd: st.bio ? C.successBd : C.inputBd,
  };

  // ---- pipeline ----
  const pipeline = STAGE_DEF.map(([id, label, rep, sub]) => {
    const ri = ORDER.indexOf(rep);
    const after = id === "posvenda";
    const done = after ? false : ri < curIdx;
    const current = after ? false : ri === curIdx;
    const pending = after ? true : ri > curIdx;
    const selected = st.stage === id;
    return {
      id, label, sub, done, current, pending, ref: false, selected, onClick: () => go(id),
      bg: selected ? C.primarySoft : C.surface,
      underline: selected ? C.primary : "transparent",
      labelColor: selected ? C.primaryHover : pending ? C.muted : C.ink,
    };
  });
  const histSelected = st.stage === "historico";
  pipeline.push({
    id: "historico", label: "Histórico", sub: "6 eventos · 4 anexos",
    done: false, current: false, pending: false, ref: true, selected: histSelected,
    onClick: () => go("historico"),
    bg: histSelected ? C.primarySoft : C.surface,
    underline: histSelected ? C.primary : "transparent",
    labelColor: histSelected ? C.primaryHover : C.muted,
  });

  // ---- atividade (steps) ----
  const steps = STEPS_DEF.map(([label, s]) => {
    const si = ORDER.indexOf(s);
    const reached = si < curIdx, current = si === curIdx, pending = si > curIdx;
    const time = reached || current ? STEP_TIME[s] : "";
    return { label, reached, current, pending, time, resp: STEP_RESP[s] || "", empty: pending && !time };
  });

  // ---- histórico (filtrável) ----
  const hist = st.histFilter === "todos" ? HIST_ALL : HIST_ALL.filter((h) => h.type === st.histFilter);
  const histFilters = HIST_FILTER_DEF.map(([k, label]) => {
    const sel = st.histFilter === k;
    return {
      label, onClick: () => update({ histFilter: k }),
      bg: sel ? C.primaryBg : C.surface, fg: sel ? C.primaryHover : C.muted, bd: sel ? C.primaryBd : C.inputBd,
    };
  });

  const npsScale = [0, 1, 2, 3, 4].map(() => ({ bg: "#eceef1" }));

  // ---- menus ----
  const printItems = [
    { icon: "📄", label: "Imprimir OS (cliente)", onClick: () => notify("Gerando: OS do cliente") },
    { icon: "🛡", label: "Termo de Garantia", onClick: () => notify("Gerando: Termo de Garantia") },
    { icon: "📦", label: "Termo de Entrega", onClick: () => notify("Gerando: Termo de Entrega") },
    { icon: "🔒", label: "Via Interna", onClick: () => notify("Gerando: Via Interna") },
    { icon: "🏷", label: "Etiqueta", onClick: () => notify("Gerando: Etiqueta") },
    { icon: "🌐", label: "Portal do cliente", onClick: () => notify("Abrindo: Portal do cliente") },
  ];
  const moreItems: Array<{ icon: string; label: string; color: string; onClick: () => void }> = [
    { icon: "✏", label: "Editar OS", color: C.body, onClick: () => notify("Editar OS") },
    { icon: "⇄", label: "Trocar OS", color: C.body, onClick: () => notify("Trocar OS") },
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

  // ---- segurança / acesso ----
  const setSecTipo = (k: V4State["secTipo"]) => update({ secTipo: k });
  const secTipoBtns = SEC_DEF.map(([k, label]) => {
    const sel = st.secTipo === k;
    return {
      label, onClick: () => setSecTipo(k as V4State["secTipo"]),
      bg: sel ? C.black : "transparent", fg: sel ? C.white : C.muted,
    };
  });
  const patternAdd = (i: number) =>
    update((s) => (s.pattern.includes(i) ? {} : { pattern: [...s.pattern, i] }));
  const patternDots = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
    const ord = st.pattern.indexOf(i);
    const sel = ord >= 0;
    return {
      order: sel ? String(ord + 1) : "",
      onClick: () => patternAdd(i),
      bg: sel ? C.primary : C.surface, fg: C.white, bd: sel ? C.primary : C.dashed,
    };
  });
  const patternSeq = st.pattern.length ? st.pattern.map((i) => i + 1).join(" → ") : "toque os pontos na ordem";

  // ---- orçamento (interativo) ----
  const cycleKind = (id: number) => {
    const o = ["cobrado", "brinde", "desconto"] as const;
    update((s) => ({
      orcItens: s.orcItens.map((it) =>
        it.id === id ? { ...it, kind: o[(o.indexOf(it.kind) + 1) % 3] } : it,
      ),
    }));
  };
  const delItem = (id: number) =>
    update((s) => ({ orcItens: s.orcItens.filter((it) => it.id !== id) }));
  const orcItens = st.orcItens.map((it) => {
    const k = KIND[it.kind];
    return {
      nome: it.nome, cat: CAT_LABEL[it.cat] || it.cat, qtd: it.qtd, valor: fmt(it.valor * it.qtd),
      kindLabel: k.label, kindBg: k.bg, kindFg: k.fg,
      onCycle: () => cycleKind(it.id), onDel: () => delItem(it.id),
    };
  });
  let sub = 0, desc = 0, brinde = 0, custo = 0;
  st.orcItens.forEach((it) => {
    const t = it.valor * it.qtd;
    custo += it.custo * it.qtd;
    if (it.kind === "cobrado") sub += t;
    else if (it.kind === "desconto") desc += t;
    else if (it.kind === "brinde") brinde += t;
  });
  const total = sub - desc;
  const lucro = total - custo;
  const orcTotais = {
    subtotal: fmt(sub), desconto: "– " + fmt(desc), brinde: fmt(brinde),
    total: fmt(total), custo: fmt(custo), lucro: fmt(lucro),
  };

  const reciboData = {
    codigo: "OS-2026-0481", cliente: "Mariana Costa Lima", data: "14/06/2026 16:50",
    forma: "PIX", valor: "R$ 300,00", total: fmt(total), saldo: fmt(total - 300),
  };

  const prim = PRIMARY[st.status];
  const tone = TONE[st.status] || TONE.em_execucao;
  const prioM = PRIO[st.prioridade];

  // ---- handlers "visuais" (só notificam) ----
  const act = {
    addAvaria: () => notify("Nova avaria"),
    addFoto: () => notify("Adicionar foto"),
    toggleFace: () => update((s) => ({ faceId: !s.faceId })),
    toggleBio: () => update((s) => ({ bio: !s.bio })),
    assinarEntrada: () => notify("Capturar assinatura (entrada)"),
    salvarDiag: () => notify("Diagnóstico salvo"),
    gerarOrc: () => { go("orcamento"); notify("Orçamento gerado do laudo"); },
    abrirOSant: () => notify("Abrindo OS-2025-2207"),
    verTimelineAp: () => notify("Linha do tempo do aparelho"),
    verVersoes: () => notify("Versões do orçamento"),
    addServico: () => notify("Novo serviço"),
    addPeca: () => notify("Nova peça"),
    catalogo: () => notify("Catálogo de produtos"),
    enviarOrc: () => notify("Orçamento reenviado"),
    recusarOrc: () => notify("Recusar orçamento"),
    aprovarOrc: () => notify("Orçamento aprovado"),
    pedirPeca: () => notify("Pedir / reservar peça"),
    alterarTec: () => notify("Alterar técnico"),
    pausarTimer: () => notify("Cronômetro pausado"),
    pararTimer: () => notify("Cronômetro encerrado"),
    novoApontamento: () => notify("Novo apontamento"),
    pdv: () => notify("Abrindo PDV de Serviço"),
    registrarEntrega: () => notify("Entrega registrada"),
    assinarRetirada: () => notify("Assinatura de retirada"),
    aplicarSugestao: () => notify("Sugestão de garantia aplicada"),
    salvarGarantia: () => notify("Garantia salva"),
    imprimirTermo: () => notify("Gerando: Termo de Garantia"),
    termoEntrega: () => notify("Gerando: Termo de Entrega"),
    abrirRetorno: () => notify("Abrir retorno"),
    retornosCliente: () => notify("Retornos do cliente"),
    pesquisa: () => notify("Pesquisa de satisfação enviada"),
    agendar: () => notify("Contato agendado"),
    whatsappFollow: () => notify("Follow-up enviado (WhatsApp)"),
    whatsapp: () => notify("Atualização enviada (WhatsApp)"),
    novaObs: () => notify("Nova observação"),
    exportHist: () => notify("Exportando auditoria"),
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
    railSettings: () => notify("Configurações"),

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
    onTrocar: () => notify("Trocar OS"),
    toHistCliente: () => notify("Histórico do cliente"),

    menu: st.menu, menuPrint: st.menu === "print", menuMore: st.menu === "more",
    togglePrint: () => toggleMenu("print"), toggleMore: () => toggleMenu("more"),
    closeMenus: () => update({ menu: null }),
    printItems, moreItems,

    statusLabel: STATUS_LABEL[st.status], tone,
    primaryLabel: prim ? prim.label : "Concluído", hasPrimary: !!prim, noPrimary: !prim,
    onPrimary: () => advance(), showKbd: true,

    prio: { label: prioM.label, fg: prioM.fg, dot: prioM.dot }, prioridades,
    steps, checklist, check: { ok: okCount, ruim: ruimCount, nt: ntCount }, tech, estadoFis, acessorios, cred,
    acessoriosDev, entregaCheck, entregaCheckResumo,
    apontamentos: APONTAMENTOS, finHist: FIN_HIST, retHist: RET_HIST, npsScale,
    hist, histCount: hist.length, histFilters, anexos: ANEXOS, resolved, pending: PENDING, act,

    openNovaOS: () => update({ novaOS: true }), closeNovaOS: () => update({ novaOS: false }), novaOSOpen: st.novaOS,
    novaBuscar: st.novaTab === "buscar", novaNovo: st.novaTab === "novo",
    setNovaBuscar: () => update({ novaTab: "buscar" }), setNovaNovo: () => update({ novaTab: "novo" }),
    buscarBg: st.novaTab === "buscar" ? C.surface : "transparent",
    buscarFg: st.novaTab === "buscar" ? C.primaryHover : C.muted,
    novoBg: st.novaTab === "novo" ? C.surface : "transparent",
    novoFg: st.novaTab === "novo" ? C.primaryHover : C.muted,
    novaEquipBtns, novaOrigemBtns, clientesBusca,
    abrirOS: () => { update({ novaOS: false }); notify("Nova OS aberta"); },

    secTipoBtns, secPin: st.secTipo === "pin", secSenha: st.secTipo === "senha", secPadrao: st.secTipo === "padrao",
    patternDots, pattern: st.pattern, patternSeq, patternClear: () => update({ pattern: [] }),

    orcItens, orcTotais, addManual: () => notify("Adicionar item manual"),
    openRecibo: () => update({ recibo: true }), closeRecibo: () => update({ recibo: false }), reciboOpen: st.recibo, reciboData,

    diag: DIAG, orc: ORC_META, garantia: GARANTIA,
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
