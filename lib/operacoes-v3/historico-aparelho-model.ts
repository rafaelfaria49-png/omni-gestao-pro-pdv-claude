// ============================================================================
// Operações V3 — SPRINT_3E.3 · HISTÓRICO DO APARELHO (modelo puro)
// ----------------------------------------------------------------------------
// Módulo PURO (sem I/O, sem React). Consolida o histórico por APARELHO
// (IMEI → fallback Serial), respondendo "esse mesmo aparelho já passou aqui?".
// Diferente do histórico por cliente (`os-derive.agruparPorCliente`).
//
// Chave do aparelho (compat — sem novos campos obrigatórios):
//   • IMEI   = provaEntradaV3.identificacao.imei  ||  equipamento.numeroSerie
//   • Serial = provaEntradaV3.identificacao.serial (fallback quando não há IMEI)
// A chave é normalizada (só dígitos/alfanum maiúsculo) para casar variações.
// Nada aqui escreve; nada inventa dado.
// ============================================================================

import type { OrdemServico } from "@/types/os";
import { statusMetaV3, statusV3FromOS, type OperacaoStatusV3 } from "./status-machine";
import { lerGarantiaV3, lerRetornosV3, type GarantiaV3View, type RetornoV3 } from "./pos-venda-model";

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Normaliza um identificador para comparação (alfanumérico maiúsculo). */
function normId(v: unknown): string {
  return s(v).toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export interface AparelhoChaveV3 {
  /** "imei" | "serial" | "nenhum" — qual identificador foi usado. */
  tipo: "imei" | "serial" | "nenhum";
  /** Valor normalizado (para match). */
  chave: string;
  /** Valor exibível (original). */
  imei?: string;
  serial?: string;
}

function identificacaoDe(os: OrdemServico | null | undefined): { imei?: string; serial?: string } {
  const ident = (os as { provaEntradaV3?: { identificacao?: { imei?: unknown; serial?: unknown } } } | null | undefined)?.provaEntradaV3
    ?.identificacao;
  const imei = s(ident?.imei) || s(os?.equipamento?.numeroSerie) || undefined;
  const serial = s(ident?.serial) || undefined;
  return { imei, serial };
}

/** Resolve a chave do aparelho de uma OS (IMEI preferencial; Serial fallback). */
export function chaveAparelhoV3(os: OrdemServico | null | undefined): AparelhoChaveV3 {
  const { imei, serial } = identificacaoDe(os);
  const imeiNorm = normId(imei);
  if (imeiNorm) return { tipo: "imei", chave: imeiNorm, imei, serial };
  const serialNorm = normId(serial);
  if (serialNorm) return { tipo: "serial", chave: serialNorm, imei, serial };
  return { tipo: "nenhum", chave: "", imei, serial };
}

/** Duas OS são "o mesmo aparelho" se compartilham IMEI OU Serial normalizados. */
export function mesmaChaveAparelhoV3(a: OrdemServico, b: OrdemServico): boolean {
  const ia = identificacaoDe(a);
  const ib = identificacaoDe(b);
  const imeiA = normId(ia.imei);
  const imeiB = normId(ib.imei);
  if (imeiA && imeiB && imeiA === imeiB) return true;
  const serialA = normId(ia.serial);
  const serialB = normId(ib.serial);
  if (serialA && serialB && serialA === serialB) return true;
  // IMEI de uma casando com Serial da outra (campos podem estar trocados na digitação).
  if (imeiA && serialB && imeiA === serialB) return true;
  if (serialA && imeiB && serialA === imeiB) return true;
  return false;
}

// ----------------------------------------------------------------------------
// Histórico por OS (linha do aparelho)
// ----------------------------------------------------------------------------

export interface HistoricoOSAparelhoV3 {
  osId: string;
  codigo: string;
  criadoEm?: string;
  entregueEm?: string;
  status: OperacaoStatusV3;
  statusLabel: string;
  defeito: string;
  /** Descrições dos serviços executados/cobrados (sem custo interno). */
  servicos: string[];
  garantia: GarantiaV3View;
  retornos: RetornoV3[];
  /** É a OS atualmente aberta no Workspace. */
  atual: boolean;
}

function servicosDaOS(os: OrdemServico): string[] {
  const out: string[] = [];
  const orcServ = (os.orcamento as { servicos?: { descricao?: unknown; kindV3?: unknown }[] } | undefined)?.servicos;
  if (Array.isArray(orcServ)) {
    for (const sv of orcServ) {
      if (sv?.kindV3 === "interno") continue;
      const d = s(sv?.descricao);
      if (d) out.push(d);
    }
  }
  if (out.length === 0 && Array.isArray(os.servicosCatalogo)) {
    for (const sc of os.servicosCatalogo) {
      const d = s(sc?.descricao);
      if (d) out.push(d);
    }
  }
  return out;
}

function linhaHistorico(os: OrdemServico, atual: boolean, now: Date): HistoricoOSAparelhoV3 {
  const status = statusV3FromOS(os);
  return {
    osId: s(os.id),
    codigo: s(os.codigo) || "—",
    criadoEm: s(os.criadoEm) || undefined,
    entregueEm: s(os.entregueEm) || undefined,
    status,
    statusLabel: statusMetaV3(status).label,
    defeito: s(os.equipamento?.defeitoRelatado),
    servicos: servicosDaOS(os),
    garantia: lerGarantiaV3(os, now),
    retornos: lerRetornosV3(os),
    atual,
  };
}

// ----------------------------------------------------------------------------
// Alertas operacionais (item 4)
// ----------------------------------------------------------------------------

export type AlertaAparelhoTipoV3 = "ja_passou" | "em_garantia" | "multiplos_retornos" | "recorrencia_defeito";

export interface AlertaAparelhoV3 {
  tipo: AlertaAparelhoTipoV3;
  tom: "info" | "warning" | "danger";
  mensagem: string;
}

/** Tokens significativos do defeito (para detectar recorrência). */
function tokensDefeito(defeito: string): string[] {
  const stop = new Set(["nao", "não", "com", "sem", "que", "uma", "para", "está", "esta", "aparelho", "celular", "fica", "muito", "quando", "the", "and"]);
  return s(defeito)
    .toLowerCase()
    .replace(/[^0-9a-zà-ú\s]/gi, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4 && !stop.has(t));
}

// ----------------------------------------------------------------------------
// Resultado consolidado
// ----------------------------------------------------------------------------

export interface HistoricoAparelhoV3 {
  chave: AparelhoChaveV3;
  /** true quando há outra OS além da atual para este aparelho. */
  temHistorico: boolean;
  /** Total de OS deste aparelho (inclui a atual). */
  totalOS: number;
  /** Linhas, mais recentes primeiro. */
  ordens: HistoricoOSAparelhoV3[];
  /** OS anteriores (exclui a atual), mais recentes primeiro. */
  anteriores: HistoricoOSAparelhoV3[];
  alertas: AlertaAparelhoV3[];
  totalRetornos: number;
  /** true se alguma OS deste aparelho tem garantia ativa. */
  garantiaAtiva: boolean;
}

function dataOrdenacao(l: HistoricoOSAparelhoV3): number {
  return Date.parse(l.entregueEm || l.criadoEm || "") || 0;
}

/**
 * Constrói o histórico do aparelho da `osAtual` varrendo `todas` as OS da loja.
 * Pure (recebe `now`). Quando a OS não tem IMEI/Serial, retorna histórico vazio
 * (só a atual), sem erro — compatível com OS antigas.
 */
export function construirHistoricoAparelhoV3(
  osAtual: OrdemServico | null | undefined,
  todas: OrdemServico[] | null | undefined,
  now: Date = new Date(),
): HistoricoAparelhoV3 {
  const chave = chaveAparelhoV3(osAtual);
  const lista = Array.isArray(todas) ? todas : [];
  const atualId = s(osAtual?.id);

  let matched: OrdemServico[];
  if (chave.tipo === "nenhum" || !osAtual) {
    // Sem identificador: o histórico é só a própria OS (se existir na lista).
    matched = osAtual ? [osAtual] : [];
  } else {
    matched = lista.filter((o) => mesmaChaveAparelhoV3(osAtual, o));
    // Garante que a própria OS esteja incluída mesmo se não vier na lista.
    if (atualId && !matched.some((o) => s(o.id) === atualId)) matched = [osAtual, ...matched];
  }

  const linhas = matched
    .map((o) => linhaHistorico(o, s(o.id) === atualId, now))
    .sort((a, b) => dataOrdenacao(b) - dataOrdenacao(a));

  const anteriores = linhas.filter((l) => !l.atual);
  const totalRetornos = linhas.reduce((acc, l) => acc + l.retornos.length, 0);
  const garantiaAtiva = linhas.some((l) => l.garantia.situacao === "ativa");

  // ---- Alertas ----
  const alertas: AlertaAparelhoV3[] = [];
  if (anteriores.length > 0) {
    alertas.push({
      tipo: "ja_passou",
      tom: "info",
      mensagem: `Este aparelho já passou pela assistência ${anteriores.length}× (${anteriores.length + 1} OS no total).`,
    });
  }
  if (garantiaAtiva) {
    alertas.push({ tipo: "em_garantia", tom: "warning", mensagem: "Há garantia ATIVA para este aparelho — verifique cobertura antes de cobrar." });
  }
  if (totalRetornos >= 2) {
    alertas.push({ tipo: "multiplos_retornos", tom: "danger", mensagem: `Aparelho com ${totalRetornos} retornos registrados — atenção à reincidência.` });
  }

  // Recorrência de defeito: token do defeito atual aparece em OS anterior.
  const atualDefeito = linhas.find((l) => l.atual)?.defeito ?? (osAtual ? s(osAtual.equipamento?.defeitoRelatado) : "");
  const tokensAtual = new Set(tokensDefeito(atualDefeito));
  if (tokensAtual.size > 0 && anteriores.length > 0) {
    const recorrente = anteriores.find((l) => tokensDefeito(l.defeito).some((t) => tokensAtual.has(t)));
    if (recorrente) {
      alertas.push({
        tipo: "recorrencia_defeito",
        tom: "danger",
        mensagem: `Possível recorrência: defeito semelhante já tratado na OS ${recorrente.codigo}.`,
      });
    }
  }

  return {
    chave,
    temHistorico: anteriores.length > 0,
    totalOS: linhas.length,
    ordens: linhas,
    anteriores,
    alertas,
    totalRetornos,
    garantiaAtiva,
  };
}

// ----------------------------------------------------------------------------
// Timeline cronológica do aparelho (item 3) — etapas agregadas de TODAS as OS
// ----------------------------------------------------------------------------

export type EtapaAparelhoV3 = "recepcao" | "diagnostico" | "orcamento" | "execucao" | "entrega" | "garantia" | "retorno";

export interface EventoAparelhoV3 {
  etapa: EtapaAparelhoV3;
  label: string;
  em?: string;
  osCodigo: string;
  detalhe?: string;
}

const ETAPA_DE_EVENTO: Record<string, EtapaAparelhoV3> = {
  criacao: "recepcao",
  diagnostico_registrado: "diagnostico",
  orcamento_enviado: "orcamento",
  orcamento_aprovado: "orcamento",
  servico_iniciado: "execucao",
  servico_concluido: "execucao",
  entrega_cliente: "entrega",
  garantia_gerada: "garantia",
  garantia_acionada: "retorno",
};

export const ETAPA_APARELHO_LABEL_V3: Record<EtapaAparelhoV3, string> = {
  recepcao: "Recepção",
  diagnostico: "Diagnóstico",
  orcamento: "Orçamento",
  execucao: "Execução",
  entrega: "Entrega",
  garantia: "Garantia",
  retorno: "Retorno",
};

/**
 * Constrói uma timeline cronológica do APARELHO, agregando os eventos
 * significativos de todas as OS dele. Mais antigos primeiro. Nunca inventa data.
 */
export function timelineAparelhoV3(hist: HistoricoAparelhoV3, osPorId: Map<string, OrdemServico>): EventoAparelhoV3[] {
  const out: EventoAparelhoV3[] = [];
  for (const linha of hist.ordens) {
    const os = osPorId.get(linha.osId);
    const timeline = Array.isArray(os?.timeline) ? os!.timeline : [];
    for (const ev of timeline) {
      const etapa = ETAPA_DE_EVENTO[s(ev?.tipo)];
      if (!etapa) continue;
      out.push({
        etapa,
        label: ETAPA_APARELHO_LABEL_V3[etapa],
        em: s(ev?.criadoEm) || undefined,
        osCodigo: linha.codigo,
        detalhe: s(ev?.conteudo) || undefined,
      });
    }
    // Retorno também conta a partir do registro estruturado.
    for (const r of linha.retornos) {
      out.push({ etapa: "retorno", label: ETAPA_APARELHO_LABEL_V3.retorno, em: s(r.criadoEm) || undefined, osCodigo: linha.codigo, detalhe: r.motivo });
    }
  }
  return out.sort((a, b) => (Date.parse(a.em || "") || 0) - (Date.parse(b.em || "") || 0));
}
