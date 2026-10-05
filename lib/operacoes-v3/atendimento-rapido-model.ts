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
import {
  campoAgoraV3,
  diaNaLojaV3,
  limitarFatoAoAgoraV3,
  montarDataOperacionalV3,
  validarDatasAtendimentoV3,
  validarEntradaDataV3,
  type CampoDataOperacionalV3,
  type DataOperacionalMetaV3,
  type DataOperacionalV3,
  type ErroCampoDataV3,
} from "./datas-operacionais-model";
// GOAL 022: fonte única do label — o resolver de cliente compartilhado é quem
// decide o nome do singleton "Cliente Balcão" (mesmo valor de sempre).
import { CLIENTE_BALCAO_NOME_V3 } from "./cliente-resolver";

export { CLIENTE_BALCAO_NOME_V3 };

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
  /** Precisão da entrada (aditivo). Ausente = chamada antiga (data/hora). */
  dataEntradaMeta?: DataOperacionalMetaV3;
  /** Data/hora de conclusão (ISO). Default = agora. Editável p/ registro retroativo. */
  dataConclusao?: string;
  dataConclusaoMeta?: DataOperacionalMetaV3;
}

/** Datas do atendimento validadas (metadata `null` = chamada antiga / padrão "agora"). */
export interface DatasAtendimentoRapidoV3 {
  entrada: { iso: string; meta: DataOperacionalMetaV3 | null };
  conclusao: { iso: string; meta: DataOperacionalMetaV3 | null };
  /** O operador informou alguma data (registro retroativo possível). */
  informadas: boolean;
}

/**
 * Valida as datas do atendimento ANTES de qualquer efeito (caixa, cliente, OS,
 * recebimento). Datas são FATOS: nunca no futuro, saída ≥ entrada. A data do
 * serviço nunca vira data do pagamento — o recebimento é sempre "agora".
 * Ausente = agora (comportamento anterior preservado).
 */
export function normalizarDatasAtendimentoRapidoV3(
  input: Pick<AtendimentoRapidoInputV3, "dataEntrada" | "dataEntradaMeta" | "dataConclusao" | "dataConclusaoMeta">,
  agora: Date = new Date(),
): { ok: true; datas: DatasAtendimentoRapidoV3 } | { ok: false; erros: ErroCampoDataV3[] } {
  const erros: ErroCampoDataV3[] = [];
  const agoraIso = agora.toISOString();
  const entradaTxt = (input.dataEntrada ?? "").trim();
  const conclusaoTxt = (input.dataConclusao ?? "").trim();
  const e = entradaTxt ? validarEntradaDataV3(entradaTxt, input.dataEntradaMeta, "Entrada do atendimento") : null;
  const c = conclusaoTxt ? validarEntradaDataV3(conclusaoTxt, input.dataConclusaoMeta, "Saída do atendimento") : null;
  if (e && !e.ok) erros.push({ campo: "dataEntrada", mensagem: e.mensagem });
  if (c && !c.ok) erros.push({ campo: "dataConclusao", mensagem: c.mensagem });
  if (erros.length > 0) return { ok: false, erros };

  const padrao = { iso: agoraIso, precisao: "data_hora" as const, dia: diaNaLojaV3(agoraIso), origem: "legado" as const };
  const entrada = e && e.ok ? e : null;
  const conclusao = c && c.ok ? c : null;
  const regras = validarDatasAtendimentoV3(
    { entrada: entrada ? entrada.data : padrao, conclusao: conclusao ? conclusao.data : padrao },
    agora,
  );
  if (regras.length > 0) return { ok: false, erros: regras };
  return {
    ok: true,
    datas: {
      // Fatos dentro da folga do relógio são gravados no "agora" do servidor.
      entrada: entrada ? limitarFatoAoAgoraV3({ iso: entrada.data.iso, meta: entrada.meta }, agora) : { iso: agoraIso, meta: null },
      conclusao: conclusao ? limitarFatoAoAgoraV3({ iso: conclusao.data.iso, meta: conclusao.meta }, agora) : { iso: agoraIso, meta: null },
      informadas: !!(entrada || conclusao),
    },
  };
}

/** Campos de data do formulário de atendimento rápido (compacto ou detalhado). */
export interface CamposDatasAtendimentoV3 {
  /** Modo compacto: uma data só (entrada = saída). */
  dataAtendimento: CampoDataOperacionalV3;
  /** "Detalhar entrada e saída": datas/horários diferentes. */
  detalhar: boolean;
  dataEntrada: CampoDataOperacionalV3;
  dataSaida: CampoDataOperacionalV3;
}

/** Estado inicial: "hoje, agora" (horário automático, descartado ao trocar o dia). */
export function camposDatasAtendimentoAgoraV3(agora: Date = new Date()): CamposDatasAtendimentoV3 {
  return { dataAtendimento: campoAgoraV3(agora), detalhar: false, dataEntrada: campoAgoraV3(agora), dataSaida: campoAgoraV3(agora) };
}

/**
 * Formulário → datas do input + erros por campo, com a MESMA regra do servidor.
 * No modo compacto os erros apontam para "dataAtendimento".
 */
export function resolverDatasAtendimentoFormV3(
  campos: CamposDatasAtendimentoV3,
  agora: Date = new Date(),
): { entrada: DataOperacionalV3 | null; conclusao: DataOperacionalV3 | null; erros: ErroCampoDataV3[] } {
  const erros: ErroCampoDataV3[] = [];
  const campoEntrada = campos.detalhar ? "dataEntrada" : "dataAtendimento";
  const campoSaida = campos.detalhar ? "dataConclusao" : "dataAtendimento";
  const e = montarDataOperacionalV3(campos.detalhar ? campos.dataEntrada : campos.dataAtendimento);
  const c = campos.detalhar ? montarDataOperacionalV3(campos.dataSaida) : e;
  if (!e.ok) erros.push({ campo: campoEntrada, mensagem: e.mensagem });
  if (campos.detalhar && !c.ok) erros.push({ campo: campoSaida, mensagem: c.mensagem });
  const entrada = e.ok ? e.valor : null;
  const conclusao = c.ok ? c.valor : null;
  if (erros.length > 0) return { entrada, conclusao, erros };
  const r = normalizarDatasAtendimentoRapidoV3(
    { dataEntrada: entrada!.iso, dataEntradaMeta: entrada!.meta, dataConclusao: conclusao!.iso, dataConclusaoMeta: conclusao!.meta },
    agora,
  );
  if (r.ok) return { entrada, conclusao, erros: [] };
  const vistos = new Set<string>();
  const remapeados = r.erros
    .map((er) => ({ campo: er.campo === "dataEntrada" ? campoEntrada : campoSaida, mensagem: er.mensagem }))
    .filter((er) => (vistos.has(er.campo) ? false : (vistos.add(er.campo), true)));
  return { entrada, conclusao, erros: remapeados };
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

  const informada = input.dataEntrada?.trim();
  const dataEntrada = informada || base.recepcao.dataEntrada;
  return {
    ...base,
    cliente: { ...base.cliente, id: cliente.id, nome: cliente.nome, telefone: cliente.telefone },
    equipamento: { ...base.equipamento, tipo: "Serviço", marca, modelo },
    recepcao: {
      ...base.recepcao,
      origem: "balcao",
      localFisico: "balcao",
      dataEntrada,
      ...(informada && input.dataEntradaMeta ? { dataEntradaMeta: input.dataEntradaMeta } : {}),
    },
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
