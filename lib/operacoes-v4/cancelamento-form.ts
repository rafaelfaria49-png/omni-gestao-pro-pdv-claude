// ============================================================================
// Operações V4 — Cancelamento de OS · validação PURA do formulário
// (GOAL OPS-V4-CANCELAR-OS-CONNECT-021).
// ----------------------------------------------------------------------------
// Módulo PURO (sem I/O, sem React, sem Prisma). `aplicarTransicaoStatusV3` (V3,
// já blindada no commit f825867) exige `opts.motivo` (mín. 5 caracteres) quando
// `to === "cancelada"` e bloqueia sozinha qualquer pagamento recebido — este
// módulo NÃO decide elegibilidade (isso é derivado de status/pagamento reais em
// use-v4-preview.ts, mesma fonte de `v.execAcoes`/`v.estorno`) — só valida o
// texto do motivo (mesmo mínimo do servidor, para feedback client-side) e monta
// o input canônico da V3.
// ============================================================================

import type { AplicarTransicaoStatusOptsV3 } from "@/lib/operacoes-v3/status-actions";

/** Mesmo mínimo exigido pelo servidor (`aplicarTransicaoStatusV3`). */
export const MOTIVO_CANCELAMENTO_MIN_LEN = 5;

export interface MotivoCancelamentoVeredito {
  ok: boolean;
  /** Mensagem de erro (só quando ok === false). */
  erro?: string;
}

/** Valida o motivo obrigatório do cancelamento. Não valida status/pagamento (gating externo). */
export function validarMotivoCancelamentoV4(motivo: string): MotivoCancelamentoVeredito {
  const m = (motivo ?? "").trim();
  if (m.length === 0) return { ok: false, erro: "Informe o motivo do cancelamento." };
  if (m.length < MOTIVO_CANCELAMENTO_MIN_LEN) {
    return { ok: false, erro: `Motivo muito curto (mín. ${MOTIVO_CANCELAMENTO_MIN_LEN} caracteres).` };
  }
  return { ok: true };
}

/** Converte o motivo (já validado) no input canônico aceito por `aplicarTransicaoStatusV3`. */
export function buildCancelarOSInputV4(motivo: string): AplicarTransicaoStatusOptsV3 {
  return { motivo: motivo.trim() };
}
