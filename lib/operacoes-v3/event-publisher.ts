// ============================================================================
// Operações V3 — Fase 3C.0 · PUBLISHER ÚNICO DE EVENTOS
// ----------------------------------------------------------------------------
// O ÚNICO ponto por onde a Operações V3 publica eventos. Nenhuma tela e nenhum
// write-path emite "na mão": todos chamam `emitirEventoOperacaoV3`.
//
// Garantias desta fase (3C.0):
//   • PRODUTORA-ONLY: publica em memória + notifica assinantes locais. NÃO toca
//     Prisma, WhatsApp, Meta, Portal, event-bus global (todos fora do escopo).
//   • NUNCA LANÇA: emitir um evento é best-effort e jamais quebra o fluxo da OS.
//     Eventos inválidos são descartados com motivo; assinante que falha é isolado.
//   • OBSERVÁVEL: ring buffer em memória + log opcional (modo debug) para
//     inspecionar evento emitido, payload e origem — sem painel complexo.
//
// O consumo real (notificação ao cliente, Omni inbox, timeline 360°) é fase
// posterior e se conecta por `subscribeOperacaoEventoV3`, SEM alterar este
// arquivo nem o modelo.
// ============================================================================

import {
  construirEventoV3,
  validarEventoV3,
  type ConstruirEventoV3Params,
  type OperacaoEventoV3Payload,
} from "./event-model";

export interface ResultadoPublicacaoV3 {
  ok: boolean;
  /** O evento publicado (presente quando ok). */
  evento?: OperacaoEventoV3Payload;
  /** Motivo da recusa quando ok=false (evento inválido). */
  motivo?: string;
}

export type OperacaoEventoV3Listener = (evento: OperacaoEventoV3Payload) => void;

// ----------------------------------------------------------------------------
// Estado do publisher (módulo). Em produção não há assinantes por padrão nesta
// fase — o bridge de notificação é registrado em fase posterior.
// ----------------------------------------------------------------------------

const subscribers = new Set<OperacaoEventoV3Listener>();

const DEBUG_BUFFER_MAX = 50;
const debugBuffer: OperacaoEventoV3Payload[] = [];

let debugEnabled = process.env.OPERACOES_V3_EVENT_DEBUG === "1";

// ----------------------------------------------------------------------------
// Observabilidade (modo debug simples).
// ----------------------------------------------------------------------------

/** Liga/desliga o modo debug (log + retenção no buffer). */
export function setDebugOperacaoEventoV3(enabled: boolean): void {
  debugEnabled = !!enabled;
}

export function isDebugOperacaoEventoV3(): boolean {
  return debugEnabled;
}

/** Cópia (mais recente por último) dos eventos retidos no buffer de debug. */
export function lerDebugEventosV3(): OperacaoEventoV3Payload[] {
  return debugBuffer.slice();
}

/** Limpa o buffer de debug (uso em dev/testes). */
export function limparDebugEventosV3(): void {
  debugBuffer.length = 0;
}

function reterNoBuffer(evento: OperacaoEventoV3Payload): void {
  debugBuffer.push(evento);
  if (debugBuffer.length > DEBUG_BUFFER_MAX) {
    debugBuffer.splice(0, debugBuffer.length - DEBUG_BUFFER_MAX);
  }
}

// ----------------------------------------------------------------------------
// Assinatura (consumo) — usado por fases futuras e pela observabilidade.
// ----------------------------------------------------------------------------

/** Registra um assinante; retorna a função de cancelamento. */
export function subscribeOperacaoEventoV3(listener: OperacaoEventoV3Listener): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

/** TEST-ONLY: remove todos os assinantes e limpa o buffer. */
export function __resetOperacaoEventoV3ParaTeste(): void {
  subscribers.clear();
  debugBuffer.length = 0;
}

// ----------------------------------------------------------------------------
// Publicação.
// ----------------------------------------------------------------------------

/**
 * Publica um payload já montado. Valida; descarta inválidos (sem lançar);
 * retém no buffer (debug) e notifica assinantes isolando falhas individuais.
 */
export function publicarEventoV3(evento: OperacaoEventoV3Payload): ResultadoPublicacaoV3 {
  const veredito = validarEventoV3(evento);
  if (!veredito.ok) {
    if (debugEnabled) {
      // eslint-disable-next-line no-console
      console.warn(`[operacoes-v3:evento] descartado — ${veredito.motivo}`, evento);
    }
    return { ok: false, motivo: veredito.motivo };
  }

  reterNoBuffer(evento);

  if (debugEnabled) {
    // eslint-disable-next-line no-console
    console.debug(`[operacoes-v3:evento] ${evento.tipo}`, {
      osId: evento.osId,
      numeroOS: evento.numeroOS,
      status: evento.status,
      loja: evento.loja,
      origem: evento.metadata?.origem ?? null,
      payload: evento,
    });
  }

  for (const listener of subscribers) {
    try {
      listener(evento);
    } catch (e) {
      // Um assinante quebrado nunca derruba o fluxo da OS nem os demais assinantes.
      // eslint-disable-next-line no-console
      console.error("[operacoes-v3:evento] assinante falhou", evento.tipo, e);
    }
  }

  return { ok: true, evento };
}

/**
 * Constrói o payload a partir da OS e publica. ESTE é o ponto que os write-paths
 * da V3 chamam — fire-and-forget, síncrono, nunca lança. Nunca chamar
 * `publicarEventoV3` direto de uma action: passar sempre por aqui.
 */
export function emitirEventoOperacaoV3(params: ConstruirEventoV3Params): ResultadoPublicacaoV3 {
  try {
    const evento = construirEventoV3(params);
    return publicarEventoV3(evento);
  } catch (e) {
    // Mesmo uma falha ao montar o payload não pode afetar o fluxo da OS.
    if (debugEnabled) {
      // eslint-disable-next-line no-console
      console.error("[operacoes-v3:evento] falha ao emitir", params?.tipo, e);
    }
    return { ok: false, motivo: e instanceof Error ? e.message : "Falha ao emitir evento." };
  }
}
