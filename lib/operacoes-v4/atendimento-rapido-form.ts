// ============================================================================
// Operações V4 — Atendimento Rápido · mapeamento PURO do formulário V4 →
// AtendimentoRapidoInputV3 (GOAL OPS-V4-ATENDIMENTO-RAPIDO-CONNECT-014).
// ----------------------------------------------------------------------------
// Módulo PURO (sem I/O, sem React, sem Prisma). Converte o formulário do modal
// "Atendimento rápido" da V4 no input canônico já aceito por
// `finalizarAtendimentoRapidoV3` (V3, reaproveitada tal como é — nenhum motor
// novo). Esta função NÃO persiste nada e NÃO valida regra de negócio; a
// validação mínima é a própria `validarAtendimentoRapidoV3` da V3.
// ============================================================================

import type { AtendimentoClienteModoV3, AtendimentoRapidoInputV3 } from "@/lib/operacoes-v3/atendimento-rapido-model";
import type { FormaRecebimentoV3 } from "@/lib/operacoes-v3/payment-model";

/** Cliente existente selecionado pela busca real (read-only) da loja ativa. */
export interface AtendimentoRapidoClienteExistenteV4 {
  id: string;
  nome: string;
  telefone?: string;
}

/** Estado controlado do formulário do modal "Atendimento rápido" da V4. */
export interface AtendimentoRapidoFormV4 {
  clienteModo: AtendimentoClienteModoV3;
  /** modo === "existente" */
  clienteExistente: AtendimentoRapidoClienteExistenteV4 | null;
  /** modo === "novo" */
  clienteNovoNome: string;
  clienteNovoTelefone: string;
  servicoNome: string;
  servicoValor: number;
  servicoDescricao: string;
  /** Equipamento é opcional no contrato V3 — placeholder "Serviço rápido" entra lá, não aqui. */
  equipMarca: string;
  equipModelo: string;
  formaPagamento: FormaRecebimentoV3;
  observacao: string;
}

/** Formulário vazio (estado inicial do modal, sempre que abre). */
export function atendimentoRapidoFormVazioV4(): AtendimentoRapidoFormV4 {
  return {
    clienteModo: "balcao",
    clienteExistente: null,
    clienteNovoNome: "",
    clienteNovoTelefone: "",
    servicoNome: "",
    servicoValor: 0,
    servicoDescricao: "",
    equipMarca: "",
    equipModelo: "",
    formaPagamento: "dinheiro",
    observacao: "",
  };
}

/** Aplica um serviço rápido pré-definido (`SERVICOS_RAPIDOS_V3`, da V3) ao formulário. */
export function selecionarServicoRapidoV4(
  form: AtendimentoRapidoFormV4,
  preset: { nome: string; valorPadrao: number },
): AtendimentoRapidoFormV4 {
  return { ...form, servicoNome: preset.nome, servicoValor: preset.valorPadrao };
}

/** Trim → string não-vazia ou undefined (não inventa valor). */
function clean(value: string | undefined | null): string | undefined {
  const s = typeof value === "string" ? value.trim() : "";
  return s.length ? s : undefined;
}

/**
 * Converte o formulário V4 no input canônico da V3. Não valida nem persiste —
 * use `validarAtendimentoRapidoV3` (V3, reaproveitada) antes de chamar
 * `finalizarAtendimentoRapidoV3`.
 */
export function buildAtendimentoRapidoInputFromFormV4(form: AtendimentoRapidoFormV4): AtendimentoRapidoInputV3 {
  const cliente: AtendimentoRapidoInputV3["cliente"] =
    form.clienteModo === "existente"
      ? {
          modo: "existente",
          clienteId: clean(form.clienteExistente?.id),
          nome: clean(form.clienteExistente?.nome),
          telefone: clean(form.clienteExistente?.telefone),
        }
      : form.clienteModo === "novo"
        ? { modo: "novo", nome: clean(form.clienteNovoNome), telefone: clean(form.clienteNovoTelefone) }
        : { modo: "balcao" };

  const marca = clean(form.equipMarca);
  const modelo = clean(form.equipModelo);

  return {
    cliente,
    servico: {
      nome: form.servicoNome.trim(),
      valor: Math.max(0, Number(form.servicoValor) || 0),
      descricao: clean(form.servicoDescricao),
    },
    equipamento: marca || modelo ? { marca, modelo } : undefined,
    formaPagamento: form.formaPagamento,
    observacao: clean(form.observacao),
  };
}
