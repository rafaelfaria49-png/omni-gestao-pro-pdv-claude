"use server";

// ============================================================================
// Operações V3 — Fase 1E · write-paths de GARANTIA + auditoria de impressão
// ----------------------------------------------------------------------------
// Side-effect-free: gravam SOMENTE o payload (garantia prevista) + timeline.
// NÃO tocam Financeiro/estoque/caixa/V2. Gravam payload direto via Prisma.
//
//   • salvarGarantiaOSV3        — define/altera o modelo+prazo da garantia da OS.
//   • registrarImpressaoDocumentoV3 — registra na timeline que um documento foi impresso.
// ============================================================================

import { revalidatePath } from "next/cache";
import type { Session } from "next-auth";
import type { Prisma } from "@/generated/prisma";
import type { EventoTimeline, EventoTipo, OrdemServico } from "@/types/os";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireEnterpriseWith } from "@/lib/auth/guard-enterprise";
import { assertActiveStoreId } from "@/lib/operacoes/assert-active-store";
import { garantiaCatalogoV3 } from "./garantia-textos";
import type { DocumentoTipoV3 } from "./documentos";

type OSPayloadFull = OrdemServico & Record<string, unknown>;

function nowIso(): string {
  return new Date().toISOString();
}
function eventId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `ev_${Date.now()}`;
}
function operadorLabel(session: Session | null): string {
  const u = session?.user;
  return (u?.name || u?.email || "Você").trim() || "Você";
}
function makeEvento(tipo: EventoTipo, autor: string, conteudo: string, metadata?: Record<string, unknown>): EventoTimeline {
  return { id: eventId(), tipo, autor, autorTipo: "usuario", conteudo, metadata, criadoEm: nowIso() };
}

async function carregar(storeId: string, osId: string): Promise<{ id: string; session: Session | null; payload: OSPayloadFull }> {
  const sid = (storeId ?? "").trim();
  const id = (osId ?? "").trim();
  assertActiveStoreId(sid, "Operações V3");
  if (!id) throw new Error("OS não informada.");
  const session = await auth();
  if (!session?.user?.id) throw new Error("Faça login para editar a garantia.");
  const guard = await requireEnterpriseWith(sid, (p) => p.operacoes.editarOs, "Sem permissão para editar a garantia desta OS.");
  if (!guard.ok) throw new Error(guard.error);
  const row = await prisma.ordemServico.findFirst({ where: { id, storeId: sid }, select: { id: true, payload: true } });
  if (!row) throw new Error("OS não encontrada.");
  const payload = row.payload as unknown as OSPayloadFull | null;
  if (!payload || typeof payload !== "object") throw new Error("OS sem payload compatível.");
  return { id, session, payload };
}

async function gravar(id: string, next: OSPayloadFull): Promise<OrdemServico> {
  const data: Prisma.OrdemServicoUpdateInput = { payload: next as unknown as Prisma.InputJsonValue };
  await prisma.ordemServico.update({ where: { id }, data });
  revalidatePath("/dashboard/operacoes-v3");
  return next as unknown as OrdemServico;
}

function appendTimeline(payload: OSPayloadFull, evento: EventoTimeline): EventoTimeline[] {
  const timeline = Array.isArray(payload.timeline) ? (payload.timeline as EventoTimeline[]) : [];
  return [...timeline, evento];
}

/** Define/altera a garantia prevista da OS (modelo + prazo + termo custom). */
export async function salvarGarantiaOSV3(
  storeId: string,
  osId: string,
  input: { modeloId: string; prazoDias?: number; termoCustom?: string },
): Promise<OrdemServico> {
  const { id, session, payload } = await carregar(storeId, osId);
  const modelo = garantiaCatalogoV3(input.modeloId);
  const prazoDias =
    typeof input.prazoDias === "number" && input.prazoDias >= 0 ? Math.trunc(input.prazoDias) : modelo.prazoDiasPadrao;

  const abertura = (payload.aberturaV3 && typeof payload.aberturaV3 === "object" ? payload.aberturaV3 : {}) as Record<string, unknown>;
  const anterior = abertura.garantiaPrevista as { modelo?: string } | undefined;
  const alterada = !!anterior?.modelo && anterior.modelo !== modelo.id;

  const nextAbertura = {
    ...abertura,
    garantiaPrevista: {
      modelo: modelo.id,
      label: modelo.titulo,
      prazoDias,
      termo: (input.termoCustom ?? "").trim() || undefined,
    },
  };

  const evento = makeEvento(
    "garantia_gerada",
    operadorLabel(session),
    alterada ? `Garantia alterada para "${modelo.titulo}" (${prazoDias} dias).` : `Garantia definida: "${modelo.titulo}" (${prazoDias} dias).`,
    { modelo: modelo.id, prazoDias, alterada },
  );

  const next: OSPayloadFull = {
    ...payload,
    aberturaV3: nextAbertura,
    timeline: appendTimeline(payload, evento),
    atualizadoEm: nowIso(),
  } as OSPayloadFull;
  return gravar(id, next);
}

/** Registra na timeline que um documento foi impresso (auditoria). Best-effort. */
export async function registrarImpressaoDocumentoV3(
  storeId: string,
  osId: string,
  tipo: DocumentoTipoV3,
): Promise<OrdemServico> {
  const { id, session, payload } = await carregar(storeId, osId);
  const label: Record<DocumentoTipoV3, string> = {
    os_cliente: "Ordem de Serviço (via cliente)",
    termo_garantia: "Termo de Garantia",
    termo_entrega: "Termo de Entrega",
    comprovante_interno: "Via Interna",
    etiqueta: "Etiqueta técnica",
  };
  const evento = makeEvento("documento_impresso", operadorLabel(session), `Documento impresso: ${label[tipo]}.`, { documento: tipo });
  const next: OSPayloadFull = { ...payload, timeline: appendTimeline(payload, evento) } as OSPayloadFull;
  return gravar(id, next);
}
