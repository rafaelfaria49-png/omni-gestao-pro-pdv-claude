"use client";

import { useLojaAtiva } from "@/lib/loja-ativa";
import { PdvStation } from "../pdv/PdvStation";

/** Quatro fluxos oficiais na UI. */
export const PDV_LAYOUTS_COUNT = 4 as const;

/**
 * Configurações → PDV e impressão. A composição (“Estação de caixa”) fica em `../pdv/`.
 * Remonta por unidade: nenhum rascunho de uma loja sobrevive à troca para outra.
 */
export function PdvSection() {
  const { lojaAtivaId } = useLojaAtiva();
  return <PdvStation key={lojaAtivaId?.trim() || "__sem_unidade__"} />;
}
