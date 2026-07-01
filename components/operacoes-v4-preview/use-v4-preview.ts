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
  HIST_FILTER_DEF,
  MODE_DEF,
  MODULE_META,
  ORDER,
  PENDING,
  PRIMARY,
  PRIO,
  RAIL_DEF,
  RESOLVED_RAW,
  STAGE_DEF,
  STATUS_LABEL,
  STEPS_DEF,
  TONE,
} from "./mock-data";
import { C, fmt } from "./tokens";
import type { V4State, V4Status, V4Stage } from "./types";
import { useLojaAtiva } from "@/lib/loja-ativa";
import type { OrdemServico, Orcamento } from "@/types/os";
import { useOrdensV4, useOrdemV4 } from "./use-ordens-v4";
// Actions REAIS reaproveitadas da V3 (sem criar backend novo) — slices OPS-V4-ORCAMENTO-REAL-002 / -ENTRADA-RECEPCAO-REAL-003.
import { salvarDiagnosticoV3, salvarChecklistEntradaV3 } from "@/lib/operacoes-v3/workspace-actions";
import {
  gerarOrcamentoDaOS,
  salvarOrcamentoV3,
  aprovarOrcamentoV3,
  recusarOrcamentoV3,
} from "@/lib/operacoes-v3/orcamento-actions";
import { aplicarTransicaoStatusV3 } from "@/lib/operacoes-v3/status-actions";
import {
  salvarIdentificacaoV3,
  salvarProvaEntradaV3,
  salvarAcessoriosEntradaV3,
  type SalvarProvaEntradaInputV3,
} from "@/lib/operacoes-v3/prova-entrada-actions";
import type { IdentificacaoV3, AcessorioEntradaV3 } from "@/lib/operacoes-v3/prova-entrada-model";
import type { ChecklistEntradaItemV3 } from "@/lib/operacoes-v3/workspace-model";
import { editorToSalvarInputV4, seedEditorFromOS, type OrcamentoEditorV4 } from "@/lib/operacoes-v4/orcamento-form";
import { seedEntradaEditor, type EntradaEditorV4 } from "@/lib/operacoes-v4/entrada-form";
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
import {
  buildBancadaView,
  buildDashboardResumo,
  buildFilaItens,
  buildPdvView,
  buildSlaView,
} from "./rails-adapter";

/** Entrada do editor de diagnóstico V4 → action `salvarDiagnosticoV3`. */
export interface DiagnosticoInputV4 {
  inicial: string;
  final: string;
  causa: string;
  solucao: string;
}

/** Dados reais injetados no `buildVals` (leitura + ações de escrita reais da V3). */
export interface V4DataCtx {
  ordens: OrdemServico[];
  ordensLoading: boolean;
  ordensPrimeiraCarga: boolean;
  ordensError: string | null;
  reloadOrdens: () => void;
  /** Recarrega o detalhe da OS selecionada após uma escrita. */
  reloadDetail: () => void;
  /** OS selecionada já hidratada (detalhe) ou linha da lista enquanto carrega. */
  realOS: OrdemServico | null;
  detailLoading: boolean;
  // ---- Ações de escrita REAIS (slice OPS-V4-ORCAMENTO-REAL-002) ----
  // Cada uma chama uma action real da V3 (storeId+osId da loja/OS ativas),
  // recarrega lista+detalhe e devolve `true` em sucesso. Sem caixa/estoque/financeiro.
  salvarDiagnostico: (input: DiagnosticoInputV4) => Promise<boolean>;
  gerarOrcamento: () => Promise<boolean>;
  salvarOrcamento: (editor: OrcamentoEditorV4) => Promise<boolean>;
  aprovarOrcamento: () => Promise<boolean>;
  recusarOrcamento: (motivo?: string) => Promise<boolean>;
  iniciarDiagnostico: () => Promise<boolean>;
  iniciarServico: () => Promise<boolean>;
  // ---- Entrada/Recepção (slice OPS-V4-ENTRADA-RECEPCAO-REAL-003) ----
  salvarIdentificacao: (input: IdentificacaoV3) => Promise<boolean>;
  salvarProvaEntrada: (input: SalvarProvaEntradaInputV3) => Promise<boolean>;
  salvarAcessorios: (acessorios: AcessorioEntradaV3[]) => Promise<boolean>;
  salvarChecklist: (itens: ChecklistEntradaItemV3[]) => Promise<boolean>;
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
  recibo: false,
  selectedOsId: null,
  focus: false,
  authState: "autorizado",
  pin4: 3,
  pin6: 3,
  pattern: [0, 3, 4, 7],
  senha: "",
  motivo: "",
};

type Patch = Partial<V4State> | ((s: V4State) => Partial<V4State>);

/**
 * Mensagem honesta para qualquer ação que NÃO persiste nada nesta Preview (somente leitura).
 * Os botões de escrita do protótipo (avançar status, recibo, WhatsApp, exportar…) apenas
 * pré-visualizam o fluxo — nunca confirmam uma operação real. Trocar OS / Histórico /
 * Configurações também não navegam de verdade na Preview.
 *
 * EXCEÇÃO (OPS-V4-NOVA-OS-REAL-001): a "Nova OS" deixou de ser preview — cria uma OS REAL
 * na loja ativa via `criarOSEnterpriseV3` (o próprio modal faz a chamada; aqui só tratamos
 * o sucesso em `onOSCriada`). As demais ações da V4 seguem em preview.
 */
const PREVIEW_NOOP = "Indisponível na Preview — nenhuma alteração foi salva.";

export function buildVals(
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
  // Ação primária. SOMENTE as transições seguras desta fase persistem de verdade
  // (aberta → diagnostico; aprovado → em_execucao), via `aplicarTransicaoStatusV3`.
  // As demais (enviar orçamento, registrar aprovação, marcar pronta, receber
  // pagamento…) seguem PREVIEW honesto — não tocam estoque/caixa/financeiro/entrega.
  const advance = () => {
    const p = PRIMARY[st.status];
    if (!p) return;
    if (st.status === "aberta") {
      void ctx.iniciarDiagnostico();
      return;
    }
    if (st.status === "aprovado") {
      void ctx.iniciarServico();
      return;
    }
    update({ status: p.to, stage: p.stage });
    notify(PREVIEW_NOOP);
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
    // Escolher um modo de trabalho sai do Modo foco (as laterais voltam ao layout do modo).
    update({ left: lr[0], right: lr[1], focus: false, module: "workspace", view: "cockpit", menu: null });
    notify("Modo: " + { recepcao: "Recepção", bancada: "Bancada", auditoria: "Auditoria" }[mode]);
  };
  // Modo foco: recolhe rail + as duas gavetas de uma vez (e as reabre ao sair). Só estado visual.
  const toggleFocus = () => {
    update((s) => {
      const f = !s.focus;
      return { focus: f, left: !f, right: !f, menu: null, module: "workspace", view: "cockpit" };
    });
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
    // "Editar OS" leva à aba Entrada real (edição dos grupos seguros) — não é mais no-op.
    { icon: "✏", label: "Editar OS (Entrada)", color: C.body, onClick: () => go("entrada") },
    { icon: "⇄", label: "Trocar OS", color: C.body, onClick: () => notify(PREVIEW_NOOP) },
  ];
  if (st.status === "em_execucao" || st.status === "aprovado")
    moreItems.push({ icon: "⏸", label: "Marcar “Aguardando peça”", color: C.body, onClick: () => setStatusTo("aguardando_peca") });
  if (st.status === "aguardando_peca")
    moreItems.push({ icon: "▶", label: "Peça chegou — retomar", color: C.body, onClick: () => setStatusTo("em_execucao") });
  if (st.status !== "entregue" && st.status !== "cancelada")
    moreItems.push({ icon: "✕", label: "Cancelar OS", color: C.danger, onClick: () => setStatusTo("cancelada") });

  // ---- módulos (rail) — só metadados; as telas de módulo são protótipo sem dados fake ----
  const mod = MODULE_META[st.module] || MODULE_META.dashboard;

  // ---- auditoria ----
  const resolved = RESOLVED_RAW.map((r, i) => ({
    feat: r[0], detail: r[1], status: "✓", bg: i % 2 ? C.surface2 : C.surface,
  }));

  // ---- Nova OS ----
  // O formulário da Nova OS vive LOCALMENTE no `NovaOSModal` (decisão de design A) e
  // chama `criarOSEnterpriseV3` direto. Aqui só expomos abrir/fechar o modal e o
  // callback de sucesso `onOSCriada` (abaixo), que seleciona a OS criada e recarrega a lista.

  // ---- orçamento REAL da OS (view read-only) + estado de edição (slice 002) ----
  // A view read-only segue mostrando persistido/prévia/ausente. As flags abaixo
  // habilitam o EDITOR real: materializado = orçamento real (não sintetizado);
  // editável/decidível = materializado E status rascunho|enviado (mesma regra das
  // actions `salvarOrcamentoV3`/`aprovar`/`recusar`). O seed alimenta o editor V4.
  const orcamentoReal = realOS ? adaptOrcamento(realOS) : EMPTY_ORCAMENTO_VIEW;
  const orcRaw = (realOS as { orcamento?: Orcamento } | null)?.orcamento ?? null;
  const orcamentoMaterializado = !!orcRaw && orcRaw.sintetizado !== true;
  const orcStatusRaw = orcRaw?.status;
  const orcamentoEditavel = orcamentoMaterializado && (orcStatusRaw === "rascunho" || orcStatusRaw === "enviado");
  const orcamentoPodeDecidir = orcamentoEditavel;
  const orcamentoEditorSeed = seedEditorFromOS(realOS);

  // ---- Entrada/Recepção (slice 003): seed do editor a partir da OS real ----
  const entradaEditorSeed: EntradaEditorV4 = seedEntradaEditor(realOS);

  // ---- telas de rail (Visão geral / Fila / Bancada / SLA / PDV) ----
  // View-models READ-ONLY derivados da MESMA lista de OS reais já carregada
  // (`ctx.ordens`). Cada builder sinaliza `temDados` para a UI escolher entre dado
  // real e empty state honesto específico do módulo. Sem número/técnico/SLA fabricado.
  const dashboardResumo = buildDashboardResumo(ctx.ordens);
  const filaItens = buildFilaItens(ctx.ordens);
  const bancadaView = buildBancadaView(ctx.ordens);
  const slaView = buildSlaView(ctx.ordens);
  const pdvView = buildPdvView(ctx.ordens);

  // Seleciona a OS REAL (identidade/financeiro reais no workspace). Único caminho de
  // seleção — sempre por clique explícito do operador, nunca por fallback automático.
  const selectOS = (o: OrdemServico) => {
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
  };
  // Abrir a OS de uma linha de rail (Fila/Bancada/SLA/PDV) → leva ao workspace real.
  const openOSFromRail = (id: string) => {
    const o = ctx.ordens.find((x) => x.id === id);
    if (o) selectOS(o);
  };
  // Barra de busca do topo: leva ao seletor de OS real (limpa seleção; nunca auto-abre).
  const goToOSSearch = () =>
    update({ selectedOsId: null, module: "workspace", view: "cockpit", menu: null });

  // Nova OS criada (REAL) pelo modal → fecha o modal, abre a OS recém-criada no workspace
  // e recarrega a lista. Recebe apenas o id resultante; a identidade/financeiro são
  // hidratados pelo detalhe (`useOrdemV4`). Uma OS nova nasce "aberta" → etapa "entrada".
  const onOSCriada = (osId: string) => {
    update({
      novaOS: false,
      selectedOsId: osId,
      status: "aberta",
      stage: "entrada",
      module: "workspace",
      view: "cockpit",
      menu: null,
    });
    ctx.reloadOrdens();
    notify("OS criada e aberta no workspace.");
  };

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

  // ---- Segurança/autorização (PREVIEW) ----------------------------------------
  // Superfície 100% visual: PIN 4/6, padrão 3×3, senha/motivo e estados da
  // autorização. NADA autentica, NADA persiste, NÃO altera permissões reais —
  // apenas demonstra os componentes. A interação local serve só à demonstração.
  const SEG_PREVIEW = "Segurança é apenas demonstração na Preview — nada é autenticado nem salvo.";
  const mkPin = (n: number, filled: number) =>
    Array.from({ length: n }, (_, i) => {
      const on = i < filled;
      return {
        v: on ? "•" : "",
        bd: on ? C.primaryBd : C.inputBd,
        bg: on ? C.primarySoft : C.surface2,
      };
    });
  const pin4 = mkPin(4, st.pin4);
  const pin6 = mkPin(6, st.pin6);
  const patternSel = st.pattern;
  const patternCells = Array.from({ length: 9 }, (_, i) => {
    const pos = patternSel.indexOf(i);
    const on = pos >= 0;
    return {
      key: i,
      n: on ? String(pos + 1) : "",
      bd: on ? C.primary : C.inputBd,
      bg: on ? C.primary : "transparent",
      onClick: () =>
        update((s) => {
          const a = s.pattern.slice();
          const x = a.indexOf(i);
          if (x >= 0) a.splice(x, 1);
          else a.push(i);
          return { pattern: a };
        }),
    };
  });
  const patternHint = patternSel.length
    ? "sequência: " + patternSel.map((i) => i + 1).join(" → ")
    : "toque os pontos para desenhar";
  const AUTH_DEFS = [
    { key: "autorizado", label: "Autorizado", glyph: "✓", color: C.success, fg: C.successFg, bd: C.successBd, wash: C.successBg2 },
    { key: "negado", label: "Negado", glyph: "✕", color: C.danger, fg: C.dangerFg, bd: C.dangerBd, wash: C.dangerBg },
    { key: "expirado", label: "Expirado", glyph: "⏱", color: C.warn, fg: C.warnFg, bd: C.warnBd, wash: C.warnBg },
  ] as const;
  const authStates = AUTH_DEFS.map((d) => ({
    ...d,
    active: d.key === st.authState,
    opacity: d.key === st.authState ? 1 : 0.5,
    ring: d.key === st.authState ? `0 0 0 2px ${d.color}` : "none",
    onClick: () => update({ authState: d.key }),
  }));
  const curAuth = AUTH_DEFS.find((d) => d.key === st.authState) ?? AUTH_DEFS[0];
  const seg = {
    pin4,
    pin6,
    onPin4: () => update((s) => ({ pin4: (s.pin4 + 1) % 5 })),
    onPin6: () => update((s) => ({ pin6: (s.pin6 + 1) % 7 })),
    pattern: patternCells,
    patternHint,
    authStates,
    authLabel: curAuth.label,
    authColor: curAuth.color,
    authFg: curAuth.fg,
    senha: st.senha,
    motivo: st.motivo,
    onSenha: (val: string) => update({ senha: val }),
    onMotivo: (val: string) => update({ motivo: val }),
    onAutorizar: () => notify(SEG_PREVIEW),
    audit: [
      { dot: C.success, text: "Autorização concedida · alterar status crítico", meta: "preview" },
      { dot: C.danger, text: "Autorização negada · aprovar desconto", meta: "preview" },
      { dot: C.warn, text: "Sessão de autorização expirada", meta: "preview" },
    ],
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

    stage: st.stage, pipeline,
    isEntrada: st.stage === "entrada", isDiag: st.stage === "diagnostico", isOrc: st.stage === "orcamento",
    isExec: st.stage === "execucao", isFin: st.stage === "financeiro", isEntrega: st.stage === "entrega",
    isPos: st.stage === "posvenda", isHist: st.stage === "historico",
    isSeg: st.stage === "seguranca",

    leftOpen: st.left, leftClosed: !st.left, rightOpen: st.right, rightClosed: !st.right,
    toggleLeft: () => update((s) => ({ left: !s.left })),
    toggleRight: () => update((s) => ({ right: !s.right })),
    onTrocar: () => notify(PREVIEW_NOOP),
    toHistCliente: () => notify(PREVIEW_NOOP),

    // ---- Modo foco (recolhe rail + gavetas; só visual) ----
    focusActive: st.focus,
    focoLabel: st.focus ? "Sair do foco" : "Modo foco",
    onFoco: toggleFocus,

    // ---- Segurança (preview) ----
    seg,
    goSeguranca: () => update({ stage: "seguranca", module: "workspace", view: "cockpit", menu: null }),
    backFromSeguranca: () => update({ stage: "execucao", module: "workspace", view: "cockpit", menu: null }),

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
    // Nova OS real: o modal coleta o formulário localmente, cria via `criarOSEnterpriseV3`
    // e chama `onOSCriada(osId)` no sucesso (fecha modal + abre a OS criada + recarrega).
    onOSCriada,

    openRecibo: () => update({ recibo: true }), closeRecibo: () => update({ recibo: false }), reciboOpen: st.recibo,

    diag: diagnosticoReal, execucao: execucaoReal, orcamento: orcamentoReal, entrega: entregaReal,
    os: osView, pag: pagView,

    // ---- Diagnóstico / Orçamento REAIS (slice OPS-V4-ORCAMENTO-REAL-002) ----
    // Handlers de escrita reais (chamam actions da V3 e recarregam lista+detalhe).
    // Demais stages (Execução/Financeiro/Entrega/Pós-venda/Documentos/WhatsApp/PDV)
    // permanecem preview/read-only.
    salvarDiagnostico: ctx.salvarDiagnostico,
    gerarOrcamento: ctx.gerarOrcamento,
    salvarOrcamento: ctx.salvarOrcamento,
    aprovarOrcamento: ctx.aprovarOrcamento,
    recusarOrcamento: ctx.recusarOrcamento,
    orcamentoMaterializado,
    orcamentoEditavel,
    orcamentoPodeDecidir,
    orcamentoEditorSeed,

    // ---- Entrada/Recepção REAL (slice OPS-V4-ENTRADA-RECEPCAO-REAL-003) ----
    // Handlers reais (actions V3 prova-entrada/checklist). Fotos/assinatura/anexos/
    // documentos e os dados básicos avançados (defeito/prioridade/recepção/observações)
    // seguem preview/futuro (slice 3B).
    salvarIdentificacao: ctx.salvarIdentificacao,
    salvarProvaEntrada: ctx.salvarProvaEntrada,
    salvarAcessorios: ctx.salvarAcessorios,
    salvarChecklist: ctx.salvarChecklist,
    entradaEditorSeed,

    toast: st.toast, showToast: !!st.toast,

    // ---- seleção de OS real ----
    osSelected: !!st.selectedOsId,
    selectedOsId: st.selectedOsId,
    selectOS,
    openOSFromRail,
    goToOSSearch,
    clearSelection: () => update({ selectedOsId: null }),
    // lista real para o seletor
    ordens: ctx.ordens,
    ordensLoading: ctx.ordensLoading,
    ordensPrimeiraCarga: ctx.ordensPrimeiraCarga,
    ordensError: ctx.ordensError,
    reloadOrdens: ctx.reloadOrdens,
    detailLoading: ctx.detailLoading,

    // ---- telas de rail (identidade própria; dado real ou empty honesto) ----
    moduleId: st.module,
    dashboardResumo,
    filaItens,
    bancadaView,
    slaView,
    pdvView,
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
  const { ordem: ordemDetail, loading: detailLoading, reload: reloadDetail } = useOrdemV4(lojaAtivaId, st.selectedOsId);

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

  // ---- Ações de escrita REAIS (slice OPS-V4-ORCAMENTO-REAL-002) ----------------
  // Wrapper único: resolve loja/OS ativas (sem fallback loja-1), executa a action
  // real da V3, recarrega lista+detalhe e dá toast honesto. Devolve `true`/`false`.
  const selectedOsId = st.selectedOsId;
  const runWrite = useCallback(
    async (
      fn: (sid: string, osId: string) => Promise<unknown>,
      okMsg: string,
      after?: () => void,
    ): Promise<boolean> => {
      const sid = (lojaAtivaId ?? "").trim();
      const osId = (selectedOsId ?? "").trim();
      if (!sid || !osId) {
        notify("Selecione uma OS na loja ativa para concluir a ação.");
        return false;
      }
      try {
        await fn(sid, osId);
        reloadOrdens();
        reloadDetail();
        if (after) after();
        notify(okMsg);
        return true;
      } catch (e) {
        notify(e instanceof Error ? e.message : "Não foi possível concluir a ação.");
        return false;
      }
    },
    [lojaAtivaId, selectedOsId, reloadOrdens, reloadDetail, notify],
  );

  const salvarDiagnostico = useCallback(
    (input: DiagnosticoInputV4) =>
      runWrite((sid, osId) => salvarDiagnosticoV3(sid, osId, input), "Diagnóstico salvo."),
    [runWrite],
  );
  const gerarOrcamento = useCallback(
    () => runWrite((sid, osId) => gerarOrcamentoDaOS(sid, osId), "Orçamento gerado."),
    [runWrite],
  );
  const salvarOrcamento = useCallback(
    (editor: OrcamentoEditorV4) =>
      runWrite((sid, osId) => salvarOrcamentoV3(sid, osId, editorToSalvarInputV4(editor)), "Orçamento salvo."),
    [runWrite],
  );
  const aprovarOrcamento = useCallback(
    () => runWrite((sid, osId) => aprovarOrcamentoV3(sid, osId), "Orçamento aprovado.", () => update({ status: "aprovado" })),
    [runWrite, update],
  );
  const recusarOrcamento = useCallback(
    (motivo?: string) => runWrite((sid, osId) => recusarOrcamentoV3(sid, osId, motivo), "Orçamento recusado."),
    [runWrite],
  );
  const iniciarDiagnostico = useCallback(
    () =>
      runWrite(
        (sid, osId) => aplicarTransicaoStatusV3(sid, osId, "diagnostico"),
        "OS movida para diagnóstico.",
        () => update({ status: "diagnostico", stage: "diagnostico" }),
      ),
    [runWrite, update],
  );
  const iniciarServico = useCallback(
    () =>
      runWrite(
        (sid, osId) => aplicarTransicaoStatusV3(sid, osId, "em_execucao"),
        "Serviço iniciado.",
        () => update({ status: "em_execucao", stage: "execucao" }),
      ),
    [runWrite, update],
  );

  // ---- Entrada/Recepção (slice 003): handlers reais (prova-entrada / checklist) ----
  const salvarIdentificacao = useCallback(
    (input: IdentificacaoV3) =>
      runWrite((sid, osId) => salvarIdentificacaoV3(sid, osId, input), "Identificação salva."),
    [runWrite],
  );
  const salvarProvaEntrada = useCallback(
    (input: SalvarProvaEntradaInputV3) =>
      runWrite((sid, osId) => salvarProvaEntradaV3(sid, osId, input), "Prova de entrada salva."),
    [runWrite],
  );
  const salvarAcessorios = useCallback(
    (acessorios: AcessorioEntradaV3[]) =>
      runWrite((sid, osId) => salvarAcessoriosEntradaV3(sid, osId, acessorios), "Acessórios salvos."),
    [runWrite],
  );
  const salvarChecklist = useCallback(
    (itens: ChecklistEntradaItemV3[]) =>
      runWrite((sid, osId) => salvarChecklistEntradaV3(sid, osId, itens), "Checklist salvo."),
    [runWrite],
  );

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
      reloadDetail,
      realOS,
      detailLoading,
      salvarDiagnostico,
      gerarOrcamento,
      salvarOrcamento,
      aprovarOrcamento,
      recusarOrcamento,
      iniciarDiagnostico,
      iniciarServico,
      salvarIdentificacao,
      salvarProvaEntrada,
      salvarAcessorios,
      salvarChecklist,
    }),
    [
      ordens,
      ordensLoading,
      ordensPrimeiraCarga,
      ordensError,
      reloadOrdens,
      reloadDetail,
      realOS,
      detailLoading,
      salvarDiagnostico,
      gerarOrcamento,
      salvarOrcamento,
      aprovarOrcamento,
      recusarOrcamento,
      iniciarDiagnostico,
      iniciarServico,
      salvarIdentificacao,
      salvarProvaEntrada,
      salvarAcessorios,
      salvarChecklist,
    ],
  );

  return useMemo(() => buildVals(st, update, notify, ctx), [st, update, notify, ctx]);
}
