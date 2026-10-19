// ============================================================================
// Operações V3 — mutação do `OrdemServico.payload` SOB A TRAVA DA LINHA
// ----------------------------------------------------------------------------
// O payload JSONB da OS guarda estado de vários donos (operacional, orçamento,
// entrega, espelhos financeiros, `recebimentoMistoRecusasV3`, timeline). Um writer
// que lê o payload, faz `await` e grava o objeto inteiro apaga o que outro writer
// commitou no meio (lost update). Regra única para todo writer de payload:
//
//   transação → SELECT … FOR UPDATE da OS (loja + id) → releitura do payload MAIS
//   RECENTE → mutação intencional sobre ele (campos desconhecidos e timeline
//   preservados por spread do latest) → UPDATE na MESMA transação → commit.
//   `revalidatePath`/eventos/efeitos externos só DEPOIS do commit, no chamador.
//
// Ordem de travas — a OS NÃO é folha; as arestas concretas são (A → B = segura A e pede B):
//
//   pagamento V3 (receber/misto/estorno/a prazo): advisory da OS → sessão de caixa
//     (FOR SHARE) → OS (FOR UPDATE) → título (FOR UPDATE) → movimentação/caixa/carteira.
//   updateOSPayload / hub / intenções de orçamento / gerar cobrança (V2): OS → título
//     (adapter os-faturamento, upsert/cancel na MESMA transação, `db: tx`).
//   cancelar OS (V3, status-actions): OS → título (`cancelContaReceber` com `db: tx`).
//   Financeiro/PDV direto, lote, rotas persist/sync-legacy, importadores: SÓ título
//     (CAS em `updatedAt` ou `SELECT … FOR UPDATE` do serviço) → movimentação/caixa/
//     carteira. Nunca pedem a OS.
//   estoque (consumo/restauração/delta): OS → produtos (ledger de estoque) → itens da OS.
//   sync de itens (rascunho): OS → itens da OS (KEY SHARE do INSERT na própria OS).
//   writers operacionais: SÓ a OS (ou OS → garantias).
//
// Sem ciclo: título, produtos e itens nunca são travados ANTES da OS por quem depois
// pede a OS; nenhum writer segura duas OS ao mesmo tempo; o serviço de título não adquire
// advisory nem outra tabela antes do título (re-travar o título no `tx` da V3 é no-op).
// Provas: `test/ops-v3-recebimento-misto/hardening-p1-transitivos.pg.ts` (PostgreSQL real).
//
// Módulo comum (sem "use server"): não é exposto como Server Action.
// ============================================================================

import { isDeepStrictEqual } from "node:util";
import type { Prisma } from "@/generated/prisma";
import type { OrdemServico } from "@/types/os";
import { prisma } from "@/lib/prisma";

export type OSPayloadV3 = OrdemServico & Record<string, unknown>;
export type TxOSPayloadV3 = Prisma.TransactionClient;

/**
 * Campos do payload que SÓ os writers financeiros da V3 (recebimento, estorno, a prazo, misto)
 * gravam, sob a trava. Patch genérico vindo do cliente nunca os troca.
 */
export const CAMPOS_FINANCEIROS_SERVIDOR_V3 = ["pagamentoV3", "aPrazoV3", "recebimentoMistoRecusasV3"] as const;
const CAMPOS_ENVIO_ORCAMENTO_V3 = ["compartilhamentosV3", "enviadoEm"] as const;

export function semCamposFinanceirosDoServidorV3<T extends object>(patch: T, current?: object): T {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("Patch da OS deve ser um objeto.");
  const limpo = { ...patch } as Record<string, unknown>;
  // Envios são escritos somente pelas actions de confirmação. Patches genéricos
  // (inclusive intenções legadas V2) não fabricam status, recibos ou eventos.
  const anterior = current as { orcamento?: Record<string, unknown>; comercialV4?: Record<string, unknown>; timeline?: Array<{ id?: string }> } | undefined;
  const orcamentoAtual = anterior?.orcamento;
  if (Object.prototype.hasOwnProperty.call(limpo, "orcamento")) {
    const entrada = limpo.orcamento as Record<string, unknown> | null | undefined;
    const objeto = !!entrada && typeof entrada === "object" && !Array.isArray(entrada);
    // `current` é o payload relido sob FOR UPDATE. Até null/arrays e snapshots
    // anteriores à reserva devem falhar antes do merge e de qualquer escrita.
    const protegido = orcamentoAtual && CAMPOS_ENVIO_ORCAMENTO_V3.some((campo) => Object.prototype.hasOwnProperty.call(orcamentoAtual, campo));
    if (protegido && (!objeto || entrada.id !== orcamentoAtual.id || entrada.sintetizado === true ||
      typeof entrada.status !== "string" || typeof entrada.total !== "number" || !Number.isFinite(entrada.total) ||
      !Array.isArray(entrada.servicos) || !Array.isArray(entrada.pecas) ||
      CAMPOS_ENVIO_ORCAMENTO_V3.some((campo) => !isDeepStrictEqual(entrada[campo], orcamentoAtual[campo])))) {
      throw new Error("Orçamento com reserva ou evidência de envio protegida. Use as ações auditadas do orçamento para alterar esses registros.");
    }
    if (entrada != null && !objeto) throw new Error("Orçamento inválido no patch da OS.");
  }
  if (limpo.orcamento && typeof limpo.orcamento === "object" && !Array.isArray(limpo.orcamento)) {
    const entrada = { ...limpo.orcamento } as Record<string, unknown>;
    if (entrada.status === "enviado" && anterior?.orcamento?.status !== "enviado") {
      throw new Error("Use a confirmação explícita de envio manual ou o aceite da API oficial para registrar enviado.");
    }
    for (const campo of CAMPOS_ENVIO_ORCAMENTO_V3) {
      if (Object.prototype.hasOwnProperty.call(entrada, campo) && !isDeepStrictEqual(entrada[campo], orcamentoAtual?.[campo])) {
        throw new Error("Campos de envio protegidos exigem as ações auditadas do orçamento.");
      }
      if (orcamentoAtual && Object.prototype.hasOwnProperty.call(orcamentoAtual, campo)) entrada[campo] = orcamentoAtual[campo];
      else delete entrada[campo];
    }
    limpo.orcamento = entrada;
  }
  if (limpo.comercialV4 && typeof limpo.comercialV4 === "object") {
    const comercial = limpo.comercialV4 as Record<string, unknown>;
    if (comercial.statusComercial === "enviado" && anterior?.comercialV4?.statusComercial !== "enviado") {
      throw new Error("Status enviado exige declaração manual ou aceite da API oficial.");
    }
  }
  if (Array.isArray(limpo.timeline)) {
    const ids = new Set((anterior?.timeline ?? []).map((e) => e.id));
    if (limpo.timeline.some((e: { id?: string; tipo?: string; metadata?: { evento?: string } }) =>
      !ids.has(e.id) && (e.tipo === "orcamento_enviado" || ["orcamento_envio_confirmado", "orcamento_compartilhamento_iniciado"].includes(e.metadata?.evento ?? "")),
    )) throw new Error("Eventos de envio exigem a confirmação auditada do orçamento.");
  }
  for (const campo of CAMPOS_FINANCEIROS_SERVIDOR_V3) delete limpo[campo];
  // Termos e coberturas só são escritos pelas actions auditadas de garantia.
  delete limpo.termosGarantiaV3;
  if (Object.prototype.hasOwnProperty.call(limpo, "aberturaV3")) {
    const previo = (current as { aberturaV3?: Record<string, unknown> } | undefined)?.aberturaV3 ?? {};
    const entrada = limpo.aberturaV3 && typeof limpo.aberturaV3 === "object" ? limpo.aberturaV3 as Record<string, unknown> : {};
    const abertura = { ...previo, ...entrada };
    for (const campo of ["garantiasServicosV3", "garantiaPrevista"]) {
      if (Object.prototype.hasOwnProperty.call(previo, campo)) abertura[campo] = previo[campo];
      else delete abertura[campo];
    }
    limpo.aberturaV3 = abertura;
  }
  return limpo as T;
}

/** Transação curta de writer de payload (mesmos limites dos writers de pagamento). */
export const TX_PAYLOAD_OS_V3 = { maxWait: 5_000, timeout: 15_000 } as const;

export interface OSTravadaV3 {
  id: string;
  storeId: string;
  numero: string | null;
  /** Payload MAIS RECENTE, lido depois da trava. `{}` quando o payload gravado não é objeto. */
  payload: OSPayloadV3;
  payloadValido: boolean;
  valorTotal: number;
  valorBase: number;
  updatedAt: Date;
}

/** `SELECT … FOR UPDATE` da OS desta loja. `false` = a OS não existe nesta loja. */
export async function travarLinhaOSV3(tx: TxOSPayloadV3, storeId: string, osId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "ordens_servico" WHERE "id" = ${osId} AND "storeId" = ${storeId} FOR UPDATE
  `;
  return Array.isArray(rows) && rows.length > 0;
}

/** Trava a OS e relê a linha: o payload devolvido é o mais recente e ninguém o troca até o commit. */
export async function lerOSTravadaV3(tx: TxOSPayloadV3, storeId: string, osId: string): Promise<OSTravadaV3 | null> {
  if (!(await travarLinhaOSV3(tx, storeId, osId))) return null;
  const row = await tx.ordemServico.findFirst({
    where: { id: osId, storeId },
    select: { id: true, storeId: true, numero: true, payload: true, valorTotal: true, valorBase: true, updatedAt: true },
  });
  if (!row) return null;
  const payloadValido = !!row.payload && typeof row.payload === "object" && !Array.isArray(row.payload);
  return {
    id: row.id,
    storeId: row.storeId,
    numero: row.numero ?? null,
    payload: (payloadValido ? row.payload : {}) as unknown as OSPayloadV3,
    payloadValido,
    valorTotal: Number(row.valorTotal ?? 0) || 0,
    valorBase: Number(row.valorBase ?? 0) || 0,
    updatedAt: row.updatedAt,
  };
}

/**
 * Resultado da mutação: `payload: null` = nada a gravar (no-op); `colunas` = colunas Prisma
 * gravadas junto (status, valorTotal, defeito…); `resultado` = o que o writer devolve.
 */
export interface MutacaoPayloadOSV3<R> {
  payload: OSPayloadV3 | null;
  colunas?: Omit<Prisma.OrdemServicoUncheckedUpdateInput, "payload">;
  resultado: R;
}

export interface MutarPayloadOSV3Params<R> {
  storeId: string;
  osId: string;
  /** Recebe a OS travada (payload mais recente) e o `tx`. Lançar aborta tudo (rollback). */
  mutate: (os: OSTravadaV3, tx: TxOSPayloadV3) => Promise<MutacaoPayloadOSV3<R>> | MutacaoPayloadOSV3<R>;
  /** Transação do chamador (já aberta). Ausente: abre uma própria com `TX_PAYLOAD_OS_V3`. */
  tx?: TxOSPayloadV3;
  /** Padrão: payload que não é objeto → "OS sem payload compatível.". `true` aceita `{}`. */
  aceitarPayloadVazio?: boolean;
  /** Padrão: OS inexistente nesta loja → "OS não encontrada.". Com isto, devolve o valor em vez de lançar. */
  aoAusente?: () => R;
}

/** MUTATE LATEST PAYLOAD UNDER ROW LOCK — ver cabeçalho do módulo. */
export async function mutarPayloadOSV3<R>(p: MutarPayloadOSV3Params<R>): Promise<R> {
  const executar = async (tx: TxOSPayloadV3): Promise<R> => {
    const os = await lerOSTravadaV3(tx, p.storeId, p.osId);
    if (!os) {
      if (p.aoAusente) return p.aoAusente();
      throw new Error("OS não encontrada.");
    }
    if (!os.payloadValido && !p.aceitarPayloadVazio) throw new Error("OS sem payload compatível.");
    const m = await p.mutate(os, tx);
    if (m.payload) {
      await tx.ordemServico.update({
        where: { id: os.id },
        data: { ...(m.colunas ?? {}), payload: m.payload as unknown as Prisma.InputJsonValue },
      });
    }
    return m.resultado;
  };
  return p.tx ? executar(p.tx) : prisma.$transaction(executar, TX_PAYLOAD_OS_V3);
}
