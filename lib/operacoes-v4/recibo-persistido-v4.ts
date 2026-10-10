// ============================================================================
// Operações V4 — comprovante PERSISTIDO da OS (GOAL OPS-V4-FLUXO-CURTO-006).
// ----------------------------------------------------------------------------
// Módulo PURO (sem I/O, sem React). Reimpressão depois de reload/troca de
// máquina: o comprovante vem da evidência que os writers canônicos já gravam na
// timeline da OS — `receberOSV3` e `registrarRecebimentoMistoOSV3` guardam o
// `ComprovanteReciboV3` em `timeline[].metadata.comprovante` (com `operacaoId`),
// na ordem do registro. Nada aqui grava, recalcula valor ou inventa comprovante.
//
// Autoridade: o histórico do TÍTULO. Um comprovante só é oferecido quando a
// sequência de comprovantes com dinheiro da OS (descontados os estornos que a OS
// registrou) casa 1:1 com os pagamentos VIGENTES do título — mesmo valor, na
// mesma ordem e a MESMA identidade de operação (`operacaoId` do comprovante =
// `operationId` do pagamento) — e o acumulado dele é o recebido atual. Identidade
// ausente em qualquer lado nunca casa: uma reposição feita fora da OS (sem
// identidade) não valida o comprovante estornado. Baixa ou estorno feitos fora da
// OS, ou um estorno seguido de reposição do mesmo valor, nunca deixam reimprimir
// um recebimento que não vale mais. O comprovante da sessão nunca é autoridade: só
// identifica "acabou de receber" quando é o mesmo que a evidência persistida.
// ============================================================================

import type { ComprovanteReciboV3 } from "@/lib/operacoes-v3/payment-model";

export interface ReciboPersistidoV4 {
  recibo: ComprovanteReciboV3;
  /** Evento da timeline que guardou o comprovante (rastreabilidade). */
  eventoId: string | null;
  /** Identidade da operação que o gravou (`metadata.operacaoId`), quando houver. */
  operacaoId: string | null;
}

export type LeituraReciboPersistidoV4 =
  | { estado: "disponivel"; persistido: ReciboPersistidoV4 }
  /** Recebido atual ainda desconhecido (projeção carregando/erro): nada é oferecido. */
  | { estado: "confirmando" }
  /** Nenhum recebimento nesta OS. */
  | { estado: "sem_recebimento" }
  /** Há recebimento, mas nenhum comprovante persistido corresponde ao estado atual. */
  | { estado: "indisponivel" };

export type LeituraReciboV4 =
  | { estado: "disponivel"; recibo: ComprovanteReciboV3; origem: "sessao" | "persistido"; eventoId: string | null }
  | { estado: "confirmando" }
  /** A leitura da OS ou do financeiro falhou: nada se conclui até reler. */
  | { estado: "erro" }
  | { estado: "sem_recebimento" }
  | { estado: "indisponivel" };

/** Pagamento vigente do título (ver `FinancialProjectionOSV4.receivablePayments`). */
export interface PagamentoVigenteV4 {
  amount: number;
  operationId: string | null;
}

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
 * Comprovantes da OS ainda não estornados PELA OS, na ordem do registro (o último
 * é o mais recente). Cada estorno do último pagamento registrado na OS remove o
 * comprovante com dinheiro mais recente — a regra de `estornarRecebimentoOSV3`.
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
    const metadata = isRecord(evento.metadata) ? evento.metadata : null;
    const recibo = metadata ? comoComprovante(metadata.comprovante) : null;
    if (!recibo) continue;
    pilha.push({
      recibo,
      eventoId: typeof evento.id === "string" ? evento.id : null,
      operacaoId: typeof metadata?.operacaoId === "string" && metadata.operacaoId.trim() ? metadata.operacaoId.trim() : null,
    });
  }
  return pilha;
}

/**
 * A sequência de comprovantes com dinheiro da OS é exatamente a de pagamentos vigentes
 * do título: mesmo valor e MESMA identidade, par a par. Comprovante sem `operacaoId`
 * ou pagamento sem `operationId` não prova nada (os writers canônicos sempre gravam a
 * identidade nos dois lados) — fail-closed, sem casar por valor e ordem.
 */
function casaComTitulo(validos: ReciboPersistidoV4[], pagamentos: ReadonlyArray<PagamentoVigenteV4>): boolean {
  const comDinheiro = validos.filter((item) => item.recibo.valorPago > 0);
  if (comDinheiro.length !== pagamentos.length) return false;
  return comDinheiro.every((item, i) => {
    const pagamento = pagamentos[i]!;
    if (!finito(pagamento.amount) || centavos(item.recibo.valorPago) !== centavos(pagamento.amount)) return false;
    return !!item.operacaoId && !!pagamento.operationId && pagamento.operationId === item.operacaoId;
  });
}

/** Mesmo comprovante (o JSONB do banco reordena chaves: compara campo a campo). */
function mesmoComprovante(a: ComprovanteReciboV3, b: ComprovanteReciboV3): boolean {
  const formas = (r: ComprovanteReciboV3) =>
    (Array.isArray(r.formas) ? r.formas : []).map((f) => `${f.forma}:${centavos(f.valor)}`).sort().join("|");
  return (
    a.numeroOS === b.numeroOS &&
    a.dataHora === b.dataHora &&
    a.operador === b.operador &&
    (a.tipoComprovante ?? "recebimento") === (b.tipoComprovante ?? "recebimento") &&
    centavos(a.valorPago) === centavos(b.valorPago) &&
    centavos(a.recebidoAcumulado) === centavos(b.recebidoAcumulado) &&
    formas(a) === formas(b)
  );
}

/**
 * Comprovante que a OS pode mostrar AGORA (reimpressão inclusive). Sem leitura
 * confirmada do título (`pagamentosVigentes`) e do recebido atual, nada é
 * oferecido. A sessão só define a origem ("acabou de receber"), nunca o conteúdo.
 */
export function escolherReciboV4(input: {
  sessao: ComprovanteReciboV3 | null | undefined;
  os: { timeline?: unknown } | null | undefined;
  recebidoAtual: number | null | undefined;
  pagamentosVigentes: ReadonlyArray<PagamentoVigenteV4> | null | undefined;
}): LeituraReciboV4 {
  if (!finito(input.recebidoAtual) || !Array.isArray(input.pagamentosVigentes)) return { estado: "confirmando" };
  const semComprovante = input.recebidoAtual > 0 ? ({ estado: "indisponivel" } as const) : ({ estado: "sem_recebimento" } as const);
  const validos = comprovantesValidosDaOSV4(input.os);
  const ultimo = validos[validos.length - 1];
  if (!ultimo || !casaComTitulo(validos, input.pagamentosVigentes)) return semComprovante;
  if (centavos(ultimo.recibo.recebidoAcumulado) !== centavos(input.recebidoAtual)) return semComprovante;
  const sessao = comoComprovante(input.sessao);
  return {
    estado: "disponivel",
    recibo: ultimo.recibo,
    origem: sessao && mesmoComprovante(sessao, ultimo.recibo) ? "sessao" : "persistido",
    eventoId: ultimo.eventoId,
  };
}

/**
 * Mesma decisão a partir de uma projeção JÁ estabelecida da MESMA OS. Sem título,
 * nada foi recebido (todo recebimento canônico cria o título antes); com título mas
 * recebido/histórico ilegíveis, o comprovante fica indisponível — nunca "confirmando"
 * para sempre.
 */
export function lerReciboDaProjecaoV4(input: {
  sessao: ComprovanteReciboV3 | null | undefined;
  os: { timeline?: unknown } | null | undefined;
  projection: { receivedTotal: number | null; receivableFound: boolean; receivablePayments?: ReadonlyArray<PagamentoVigenteV4> | null };
}): LeituraReciboV4 {
  const { projection } = input;
  const recebidoAtual = projection.receivedTotal ?? (projection.receivableFound ? null : 0);
  const pagamentosVigentes = projection.receivablePayments ?? (projection.receivableFound ? null : []);
  if (recebidoAtual == null || pagamentosVigentes == null) return { estado: "indisponivel" };
  return escolherReciboV4({ sessao: input.sessao, os: input.os, recebidoAtual, pagamentosVigentes });
}

/**
 * Leitura só da timeline da OS (sem o título): o último comprovante não estornado
 * pela OS cujo acumulado é o recebido atual. Use `escolherReciboV4` para decidir o
 * que mostrar — esta leitura não enxerga baixa/estorno feitos fora da OS.
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
