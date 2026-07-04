// ============================================================================
// Operações V4 — Estorno de recebimento · validação PURA do formulário
// (GOAL OPS-V4-RECEBIMENTO-ESTORNO-016).
// ----------------------------------------------------------------------------
// Módulo PURO (sem I/O, sem React, sem Prisma). `estornarRecebimentoOSV3` (V3)
// aceita `motivo` OPCIONAL (usa um texto genérico de fallback se omitido) — a
// V4 exige motivo preenchido com um mínimo de caracteres antes de habilitar a
// confirmação, para manter o estorno auditável de verdade (correção financeira).
// Este módulo NÃO decide elegibilidade (isso é derivado de pagamento/sessão de
// caixa reais em use-v4-preview.ts, mesma fonte do `v.recebimento`) — só valida
// o texto do motivo e monta o input canônico da V3.
// ============================================================================

import type { EstornarRecebimentoInputV3 } from "@/lib/operacoes-v3/pdv-servico-actions";

/** Mesmo mínimo já usado para motivo de reabertura de fechamento (Financeiro HUB). */
export const MOTIVO_ESTORNO_MIN_LEN = 5;

export interface MotivoEstornoVeredito {
  ok: boolean;
  /** Mensagem de erro (só quando ok === false). */
  erro?: string;
}

/** Valida o motivo obrigatório do estorno. Não valida saldo/caixa (isso é gating externo). */
export function validarMotivoEstornoV4(motivo: string): MotivoEstornoVeredito {
  const m = (motivo ?? "").trim();
  if (m.length === 0) return { ok: false, erro: "Informe o motivo do estorno." };
  if (m.length < MOTIVO_ESTORNO_MIN_LEN) {
    return { ok: false, erro: `Motivo muito curto (mín. ${MOTIVO_ESTORNO_MIN_LEN} caracteres).` };
  }
  return { ok: true };
}

/** Converte sessão + motivo (já validado) no input canônico aceito por `estornarRecebimentoOSV3`. */
export function buildEstornarRecebimentoInputV4(sessaoId: string, motivo: string): EstornarRecebimentoInputV3 {
  return { sessaoId: sessaoId.trim(), motivo: motivo.trim() };
}
