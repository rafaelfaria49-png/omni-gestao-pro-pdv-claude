"use server";

// ============================================================================
// Operações V3 — Fase 1E · write-paths de GARANTIA + auditoria de impressão
// ----------------------------------------------------------------------------
// Side-effect-free: gravam SOMENTE o payload (garantia prevista) + timeline.
// NÃO tocam Financeiro/estoque/caixa/V2. Gravam o payload MAIS RECENTE sob a
// trava da linha da OS (`os-payload-lock`).
//
//   • salvarGarantiaOSV3        — define/altera o modelo+prazo da garantia da OS.
//   • registrarImpressaoDocumentoV3 — registra na timeline que um documento foi impresso.
// ============================================================================

import { revalidatePath } from "next/cache";
import type { Session } from "next-auth";
import type { EventoTimeline, EventoTipo, OrdemServico } from "@/types/os";
import { auth } from "@/auth";
import { requireEnterpriseWith } from "@/lib/auth/guard-enterprise";
import { assertActiveStoreId } from "@/lib/operacoes/assert-active-store";
import { normalizarGarantiaPrevistaV3 } from "./garantia-textos";
import type { DocumentoTipoV3 } from "./documentos";
import { emitirEventoOperacaoV3 } from "./event-publisher";
import { mutarPayloadOSV3 } from "./os-payload-lock";

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

async function autorizar(storeId: string, osId: string): Promise<{ sid: string; id: string; session: Session | null }> {
  const sid = (storeId ?? "").trim();
  const id = (osId ?? "").trim();
  assertActiveStoreId(sid, "Operações V3");
  if (!id) throw new Error("OS não informada.");
  const session = await auth();
  if (!session?.user?.id) throw new Error("Faça login para editar a garantia.");
  const guard = await requireEnterpriseWith(sid, (p) => p.operacoes.editarOs, "Sem permissão para editar a garantia desta OS.");
  if (!guard.ok) throw new Error(guard.error);
  return { sid, id, session };
}

/** Aplica `montar` ao payload MAIS RECENTE sob a trava da OS; revalida após o commit. */
async function mutar<T>(sid: string, id: string, montar: (payload: OSPayloadFull) => { next: OSPayloadFull; extra: T }): Promise<{ os: OrdemServico; extra: T }> {
  const r = await mutarPayloadOSV3({
    storeId: sid,
    osId: id,
    mutate: ({ payload }) => {
      const { next, extra } = montar(payload);
      return { payload: next, resultado: { os: next as unknown as OrdemServico, extra } };
    },
  });
  revalidatePath("/dashboard/operacoes-v3");
  return r;
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
  const { sid, id, session } = await autorizar(storeId, osId);
  const { modelo, prazoDias } = normalizarGarantiaPrevistaV3(input);

  const { os: salva, extra: alterada } = await mutar(sid, id, (payload) => {
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
    return { next, extra: alterada };
  });

  // Espinha de eventos (3C.0): garantia prevista definida/alterada.
  emitirEventoOperacaoV3({
    tipo: "os_garantia_criada",
    os: salva,
    storeId: (storeId ?? "").trim(),
    origem: "garantia",
    metadata: { modelo: modelo.id, prazoDias, alterada },
  });
  return salva;
}

/** Registra na timeline que um documento foi impresso (auditoria). Best-effort. */
export async function registrarImpressaoDocumentoV3(
  storeId: string,
  osId: string,
  tipo: DocumentoTipoV3,
): Promise<OrdemServico> {
  const { sid, id, session } = await autorizar(storeId, osId);
  const label: Record<DocumentoTipoV3, string> = {
    os_cliente: "Ordem de Serviço (via cliente)",
    termo_garantia: "Termo de Garantia",
    termo_entrega: "Termo de Entrega",
    comprovante_interno: "Via Interna",
    etiqueta: "Etiqueta técnica",
    orcamento_cliente: "Orçamento (via cliente)",
  };
  const evento = makeEvento("documento_impresso", operadorLabel(session), `Documento impresso: ${label[tipo]}.`, { documento: tipo });
  const { os } = await mutar(sid, id, (payload) => ({ next: { ...payload, timeline: appendTimeline(payload, evento) } as OSPayloadFull, extra: null }));
  return os;
}
