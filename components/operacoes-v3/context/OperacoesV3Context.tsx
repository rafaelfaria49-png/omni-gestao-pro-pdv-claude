"use client";

// ============================================================================
// Operações V3 — Contexto de navegação + dados compartilhados (somente leitura)
// ----------------------------------------------------------------------------
// O Shell constrói o value (estado de navegação + lista de OS já carregada +
// ação placeholder honesta). As telas consomem via useOperacoesV3().
// ============================================================================

import { createContext, useContext } from "react";
import type { OrdemServico } from "@/types/os";
import type { OperacaoStatusV3 } from "@/lib/operacoes-v3/status-machine";
import type { ScreenId } from "../data/types";

export interface OperacoesV3ContextValue {
  storeId: string | null;
  activeScreen: ScreenId;
  selectedOsId: string | null;
  navigate: (screen: ScreenId, osId?: string | null) => void;
  openOS: (osId: string) => void;

  // Lista de OS compartilhada (carregada uma vez no Shell)
  ordens: OrdemServico[];
  loading: boolean;
  primeiraCarga: boolean;
  error: string | null;
  reload: () => void;

  /**
   * Aplica uma transição de status pela máquina única da V3 (write real).
   * Já recarrega a lista e exibe toast (sucesso ou motivo do bloqueio).
   * Retorna `true` em sucesso. Kanban, Workspace e Action Bar usam este caminho.
   */
  mudarStatus: (osId: string, to: OperacaoStatusV3) => Promise<boolean>;

  /** Abre o modal "Nova OS Enterprise" (fluxo completo de abertura de OS). */
  abrirNovaOS: () => void;

  /** Toast neutro (ex.: transição bloqueada validada no cliente). */
  notificar: (msg: string) => void;

  /** Toast honesto para ações ainda não disponíveis nesta fase (sem write-path). */
  acaoEmConstrucao: (label?: string) => void;
}

export const OperacoesV3Context = createContext<OperacoesV3ContextValue | null>(null);

export function useOperacoesV3(): OperacoesV3ContextValue {
  const ctx = useContext(OperacoesV3Context);
  if (!ctx) {
    throw new Error("useOperacoesV3 deve ser usado dentro de <OperacoesV3Shell>.");
  }
  return ctx;
}
