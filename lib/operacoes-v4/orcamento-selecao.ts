// ============================================================================
// Operações V4 — GOAL OPS-V4-ORC-APROVACAO-SELECAO-026 · seleção de variante
// ----------------------------------------------------------------------------
// Módulo PURO (sem I/O, sem React). Marca `selecionadaV3` na linha escolhida
// de UM grupo, preservando a seleção de todos os outros grupos como estão —
// mesma semântica de `marcarSelecaoV4` (privada em `orcamento-cliente-view.ts`,
// GOAL 023) mas exportada aqui para o Stage poder gravar a seleção via
// `salvarOrcamentoV3` (contrato oficial de grupos, GOAL 026). Não duplicamos
// import da projeção 023 — este é um utilitário pequeno e independente.
// ============================================================================

import type { PecaV3, ServicoV3 } from "@/lib/operacoes-v3/orcamento-model";

export interface OrcamentoSelecaoInputV4 {
  pecas: PecaV3[];
  servicos: ServicoV3[];
}

function marcarSelecao<T extends { id: string; grupoId?: string; selecionadaV3?: boolean }>(
  linhas: T[],
  grupoId: string,
  itemId: string,
): T[] {
  return linhas.map((l) => ((l.grupoId ?? "").trim() === grupoId ? { ...l, selecionadaV3: l.id === itemId } : l));
}

/**
 * Marca a linha `itemId` como selecionada dentro do grupo `grupoId`; as
 * demais linhas DESSE grupo ficam `selecionadaV3: false`; linhas de outros
 * grupos e linhas fixas (sem grupoId) não são tocadas.
 */
export function marcarSelecaoVarianteV4(orc: OrcamentoSelecaoInputV4, grupoId: string, itemId: string): OrcamentoSelecaoInputV4 {
  return {
    pecas: marcarSelecao(orc.pecas, grupoId, itemId),
    servicos: marcarSelecao(orc.servicos, grupoId, itemId),
  };
}
