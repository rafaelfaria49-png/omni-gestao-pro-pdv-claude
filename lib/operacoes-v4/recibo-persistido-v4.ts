// ============================================================================
// Operações V4 — comprovante PERSISTIDO da OS (GOAL OPS-V4-FLUXO-CURTO-006).
// ----------------------------------------------------------------------------
// Módulo PURO (sem I/O, sem React). Reimpressão depois de reload/troca de
// máquina: o comprovante vem da evidência que os writers canônicos já gravam na
// timeline da OS — `receberOSV3` e `registrarRecebimentoMistoOSV3` guardam o
// `ComprovanteReciboV3` em `timeline[].metadata.comprovante`, na ordem do
// registro. Nada aqui grava, recalcula valor ou inventa comprovante.
//
// Estorno: `estornarRecebimentoOSV3` reverte o ÚLTIMO recebimento com dinheiro
// (modo "ultimo_pagamento"); o comprovante correspondente deixa de valer. Além
// disso, só é oferecido o comprovante cujo acumulado recebido bate com o
// recebido ATUAL da projeção server-side — histórico alterado por outro caminho
// (estorno/baixa fora da OS) nunca reimprime um estado que não existe mais.
// ============================================================================

import type { ComprovanteReciboV3 } from "@/lib/operacoes-v3/payment-model";

export interface ReciboPersistidoV4 {
  recibo: ComprovanteReciboV3;
  /** Evento da timeline que guardou o comprovante (rastreabilidade). */
  eventoId: string | null;
}

export type LeituraReciboPersistidoV4 =
  | { estado: "disponivel"; persistido: ReciboPersistidoV4 }
  /** Recebido atual ainda desconhecido (projeção carregando/erro): nada é oferecido. */
  | { estado: "confirmando" }
  /** Nenhum recebimento nesta OS. */
  | { estado: "sem_recebimento" }
  /** Há recebimento, mas nenhum comprovante persistido corresponde ao estado atual. */
  | { estado: "indisponivel" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function finito(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

const centavos = (value: number) => Math.round(value * 100);

/** Só aceita o formato do `ComprovanteReciboV3` gravado pelos writers canônicos. */
function comoComprovante(value: unknown): ComprovanteReciboV3 | null {
  if (!isRecord(value)) return null;
  if (typeof value.numeroOS !== "string" || !Array.isArray(value.formas)) return null;
  if (!finito(value.valorPago) || !finito(value.totalOS) || !finito(value.recebidoAcumulado) || !finito(value.saldoRestante)) return null;
  return value as unknown as ComprovanteReciboV3;
}

function estornoDoUltimoPagamento(evento: Record<string, unknown>): boolean {
  if (evento.tipo !== "financeiro_conta_receber_atualizada" || !isRecord(evento.metadata)) return false;
  const estornado = evento.metadata.estornado;
  return evento.metadata.modo === "ultimo_pagamento" && finito(estornado) && estornado > 0;
}

/**
 * Comprovantes ainda válidos da OS, na ordem do registro (o último é o mais
 * recente). Cada estorno do último pagamento remove o comprovante com dinheiro
 * mais recente — a mesma regra do motor (`estornarContaReceber`).
 */
export function comprovantesValidosDaOSV4(os: { timeline?: unknown } | null | undefined): ReciboPersistidoV4[] {
  const timeline = Array.isArray(os?.timeline) ? os!.timeline : [];
  const pilha: ReciboPersistidoV4[] = [];
  for (const evento of timeline) {
    if (!isRecord(evento)) continue;
    if (estornoDoUltimoPagamento(evento)) {
      for (let i = pilha.length - 1; i >= 0; i--) {
        if (pilha[i]!.recibo.valorPago > 0) {
          pilha.splice(i, 1);
          break;
        }
      }
      continue;
    }
    const recibo = isRecord(evento.metadata) ? comoComprovante(evento.metadata.comprovante) : null;
    if (recibo) pilha.push({ recibo, eventoId: typeof evento.id === "string" ? evento.id : null });
  }
  return pilha;
}

/**
 * Comprovante oferecido para reimpressão. `recebidoAtual` é o recebido da
 * projeção server-side da MESMA OS (null = ainda não confirmado → nada é
 * oferecido). O comprovante só vale se o acumulado dele é o recebido atual.
 */
export function lerReciboPersistidoV4(input: {
  os: { timeline?: unknown } | null | undefined;
  recebidoAtual: number | null | undefined;
}): LeituraReciboPersistidoV4 {
  if (!finito(input.recebidoAtual)) return { estado: "confirmando" };
  const validos = comprovantesValidosDaOSV4(input.os);
  const ultimo = validos[validos.length - 1];
  if (ultimo && centavos(ultimo.recibo.recebidoAcumulado) === centavos(input.recebidoAtual)) {
    return { estado: "disponivel", persistido: ultimo };
  }
  return input.recebidoAtual > 0 ? { estado: "indisponivel" } : { estado: "sem_recebimento" };
}
