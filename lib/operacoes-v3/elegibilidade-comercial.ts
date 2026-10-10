// ============================================================================
// Operações V3 — elegibilidade comercial de um recebimento NOVO
// (GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002, item A)
// ----------------------------------------------------------------------------
// Critério ÚNICO dos writers de recebimento (simples/parcial, misto e a prazo):
// reaproveita `reconciliarTotaisFinanceirosV3`, a MESMA regra comercial que decide
// a entrega — nenhuma segunda regra de preço. Preço desconhecido (orçamento real
// não aprovado, ou só zeros sem aprovação) ou inconsistente recusa a operação
// NOVA com motivo estruturado e destino, nos códigos de impedimento da projeção V4
// (GOAL 001). Os writers chamam isto sob a trava da OS e DEPOIS do replay: uma
// operação já gravada continua sendo devolvida mesmo que o comercial mude.
// Puro: sem Prisma e sem relógio implícito.
// ============================================================================

import type { OrdemServico } from "@/types/os";
import { reconciliarTotaisFinanceirosV3 } from "./delivery-financial-guard";
import { orcamentoRealV3, statusEfetivoOrcamentoV3 } from "./orcamento-model";

/** Mesmos códigos do impedimento da projeção V4 (`ImpedimentoCodigoV4`, GOAL 001). */
export type CodigoInelegibilidadeComercialV3 =
  | "APROVACAO_COMERCIAL_PENDENTE"
  | "ORCAMENTO_RECUSADO"
  | "ORCAMENTO_EXPIRADO"
  | "PRECO_AUSENTE"
  | "VALORES_DIVERGENTES";

/** Onde o operador resolve: mesmo vocabulário de `DestinoImpedimentoV4`. */
export type DestinoInelegibilidadeComercialV3 = "comercial" | "financeiro";

export interface RecusaComercialV3 {
  elegivel: false;
  codigo: CodigoInelegibilidadeComercialV3;
  destino: DestinoInelegibilidadeComercialV3;
  mensagem: string;
  /** Diagnóstico da reconciliação, quando houver (ex.: quais fontes divergem). */
  detalhe?: string;
}

export type ElegibilidadeComercialV3 = { elegivel: true; totalCentavos: number } | RecusaComercialV3;

export interface ElegibilidadeComercialInputV3 {
  storeId: string;
  osId: string;
  /** Payload da OS relido sob a trava. */
  payload: OrdemServico & Record<string, unknown>;
  /** Coluna `valorTotal` da OS, lida sob a trava (mesma fonte do guard de entrega). */
  prismaValorTotal: number;
  /** Instante da decisão (ms). Só classifica o motivo (vencido × pendente). */
  agora: number;
}

export const DESTINO_INELEGIBILIDADE_COMERCIAL_V3: Readonly<Record<CodigoInelegibilidadeComercialV3, DestinoInelegibilidadeComercialV3>> = {
  APROVACAO_COMERCIAL_PENDENTE: "comercial",
  ORCAMENTO_RECUSADO: "comercial",
  ORCAMENTO_EXPIRADO: "comercial",
  PRECO_AUSENTE: "comercial",
  VALORES_DIVERGENTES: "financeiro",
};

export const MENSAGEM_INELEGIBILIDADE_COMERCIAL_V3: Readonly<Record<CodigoInelegibilidadeComercialV3, string>> = {
  APROVACAO_COMERCIAL_PENDENTE: "Recebimento recusado: o orçamento ainda não foi aprovado. Confira e aprove o orçamento antes de receber.",
  ORCAMENTO_RECUSADO: "Recebimento recusado: o orçamento foi recusado. Nada foi cobrado.",
  ORCAMENTO_EXPIRADO: "Recebimento recusado: o orçamento venceu sem aprovação. Atualize a validade e aprove antes de receber.",
  PRECO_AUSENTE: "Recebimento recusado: esta OS não tem preço aprovado. Gere e aprove o orçamento antes de receber.",
  VALORES_DIVERGENTES: "Recebimento recusado: os valores desta OS não conferem entre si. Confira a cobrança antes de receber.",
};

/**
 * (item B) "Gerar orçamento" sobre OS com pagamento: o MESMO texto na recusa do servidor e na
 * orientação da tela (em build de produção a mensagem de um erro lançado numa Server Action
 * não chega ao navegador — a tela orienta antes; o servidor continua decidindo).
 */
export const MENSAGEM_GERAR_ORCAMENTO_COM_PAGAMENTO_V3 =
  "Esta OS já tem pagamento registrado: um novo orçamento em rascunho deixaria esse pagamento sem aprovação comercial. Confira o orçamento e o pagamento; se o cliente aprovou, use “Formalizar aprovação pendente”.";
export const MENSAGEM_GERAR_ORCAMENTO_PAGAMENTOS_EM_CONFERENCIA_V3 =
  "Não foi possível conferir os pagamentos desta OS. Confira a Conta a Receber antes de gerar um novo orçamento.";

function recusa(codigo: CodigoInelegibilidadeComercialV3, detalhe?: string): RecusaComercialV3 {
  const base: RecusaComercialV3 = {
    elegivel: false,
    codigo,
    destino: DESTINO_INELEGIBILIDADE_COMERCIAL_V3[codigo],
    mensagem: MENSAGEM_INELEGIBILIDADE_COMERCIAL_V3[codigo],
  };
  return detalhe ? { ...base, detalhe } : base;
}

/**
 * Motivo de um preço desconhecido, com a MESMA classificação da dimensão comercial da
 * projeção V4: status efetivo do orçamento real; validade em formato próprio decide o
 * vencimento, outro formato nunca vira "vencido".
 */
function motivoPrecoDesconhecido(payload: OrdemServico & Record<string, unknown>, agora: number): CodigoInelegibilidadeComercialV3 {
  const real = orcamentoRealV3(payload);
  if (!real) return "PRECO_AUSENTE";
  const validoAte = (real as { validoAte?: unknown }).validoAte;
  const validadeLegivel = validoAte === undefined || validoAte === null || typeof validoAte === "string";
  const efetivo = validadeLegivel && Number.isFinite(agora) ? statusEfetivoOrcamentoV3(real, agora) : real.status;
  if (efetivo === "recusado") return "ORCAMENTO_RECUSADO";
  if (efetivo === "expirado") return "ORCAMENTO_EXPIRADO";
  return "APROVACAO_COMERCIAL_PENDENTE";
}

export function avaliarElegibilidadeComercialV3(input: ElegibilidadeComercialInputV3): ElegibilidadeComercialV3 {
  let totais: ReturnType<typeof reconciliarTotaisFinanceirosV3>;
  try {
    totais = reconciliarTotaisFinanceirosV3({
      storeId: input.storeId,
      osId: input.osId,
      payload: input.payload,
      prismaValorTotal: input.prismaValorTotal,
      titulo: null,
    });
  } catch {
    // Orçamento fora do formato que o cálculo lê: preço desconhecido, nunca exceção no writer.
    return recusa("PRECO_AUSENTE", "Orçamento fora do formato esperado.");
  }
  if (totais.inconsistencia) return recusa("VALORES_DIVERGENTES", totais.inconsistencia);
  if (totais.desconhecido || totais.totalCentavos == null) {
    let codigo: CodigoInelegibilidadeComercialV3;
    try {
      codigo = motivoPrecoDesconhecido(input.payload, input.agora);
    } catch {
      codigo = "APROVACAO_COMERCIAL_PENDENTE";
    }
    return recusa(codigo);
  }
  return { elegivel: true, totalCentavos: totais.totalCentavos };
}

/** Recusa lançada pelos writers que sinalizam erro por exceção (`receberOSV3`, `lancarOSAPrazoV3`). */
export class RecebimentoInelegivelErroV3 extends Error {
  readonly codigo: CodigoInelegibilidadeComercialV3;
  readonly destino: DestinoInelegibilidadeComercialV3;

  constructor(r: RecusaComercialV3) {
    super(r.mensagem);
    this.name = "RecebimentoInelegivelErroV3";
    this.codigo = r.codigo;
    this.destino = r.destino;
  }
}
