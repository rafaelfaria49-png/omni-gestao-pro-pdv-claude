import type { EventoTimeline, OrdemServico } from "@/types/os";
import {
  lerGarantiaV3,
  lerRetornosV3,
  lerVinculoRetornoV3,
  type GarantiaSituacaoV3,
  type RetornoV3,
  type VinculoRetornoV3,
} from "@/lib/operacoes-v3/pos-venda-model";
import { termoGarantiaDaOSV3 } from "@/lib/operacoes-v3/print-model";
import { statusV3FromOS } from "@/lib/operacoes-v3/status-machine";
import { enquadrarOrigemRetornoV4, retornoLegadoSemAtendimentoV4, type EnquadramentoRetornoV4 } from "./retorno-origem-v4";

export type PosVendaToneV4 = "success" | "info" | "warn" | "danger" | "neutro";

export interface GarantiaPosVendaV4 {
  temGarantia: boolean;
  situacao: GarantiaSituacaoV3;
  situacaoLabel: string;
  tone: PosVendaToneV4;
  label: string;
  prazoDias: number;
  semCobertura: boolean;
  inicio?: string;
  vencimento?: string;
  diasRestantes?: number;
  origem?: string;
  cobertura: string[];
  observacoes?: string;
}

export type ElegibilidadeRetornoV4Id =
  | "dentro_garantia"
  | "fora_garantia"
  | "garantia_nao_informada"
  | "retorno_aberto"
  | "abertura_em_processamento"
  | "os_nao_entregue"
  | "os_cancelada"
  | "dados_incompletos"
  | "condicao_nao_determinada";

export interface ElegibilidadeRetornoV4 {
  id: ElegibilidadeRetornoV4Id;
  label: string;
  descricao: string;
  tone: PosVendaToneV4;
  /**
   * Pode abrir um retorno NOVO (motor V3, OS entregue). Retorno aberto, reserva em
   * processamento, OS não entregue/cancelada ou dados incompletos bloqueiam a CTA.
   */
  podeRegistrar: boolean;
}

export interface TimelinePosVendaV4 {
  id: string;
  tipo: EventoTimeline["tipo"];
  texto: string;
  autor?: string;
  criadoEm: string;
}

export interface PosVendaV4 {
  garantia: GarantiaPosVendaV4;
  elegibilidade: ElegibilidadeRetornoV4;
  /** GOAL OPS-V4-FLUXO-CURTO-007: enquadramento único (o mesmo do seletor da OS original). */
  enquadramento: EnquadramentoRetornoV4;
  retornoAberto?: RetornoV3;
  /** Retorno aberto cujo atendimento ainda está sendo criado (reserva viva). */
  retornoEmAbertura: boolean;
  /** Retorno aberto legado, sem atendimento: o fluxo pode abrir o atendimento DELE (mesmo relato). */
  atendimentoPendente: boolean;
  retornos: RetornoV3[];
  podeAbrirRetorno: boolean;
  /** OS não entregue: a ocorrência vai para a observação interna desta OS (sem retorno). */
  podeRegistrarOcorrencia: boolean;
  podeFinalizarRetorno: boolean;
  historico: RetornoV3[];
  timeline: TimelinePosVendaV4[];
  headerLabel: string;
  /** Presente quando ESTA OS é o atendimento gerado a partir de um retorno. */
  vinculoOrigem?: VinculoRetornoV3;
}

export const EMPTY_POSVENDA_V4: PosVendaV4 = {
  garantia: {
    temGarantia: false,
    situacao: "nenhuma",
    situacaoLabel: "Sem garantia registrada",
    tone: "neutro",
    label: "",
    prazoDias: 0,
    semCobertura: false,
    cobertura: [],
  },
  elegibilidade: {
    id: "garantia_nao_informada",
    label: "Garantia não informada",
    descricao: "Selecione uma OS para consultar a condição do retorno.",
    tone: "neutro",
    podeRegistrar: false,
  },
  enquadramento: {
    id: "garantia_nao_informada",
    label: "Garantia não informada",
    descricao: "Selecione uma OS para consultar a condição do retorno.",
    tone: "neutro",
    acao: "nenhuma",
  },
  retornoEmAbertura: false,
  atendimentoPendente: false,
  retornos: [],
  podeAbrirRetorno: false,
  podeRegistrarOcorrencia: false,
  podeFinalizarRetorno: false,
  historico: [],
  timeline: [],
  headerLabel: "Sem garantia",
};

const TONE_GARANTIA: Record<GarantiaSituacaoV3, PosVendaToneV4> = {
  nenhuma: "neutro",
  sem_garantia: "neutro",
  prevista: "info",
  ativa: "success",
  vencida: "warn",
};

const LABEL_GARANTIA: Record<GarantiaSituacaoV3, string> = {
  nenhuma: "Sem garantia registrada",
  sem_garantia: "Sem cobertura",
  prevista: "Prevista",
  ativa: "Vigente",
  vencida: "Vencida",
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function origemGarantia(os: OrdemServico): string | undefined {
  const raw = os as OrdemServico & {
    aberturaV3?: { garantiaPrevista?: unknown };
  };
  if (raw.aberturaV3?.garantiaPrevista) return "Garantia definida na OS";
  if (os.garantia?.inicioEm || os.garantia?.fimEm || os.garantia?.ativa) return "Garantia registrada na OS";
  if (os.garantiasOperacionais?.length) return "Garantia operacional registrada";
  return undefined;
}

export function buildGarantiaPosVendaV4(os: OrdemServico, now: Date = new Date()): GarantiaPosVendaV4 {
  const garantia = lerGarantiaV3(os, now);
  const termo = garantia.temGarantia ? termoGarantiaDaOSV3(os) : null;
  return {
    temGarantia: garantia.temGarantia,
    situacao: garantia.situacao,
    situacaoLabel: LABEL_GARANTIA[garantia.situacao],
    tone: TONE_GARANTIA[garantia.situacao],
    label: garantia.label,
    prazoDias: garantia.prazoDias,
    semCobertura: garantia.semCobertura,
    inicio: garantia.inicio,
    vencimento: garantia.vencimento,
    diasRestantes: garantia.diasRestantes,
    origem: origemGarantia(os),
    cobertura: termo?.cobertura ?? [],
    observacoes: termo?.observacao || undefined,
  };
}

/** Ficha da OS: projeção do enquadramento único (GOAL OPS-V4-FLUXO-CURTO-007). */
function elegibilidadeRetorno(enquadramento: EnquadramentoRetornoV4): ElegibilidadeRetornoV4 {
  switch (enquadramento.id) {
    case "retorno_em_andamento":
    case "retorno_sem_atendimento":
      return {
        id: "retorno_aberto",
        label: "Retorno em andamento",
        descricao: "Finalize o retorno atual antes de registrar outro.",
        tone: "warn",
        podeRegistrar: false,
      };
    case "abertura_em_processamento":
      return { id: "abertura_em_processamento", label: enquadramento.label, descricao: enquadramento.descricao, tone: "info", podeRegistrar: false };
    case "nao_entregue":
      return {
        id: "os_nao_entregue",
        label: "OS não entregue",
        descricao: "A cobertura ainda não iniciou e isto não é pós-venda: registre a ocorrência como observação interna desta OS.",
        tone: "info",
        podeRegistrar: false,
      };
    case "cancelada":
      return { id: "os_cancelada", label: enquadramento.label, descricao: enquadramento.descricao, tone: "danger", podeRegistrar: false };
    case "dados_incompletos":
      return { id: "dados_incompletos", label: enquadramento.label, descricao: enquadramento.descricao, tone: "danger", podeRegistrar: false };
    case "garantia_ativa":
      return {
        id: "dentro_garantia",
        label: "Dentro da garantia",
        descricao: "A garantia está vigente na leitura atual da OS. Isso não confirma que o novo defeito está coberto.",
        tone: "success",
        podeRegistrar: true,
      };
    case "fora_cobertura":
      return {
        id: "fora_garantia",
        label: "Fora da garantia",
        descricao: "O retorno pode ser registrado, mas não há cobertura confirmada: serviço cobrável exige decisão comercial própria.",
        tone: "warn",
        podeRegistrar: true,
      };
    default:
      return {
        id: "garantia_nao_informada",
        label: "Garantia não informada",
        descricao: "O retorno pode ser registrado; nenhuma cobertura é presumida.",
        tone: "neutro",
        podeRegistrar: true,
      };
  }
}

function timelinePosVenda(os: OrdemServico): TimelinePosVendaV4[] {
  const tipos = new Set<EventoTimeline["tipo"]>(["garantia_gerada", "entrega_cliente", "retirada_confirmada"]);
  return (Array.isArray(os.timeline) ? os.timeline : [])
    .filter((evento) => tipos.has(evento.tipo))
    .slice()
    .sort((a, b) => Date.parse(b.criadoEm) - Date.parse(a.criadoEm))
    .map((evento) => ({
      id: evento.id,
      tipo: evento.tipo,
      texto: text(evento.titulo) || text(evento.conteudo) || evento.tipo,
      autor: text(evento.autor) || undefined,
      criadoEm: evento.criadoEm,
    }));
}

function headerLabel(
  garantia: GarantiaPosVendaV4,
  retornoAberto: RetornoV3 | undefined,
  vinculoOrigem?: VinculoRetornoV3,
): string {
  if (retornoAberto?.osRetornoCodigo) return `Retorno · ${retornoAberto.osRetornoCodigo}`;
  if (retornoAberto) return "Retorno aberto";
  if (vinculoOrigem?.descartadoEm) return "Atendimento descartado";
  if (vinculoOrigem) return `Retorno da ${vinculoOrigem.osOrigemCodigo || "OS original"}`;
  if (garantia.situacao === "ativa" && garantia.vencimento) return `Garantia até ${garantia.vencimento}`;
  if (garantia.situacao === "vencida") return "Garantia vencida";
  if (garantia.situacao === "prevista" && garantia.prazoDias > 0) return `Garantia ${garantia.prazoDias} dias`;
  if (garantia.situacao === "sem_garantia") return "Sem cobertura";
  return "Sem garantia";
}

export function buildPosVendaV4(os: OrdemServico, now: Date = new Date()): PosVendaV4 {
  const garantia = buildGarantiaPosVendaV4(os, now);
  const retornos = lerRetornosV3(os);
  const retornoAberto = retornos.find((retorno) => retorno.status === "aberto");
  const enquadramento = enquadrarOrigemRetornoV4(os, now);
  const elegibilidade = elegibilidadeRetorno(enquadramento);
  const vinculoOrigem = lerVinculoRetornoV3(os);
  const retornoEmAbertura = enquadramento.id === "abertura_em_processamento";
  return {
    garantia,
    elegibilidade,
    enquadramento,
    retornoAberto,
    retornoEmAbertura,
    atendimentoPendente: !!text(os.id) && enquadramento.id === "retorno_sem_atendimento" && retornoLegadoSemAtendimentoV4(retornoAberto),
    retornos,
    podeAbrirRetorno: !!text(os.id) && elegibilidade.podeRegistrar,
    podeRegistrarOcorrencia: !!text(os.id) && enquadramento.acao === "registrar_ocorrencia",
    podeFinalizarRetorno: !!retornoAberto && !retornoEmAbertura,
    historico: retornos,
    timeline: timelinePosVenda(os),
    headerLabel: headerLabel(garantia, retornoAberto, vinculoOrigem),
    vinculoOrigem,
  };
}

export type GarantiaPortfolioFiltroV4 = "todas" | "vigentes" | "vencendo" | "vencidas" | "com_retorno";

export interface GarantiaPortfolioItemV4 {
  osId: string;
  codigo: string;
  cliente: string;
  aparelho: string;
  vencimento?: string;
  diasRestantes?: number;
  situacao: GarantiaSituacaoV3;
  situacaoLabel: string;
  tone: PosVendaToneV4;
  retornoAberto: boolean;
  /** GOAL 007: retorno em andamento (aberto) × concluído (só finalizados) × nenhum. */
  retornoStatus: "andamento" | "concluido" | null;
  /** GOAL 007: o fluxo Retorno / Garantia pode abrir um retorno novo para esta OS. */
  podeAbrirRetorno: boolean;
  busca: string;
}

export interface GarantiasPortfolioV4 {
  itens: GarantiaPortfolioItemV4[];
  vigentes: number;
  vencendo: number;
  vencidas: number;
  retornosAbertos: number;
  /** OS do portfólio cujos retornos estão todos concluídos (finalizados). */
  retornosConcluidos: number;
  vencendoDias: number;
}

export function buildGarantiasPortfolioV4(
  ordens: OrdemServico[],
  opts: { now?: Date; vencendoDias?: number } = {},
): GarantiasPortfolioV4 {
  const now = opts.now ?? new Date();
  const vencendoDias = opts.vencendoDias ?? 7;
  const itens = (ordens ?? []).flatMap((os): GarantiaPortfolioItemV4[] => {
    const posVenda = buildPosVendaV4(os, now);
    const garantia = posVenda.garantia;
    if (!garantia.temGarantia) return [];
    const cliente = text(os.cliente?.nome) || "Cliente não identificado";
    const aparelho = [text(os.equipamento?.marca), text(os.equipamento?.modelo)].filter(Boolean).join(" ") || text(os.equipamento?.tipo) || "Equipamento";
    const codigo = text(os.codigo) || os.id;
    return [{
      osId: os.id,
      codigo,
      cliente,
      aparelho,
      vencimento: garantia.vencimento,
      diasRestantes: garantia.diasRestantes,
      situacao: garantia.situacao,
      situacaoLabel: garantia.situacaoLabel,
      tone: garantia.tone,
      retornoAberto: !!posVenda.retornoAberto,
      retornoStatus: posVenda.retornoAberto ? "andamento" : posVenda.retornos.length > 0 ? "concluido" : null,
      podeAbrirRetorno: posVenda.podeAbrirRetorno,
      busca: `${codigo} ${cliente} ${aparelho}`.toLocaleLowerCase("pt-BR"),
    }];
  });

  itens.sort((a, b) => {
    if (a.retornoAberto !== b.retornoAberto) return a.retornoAberto ? -1 : 1;
    if (!a.vencimento) return 1;
    if (!b.vencimento) return -1;
    return Date.parse(a.vencimento) - Date.parse(b.vencimento);
  });

  return {
    itens,
    vigentes: itens.filter((item) => item.situacao === "ativa").length,
    vencendo: itens.filter((item) => item.situacao === "ativa" && typeof item.diasRestantes === "number" && item.diasRestantes <= vencendoDias).length,
    vencidas: itens.filter((item) => item.situacao === "vencida").length,
    retornosAbertos: itens.filter((item) => item.retornoAberto).length,
    retornosConcluidos: itens.filter((item) => item.retornoStatus === "concluido").length,
    vencendoDias,
  };
}

export function filtrarGarantiasPortfolioV4(
  portfolio: GarantiasPortfolioV4,
  filtro: GarantiaPortfolioFiltroV4,
  busca = "",
): GarantiaPortfolioItemV4[] {
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  return portfolio.itens.filter((item) => {
    if (termo && !item.busca.includes(termo)) return false;
    if (filtro === "vigentes") return item.situacao === "ativa";
    if (filtro === "vencendo") return item.situacao === "ativa" && typeof item.diasRestantes === "number" && item.diasRestantes <= portfolio.vencendoDias;
    if (filtro === "vencidas") return item.situacao === "vencida";
    if (filtro === "com_retorno") return item.retornoAberto;
    return true;
  });
}

/** O status é exposto só para auditoria/testes; o motor de retorno não o usa como bloqueio. */
export function statusOsNaElegibilidadeV4(os: OrdemServico): ReturnType<typeof statusV3FromOS> {
  return statusV3FromOS(os);
}
