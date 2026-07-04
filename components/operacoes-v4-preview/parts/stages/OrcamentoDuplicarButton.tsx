/**
 * Operações V4 — botão "Duplicar como novo orçamento" (GOAL OPS-V4-ORC-ENVIO-
 * WA-025). Monta o prefill (visão INTERNA — inclui custo) a partir da OS REAL
 * via `montarPrefillDuplicarOrcamentoV4` e abre o modal "⚡ Orçamento Rápido"
 * (GOAL 024) já preenchido. O cliente NUNCA é copiado — duplicar é para um
 * atendimento novo. Nenhuma escrita acontece aqui: salvar segue o fluxo normal
 * do 024 (nova OS, nova ação do operador).
 */
"use client";

import { C } from "../../tokens";
import type { V4Vals } from "../../use-v4-preview";
import { montarPrefillDuplicarOrcamentoV4 } from "@/lib/operacoes-v4/orcamento-prefill";

export function OrcamentoDuplicarButton({ v }: { v: V4Vals }) {
  if (!v.realOS) return null;
  const prefill = montarPrefillDuplicarOrcamentoV4(v.realOS);
  if (!prefill) return null;

  return (
    <button
      type="button"
      onClick={() => v.abrirOrcamentoRapidoComPrefill(prefill)}
      style={{ height: 30, padding: "0 12px", border: `1px solid ${C.inputBd2}`, background: C.surface, color: C.body, borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer", width: "100%" }}
    >
      🗐 Duplicar como novo orçamento
    </button>
  );
}
