// ============================================================================
// Operações V4 — Novo atendimento comercial (GOAL OPS-V4-NOVO-ATENDIMENTO-COMERCIAL-001).
// ----------------------------------------------------------------------------
// Módulo PURO (sem I/O, sem React, sem Prisma). Catálogo único das modalidades
// de começar um atendimento. Cada opção aponta para um motor V3 JÁ existente —
// este arquivo NÃO cria OS, NÃO orça e NÃO recebe. Serve a launcher/UX e
// documenta o destino no workspace depois da criação.
//
// GOAL OPS-V4-FLUXO-CURTO-007: "Retorno / Garantia" é ENTRADA de interface para
// o motor de retorno já existente (`abrirRetornoV3`), não um quarto motor de
// criação: escolhida, só abre o seletor da OS original — nada é criado.
// ============================================================================

/** As formas de começar um atendimento na V4: três criações + a entrada do retorno. */
export type NovoAtendimentoModalidadeV4 = "os" | "orcamento" | "rapido" | "retorno";

/**
 * Motor real que a modalidade dispara. Nomes iguais às Server Actions já
 * usadas pelos modais — para o próximo GOAL achar o contrato sem caçar UI.
 */
export type NovoAtendimentoMotorV4 =
  | "criarOSEnterpriseV3"
  | "criarOrcamentoRapidoV3"
  | "finalizarAtendimentoRapidoV3"
  | "abrirRetornoV3";

/** Etapa do cockpit aberta depois da criação (já é o comportamento dos handlers). */
export type NovoAtendimentoDestinoV4 = "entrada" | "orcamento" | "entrega";

export interface NovoAtendimentoOpcaoV4 {
  id: NovoAtendimentoModalidadeV4;
  titulo: string;
  /** Rótulo operacional curto (não é marketing). */
  chip: string;
  descricao: string;
  motor: NovoAtendimentoMotorV4;
  destino: NovoAtendimentoDestinoV4;
}

export const NOVO_ATENDIMENTO_COPY_V4 = {
  titulo: "Novo atendimento",
  subtitulo: "Escolha como este atendimento começa.",
  cta: "+ Novo",
} as const;

export const NOVO_ATENDIMENTO_OPCOES_V4: readonly NovoAtendimentoOpcaoV4[] = [
  {
    id: "os",
    titulo: "Nova OS",
    chip: "Entra na oficina",
    descricao: "Cliente já vai deixar o aparelho ou serviço já está autorizado.",
    motor: "criarOSEnterpriseV3",
    destino: "entrada",
  },
  {
    id: "orcamento",
    titulo: "Orçamento",
    chip: "Só proposta",
    descricao: "Cliente pediu preço e ainda precisa aprovar.",
    motor: "criarOrcamentoRapidoV3",
    destino: "orcamento",
  },
  {
    id: "rapido",
    titulo: "Atendimento rápido",
    chip: "Fecha agora",
    descricao: "Serviço simples, pagamento e conclusão na hora.",
    motor: "finalizarAtendimentoRapidoV3",
    destino: "entrega",
  },
  {
    id: "retorno",
    titulo: "Retorno / Garantia",
    chip: "Volta da OS original",
    descricao: "Aparelho já entregue voltou: parte da OS original, sem recadastrar.",
    motor: "abrirRetornoV3",
    destino: "entrada",
  },
];

export function opcaoNovoAtendimentoV4(id: NovoAtendimentoModalidadeV4): NovoAtendimentoOpcaoV4 {
  const found = NOVO_ATENDIMENTO_OPCOES_V4.find((o) => o.id === id);
  if (!found) {
    throw new Error(`Modalidade de atendimento desconhecida: ${String(id)}`);
  }
  return found;
}

/** Patch de estado V4 ao abrir o launcher — fecha os três formulários. */
export function patchAbrirLauncherNovoAtendimentoV4() {
  return {
    novoAtendimento: true,
    novaOS: false,
    orcamentoRapido: false,
    atendimentoRapido: false,
  } as const;
}

/**
 * Patch de estado V4 ao escolher uma modalidade — fecha o launcher e abre só o
 * motor certo. "retorno" fecha os três formulários; o seletor da OS original é
 * aberto pelo orquestrador (chaveado pela loja ativa).
 */
export function patchEscolherNovoAtendimentoV4(id: NovoAtendimentoModalidadeV4) {
  return {
    novoAtendimento: false,
    novaOS: id === "os",
    orcamentoRapido: id === "orcamento",
    atendimentoRapido: id === "rapido",
  } as const;
}
