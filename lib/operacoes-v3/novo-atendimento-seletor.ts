// ============================================================================
// Operações V3 — seletor "Novo atendimento" (GOAL OPERACOES-V3-NOVA-OS-SELETOR-003)
// ----------------------------------------------------------------------------
// Módulo PURO (sem I/O, sem React). O "Nova OS" da V3 abre um seletor com só
// três entradas — Nova OS, Orçamento e Retorno / Garantia. Reaproveita o
// catálogo da V4 (copy única entre as versões) SEM "Atendimento rápido", que
// fica fora do seletor da V3 (a tela própria de Atendimento rápido continua).
// Nada aqui cria OS, orça ou recebe: cada opção só escolhe o motor V3 existente.
// ============================================================================

import {
  NOVO_ATENDIMENTO_COPY_V4,
  NOVO_ATENDIMENTO_OPCOES_V4,
  type NovoAtendimentoOpcaoV4,
} from "@/lib/operacoes-v4/novo-atendimento";

/** As três entradas do seletor da V3. */
export type NovoAtendimentoModalidadeV3 = "os" | "orcamento" | "retorno";

export interface NovoAtendimentoOpcaoV3 extends Pick<NovoAtendimentoOpcaoV4, "titulo" | "chip" | "descricao"> {
  id: NovoAtendimentoModalidadeV3;
  /** Server Action V3 que a opção leva (nome real, para auditoria). */
  motor: "criarOSEnterpriseV3" | "criarOSPreOrcamentoV3" | "abrirRetornoV3";
}

const IDS_V3: readonly NovoAtendimentoModalidadeV3[] = ["os", "orcamento", "retorno"];

function ehModalidadeV3(id: string): id is NovoAtendimentoModalidadeV3 {
  return (IDS_V3 as readonly string[]).includes(id);
}

export const NOVO_ATENDIMENTO_COPY_V3 = {
  titulo: NOVO_ATENDIMENTO_COPY_V4.titulo,
  subtitulo: NOVO_ATENDIMENTO_COPY_V4.subtitulo,
} as const;

/**
 * Motor por opção na V3. O Orçamento da V3 nasce pelo formulário da Nova OS
 * gravado como pré-OS (`criarOSPreOrcamentoV3`) — sem recebimento, sem concluir
 * serviço; a V4 usa outro formulário para o mesmo tipo de registro.
 */
const MOTOR_V3: Record<NovoAtendimentoModalidadeV3, NovoAtendimentoOpcaoV3["motor"]> = {
  os: "criarOSEnterpriseV3",
  orcamento: "criarOSPreOrcamentoV3",
  retorno: "abrirRetornoV3",
};

export const NOVO_ATENDIMENTO_OPCOES_V3: readonly NovoAtendimentoOpcaoV3[] = NOVO_ATENDIMENTO_OPCOES_V4.flatMap((o) =>
  ehModalidadeV3(o.id) ? [{ id: o.id, titulo: o.titulo, chip: o.chip, descricao: o.descricao, motor: MOTOR_V3[o.id] }] : [],
);

export function motorNovoAtendimentoV3(id: NovoAtendimentoModalidadeV3): NovoAtendimentoOpcaoV3["motor"] {
  return MOTOR_V3[id];
}
