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
import { garantiaCatalogoV3 } from "./garantia-textos";
import { assinaturaGarantiasServicosV3, gravarCoberturasGarantiaV3, lerCoberturasGarantiaV3, validarPrazoGarantiaServicoV3, type CoberturaServicoV3 } from "./garantia-servicos-model";
import { adicionarVersaoTermoGarantiaV3, lerVersoesTermoGarantiaV3 } from "./garantia-termos-model";
import { lerEmpresaTermoGarantiaV3 } from "./garantia-empresa-server";
import { lerEntregaV3 } from "./pos-venda-model";
import type { DocumentoTipoV3 } from "./documentos";
import { emitirEventoOperacaoV3 } from "./event-publisher";
import { mutarPayloadOSV3, type TxOSPayloadV3 } from "./os-payload-lock";

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
async function mutar<T>(sid: string, id: string, montar: (payload: OSPayloadFull, tx: TxOSPayloadV3) => { next: OSPayloadFull; extra: T } | Promise<{ next: OSPayloadFull; extra: T }>): Promise<{ os: OrdemServico; extra: T }> {
  const r = await mutarPayloadOSV3({
    storeId: sid,
    osId: id,
    mutate: async ({ payload }, tx) => {
      const { next, extra } = await montar(payload, tx);
      return { payload: next, resultado: { os: next as unknown as OrdemServico, extra } };
    },
  });
  revalidatePath("/dashboard/operacoes-v3");
  revalidatePath("/dashboard/operacoes-v4-preview");
  return r;
}

function appendTimeline(payload: OSPayloadFull, evento: EventoTimeline): EventoTimeline[] {
  const timeline = Array.isArray(payload.timeline) ? (payload.timeline as EventoTimeline[]) : [];
  return [...timeline, evento];
}

export interface SalvarGarantiaInputV3 {
  modeloId: string; prazoDias?: number; termoCustom?: string;
  linhaId?: string; motivo?: string; esperado?: string; origem?: "v3" | "v4";
}

/** Confirmação do padrão usa editarOs; toda alteração exige garantia + motivo. */
export async function salvarGarantiaOSV3(storeId: string, osId: string, input: SalvarGarantiaInputV3): Promise<OrdemServico> {
  const { sid, id, session } = await autorizar(storeId, osId);
  const prazoDias = validarPrazoGarantiaServicoV3(input.modeloId, input.prazoDias);
  const modelo = garantiaCatalogoV3(input.modeloId);
  const { os: salva, extra: alterada } = await mutar(sid, id, async (payload) => {
    if (input.esperado !== undefined && input.esperado !== assinaturaGarantiasServicosV3(payload)) throw new Error("A garantia ou a entrega mudou. Reabra o editor e revise antes de salvar.");
    const anteriores = lerCoberturasGarantiaV3(payload);
    if (anteriores.length > 1 && !input.linhaId) throw new Error("Selecione o serviço cuja garantia será alterada.");
    const linhaId = input.linhaId || anteriores[0]?.linhaId || "legado-os";
    const anterior = anteriores.find((c) => c.linhaId === linhaId);
    if (input.linhaId && !anterior) throw new Error("Serviço não aprovado ou não encontrado nesta OS.");
    const gp = (payload.aberturaV3 as { garantiaPrevista?: { modelo?: string; prazoDias?: number; termo?: string } } | undefined)?.garantiaPrevista;
    const antes: CoberturaServicoV3 | undefined = anterior ?? (gp?.modelo ? { linhaId, descricao: "Serviço registrado na OS", modeloId: gp.modelo, prazoDias: gp.prazoDias ?? garantiaCatalogoV3(gp.modelo).prazoDiasPadrao, ...(gp.termo ? { termoCustom: gp.termo } : {}), origem: "legado" as const } : undefined);
    const termoCustom = input.termoCustom === undefined ? antes?.termoCustom : input.termoCustom.trim();
    const depois: CoberturaServicoV3 = { linhaId, descricao: antes?.descricao || "Serviço registrado na OS", modeloId: modelo.id, prazoDias, ...(termoCustom ? { termoCustom } : {}), ...(antes && "inicioOriginal" in antes && antes.inicioOriginal ? { inicioOriginal: antes.inicioOriginal } : {}), ...(antes && "vencimentoOriginal" in antes && antes.vencimentoOriginal && antes.prazoDias === prazoDias ? { vencimentoOriginal: antes.vencimentoOriginal } : {}), origem: "edicao" };
    const emitidas = lerVersoesTermoGarantiaV3(payload);
    const mudou = antes ? (antes.modeloId !== depois.modeloId || antes.prazoDias !== depois.prazoDias || (antes.termoCustom ?? "") !== (depois.termoCustom ?? "")) : emitidas.length > 0;
    const foraPadrao = !antes && (prazoDias !== modelo.prazoDiasPadrao || !!termoCustom);
    if (lerEntregaV3(payload).entregue && !emitidas.length) throw new Error("Documento legado sem snapshot. Faça uma reemissão autorizada antes de criar aditivos.");
    if (mudou || foraPadrao) {
      const guard = await requireEnterpriseWith(sid, (p) => p.operacoes.garantia, "Sem permissão para alterar o padrão da garantia.");
      if (!guard.ok) throw new Error(guard.error);
      if (!input.motivo?.trim()) throw new Error("Informe o motivo obrigatório da alteração da garantia.");
      if (emitidas.length && !input.esperado) throw new Error("Reabra o editor para revisar a versão emitida antes do aditivo.");
    }
    const agora = nowIso();
    let next = gravarCoberturasGarantiaV3(payload, anteriores.length ? anteriores.map((c) => c.linhaId === linhaId ? depois : c) : [depois]);
    if (emitidas.length && mudou) next = adicionarVersaoTermoGarantiaV3(next, { tipo: "aditivo", agora, operadorId: session!.user!.id!, operador: operadorLabel(session), motivo: input.motivo!.trim(), origem: input.origem === "v4" ? "v4" : "v3" });
    const evento = makeEvento("garantia_gerada", operadorLabel(session), (emitidas.length && mudou ? "Aditivo de garantia" : mudou ? "Garantia alterada" : "Garantia confirmada") + ': "' + modelo.titulo + '" (' + prazoDias + ' dias).', {
      modelo: modelo.id, prazoDias, alterada: mudou, linhaId, antes: antes ?? null, depois, operadorId: session!.user!.id!, instante: agora, origem: input.origem === "v4" ? "v4" : "v3", motivo: input.motivo?.trim() || null, versao: lerVersoesTermoGarantiaV3(next).at(-1)?.versao ?? null,
    });
    next = { ...next, timeline: appendTimeline(next, evento), atualizadoEm: agora };
    return { next, extra: mudou };
  });
  emitirEventoOperacaoV3({ tipo: "os_garantia_criada", os: salva, storeId: sid, origem: "garantia", metadata: { modelo: modelo.id, prazoDias, alterada } });
  return salva;
}

/** Reemissão explícita; preserva o legado e nunca fabrica uma emissão original. */
export async function reemitirTermoGarantiaLegadoV3(storeId: string, osId: string, input: { motivo: string; esperado: string }): Promise<OrdemServico> {
  const { sid, id, session } = await autorizar(storeId, osId);
  const guard = await requireEnterpriseWith(sid, (p) => p.operacoes.garantia, "Sem permissão para reemitir o termo de garantia.");
  if (!guard.ok) throw new Error(guard.error);
  if (!input.motivo?.trim()) throw new Error("Informe o motivo obrigatório da reemissão.");
  return (await mutar(sid, id, async (payload, tx) => {
    if (lerVersoesTermoGarantiaV3(payload).length) throw new Error("Já existe versão emitida. Reabra o documento.");
    if (!lerEntregaV3(payload).entregue) throw new Error("Confirme a entrega antes de emitir o termo.");
    if (input.esperado !== assinaturaGarantiasServicosV3(payload)) throw new Error("A garantia mudou. Reabra a reemissão.");
    const agora = nowIso();
    let fonte = payload;
    const gp = (payload.aberturaV3 as { garantiaPrevista?: unknown } | undefined)?.garantiaPrevista;
    if (!lerCoberturasGarantiaV3(payload).length && !gp && !payload.garantia) {
      await tx.$queryRaw`SELECT "id" FROM "garantia_ordem_servico" WHERE "storeId" = ${sid} AND "ordemServicoId" = ${id} FOR UPDATE`;
      const linhas = await tx.garantiaOrdemServico.findMany({ where: { storeId: sid, ordemServicoId: id, status: "ativa" }, orderBy: { dataInicio: "desc" }, select: { id: true, prazoDias: true, cobertura: true, dataInicio: true, dataFim: true } });
      fonte = { ...payload, garantiasOperacionais: linhas.map((l) => ({ ...l, dataInicio: l.dataInicio.toISOString(), dataFim: l.dataFim.toISOString() })) } as OSPayloadFull;
    }
    const next = adicionarVersaoTermoGarantiaV3(fonte, { tipo: "reemissao_legado", agora, operadorId: session!.user!.id!, operador: operadorLabel(session), motivo: input.motivo.trim(), origem: "reemissao_legado", empresa: await lerEmpresaTermoGarantiaV3(tx, sid) });
    if (!Object.prototype.hasOwnProperty.call(payload, "garantiasOperacionais")) delete next.garantiasOperacionais;
    else next.garantiasOperacionais = payload.garantiasOperacionais;
    return { next: { ...next, timeline: appendTimeline(next, makeEvento("garantia_gerada", operadorLabel(session), "Termo legado reemitido; original indisponível.", { evento: "termo_garantia_reemissao", motivo: input.motivo.trim(), operadorId: session!.user!.id!, versao: 1 })), atualizadoEm: agora }, extra: null };
  })).os;
}

/** Registra na timeline que um documento foi impresso (auditoria). Best-effort. */
export async function registrarImpressaoDocumentoV3(
  storeId: string,
  osId: string,
  tipo: DocumentoTipoV3,
  versao?: number,
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
  const { os } = await mutar(sid, id, (payload) => {
    const versoes = lerVersoesTermoGarantiaV3(payload);
    const emitida = versao === undefined ? versoes.at(-1) : versoes.find((v) => v.versao === versao);
    if (tipo === "termo_garantia" && !emitida) throw new Error("Termo sem versão emitida. Confirme a entrega ou solicite reemissão do legado.");
    return { next: { ...payload, timeline: appendTimeline(payload, { ...evento, metadata: { ...evento.metadata, ...(tipo === "termo_garantia" ? { versao: emitida!.versao } : {}) } }) } as OSPayloadFull, extra: null };
  });
  return os;
}
