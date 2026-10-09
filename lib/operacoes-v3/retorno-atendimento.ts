// ============================================================================
// Operações V3 — rascunho do atendimento de retorno/garantia (puro).
// ----------------------------------------------------------------------------
// Converte a OS original + motivo/observação no `NovaOSDraftV3` que
// `criarOSEnterpriseV3` já sabe persistir. Sem I/O. A OS original continua
// entregue (status final); o atendimento novo nasce aberto, com origem
// retorno/garantia e vínculo explícito gravado depois pela action.
//
// GOAL OPS-V4-FLUXO-CURTO-007: cliente e identidade do aparelho são herdados
// (sem recadastro); senha e acessórios NÃO — são fatos da recepção NOVA,
// informados pelo operador agora (ausente = não informado).
// ============================================================================

import type { OrdemServico } from "@/types/os";
import { novaOSDraftVazioV3, type NovaOSDraftV3, type NovaOSSenhaTipoV3 } from "./nova-os-model";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function senhaTipoValido(tipo: unknown): NovaOSSenhaTipoV3 | undefined {
  return tipo === "padrao" || tipo === "texto" || tipo === "numerica" ? tipo : undefined;
}

/** Recepção do atendimento NOVO — nada aqui vem da OS original. */
export interface RetornoRecepcaoInputV3 {
  /** Acessórios entregues AGORA, junto com o aparelho que voltou. */
  acessorios?: string[];
  /** Senha informada AGORA (opcional). */
  senha?: string;
  senhaTipo?: NovaOSSenhaTipoV3;
}

export interface RetornoAtendimentoInputV3 {
  motivo: string;
  observacao?: string;
  garantiaAtiva: boolean;
  recepcao?: RetornoRecepcaoInputV3;
}

/** Rascunho canônico para reabrir o aparelho como atendimento vinculado. */
export function buildRetornoAtendimentoDraftV3(
  os: OrdemServico,
  input: RetornoAtendimentoInputV3,
  now: Date = new Date(),
): NovaOSDraftV3 {
  const base = novaOSDraftVazioV3(now);
  const motivo = text(input.motivo);
  const observacao = text(input.observacao);
  const codigo = text(os.codigo);
  const notas = [
    codigo ? `Retorno da OS ${codigo}.` : "Retorno em garantia da OS original.",
    observacao,
  ]
    .filter(Boolean)
    .join(" ");

  const clienteId = text(os.clienteId) || text(os.cliente?.id) || undefined;
  const acessorios = Array.isArray(input.recepcao?.acessorios)
    ? input.recepcao.acessorios.map((item) => text(item)).filter(Boolean)
    : [];
  const senha = text(input.recepcao?.senha) || undefined;

  return {
    ...base,
    cliente: {
      id: clienteId,
      nome: text(os.cliente?.nome),
      telefone: text(os.cliente?.telefone) || text(os.cliente?.whatsapp) || undefined,
      documento: text(os.cliente?.documento) || undefined,
      email: text(os.cliente?.email) || undefined,
      tipo: "PF",
    },
    equipamento: {
      ...base.equipamento,
      tipo: text(os.equipamento?.tipo) || "Smartphone",
      marca: text(os.equipamento?.marca),
      modelo: text(os.equipamento?.modelo),
      imei: text(os.equipamento?.numeroSerie) || undefined,
      senha,
      senhaTipo: (senha && senhaTipoValido(input.recepcao?.senhaTipo)) || base.equipamento.senhaTipo,
      acessorios,
    },
    recepcao: {
      ...base.recepcao,
      origem: input.garantiaAtiva ? "garantia" : "retorno",
      prioridade: "alta",
      localFisico: "balcao",
    },
    problema: {
      defeitoRelatado: motivo,
      observacoesInternas: notas || undefined,
    },
  };
}
