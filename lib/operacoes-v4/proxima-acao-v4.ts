// ============================================================================
// Operações V4 — PRÓXIMA AÇÃO operacional (GOAL OPS-V4-FLUXO-CURTO-005).
// ----------------------------------------------------------------------------
// Módulo PURO (sem I/O, sem React). Deriva, só de estado REAL já carregado, a
// orientação operacional da OS: o que fazer agora, onde isso acontece e se o
// clique GRAVA (write), NAVEGA (navigate), ESPERA uma leitura (wait) ou não há
// ação (none).
//
// Próxima ação ≠ próximo status. A máquina única da V3 (`status-machine.ts`)
// autoriza transições; esta derivação apenas ORIENTA. Ex.: OS pronta com saldo
// tem "recebida" como próximo status, mas a próxima ação é "Receber pagamento";
// OS aguardando aprovação tem "aprovado" como próximo status, mas a próxima ação
// é esperar o cliente — nunca "Aprovar".
//
// Substitui o `PRIMARY` (mock-data) como autoridade da ação primária. Fontes:
// status real (`resolverStatusV4` fail-closed + `statusV3FromOS` só para
// distinguir "recebida"), `podeTransicionarV3` para autorizar escrita, carga do
// detalhe, orçamento materializado e a projeção financeira server-side.
// Pendências da Entrada NÃO entram aqui (GOAL 004: nunca bloqueiam o fluxo).
// ============================================================================

import type { V4Stage } from "@/components/operacoes-v4-preview/types";
import { resolverStatusV4, type OSStatusFonteV4 } from "@/components/operacoes-v4-preview/os-adapter";
import { podeTransicionarV3, statusV3FromOS } from "@/lib/operacoes-v3/status-machine";
import type { FinancialProjectionOSV4, FinancialStatusV4 } from "./financial-projection";

export type EstadoProximaAcaoV4 =
  | "acao"
  | "navegacao"
  | "aguardando"
  | "bloqueada"
  | "concluida"
  | "indisponivel";

/** O que o CTA primário faz ao ser acionado. */
export type EfeitoProximaAcaoV4 = "write" | "navigate" | "wait" | "none";

export type ToneProximaAcaoV4 = "primary" | "success" | "warning" | "danger" | "neutral";

/** Escritas EXISTENTES que a próxima ação pode acionar (nenhuma action nova). */
export type EscritaProximaAcaoV4 = "iniciar_diagnostico" | "iniciar_execucao";

export interface CtaProximaAcaoV4 {
  label: string;
  disabled: boolean;
  /** Escrita desta OS em voo (trava ativa): o CTA comunica processamento. */
  ocupado?: boolean;
}

/** Ação secundária: sempre navegação ou releitura — nunca escrita. */
export interface SecundariaProximaAcaoV4 {
  id: string;
  label: string;
  stage?: V4Stage;
  recarregar?: "detalhe" | "financeiro";
}

export interface ProximaAcaoV4 {
  estado: EstadoProximaAcaoV4;
  /** Identificador estável da orientação (testes, analytics, data-attributes). */
  id: string;
  /** Rótulo curto do tipo de orientação (o estado nunca é comunicado só por cor). */
  eyebrow: string;
  titulo: string;
  descricao: string;
  efeito: EfeitoProximaAcaoV4;
  /** Etapa onde a ação real acontece (destino da navegação ou da escrita). */
  stage?: V4Stage;
  escrita?: EscritaProximaAcaoV4;
  /**
   * O controle real desta ação vive na própria etapa `stage` (ex.: botão da
   * Execução, recebimento do Financeiro). Com o operador já nela, a superfície
   * não duplica o botão — só aponta para o controle.
   */
  controleNaEtapa: boolean;
  cta: CtaProximaAcaoV4 | null;
  secundaria: SecundariaProximaAcaoV4 | null;
  /** Por que a ação não está disponível agora (bloqueio/carga/erro). */
  motivo?: string;
  tone: ToneProximaAcaoV4;
}

/** Estado de carga do DETALHE da OS selecionada (mesma loja+OS). */
export type CargaOSProximaAcaoV4 = "estabelecida" | "carregando" | "erro";

export interface EntradaProximaAcaoV4 {
  /** OS real resolvida para a seleção atual (detalhe ou linha da lista da MESMA loja). */
  os: (OSStatusFonteV4 & { id?: unknown }) | null;
  carga: CargaOSProximaAcaoV4;
  cargaErro?: string | null;
  /**
   * A Entrada desta OS tem rascunho não salvo. Escrita de status fica bloqueada
   * até salvar/descartar — nunca é adiada para depois da guarda (GOAL 001).
   */
  entradaComRascunho?: boolean;
  orcamento: { materializado: boolean; status?: string | null };
  financeiro: {
    projection: FinancialProjectionOSV4 | null;
    loading: boolean;
    error: string | null;
  };
}

const MSG_AGUARDE_CARGA = "Aguarde a OS terminar de carregar.";
const MSG_RASCUNHO_ENTRADA = "Salve ou descarte as alterações da Entrada antes de mudar o status.";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function base(
  partial: Omit<ProximaAcaoV4, "secundaria" | "controleNaEtapa"> &
    Partial<Pick<ProximaAcaoV4, "secundaria" | "controleNaEtapa">>,
): ProximaAcaoV4 {
  return { secundaria: null, controleNaEtapa: false, ...partial };
}

function semOS(carga: CargaOSProximaAcaoV4): ProximaAcaoV4 {
  return base({
    estado: "indisponivel",
    id: "sem-os",
    eyebrow: carga === "carregando" ? "Carregando" : "Indisponível",
    titulo: carga === "carregando" ? "Carregando OS…" : "Nenhuma OS selecionada",
    descricao: "A próxima ação aparece quando a OS estiver carregada.",
    efeito: "none",
    cta: null,
    tone: "neutral",
  });
}

function erroDetalhe(erro: string | null | undefined): ProximaAcaoV4 {
  return base({
    estado: "bloqueada",
    id: "erro-leitura-os",
    eyebrow: "Revisar",
    titulo: "Não foi possível determinar a próxima ação",
    descricao: "A OS não carregou corretamente. Nenhuma ação é oferecida até recarregar.",
    motivo: erro?.trim() || undefined,
    efeito: "none",
    cta: null,
    secundaria: { id: "recarregar-os", label: "Tentar novamente", recarregar: "detalhe" },
    tone: "danger",
  });
}

/** Escrita existente: só habilita com carga estabelecida e transição autorizada. */
function escritaPrimaria(input: {
  id: string;
  titulo: string;
  descricao: string;
  escrita: EscritaProximaAcaoV4;
  stage: V4Stage;
  controleNaEtapa: boolean;
  carga: CargaOSProximaAcaoV4;
  entradaComRascunho: boolean;
}): ProximaAcaoV4 {
  const pronta = input.carga === "estabelecida" && !input.entradaComRascunho;
  const motivo = input.carga !== "estabelecida" ? MSG_AGUARDE_CARGA : input.entradaComRascunho ? MSG_RASCUNHO_ENTRADA : undefined;
  return base({
    estado: "acao",
    id: input.id,
    eyebrow: "Próxima ação",
    titulo: input.titulo,
    descricao: input.descricao,
    efeito: "write",
    escrita: input.escrita,
    stage: input.stage,
    controleNaEtapa: input.controleNaEtapa,
    cta: { label: input.titulo, disabled: !pronta },
    motivo,
    tone: "primary",
  });
}

const REVISAR_FINANCEIRO_DESCRICAO: Partial<Record<FinancialStatusV4, string>> = {
  UNKNOWN: "A situação financeira desta OS não pôde ser confirmada.",
  INCONSISTENT: "Os valores do financeiro não conferem com a OS.",
  CANCELLED: "A cobrança desta OS foi cancelada.",
  REVERSED: "O pagamento desta OS foi estornado.",
  NO_PRICE: "Não há cobrança definida para esta OS.",
  PRICE_DEFINED: "O preço está definido, mas a cobrança ainda não foi materializada.",
  CHARGE_NOT_CREATED: "A cobrança desta OS ainda não foi criada.",
};

/** pronta / recebida — a próxima ação depende SÓ da projeção financeira server-side. */
function prontaParaFinanceiro(
  input: EntradaProximaAcaoV4,
  osId: string,
  recebida: boolean,
): ProximaAcaoV4 {
  const { projection, loading, error } = input.financeiro;
  const prefixoRecebida = recebida ? "OS recebida — falta a confirmação formal de entrega. " : "";

  if (error) {
    return base({
      estado: "bloqueada",
      id: "revisar-financeiro",
      eyebrow: "Revisar",
      titulo: "Revisar financeiro",
      descricao: `${prefixoRecebida}Não foi possível ler a situação financeira. A entrega fica bloqueada até a leitura.`,
      motivo: error,
      efeito: "navigate",
      stage: "financeiro",
      controleNaEtapa: true,
      cta: { label: "Abrir financeiro", disabled: false },
      secundaria: { id: "recarregar-financeiro", label: "Tentar novamente", recarregar: "financeiro" },
      tone: "warning",
    });
  }

  // Projeção ausente, em leitura ou de OUTRA OS (stale): nunca decidir entrega.
  if (loading || !projection || (osId && projection.osId !== osId)) {
    return base({
      estado: "indisponivel",
      id: "financeiro-carregando",
      eyebrow: "Carregando",
      titulo: "Carregando situação financeira…",
      descricao: `${prefixoRecebida}A próxima ação depende do saldo desta OS.`,
      efeito: "wait",
      stage: "financeiro",
      cta: { label: "Carregando…", disabled: true },
      tone: "neutral",
    });
  }

  const status = projection.financialStatus;
  if (status === "OPEN" || status === "PARTIAL") {
    const saldo = typeof projection.balance === "number" && projection.balance > 0 ? brl.format(projection.balance) : null;
    return base({
      estado: "navegacao",
      id: "receber-pagamento",
      eyebrow: "Próxima ação",
      titulo: "Receber pagamento",
      descricao: `${prefixoRecebida}${
        status === "PARTIAL"
          ? `Pagamento parcial${saldo ? ` — faltam ${saldo}` : ""}.`
          : `Saldo em aberto${saldo ? ` de ${saldo}` : ""}.`
      } Registre o recebimento no Financeiro antes da entrega.`,
      efeito: "navigate",
      stage: "financeiro",
      controleNaEtapa: true,
      cta: { label: "Abrir financeiro", disabled: false },
      tone: "primary",
    });
  }

  if (projection.canDeliver === true) {
    const situacao =
      status === "AUTHORIZED_CREDIT"
        ? "Saldo autorizado a prazo."
        : status === "AUTHORIZED_NO_CHARGE"
          ? "Entrega sem cobrança autorizada."
          : "Pagamento quitado.";
    return base({
      estado: "navegacao",
      id: "confirmar-entrega",
      eyebrow: "Próxima ação",
      titulo: "Confirmar entrega",
      descricao: `${prefixoRecebida}${situacao} Confirme a retirada do aparelho na etapa Entrega.`,
      efeito: "navigate",
      stage: "entrega",
      controleNaEtapa: true,
      cta: { label: "Abrir entrega", disabled: false },
      tone: "success",
    });
  }

  return base({
    estado: "bloqueada",
    id: "revisar-financeiro",
    eyebrow: "Revisar",
    titulo: "Revisar financeiro",
    descricao: `${prefixoRecebida}${
      REVISAR_FINANCEIRO_DESCRICAO[status] ?? "A situação financeira não libera a entrega."
    } Revise antes de entregar.`,
    motivo: projection.consistencyIssues[0] ?? undefined,
    efeito: "navigate",
    stage: "financeiro",
    controleNaEtapa: true,
    cta: { label: "Abrir financeiro", disabled: false },
    tone: "warning",
  });
}

/**
 * Deriva a próxima ação operacional da OS selecionada. Pura e determinística:
 * mesma entrada → mesma saída; não muta a entrada.
 */
export function derivarProximaAcaoV4(input: EntradaProximaAcaoV4): ProximaAcaoV4 {
  const os = input.os;
  // Detalhe com erro: a linha da lista (se houver) pode estar desatualizada — fail-closed.
  if (input.carga === "erro") return erroDetalhe(input.cargaErro);
  if (!os) return semOS(input.carga);

  const osId = typeof os.id === "string" ? os.id.trim() : "";
  const status = resolverStatusV4(os);
  const statusV3 = statusV3FromOS(os);

  switch (status) {
    case "aberta": {
      if (!podeTransicionarV3(statusV3, "diagnostico").ok) break;
      return escritaPrimaria({
        id: "iniciar-diagnostico",
        titulo: "Iniciar diagnóstico",
        descricao: "Muda o status da OS para Diagnóstico e abre a avaliação técnica.",
        escrita: "iniciar_diagnostico",
        stage: "diagnostico",
        // A etapa Diagnóstico não tem botão próprio de início: o controle é este.
        controleNaEtapa: false,
        carga: input.carga,
        entradaComRascunho: input.entradaComRascunho === true,
      });
    }

    case "diagnostico": {
      const revisar = input.orcamento.materializado;
      return base({
        estado: "navegacao",
        id: revisar ? "revisar-orcamento" : "preparar-orcamento",
        eyebrow: "Próxima ação",
        titulo: revisar ? "Revisar orçamento" : "Preparar orçamento",
        descricao: revisar
          ? "O orçamento já existe. Revise os itens e envie ao cliente para decisão."
          : "Registre o diagnóstico e monte o orçamento para enviar ao cliente.",
        efeito: "navigate",
        stage: "orcamento",
        controleNaEtapa: true,
        cta: { label: "Abrir orçamento", disabled: false },
        tone: "primary",
      });
    }

    case "aguardando_aprovacao":
      return base({
        estado: "aguardando",
        id: "aguardando-cliente",
        eyebrow: "Aguardando",
        titulo: "Aguardando decisão do cliente",
        descricao: "O orçamento foi enviado. Quando o cliente responder, registre a decisão no orçamento.",
        efeito: "navigate",
        stage: "orcamento",
        controleNaEtapa: true,
        cta: { label: "Abrir orçamento", disabled: false },
        tone: "warning",
      });

    case "aprovado": {
      if (!podeTransicionarV3(statusV3, "em_execucao").ok) break;
      return escritaPrimaria({
        id: "iniciar-execucao",
        titulo: "Iniciar execução",
        descricao: "O serviço está autorizado. Iniciar muda o status da OS para Em execução.",
        escrita: "iniciar_execucao",
        stage: "execucao",
        // A Execução tem o botão real "Iniciar execução" (mesma action).
        controleNaEtapa: true,
        carga: input.carga,
        entradaComRascunho: input.entradaComRascunho === true,
      });
    }

    case "aguardando_peca":
      return base({
        estado: "aguardando",
        id: "aguardando-peca",
        eyebrow: "Aguardando",
        titulo: "Aguardando peça",
        descricao: "A execução pode ser retomada quando a peça estiver disponível.",
        efeito: "navigate",
        stage: "execucao",
        controleNaEtapa: true,
        cta: { label: "Abrir execução", disabled: false },
        tone: "warning",
      });

    case "em_execucao":
      return base({
        estado: "navegacao",
        id: "marcar-pronta",
        eyebrow: "Próxima ação",
        titulo: "Marcar como pronta",
        descricao: "Ao concluir o serviço, marque a OS como pronta na etapa Execução.",
        efeito: "navigate",
        stage: "execucao",
        controleNaEtapa: true,
        cta: { label: "Abrir execução", disabled: false },
        tone: "primary",
      });

    case "pronta":
      return prontaParaFinanceiro(input, osId, statusV3 === "recebida");

    case "entregue":
      return base({
        estado: "concluida",
        id: "fluxo-concluido",
        eyebrow: "Concluído",
        titulo: "Fluxo operacional concluído",
        descricao: "A OS foi entregue ao cliente. Garantia e retornos ficam no pós-venda.",
        efeito: "none",
        cta: null,
        secundaria: { id: "abrir-posvenda", label: "Abrir pós-venda", stage: "posvenda" },
        tone: "success",
      });

    case "cancelada":
      return base({
        estado: "concluida",
        id: "os-cancelada",
        eyebrow: "Encerrada",
        titulo: "OS cancelada",
        descricao: "Nenhuma ação operacional disponível. O motivo do cancelamento está no histórico.",
        efeito: "none",
        cta: null,
        secundaria: { id: "ver-historico", label: "Ver histórico", stage: "historico" },
        tone: "neutral",
      });

    case "desconhecido":
    default:
      break;
  }

  // Status fora do domínio (ou transição não autorizada pela máquina única):
  // fail-closed — nenhuma ação operacional, só consulta.
  return base({
    estado: "indisponivel",
    id: "status-nao-reconhecido",
    eyebrow: "Revisar",
    titulo: "Status da OS não reconhecido",
    descricao: "Nenhuma ação é oferecida até o status ser conferido. Consulte o histórico da OS.",
    efeito: "none",
    cta: null,
    secundaria: { id: "ver-historico", label: "Ver histórico", stage: "historico" },
    tone: "danger",
  });
}

// ----------------------------------------------------------------------------
// Trava da escrita primária (duplo clique / troca de OS ou loja).
// ----------------------------------------------------------------------------

/**
 * Trava síncrona da escrita disparada pela próxima ação, chaveada por loja+OS.
 * Vive do clique até a escrita terminar E o detalhe da mesma OS ser relido —
 * entre o fim da escrita e a releitura, o detalhe antigo ainda mostraria a
 * mesma ação e um segundo clique dispararia outra escrita.
 */
export interface TravaProximaAcaoV4 {
  chave: string;
  /** Identidade do detalhe da OS no momento do clique. */
  detalheRef: unknown;
  concluida: boolean;
}

export function chaveProximaAcaoV4(lojaId: string | null | undefined, osId: string | null | undefined): string {
  const loja = (lojaId ?? "").trim();
  const os = (osId ?? "").trim();
  return loja && os ? `${loja}::${os}` : "";
}

/** A trava bloqueia a escrita da seleção ATUAL? Outra loja/OS nunca é afetada. */
export function travaAtivaProximaAcaoV4(
  trava: TravaProximaAcaoV4 | null,
  atual: { chave: string; detalhe: unknown; detalheCarregando: boolean; detalheErro: boolean },
): boolean {
  if (!trava || !atual.chave || trava.chave !== atual.chave) return false;
  if (!trava.concluida) return true;
  if (atual.detalheErro) return false;
  return atual.detalheCarregando || atual.detalhe === trava.detalheRef;
}
