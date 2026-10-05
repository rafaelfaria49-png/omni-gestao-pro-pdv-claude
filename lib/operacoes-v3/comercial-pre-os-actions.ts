"use server";

// ============================================================================
// Operações V3 — carimbo comercial pré-OS (GOAL OPS-V4-NOVO-ATENDIMENTO-COMERCIAL-001).
// Payload-only. Sem schema, sem Financeiro, sem estoque. Reusa o mesmo
// write-path de dados-basicos-actions (Prisma direto, sem updateOSPayload).
// ============================================================================

import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma";
import type { EventoTimeline, OrdemServico } from "@/types/os";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireEnterpriseWith } from "@/lib/auth/guard-enterprise";
import { assertActiveStoreId } from "@/lib/operacoes/assert-active-store";
import type { ComercialV4, StatusComercialOrcamentoV4 } from "@/lib/operacoes-v4/orcamento-pre-os";
import { lerComercialV4 } from "@/lib/operacoes-v4/orcamento-pre-os";
import { recebimentoLoteAdvisoryLock } from "@/lib/financeiro/services/recebimento-lote-service";
import { chaveLockRecebimentoMistoV3, travarOS } from "./recebimento-misto-service";
import { validadeExpiradaV3 } from "./orcamento-model";
import {
  erroFatoFuturoV3,
  erroOrdemV3,
  formatarDiaDeIsoNaLojaV3,
  lerDatasOSV3,
  limitarFatoAoAgoraV3,
  validarEntradaDataV3,
  prazoSlaDaPrevisaoV3,
  ROTULO_DATA_ENTRADA_V3,
  ROTULO_PREVISAO_ENTREGA_V3,
  type DataOperacionalMetaV3,
} from "./datas-operacionais-model";

type OSPayloadFull = OrdemServico & Record<string, unknown>;

function nowIso(): string {
  return new Date().toISOString();
}
function eventId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `ev_${Date.now()}`;
}
function operadorLabel(): string {
  return "Operador";
}

async function carregar(storeId: string, osId: string): Promise<{ id: string; payload: OSPayloadFull; autor: string }> {
  const sid = (storeId ?? "").trim();
  const id = (osId ?? "").trim();
  assertActiveStoreId(sid, "Operações V3");
  if (!id) throw new Error("OS não informada.");
  const session = await auth();
  if (!session?.user?.id) throw new Error("Faça login para editar o orçamento.");
  const guard = await requireEnterpriseWith(sid, (p) => p.operacoes.editarOs, "Sem permissão para editar esta OS.");
  if (!guard.ok) throw new Error(guard.error);
  const row = await prisma.ordemServico.findFirst({ where: { id, storeId: sid }, select: { id: true, payload: true } });
  if (!row) throw new Error("OS não encontrada.");
  const payload = row.payload as unknown as OSPayloadFull | null;
  if (!payload || typeof payload !== "object") throw new Error("OS sem payload compatível.");
  const autor = (session.user.name || session.user.email || operadorLabel()).trim() || operadorLabel();
  return { id, payload, autor };
}

/**
 * Grava sob a MESMA trava por OS da conversão e dos writers de pagamento
 * (advisory lock + FOR UPDATE + releitura): o patch é calculado sobre o estado
 * ATUAL — um carimbo/status atrasado nunca desfaz uma conversão já gravada.
 * `aplicar` devolve `null` quando não há o que gravar (ex.: já convertido).
 */
async function gravarComTrava(storeId: string, id: string, aplicar: (payload: OSPayloadFull) => OSPayloadFull | null): Promise<OrdemServico> {
  const sid = (storeId ?? "").trim();
  const salvo = await prisma.$transaction(
    async (tx) => {
      await recebimentoLoteAdvisoryLock(tx, chaveLockRecebimentoMistoV3(sid, id));
      if (!(await travarOS(tx, sid, id))) throw new Error("OS não encontrada.");
      const row = await tx.ordemServico.findFirst({ where: { id, storeId: sid }, select: { payload: true } });
      const payload = row?.payload as unknown as OSPayloadFull | null;
      if (!payload || typeof payload !== "object") throw new Error("OS sem payload compatível.");
      const next = aplicar(payload);
      if (!next) return payload;
      await tx.ordemServico.update({ where: { id }, data: { payload: next as unknown as Prisma.InputJsonValue } });
      return next;
    },
    { maxWait: 5_000, timeout: 15_000 },
  );
  revalidatePath("/dashboard/operacoes-v3");
  revalidatePath("/dashboard/operacoes-v4-preview");
  return salvo as unknown as OrdemServico;
}

/** Status que as actions de carimbo/status aceitam. "convertido" é exclusivo da conversão. */
const STATUS_COMERCIAL_GRAVAVEIS_V3: readonly StatusComercialOrcamentoV4[] = ["rascunho", "enviado", "aprovado", "recusado", "vencido"];

/**
 * Guarda do servidor para um status comercial pedido por carimbo/status: só
 * valores conhecidos; "convertido" só pela conversão (que exige a entrada real e
 * registra o evento); "aprovado" nunca para proposta vencida (mesma regra da
 * aprovação do orçamento — renovar a validade é pela correção auditada).
 */
function exigirStatusComercialGravavelV3(statusComercial: unknown, payload: OSPayloadFull): void {
  if (statusComercial === "convertido") {
    throw new Error('A conversão em OS é feita só por "Converter em OS" (pede a entrada real do aparelho e registra o evento).');
  }
  if (!STATUS_COMERCIAL_GRAVAVEIS_V3.includes(statusComercial as StatusComercialOrcamentoV4)) {
    throw new Error("Status comercial inválido.");
  }
  const validoAte = (payload.orcamento as { validoAte?: string } | undefined)?.validoAte;
  if (statusComercial === "aprovado" && validadeExpiradaV3(validoAte)) {
    throw new Error(`Este orçamento venceu em ${formatarDiaDeIsoNaLojaV3(validoAte)}. Para aprovar, atualize o "Válido até" em "Corrigir datas".`);
  }
}

export interface MarcarPreOsInputV3 {
  origemAtendimento?: string;
  validadeDias?: number;
  prazoEstimado?: string;
  observacaoCliente?: string;
  observacaoInterna?: string;
  diagnosticoInicial?: ComercialV4["diagnosticoInicial"];
  aparelho?: { tipo?: string; imei?: string; cor?: string };
  statusComercial?: StatusComercialOrcamentoV4;
}

export async function marcarOrcamentoPreOsV3(storeId: string, osId: string, input: MarcarPreOsInputV3 = {}): Promise<OrdemServico> {
  const { id, autor } = await carregar(storeId, osId);
  return gravarComTrava(storeId, id, (payload) => {
    const atual = lerComercialV4(payload);
    if (atual?.statusComercial === "convertido") return null;
    if (input.statusComercial !== undefined) exigirStatusComercialGravavelV3(input.statusComercial, payload);

    const comercialV4: ComercialV4 = {
      // Preserva campos já gravados (ex.: data da proposta definida na criação).
      ...(atual ?? {}),
      tipo: "orcamento_pre_os",
      statusComercial: input.statusComercial ?? atual?.statusComercial ?? "rascunho",
      origemAtendimento: input.origemAtendimento ?? atual?.origemAtendimento,
      validadeDias: input.validadeDias ?? atual?.validadeDias,
      prazoEstimado: input.prazoEstimado ?? atual?.prazoEstimado,
      observacaoCliente: input.observacaoCliente ?? atual?.observacaoCliente,
      observacaoInterna: input.observacaoInterna ?? atual?.observacaoInterna,
      diagnosticoInicial: input.diagnosticoInicial ?? atual?.diagnosticoInicial,
      opcaoAprovadaId: atual?.opcaoAprovadaId,
      opcaoAprovadaRotulo: atual?.opcaoAprovadaRotulo,
      convertidoEm: atual?.convertidoEm,
      convertidoPor: atual?.convertidoPor,
    };

    const equipamentoAtual = payload.equipamento && typeof payload.equipamento === "object"
      ? (payload.equipamento as unknown as Record<string, unknown>)
      : {};
    const equipamento = {
      ...equipamentoAtual,
      ...(input.aparelho?.tipo ? { tipo: input.aparelho.tipo } : {}),
      ...(input.aparelho?.imei ? { numeroSerie: input.aparelho.imei } : {}),
      ...(input.aparelho?.cor ? { cor: input.aparelho.cor } : {}),
    };

    const evento: EventoTimeline = {
      id: eventId(),
      tipo: "observacao",
      autor,
      autorTipo: "usuario",
      conteudo: "Orçamento comercial classificado como pré-OS.",
      metadata: { evento: "orcamento_pre_os" },
      criadoEm: nowIso(),
    };
    const timeline: EventoTimeline[] = Array.isArray(payload.timeline) ? (payload.timeline as EventoTimeline[]) : [];

    return { ...payload, comercialV4, equipamento, timeline: [...timeline, evento], atualizadoEm: nowIso() } as unknown as OSPayloadFull;
  });
}

/** Campos que o status comercial pode carregar junto (nenhum deles é data). */
const CAMPOS_EXTRA_STATUS_COMERCIAL_V3 = ["opcaoAprovadaId", "opcaoAprovadaRotulo", "observacaoCliente", "observacaoInterna"] as const;
export type ExtraStatusComercialV3 = Partial<Pick<ComercialV4, (typeof CAMPOS_EXTRA_STATUS_COMERCIAL_V3)[number]>>;

export async function atualizarStatusComercialV3(
  storeId: string,
  osId: string,
  statusComercial: StatusComercialOrcamentoV4,
  extra: ExtraStatusComercialV3 = {},
): Promise<OrdemServico> {
  // Só campos não temporais: data da proposta, validade e conversão mudam apenas
  // pelos fluxos validados (criação, "Corrigir datas", conversão) — nunca por aqui.
  const extraPermitido: ExtraStatusComercialV3 = {};
  for (const k of CAMPOS_EXTRA_STATUS_COMERCIAL_V3) {
    const v = extra?.[k];
    if (typeof v === "string" && v.trim()) extraPermitido[k] = v.trim();
  }
  const { id, autor } = await carregar(storeId, osId);
  return gravarComTrava(storeId, id, (payload) => {
    const atual = lerComercialV4(payload);
    if (!atual || atual.tipo !== "orcamento_pre_os") {
      throw new Error("Este registro não é um orçamento pré-OS.");
    }
    if (atual.statusComercial === "convertido") return null;
    exigirStatusComercialGravavelV3(statusComercial, payload);

    const comercialV4: ComercialV4 = { ...atual, ...extraPermitido, tipo: "orcamento_pre_os", statusComercial };
    const evento: EventoTimeline = {
      id: eventId(),
      tipo: "observacao",
      autor,
      autorTipo: "usuario",
      conteudo: `Status comercial do orçamento: ${statusComercial}.`,
      metadata: { evento: "status_comercial", statusComercial },
      criadoEm: nowIso(),
    };
    const timeline: EventoTimeline[] = Array.isArray(payload.timeline) ? (payload.timeline as EventoTimeline[]) : [];
    return { ...payload, comercialV4, timeline: [...timeline, evento], atualizadoEm: nowIso() } as OSPayloadFull;
  });
}

export interface ConverterOrcamentoInputV3 {
  prioridade?: string;
  localFisico?: string;
  /** Previsão de entrega combinada (ISO). */
  previsaoEntrega?: string;
  previsaoEntregaMeta?: DataOperacionalMetaV3;
  recebidoPor?: string;
  /**
   * Entrada REAL do aparelho. Obrigatória quando o orçamento ainda não tem
   * entrada registrada; ignorada quando já tem (a entrada informada é preservada).
   * Nunca é presumida a partir da data da proposta.
   */
  dataEntrada?: { iso: string; meta: DataOperacionalMetaV3 };
}

/**
 * Promove o MESMO registro (sem duplicar OS). Idempotente: se já convertido, devolve.
 * Datas validadas antes da escrita; a escrita relê a OS sob a mesma trava por OS
 * dos writers de pagamento (o patch nunca parte de um snapshot antigo).
 */
export async function converterOrcamentoEmOSV3(
  storeId: string,
  osId: string,
  input: ConverterOrcamentoInputV3 = {},
): Promise<{ osId: string; jaConvertido: boolean }> {
  const { id, autor } = await carregar(storeId, osId);
  const sid = (storeId ?? "").trim();
  const agora = new Date();

  const resultado = await prisma.$transaction(async (tx) => {
    await recebimentoLoteAdvisoryLock(tx, chaveLockRecebimentoMistoV3(sid, id));
    if (!(await travarOS(tx, sid, id))) throw new Error("OS não encontrada.");
    const row = await tx.ordemServico.findFirst({ where: { id, storeId: sid }, select: { payload: true } });
    const payload = row?.payload as unknown as OSPayloadFull | null;
    if (!payload || typeof payload !== "object") throw new Error("OS sem payload compatível.");

    const atual = lerComercialV4(payload);
    if (atual?.statusComercial === "convertido") return { osId: id, jaConvertido: true };
    if (!atual || atual.tipo !== "orcamento_pre_os") {
      throw new Error("Só é possível converter um orçamento pré-OS.");
    }
    const orc = payload.orcamento && typeof payload.orcamento === "object"
      ? (payload.orcamento as { status?: string })
      : null;
    if (atual.statusComercial !== "aprovado" && orc?.status !== "aprovado") {
      throw new Error("Aprove o orçamento (e a opção escolhida) antes de converter em OS.");
    }

    // Entrada: a já registrada é preservada; sem ela, o operador informa a real.
    const registrada = lerDatasOSV3(payload).entrada;
    let entradaNova: { iso: string; meta: DataOperacionalMetaV3 | null } | null = null;
    let entradaFinal = registrada;
    if (!registrada) {
      if (!input.dataEntrada) throw new Error("Informe a data de entrada do aparelho para abrir a OS.");
      const v = validarEntradaDataV3(input.dataEntrada.iso, input.dataEntrada.meta, ROTULO_DATA_ENTRADA_V3);
      if (!v.ok) throw new Error(v.mensagem);
      const futura = erroFatoFuturoV3("dataEntrada", ROTULO_DATA_ENTRADA_V3, v.data, agora);
      if (futura) throw new Error(futura.mensagem);
      // Dentro da folga do relógio, a entrada é gravada no "agora" do servidor.
      entradaNova = limitarFatoAoAgoraV3({ iso: v.data.iso, meta: v.meta }, agora);
      entradaFinal = { ...v.data, iso: entradaNova.iso, dia: entradaNova.meta?.dia ?? v.data.dia };
    }
    let previsao: { iso: string; meta: DataOperacionalMetaV3 | null } | null = null;
    if (input.previsaoEntrega?.trim()) {
      const v = validarEntradaDataV3(input.previsaoEntrega, input.previsaoEntregaMeta, ROTULO_PREVISAO_ENTREGA_V3);
      if (!v.ok) throw new Error(v.mensagem);
      const ordem = erroOrdemV3("previsaoEntrega", "A previsão de entrega", v.data, "entrada do aparelho", entradaFinal);
      if (ordem) throw new Error(ordem.mensagem);
      previsao = { iso: v.data.iso, meta: v.meta };
    } else {
      // A previsão já gravada (que será preservada) também não pode ficar antes da entrada.
      const existente = lerDatasOSV3(payload).previsao;
      const ordem = existente ? erroOrdemV3("previsaoEntrega", "A previsão de entrega", existente, "entrada do aparelho", entradaFinal) : null;
      if (ordem) throw new Error(`${ordem.mensagem} Informe a nova previsão de entrega ao abrir a OS.`);
    }

    const aberturaAtual = payload.aberturaV3 && typeof payload.aberturaV3 === "object"
      ? (payload.aberturaV3 as Record<string, unknown>)
      : {};
    const recepcaoAtual = aberturaAtual.recepcao && typeof aberturaAtual.recepcao === "object"
      ? (aberturaAtual.recepcao as Record<string, unknown>)
      : {};
    const aberturaV3 = {
      ...aberturaAtual,
      recepcao: {
        ...recepcaoAtual,
        ...(input.prioridade ? { prioridade: input.prioridade } : {}),
        ...(input.localFisico ? { localFisico: input.localFisico } : {}),
        ...(entradaNova ? { dataEntrada: entradaNova.iso, ...(entradaNova.meta ? { dataEntradaMeta: entradaNova.meta } : {}) } : {}),
        ...(previsao ? { previsaoEntrega: previsao.iso, ...(previsao.meta ? { previsaoEntregaMeta: previsao.meta } : {}) } : {}),
        ...(input.recebidoPor ? { recebidoPor: input.recebidoPor } : {}),
      },
    };
    const slaAtual = payload.sla && typeof payload.sla === "object" ? (payload.sla as unknown as Record<string, unknown>) : null;
    const comercialV4: ComercialV4 = {
      ...atual,
      tipo: "orcamento_pre_os",
      statusComercial: "convertido",
      convertidoEm: agora.toISOString(),
      convertidoPor: autor,
    };
    const evento: EventoTimeline = {
      id: eventId(),
      tipo: "observacao",
      autor,
      autorTipo: "usuario",
      conteudo: "Orçamento convertido em Ordem de Serviço (mesmo registro).",
      metadata: {
        evento: "orcamento_convertido_os",
        ...(entradaNova ? { dataEntrada: entradaNova.iso } : {}),
      },
      criadoEm: agora.toISOString(),
    };
    const timeline: EventoTimeline[] = Array.isArray(payload.timeline) ? (payload.timeline as EventoTimeline[]) : [];
    const next = {
      ...payload,
      comercialV4,
      aberturaV3,
      ...(previsao ? { sla: { ...(slaAtual ?? {}), prazo: prazoSlaDaPrevisaoV3(previsao), origemV3: "informada" } } : {}),
      timeline: [...timeline, evento],
      atualizadoEm: agora.toISOString(),
    } as OSPayloadFull;
    await tx.ordemServico.update({ where: { id }, data: { payload: next as unknown as Prisma.InputJsonValue } });
    return { osId: id, jaConvertido: false };
  }, { maxWait: 5_000, timeout: 15_000 });

  revalidatePath("/dashboard/operacoes-v3");
  revalidatePath("/dashboard/operacoes-v4-preview");
  return resultado;
}
