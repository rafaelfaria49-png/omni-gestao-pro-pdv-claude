// ============================================================================
// Operações V3 — Atendimento Rápido · MODELO puro (serviços rápidos de balcão)
// ----------------------------------------------------------------------------
// Módulo PURO (sem I/O, sem React, sem Prisma). Descreve a entrada de um
// "serviço rápido concluído no balcão" (transferência de dados, película,
// configuração, etc.) e o converte no rascunho da Nova OS (NovaOSDraftV3), para
// REUSAR a espinha operacional da V3 (criação de OS + recebimento + caixa) sem
// criar um sistema paralelo nem tocar schema.
//
// NÃO há catálogo de serviços PERSISTENTE no projeto (só arrays por OS). Aqui
// usamos uma lista CURADA + entrada manual; persistir um catálogo é follow-up.
// ============================================================================

import { novaOSDraftVazioV3, type NovaOSDraftV3, type NovaOSPagamentoFormaV3 } from "./nova-os-model";
import type { FormaRecebimentoV3 } from "./payment-model";

/** Label operacional do consumidor de balcão (cliente singleton por unidade). */
export const CLIENTE_BALCAO_NOME_V3 = "Cliente Balcão";

/** Serviços rápidos sugeridos (seleção rápida; o operador pode editar/!manual). */
export const SERVICOS_RAPIDOS_V3: { id: string; nome: string; valorPadrao: number }[] = [
  { id: "transferencia_dados", nome: "Transferência de dados", valorPadrao: 30 },
  { id: "pelicula", nome: "Instalação de película", valorPadrao: 20 },
  { id: "config_whatsapp", nome: "Configuração de WhatsApp", valorPadrao: 20 },
  { id: "conta", nome: "Criação / recuperação de conta", valorPadrao: 25 },
  { id: "instalar_app", nome: "Instalação de aplicativo", valorPadrao: 15 },
  { id: "limpeza_simples", nome: "Limpeza simples", valorPadrao: 30 },
  { id: "config_aparelho", nome: "Atualização / configuração de aparelho", valorPadrao: 30 },
];

export type AtendimentoClienteModoV3 = "balcao" | "novo" | "existente";

export interface AtendimentoRapidoInputV3 {
  cliente: {
    modo: AtendimentoClienteModoV3;
    /** modo === "existente" */
    clienteId?: string;
    /** modo === "novo" (nome obrigatório) / opcional p/ exibição em "existente" */
    nome?: string;
    telefone?: string;
  };
  servico: { nome: string; valor: number; descricao?: string };
  /** Opcional — serviço rápido não exige equipamento. */
  equipamento?: { marca?: string; modelo?: string };
  formaPagamento: FormaRecebimentoV3;
  observacao?: string;
  /** Data/hora de entrada (ISO). Default = agora. Editável p/ registro retroativo. */
  dataEntrada?: string;
  /** Data/hora de conclusão (ISO). Default = agora. Editável p/ registro retroativo. */
  dataConclusao?: string;
}

/** Formata uma duração (ms) como "Xh YYmin" / "YYmin". Negativo/ inválido → "—". */
export function formatDuracaoV3(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h <= 0 ? `${m}min` : `${h}h ${String(m).padStart(2, "0")}min`;
}

/** Forma de recebimento → forma "prevista" do snapshot da Nova OS. */
export function formaPrevistaDeRecebimentoV3(f: FormaRecebimentoV3): NovaOSPagamentoFormaV3 {
  switch (f) {
    case "dinheiro":
      return "dinheiro";
    case "pix":
      return "pix";
    case "debito":
      return "debito";
    case "credito":
      return "credito";
    case "parcelado":
      return "parcelado";
    case "crediario":
      return "crediario";
    default:
      return "a_combinar";
  }
}

/** Valida o mínimo do atendimento rápido. Retorna 1ª mensagem ou null. */
export function validarAtendimentoRapidoV3(input: AtendimentoRapidoInputV3): string | null {
  const nome = input.servico?.nome?.trim();
  if (!nome) return "Informe o serviço realizado.";
  const valor = Number(input.servico?.valor);
  if (!Number.isFinite(valor) || valor <= 0) return "Informe um valor maior que zero para o serviço.";
  if (input.cliente.modo === "existente" && !input.cliente.clienteId?.trim()) {
    return "Selecione o cliente existente ou use Cliente balcão.";
  }
  if (input.cliente.modo === "novo" && !input.cliente.nome?.trim()) {
    return "Informe o nome do novo cliente ou use Cliente balcão.";
  }
  return null;
}

/**
 * Constrói o rascunho da Nova OS a partir do atendimento rápido (reuso da espinha).
 * O serviço entra como item de serviço COBRADO. Equipamento recebe placeholder
 * "Serviço rápido" quando não informado (o modelo da OS exige marca/modelo).
 */
export function montarDraftAtendimentoRapidoV3(
  input: AtendimentoRapidoInputV3,
  cliente: { id: string; nome: string; telefone?: string },
): NovaOSDraftV3 {
  const base = novaOSDraftVazioV3();
  const servNome = input.servico.nome.trim();
  const descricao = input.servico.descricao?.trim();
  const valor = Math.max(0, Math.round(Number(input.servico.valor) * 100) / 100);
  const marca = input.equipamento?.marca?.trim() || "Serviço rápido";
  const modelo = input.equipamento?.modelo?.trim() || "Balcão";

  const dataEntrada = input.dataEntrada?.trim() || base.recepcao.dataEntrada;
  return {
    ...base,
    cliente: { ...base.cliente, id: cliente.id, nome: cliente.nome, telefone: cliente.telefone },
    equipamento: { ...base.equipamento, tipo: "Serviço", marca, modelo },
    recepcao: { ...base.recepcao, origem: "balcao", localFisico: "balcao", dataEntrada },
    problema: { ...base.problema, defeitoRelatado: `Atendimento rápido: ${servNome}` },
    itens: [
      {
        id: `ar-${Date.now()}`,
        categoria: "servico",
        descricao: descricao ? `${servNome} — ${descricao}` : servNome,
        quantidade: 1,
        custoUnitario: 0,
        valorUnitario: valor,
        kind: "cobrado",
        baixaEstoque: false,
        garantiaDias: 0,
      },
    ],
    pagamento: { ...base.pagamento, forma: formaPrevistaDeRecebimentoV3(input.formaPagamento) },
  };
}
