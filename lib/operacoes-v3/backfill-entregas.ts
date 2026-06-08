// ============================================================================
// Operações V3 — SPRINT_3D.2A · Backfill de entregas legadas (seguro)
// ----------------------------------------------------------------------------
// Corrige OS finalizadas como "entregue" pelo caminho ANTIGO (status-only, antes
// da 3D.2), que ficaram SEM `entregaV3` → garantia não iniciada + timeline sem o
// marco `entrega_cliente`.
//
// PRECISÃO: o alvo NÃO é "qualquer OS sem entregaV3", e sim a OS entregue cuja
// leitura oficial de entrega (`lerEntregaV3`) NÃO reconhece a entrega — pois esse
// reader já tem fallback para `os.entregueEm`/`os.retirada` (OS entregues pelo V2
// JÁ funcionam e NÃO são tocadas). A data da entrega é RECUPERADA da timeline
// (evento de transição para "entregue"); nada é inventado sem registrar a fonte.
//
// SEGURANÇA:
//   • Não executa automaticamente (nenhum import na app dispara isto).
//   • Idempotente: reprocessar é no-op (após o backfill, `lerEntregaV3` passa a
//     reconhecer a entrega → a OS deixa de ser candidata).
//   • Aditivo: só PREENCHE campos ausentes (entregaV3/entregueEm/retirada) +
//     1 evento de timeline. Nunca altera status, valor, estoque ou Financeiro.
//   • Dois modos: `previewBackfillEntregasV3` (read-only) e
//     `applyBackfillEntregasV3` (escreve). Sem schema/migration.
// ============================================================================

import type { EventoTimeline, OrdemServico } from "@/types/os";
import type { Prisma } from "@/generated/prisma";
import { prisma, withPrismaSafe } from "@/lib/prisma";
import { statusV3FromOS } from "./status-machine";
import { lerEntregaV3 } from "./pos-venda-model";

type OSPayloadLike = OrdemServico & Record<string, unknown>;

function nowIso(d: Date): string {
  return d.toISOString();
}
function evId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? `ev_${crypto.randomUUID()}` : `ev_${Date.now()}_${Math.round(Math.random() * 1e6)}`;
}
function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// ----------------------------------------------------------------------------
// Núcleo PURO (testável sem DB)
// ----------------------------------------------------------------------------

export type FonteDataEntregaV3 = "timeline_status" | "atualizadoEm" | "aproximado";

export interface BackfillEntregaPlanoV3 {
  osId: string;
  codigo: string;
  entregueEm: string;
  fonteData: FonteDataEntregaV3;
  recebidoPor: string;
  /** true quando a data não pôde ser recuperada e usou "agora" como aproximação. */
  aproximado: boolean;
}

/**
 * A OS precisa de backfill quando está ENTREGUE (V3) mas a leitura oficial de
 * entrega não a reconhece (sem entregaV3/entregueEm/retirada). Reusa os readers
 * canônicos — sem lógica de status/entrega paralela.
 */
export function precisaBackfillEntregaV3(os: OSPayloadLike | null | undefined): boolean {
  if (!os || typeof os !== "object") return false;
  if (statusV3FromOS(os) !== "entregue") return false;
  return !lerEntregaV3(os as OrdemServico).entregue;
}

/**
 * Recupera a data da entrega de uma OS legada. Prioridade:
 *   1. evento de timeline de transição para "entregue" (o caminho antigo gravava
 *      `mudanca_status` com metadata.para === "entregue") — data REAL recuperada;
 *   2. `payload.atualizadoEm`;
 *   3. "agora" (aproximado, sinalizado).
 */
export function resolverEntregueEmBackfillV3(os: OSPayloadLike | null | undefined, now: Date): { entregueEm: string; fonte: FonteDataEntregaV3 } {
  const timeline = Array.isArray(os?.timeline) ? (os!.timeline as EventoTimeline[]) : [];
  const datasEntrega = timeline
    .filter((e) => {
      const m = (e?.metadata ?? undefined) as Record<string, unknown> | undefined;
      return (m && m.para === "entregue") || e?.tipo === "entrega_cliente";
    })
    .map((e) => s(e?.criadoEm))
    .filter(Boolean)
    .sort();
  if (datasEntrega.length > 0) return { entregueEm: datasEntrega[datasEntrega.length - 1], fonte: "timeline_status" };

  const atualizado = s(os?.atualizadoEm);
  if (atualizado) return { entregueEm: atualizado, fonte: "atualizadoEm" };

  return { entregueEm: nowIso(now), fonte: "aproximado" };
}

/**
 * Monta o patch ADITIVO de entrega + o evento de timeline para uma OS candidata.
 * Pure (recebe `now`). Só preenche campos ausentes; marca `origem: "backfill"`.
 */
export function montarBackfillEntregaV3(
  os: OSPayloadLike,
  now: Date,
): { patch: Record<string, unknown>; evento: EventoTimeline; plano: BackfillEntregaPlanoV3 } {
  const { entregueEm, fonte } = resolverEntregueEmBackfillV3(os, now);
  const recebidoPor = s((os as OrdemServico)?.retirada?.retiradoPor) || s((os as OrdemServico)?.cliente?.nome) || "Cliente";
  const aproximado = fonte === "aproximado";

  const entregaV3 = {
    entregueEm,
    entreguePor: "(backfill)",
    recebidoPor,
    origem: "backfill" as const,
    backfillEm: nowIso(now),
    ...(aproximado ? { aproximado: true } : {}),
  };

  const patch: Record<string, unknown> = {
    entregaV3,
    // Só preenche se ausente (o predicado garante que estão ausentes nos candidatos).
    entregueEm: s((os as OrdemServico)?.entregueEm) || entregueEm,
    retirada:
      (os as OrdemServico)?.retirada && typeof (os as OrdemServico).retirada === "object"
        ? (os as OrdemServico).retirada
        : { confirmado: true, retiradoPor: recebidoPor, retiradoEm: entregueEm, origem: "backfill" },
  };

  const evento: EventoTimeline = {
    id: evId(),
    tipo: "entrega_cliente",
    autor: "Sistema",
    autorTipo: "sistema",
    conteudo: `Entrega registrada retroativamente (backfill 3D.2A) para ${recebidoPor}. Data ${aproximado ? "aproximada" : "recuperada"} (${fonte}).`,
    metadata: { backfill: true, fonteData: fonte, para: "entregue", aproximado },
    criadoEm: nowIso(now),
  };

  return {
    patch,
    evento,
    plano: { osId: s((os as OrdemServico)?.id), codigo: s((os as OrdemServico)?.codigo), entregueEm, fonteData: fonte, recebidoPor, aproximado },
  };
}

// ----------------------------------------------------------------------------
// Camada de I/O (Prisma) — somente leitura na auditoria/preview.
// ----------------------------------------------------------------------------

type EntregueRow = { id: string; storeId: string; numero: string | null; payload: unknown; updatedAt: Date };

const MAX_SCAN = 5000;

async function carregarEntregues(storeId?: string): Promise<EntregueRow[]> {
  const sid = (storeId ?? "").trim();
  return withPrismaSafe(
    (db) =>
      db.ordemServico.findMany({
        where: { status: "Entregue", ...(sid ? { storeId: sid } : {}) },
        select: { id: true, storeId: true, numero: true, payload: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: MAX_SCAN,
      }) as Promise<EntregueRow[]>,
    [] as EntregueRow[],
  );
}

function planoComIds(plano: BackfillEntregaPlanoV3, row: EntregueRow): BackfillEntregaPlanoV3 {
  return { ...plano, osId: row.id, codigo: plano.codigo || s(row.numero) };
}

// ----------------------------------------------------------------------------
// 1. Auditoria (read-only)
// ----------------------------------------------------------------------------

export interface AuditoriaEntregasV3 {
  /** OS com status "entregue" (V3) varridas. */
  totalEntregues: number;
  /** Candidatas a backfill (entregue sem entrega legível). */
  semEntregaV3: number;
  /** Entregues que já são consistentes (V2 ou já com entregaV3). */
  jaConsistentes: number;
  /** Quebra por fonte de data recuperada nas candidatas. */
  porFonte: Record<FonteDataEntregaV3, number>;
  /** Quantas candidatas teriam data apenas aproximada. */
  aproximadas: number;
  /** Amostra dos planos (até `amostraMax`). */
  amostra: BackfillEntregaPlanoV3[];
  /** true se a varredura atingiu o teto (pode haver mais). */
  truncado: boolean;
}

export async function auditarEntregasLegadasV3(opts?: { storeId?: string; amostraMax?: number }): Promise<AuditoriaEntregasV3> {
  const now = new Date();
  const amostraMax = Math.max(0, opts?.amostraMax ?? 25);
  const rows = await carregarEntregues(opts?.storeId);

  let totalEntregues = 0;
  let semEntregaV3 = 0;
  let aproximadas = 0;
  const porFonte: Record<FonteDataEntregaV3, number> = { timeline_status: 0, atualizadoEm: 0, aproximado: 0 };
  const amostra: BackfillEntregaPlanoV3[] = [];

  for (const r of rows) {
    const payload = r.payload as OSPayloadLike | null;
    if (!payload || typeof payload !== "object") continue;
    if (statusV3FromOS(payload) !== "entregue") continue;
    totalEntregues += 1;
    if (lerEntregaV3(payload as OrdemServico).entregue) continue; // já consistente
    semEntregaV3 += 1;
    const { plano } = montarBackfillEntregaV3(payload, now);
    porFonte[plano.fonteData] += 1;
    if (plano.aproximado) aproximadas += 1;
    if (amostra.length < amostraMax) amostra.push(planoComIds(plano, r));
  }

  return {
    totalEntregues,
    semEntregaV3,
    jaConsistentes: totalEntregues - semEntregaV3,
    porFonte,
    aproximadas,
    amostra,
    truncado: rows.length >= MAX_SCAN,
  };
}

// ----------------------------------------------------------------------------
// 2. Backfill — preview (dry-run) × apply
// ----------------------------------------------------------------------------

export interface BackfillEntregasResultadoV3 {
  dryRun: boolean;
  /** Candidatas encontradas (independe do `limit`). */
  candidatos: number;
  /** Quantas foram efetivamente gravadas (0 em dry-run). */
  aplicadas: number;
  /** Entregues já consistentes (ignoradas por idempotência). */
  ignoradas: number;
  /** Falhas de gravação (não interrompem o lote). */
  erros: number;
  /** Candidatas com data aproximada. */
  aproximadas: number;
  /** O que foi/seria aplicado (até `planosMax`). */
  planos: BackfillEntregaPlanoV3[];
  truncado: boolean;
}

async function runBackfill(opts: { dryRun: boolean; storeId?: string; limit?: number; planosMax?: number }): Promise<BackfillEntregasResultadoV3> {
  const now = new Date();
  const rows = await carregarEntregues(opts.storeId);
  const limit = opts.limit && opts.limit > 0 ? Math.trunc(opts.limit) : Infinity;
  const planosMax = Math.max(0, opts.planosMax ?? 200);

  let candidatos = 0;
  let aplicadas = 0;
  let ignoradas = 0;
  let erros = 0;
  let aproximadas = 0;
  const planos: BackfillEntregaPlanoV3[] = [];

  for (const r of rows) {
    const payload = r.payload as OSPayloadLike | null;
    if (!payload || typeof payload !== "object") continue;
    if (statusV3FromOS(payload) !== "entregue") continue;

    // Idempotência: entregue já reconhecida → no-op.
    if (lerEntregaV3(payload as OrdemServico).entregue) {
      ignoradas += 1;
      continue;
    }

    candidatos += 1;
    const { patch, evento, plano } = montarBackfillEntregaV3(payload, now);
    if (plano.aproximado) aproximadas += 1;
    if (planos.length < planosMax) planos.push(planoComIds(plano, r));

    if (opts.dryRun) continue;
    if (aplicadas >= limit) continue; // aplica só até o limite (lote cauteloso)

    try {
      const timeline = Array.isArray(payload.timeline) ? (payload.timeline as EventoTimeline[]) : [];
      // Não duplica o marco se por algum motivo já existir um entrega_cliente.
      const jaTemMarco = timeline.some((e) => e?.tipo === "entrega_cliente");
      const nextTimeline = jaTemMarco ? timeline : [...timeline, evento];
      const nextPayload = { ...payload, ...patch, timeline: nextTimeline, atualizadoEm: nowIso(now) };
      await prisma.ordemServico.update({
        where: { id: r.id },
        data: { payload: nextPayload as unknown as Prisma.InputJsonValue },
      });
      aplicadas += 1;
    } catch (e) {
      erros += 1;
      console.error("[backfill-entregas-v3] falha ao aplicar", r.id, e instanceof Error ? e.message : e);
    }
  }

  return { dryRun: opts.dryRun, candidatos, aplicadas, ignoradas, erros, aproximadas, planos, truncado: rows.length >= MAX_SCAN };
}

/** MODO PREVIEW — read-only. Lista o que SERIA corrigido, sem gravar nada. */
export function previewBackfillEntregasV3(opts?: { storeId?: string; planosMax?: number }): Promise<BackfillEntregasResultadoV3> {
  return runBackfill({ dryRun: true, storeId: opts?.storeId, planosMax: opts?.planosMax });
}

/**
 * MODO APPLY — grava o backfill (aditivo, idempotente). `limit` aplica só até N
 * OS (lote cauteloso); ausente = todas as candidatas da varredura.
 */
export function applyBackfillEntregasV3(opts?: { storeId?: string; limit?: number; planosMax?: number }): Promise<BackfillEntregasResultadoV3> {
  return runBackfill({ dryRun: false, storeId: opts?.storeId, limit: opts?.limit, planosMax: opts?.planosMax });
}
