// ============================================================================
// Operações V3 — OS Workspace Enterprise · MODELO puro (prontuário do equipamento)
// ----------------------------------------------------------------------------
// Módulo PURO (sem I/O, sem React, sem Prisma). Lê os campos operacionais da OS
// a partir do que JÁ existe no DTO + extras persistidos no `payload` (JSONB):
//   • checklist de entrada  → `payload.checklist` (compatível com o V2/`os.checklist`)
//   • senha + acessórios    → `senhaEquipamento`/`senhaEquipamentoTipo` + `equipamento.acessorios`
//   • diagnóstico técnico    → `payload.diagnosticoV3` (campo novo, sobrevive ao spread)
//   • recepção (datas/local) → `payload.aberturaV3.recepcao` (gravado pela Nova OS)
//   • timeline operacional   → derivada de `os.timeline` + status (NÃO inventa dados)
//
// Nenhuma função aqui escreve nada nem simula recebimento/estoque/financeiro.
// ============================================================================

import type { EventoTimeline, EventoTipo, OrdemServico } from "@/types/os";
import { statusMetaV3, statusV3FromOS, type OperacaoStatusV3 } from "./status-machine";
import { formatarDataOperacionalV3, lerDatasOSV3, previsaoVencidaV3, rotuloEntradaV3 } from "./datas-operacionais-model";

// ----------------------------------------------------------------------------
// Checklist de entrada (item 4)
// ----------------------------------------------------------------------------

export type ChecklistEstadoV3 = "ok" | "ruim" | "nao_testado";

export interface ChecklistEntradaItemV3 {
  id: string;
  label: string;
  estado: ChecklistEstadoV3;
}

/** Componentes inspecionados na entrada (prontuário). */
export const CHECKLIST_ENTRADA_PADRAO_V3: { id: string; label: string }[] = [
  { id: "liga", label: "Liga" },
  { id: "touch", label: "Touch funciona" },
  { id: "face_id", label: "Face ID" },
  { id: "biometria", label: "Biometria" },
  { id: "wifi", label: "Wi-Fi" },
  { id: "bluetooth", label: "Bluetooth" },
  { id: "camera_frontal", label: "Câmera frontal" },
  { id: "camera_traseira", label: "Câmera traseira" },
  { id: "alto_falante", label: "Alto-falante" },
  { id: "microfone", label: "Microfone" },
  { id: "vibracao", label: "Vibração" },
  { id: "botoes", label: "Botões" },
  { id: "carregamento", label: "Carregamento" },
];

export const CHECKLIST_ESTADO_META_V3: Record<ChecklistEstadoV3, { label: string; tone: "success" | "danger" | "neutral" }> = {
  ok: { label: "OK", tone: "success" },
  ruim: { label: "Ruim", tone: "danger" },
  nao_testado: { label: "N/T", tone: "neutral" },
};

function isChecklistEstado(v: unknown): v is ChecklistEstadoV3 {
  return v === "ok" || v === "ruim" || v === "nao_testado";
}

/**
 * Lê o checklist de entrada. Preferência: `os.checklist` (V2/legado) quando
 * existir; senão, a lista padrão V3 com tudo "não testado". Nunca inventa estado.
 */
export function lerChecklistEntradaV3(os: OrdemServico | null | undefined): ChecklistEntradaItemV3[] {
  const raw = (os as { checklist?: unknown } | null | undefined)?.checklist;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((c, i) => {
      const item = c as { id?: unknown; label?: unknown; estado?: unknown };
      return {
        id: typeof item.id === "string" && item.id ? item.id : `chk-${i}`,
        label: typeof item.label === "string" && item.label ? item.label : `Item ${i + 1}`,
        estado: isChecklistEstado(item.estado) ? item.estado : "nao_testado",
      };
    });
  }
  return CHECKLIST_ENTRADA_PADRAO_V3.map((c) => ({ ...c, estado: "nao_testado" as ChecklistEstadoV3 }));
}

export interface ChecklistResumoV3 {
  ok: number;
  ruim: number;
  naoTestado: number;
  total: number;
}

export function resumoChecklistV3(itens: ChecklistEntradaItemV3[]): ChecklistResumoV3 {
  return {
    ok: itens.filter((i) => i.estado === "ok").length,
    ruim: itens.filter((i) => i.estado === "ruim").length,
    naoTestado: itens.filter((i) => i.estado === "nao_testado").length,
    total: itens.length,
  };
}

// ----------------------------------------------------------------------------
// Senha + acessórios (item 5)
// ----------------------------------------------------------------------------

export type SenhaTipoV3 = "numerica" | "texto" | "padrao";

export interface SenhaAcessoriosV3 {
  senha: string;
  senhaTipo: SenhaTipoV3;
  acessorios: string[];
}

/** Acessórios padrão recebidos no balcão. */
export const ACESSORIOS_RECEBIDOS_PADRAO_V3: string[] = [
  "Chip",
  "Carregador",
  "Cabo",
  "Película",
  "Capinha",
  "Cartão de memória",
];

function isSenhaTipo(v: unknown): v is SenhaTipoV3 {
  return v === "numerica" || v === "texto" || v === "padrao";
}

export function lerSenhaAcessoriosV3(os: OrdemServico | null | undefined): SenhaAcessoriosV3 {
  const senha = typeof os?.senhaEquipamento === "string" ? os.senhaEquipamento : "";
  const senhaTipo = isSenhaTipo(os?.senhaEquipamentoTipo) ? os.senhaEquipamentoTipo : "numerica";
  const acessorios = Array.isArray(os?.equipamento?.acessorios)
    ? os.equipamento.acessorios.filter((a): a is string => typeof a === "string" && a.trim().length > 0)
    : [];
  return { senha, senhaTipo, acessorios };
}

// ----------------------------------------------------------------------------
// Diagnóstico técnico (item 6) — campo novo no payload (`diagnosticoV3`)
// ----------------------------------------------------------------------------

export interface DiagnosticoTecnicoV3 {
  inicial: string;
  final: string;
  causa: string;
  solucao: string;
  atualizadoEm?: string;
  atualizadoPor?: string;
}

export function diagnosticoVazioV3(): DiagnosticoTecnicoV3 {
  return { inicial: "", final: "", causa: "", solucao: "" };
}

export function lerDiagnosticoV3(os: OrdemServico | null | undefined): DiagnosticoTecnicoV3 {
  const d = (os as { diagnosticoV3?: unknown } | null | undefined)?.diagnosticoV3 as Partial<DiagnosticoTecnicoV3> | undefined;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  // Semente a partir do diagnóstico inicial da Nova OS (aberturaV3), quando não houver diagnóstico V3 ainda.
  const abertura = (os as { aberturaV3?: { diagnosticoInicial?: { diagnosticoTecnico?: unknown; solucaoPrevista?: unknown } } } | null | undefined)?.aberturaV3;
  return {
    inicial: str(d?.inicial) || str(abertura?.diagnosticoInicial?.diagnosticoTecnico),
    final: str(d?.final),
    causa: str(d?.causa),
    solucao: str(d?.solucao) || str(abertura?.diagnosticoInicial?.solucaoPrevista),
    atualizadoEm: typeof d?.atualizadoEm === "string" ? d.atualizadoEm : undefined,
    atualizadoPor: typeof d?.atualizadoPor === "string" ? d.atualizadoPor : undefined,
  };
}

export function diagnosticoPreenchidoV3(d: DiagnosticoTecnicoV3): boolean {
  return !!(d.inicial.trim() || d.final.trim() || d.causa.trim() || d.solucao.trim());
}

// ----------------------------------------------------------------------------
// Recepção (datas/local) — lida da Nova OS (aberturaV3) com fallback honesto
// ----------------------------------------------------------------------------

export interface RecepcaoV3 {
  /** ISO bruta (compatível): entrada registrada, ou o cadastro no legado. Para EXIBIR use `entradaTexto`. */
  dataEntrada?: string;
  /** ISO bruta (compatível, regra de SLA): previsão, ou o prazo interno. Para EXIBIR use `previsaoTexto`. */
  previsaoEntrega?: string;
  recebidoPor?: string;
  origem?: string;
  localFisico?: string;
  /** "Entrada" ou "Cadastro" — o cadastro nunca aparece como entrada confirmada. */
  entradaRotulo?: string;
  /** Entrada no fuso da loja (só-dia sem horário); "" quando não há data. */
  entradaTexto?: string;
  /** Previsão de entrega COMBINADA; "" = não informada. */
  previsaoTexto?: string;
  /** A previsão combinada já passou e o aparelho não foi entregue (aviso honesto, calculado agora). */
  previsaoVencida?: boolean;
  /** Prazo interno (automático/legado) quando não é a previsão combinada; "" = nenhum. */
  prazoInternoTexto?: string;
}

export function lerRecepcaoV3(os: OrdemServico | null | undefined): RecepcaoV3 {
  const r = (os as { aberturaV3?: { recepcao?: Record<string, unknown> } } | null | undefined)?.aberturaV3?.recepcao;
  const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
  const datas = lerDatasOSV3(os);
  return {
    dataEntrada: str(r?.dataEntrada) ?? os?.criadoEm,
    previsaoEntrega: str(r?.previsaoEntrega) ?? os?.sla?.prazo,
    recebidoPor: str(r?.recebidoPor),
    origem: str(r?.origem) ?? os?.origem,
    localFisico: str(r?.localFisico),
    entradaRotulo: datas.semEntradaFisica ? "Entrada" : rotuloEntradaV3(datas.entradaOuCadastro),
    entradaTexto: datas.semEntradaFisica ? "Aparelho não está na loja" : formatarDataOperacionalV3(datas.entradaOuCadastro),
    previsaoTexto: formatarDataOperacionalV3(datas.previsao),
    previsaoVencida: previsaoVencidaV3(datas.previsao) && !datas.entrega,
    prazoInternoTexto:
      !datas.previsao && datas.prazoInterno
        ? `${formatarDataOperacionalV3(datas.prazoInterno.data)}${datas.prazoInterno.origem === "automatico" ? " (automático)" : ""}`
        : "",
  };
}

// ----------------------------------------------------------------------------
// Timeline operacional (item 3) — derivada, nunca inventa data
// ----------------------------------------------------------------------------

export type TimelineToneV3 = "success" | "primary" | "info" | "warning" | "neutral";

export interface TimelineStepV3 {
  key: string;
  label: string;
  tone: TimelineToneV3;
  /** A etapa foi atingida (pelo status atual e/ou por um evento real). */
  atingido: boolean;
  /** ISO do evento que marca a etapa (quando há evento real). */
  em?: string;
  /** Texto pronto de uma data operacional (respeita a precisão: só-dia nunca mostra a âncora). */
  emTexto?: string;
  /** Responsável pelo evento (autor), quando há evento real. */
  responsavel?: string;
}

interface StepDefV3 {
  key: string;
  label: string;
  tone: TimelineToneV3;
  /** Ordem mínima de status (máquina V3) que satisfaz a etapa; 0 = sempre. */
  minOrder: number;
  /** Tipos de evento que marcam explicitamente a etapa. */
  tipos: EventoTipo[];
  /** Alvos de `mudanca_status` (metadata.para) que marcam a etapa. */
  statusPara: OperacaoStatusV3[];
}

const STEPS_DEF: StepDefV3[] = [
  { key: "criada", label: "OS criada", tone: "neutral", minOrder: 0, tipos: ["criacao"], statusPara: [] },
  { key: "recebida", label: "Recebida", tone: "info", minOrder: 0, tipos: [], statusPara: ["recebida"] },
  { key: "diagnostico", label: "Diagnóstico", tone: "info", minOrder: 20, tipos: ["diagnostico_registrado"], statusPara: ["diagnostico"] },
  { key: "orcamento", label: "Orçamento enviado", tone: "warning", minOrder: 30, tipos: ["orcamento_enviado"], statusPara: ["aguardando_aprovacao"] },
  { key: "aprovada", label: "Aprovada", tone: "primary", minOrder: 40, tipos: ["orcamento_aprovado"], statusPara: ["aprovado"] },
  { key: "em_reparo", label: "Em reparo", tone: "primary", minOrder: 60, tipos: ["servico_iniciado"], statusPara: ["em_execucao"] },
  { key: "pronta", label: "Pronta", tone: "success", minOrder: 70, tipos: ["servico_concluido"], statusPara: ["pronta", "recebida"] },
  { key: "entregue", label: "Entregue", tone: "success", minOrder: 90, tipos: ["entrega_cliente"], statusPara: ["entregue"] },
];

function eventoDaEtapa(timeline: EventoTimeline[], def: StepDefV3): EventoTimeline | undefined {
  for (const ev of timeline) {
    if (def.tipos.includes(ev.tipo)) return ev;
    if (ev.tipo === "mudanca_status") {
      const para = (ev.metadata as { para?: unknown } | undefined)?.para;
      if (typeof para === "string" && def.statusPara.includes(para as OperacaoStatusV3)) return ev;
    }
  }
  return undefined;
}

/**
 * Constrói a timeline operacional (8 etapas) a partir do estado real da OS.
 * `atingido` vem do status atual (ordem da máquina) OU de um evento explícito.
 * Data/responsável só aparecem quando há evento real — nada é inventado.
 */
export function construirTimelineOperacionalV3(os: OrdemServico | null | undefined): TimelineStepV3[] {
  const timeline = Array.isArray(os?.timeline) ? [...(os!.timeline as EventoTimeline[])] : [];
  // ordena por data crescente para pegar o primeiro evento de cada etapa
  timeline.sort((a, b) => Date.parse(a.criadoEm || "") - Date.parse(b.criadoEm || ""));

  const statusAtual = statusV3FromOS(os);
  const ordemAtual = statusMetaV3(statusAtual).order;
  const cancelada = statusAtual === "cancelada";
  const recepcao = lerRecepcaoV3(os);
  const datas = lerDatasOSV3(os);

  return STEPS_DEF.map((def) => {
    const ev = eventoDaEtapa(timeline, def);
    let atingido = !!ev;
    if (!cancelada && def.minOrder > 0 && ordemAtual >= def.minOrder) atingido = true;
    if (def.key === "criada") atingido = true;
    // Se a OS existe, o aparelho foi recebido — exceto orçamento sem o aparelho na loja.
    if (def.key === "recebida") atingido = atingido || (!!os && !datas.semEntradaFisica);

    let em = ev?.criadoEm;
    let emTexto: string | undefined;
    let responsavel = ev?.autor;
    if (def.key === "criada" && !em) em = os?.criadoEm;
    // Recebida/Entregue mostram as datas EFETIVAS (com a precisão gravada); o
    // horário real de cada registro continua no Histórico.
    if (def.key === "recebida") {
      if (datas.entrada) {
        em = datas.entrada.iso;
        emTexto = formatarDataOperacionalV3(datas.entrada);
        responsavel = recepcao.recebidoPor;
      } else if (datas.semEntradaFisica) {
        em = undefined;
        responsavel = undefined;
      } else if (!em) {
        em = recepcao.dataEntrada;
      }
    }
    if (def.key === "entregue") {
      if (datas.entrega) {
        em = datas.entrega.iso;
        emTexto = formatarDataOperacionalV3(datas.entrega);
      } else if (!em && os?.entregueEm) {
        em = os.entregueEm;
      }
    }

    return { key: def.key, label: def.label, tone: def.tone, atingido, em, emTexto, responsavel };
  });
}

// ----------------------------------------------------------------------------
// Histórico auditável (item 10) — eventos completos, mais recentes primeiro
// ----------------------------------------------------------------------------

export function lerHistoricoV3(os: OrdemServico | null | undefined): EventoTimeline[] {
  const timeline = Array.isArray(os?.timeline) ? [...(os!.timeline as EventoTimeline[])] : [];
  return timeline.sort((a, b) => Date.parse(b.criadoEm || "") - Date.parse(a.criadoEm || ""));
}
