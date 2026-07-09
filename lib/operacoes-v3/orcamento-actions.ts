"use server";

// ============================================================================
// Operações V3 — Fase 1C · write-path de ORÇAMENTO (side-effect-free)
// ----------------------------------------------------------------------------
// Grava SOMENTE estrutura de orçamento + status do orçamento + status da OS
// (via máquina única) + timeline + histórico de versões. NÃO toca Financeiro
// (Conta a Receber), estoque, garantia, WhatsApp. Não usa `approveOrcamento`/
// `rejectOrcamento` do V2 (que materializam/cancelam cobrança).
//
//   • gerarOrcamentoDaOS  — REUSO do @/api/os (materializa rascunho; seguro).
//   • salvarOrcamentoV3   — edita itens/desconto/brindes + histórico de versão.
//   • enviarOrcamentoV3   — rascunho/enviado → enviado (+ OS → aguardando_aprovacao).
//   • aprovarOrcamentoV3  — → aprovado (+ OS → aprovado pela máquina). Sem financeiro.
//   • recusarOrcamentoV3  — → recusado (+ timeline). Sem outros efeitos.
//   • registrarEnvioOrcamento — auditoria best-effort do canal de envio (mesmo
//     molde de `registrarImpressaoDocumentoV3`); NÃO muda status do orçamento.
// ============================================================================

import { revalidatePath } from "next/cache";
import type { Session } from "next-auth";
import type { Prisma } from "@/generated/prisma";
import type { EventoTimeline, EventoTipo, OrdemServico } from "@/types/os";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireEnterpriseWith } from "@/lib/auth/guard-enterprise";
import { assertActiveStoreId } from "@/lib/operacoes/assert-active-store";
import { operacaoStatusToPrismaStatus } from "@/components/operacoes/lovable/utils/os-status";
import {
  projetarStatusV2,
  statusOSAposAprovarOrcamento,
  statusOSAposEnviarOrcamento,
  statusV3FromOS,
  type OperacaoStatusV3,
} from "./status-machine";
// Caminho completo (em vez do alias `@/api/os`) para resolver também sob o
// `vitest.config.ts` (só mapeia `@` → raiz, sem os aliases finos do
// tsconfig) — mesmo arquivo físico; permite mockar este módulo em teste
// (mesmo ajuste já aplicado a `cliente-resolver.ts`, GOAL 022).
import { gerarOrcamentoDaOS as gerarOrcamentoDaOSImpl } from "@/components/operacoes/lovable/api/os";
import {
  computeTotaisV3,
  garantiaResultanteAprovacaoV3,
  montarEventoEnvioOrcamentoV3,
  montarEventoRecusaOrcamentoV3,
  recalcOrcamentoV3,
  validarGruposOrcamentoV3,
  validarSelecaoCompletaV3,
  VALIDADE_PADRAO_DIAS,
  type CanalEnvioOrcamentoV3,
  type OrcamentoV3,
  type OrcamentoVersaoV3,
  type RecusarOrcamentoV3Input,
  type SalvarOrcamentoV3Input,
} from "./orcamento-model";
import { emitirEventoOperacaoV3 } from "./event-publisher";
import { salvarGarantiaOSV3 } from "./garantia-actions";

/** Materializa o rascunho a partir dos itens da OS (reuso seguro do @/api/os). */
export async function gerarOrcamentoDaOS(storeId: string, osId: string): Promise<OrdemServico> {
  return gerarOrcamentoDaOSImpl(storeId, osId);
}

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

type OSPayloadFull = OrdemServico & Record<string, unknown>;

async function carregar(storeId: string, osId: string): Promise<{ sid: string; id: string; session: Session | null; payload: OSPayloadFull }> {
  const sid = (storeId ?? "").trim();
  const id = (osId ?? "").trim();
  assertActiveStoreId(sid, "Operações V3");
  if (!id) throw new Error("OS não informada.");

  const session = await auth();
  if (!session?.user?.id) throw new Error("Faça login para editar o orçamento.");
  const guard = await requireEnterpriseWith(sid, (p) => p.operacoes.editarOs, "Sem permissão para editar o orçamento desta OS.");
  if (!guard.ok) throw new Error(guard.error);

  const row = await prisma.ordemServico.findFirst({ where: { id, storeId: sid }, select: { id: true, payload: true } });
  if (!row) throw new Error("OS não encontrada.");
  const payload = row.payload as unknown as OSPayloadFull | null;
  if (!payload || typeof payload !== "object") throw new Error("OS sem payload compatível.");
  return { sid, id, session, payload };
}

function orcamentoEditavel(payload: OSPayloadFull): OrcamentoV3 {
  const orc = payload.orcamento as (OrcamentoV3 & { sintetizado?: boolean }) | undefined;
  if (!orc || typeof orc !== "object") throw new Error("Esta OS ainda não tem orçamento. Gere o orçamento da OS primeiro.");
  if (orc.sintetizado === true) throw new Error("O orçamento ainda é uma prévia. Gere o orçamento da OS para materializá-lo.");
  return orc;
}

function assertStatus(orc: OrcamentoV3, permitidos: OrcamentoV3["status"][], acao: string): void {
  if (!permitidos.includes(orc.status)) {
    throw new Error(`Não é possível ${acao} um orçamento com status "${orc.status}".`);
  }
}

async function gravar(
  sid: string,
  id: string,
  payload: OSPayloadFull,
  next: { orcamento: OrcamentoV3; eventos: EventoTimeline[]; statusOS?: OperacaoStatusV3 | null; versoes?: OrcamentoVersaoV3[] },
): Promise<OrdemServico> {
  const timeline = Array.isArray(payload.timeline) ? (payload.timeline as EventoTimeline[]) : [];
  const nextPayload: OSPayloadFull = {
    ...payload,
    orcamento: next.orcamento,
    timeline: [...timeline, ...next.eventos],
    atualizadoEm: nowIso(),
  };
  if (next.versoes) nextPayload.orcamentoVersoesV3 = next.versoes;

  const data: Prisma.OrdemServicoUpdateInput = { payload: nextPayload as unknown as Prisma.InputJsonValue };
  if (next.statusOS) {
    const statusV2 = projetarStatusV2(next.statusOS);
    nextPayload.status = statusV2;
    nextPayload.operacaoStatus = statusV2;
    nextPayload.operacaoStatusV3 = next.statusOS;
    data.payload = nextPayload as unknown as Prisma.InputJsonValue;
    data.status = operacaoStatusToPrismaStatus(statusV2);
  }
  // total da OS reflete o total ao cliente do orçamento.
  const totalCliente = computeTotaisV3(next.orcamento).total;
  if (Number.isFinite(totalCliente)) data.valorTotal = totalCliente;

  await prisma.ordemServico.update({ where: { id }, data });
  revalidatePath("/dashboard/operacoes-v3");
  return nextPayload as unknown as OrdemServico;
}

// ----------------------------------------------------------------------------
// Edição de itens / desconto / brindes (+ histórico de versão)
// ----------------------------------------------------------------------------

export async function salvarOrcamentoV3(storeId: string, osId: string, input: SalvarOrcamentoV3Input): Promise<OrdemServico> {
  const { sid, id, session, payload } = await carregar(storeId, osId);
  const atual = orcamentoEditavel(payload);
  assertStatus(atual, ["rascunho", "enviado"], "editar");

  const servicosInput = Array.isArray(input.servicos) ? input.servicos : [];
  const pecasInput = Array.isArray(input.pecas) ? input.pecas : [];
  // GOAL OPS-V4-ORC-RAPIDO-024: valida o limite de linhas por grupo de escolha
  // (MAX_LINHAS_POR_GRUPO_V3). Sem `grupoId` em nenhuma linha (caso de sempre
  // até aqui), `validarGruposOrcamentoV3` retorna [] — comportamento inalterado.
  const errosGrupos = validarGruposOrcamentoV3({ pecas: pecasInput, servicos: servicosInput });
  if (errosGrupos.length > 0) throw new Error(errosGrupos[0]);

  const versoesAtuais = Array.isArray(payload.orcamentoVersoesV3) ? (payload.orcamentoVersoesV3 as OrcamentoVersaoV3[]) : [];
  const versao: OrcamentoVersaoV3 = {
    versao: versoesAtuais.length + 1,
    status: atual.status,
    total: atual.total,
    desconto: atual.desconto ?? 0,
    registradoEm: nowIso(),
    registradoPor: operadorLabel(session),
    snapshot: atual,
  };

  const editado = recalcOrcamentoV3({
    ...atual,
    servicos: servicosInput,
    pecas: pecasInput,
    desconto: Math.max(0, Number(input.desconto) || 0),
    observacao: input.observacao ?? atual.observacao,
    // GOAL 026: contrato oficial de grupos — ausente preserva os grupos já
    // existentes (chamadores que não editam grupos, ex. editor de itens V4).
    gruposV3: input.gruposV3 ?? atual.gruposV3,
    atualizadoEm: nowIso(),
  });

  return gravar(sid, id, payload, {
    orcamento: editado,
    eventos: [makeEvento("orcamento_atualizado", operadorLabel(session), "Orçamento atualizado.", { versao: versao.versao })],
    versoes: [...versoesAtuais, versao],
  });
}

// ----------------------------------------------------------------------------
// Correção de orçamento em OS avançada (GOAL OPS-V4-ORCAMENTO-REABRIR-MOTOR-003)
// ----------------------------------------------------------------------------
// Caminho SEPARADO e explícito para corrigir um orçamento materializado cujo
// valor ficou vazio/perdido numa OS já avançada (aprovada/em execução/pronta/
// recebida/entregue). Diferente de `salvarOrcamentoV3` (que só aceita
// rascunho/enviado), esta action aceita OS avançada: reescreve itens/desconto/
// observação/grupos, recalcula o total e o `valorTotal` da OS, e NÃO muda o
// status da OS (preserva "entregue"/"pronta"/... — não regressa a orçamento).
// Não cria Conta a Receber, não cria venda, não mexe em estoque/caixa — só
// persiste o orçamento + timeline. Com `valorTotal > 0`, os readers financeiros
// (`totalCobravelV3`/`lerPagamentoV3`) passam a ver cobrança pendente e a OS
// fica elegível para recebimento pelos filtros existentes (total > 0).
//
// Status do orçamento é PRESERVADO (ex.: continua "aprovado") — a decisão
// comercial anterior continua de pé; só os itens/valores perdidos são repostos.
// Evento de timeline `orcamento_aprovado_revisado` (tipo já existente em
// `@/types/os`, não toca o union protegido) registra total anterior/novo e a
// origem `operacoes_v4_orcamento_reaberto` para auditoria.
/** Status da OS que admitem correção avançada do orçamento (pós-aprovação). */
const STATUS_CORRECAO_AVANCADA_V3: ReadonlySet<OperacaoStatusV3> = new Set([
  "aprovado",
  "aguardando_peca",
  "em_execucao",
  "pronta",
  "recebida",
  "entregue",
]);

export async function corrigirOrcamentoV3(storeId: string, osId: string, input: SalvarOrcamentoV3Input): Promise<OrdemServico> {
  const { sid, id, session, payload } = await carregar(storeId, osId);
  const atual = orcamentoEditavel(payload);

  const statusOS = statusV3FromOS(payload);
  if (!STATUS_CORRECAO_AVANCADA_V3.has(statusOS)) {
    throw new Error(
      statusOS === "cancelada"
        ? "Não é possível corrigir o orçamento de uma OS cancelada."
        : "Correção de orçamento avançada só vale para OS já aprovada/em execução/pronta/recebida/entregue.",
    );
  }

  const servicosInput = Array.isArray(input.servicos) ? input.servicos : [];
  const pecasInput = Array.isArray(input.pecas) ? input.pecas : [];
  const errosGrupos = validarGruposOrcamentoV3({ pecas: pecasInput, servicos: servicosInput });
  if (errosGrupos.length > 0) throw new Error(errosGrupos[0]);

  const totalAnterior = computeTotaisV3(atual).total;

  // Preserva o status do orçamento (ex.: "aprovado") — a correção só reescreve
  // itens/desconto/observação/grupos; a decisão comercial anterior continua de pé.
  const corrigido = recalcOrcamentoV3({
    ...atual,
    servicos: servicosInput,
    pecas: pecasInput,
    desconto: Math.max(0, Number(input.desconto) || 0),
    observacao: input.observacao ?? atual.observacao,
    gruposV3: input.gruposV3 ?? atual.gruposV3,
    atualizadoEm: nowIso(),
  });

  const totalNovo = computeTotaisV3(corrigido).total;

  return gravar(sid, id, payload, {
    orcamento: corrigido,
    // Sem `statusOS`: o status da OS (entregue/pronta/...) é preservado.
    eventos: [
      makeEvento(
        "orcamento_aprovado_revisado",
        operadorLabel(session),
        `Orçamento corrigido manualmente. Total anterior R$ ${totalAnterior.toFixed(2).replace(".", ",")} → novo R$ ${totalNovo.toFixed(2).replace(".", ",")}.`,
        { origem: "operacoes_v4_orcamento_reaberto", totalAnterior, totalNovo, correcaoAvancada: true },
      ),
    ],
  });
}

// ----------------------------------------------------------------------------
// Enviar / Aprovar / Recusar
// ----------------------------------------------------------------------------

export async function enviarOrcamentoV3(storeId: string, osId: string): Promise<OrdemServico> {
  const { sid, id, session, payload } = await carregar(storeId, osId);
  const atual = orcamentoEditavel(payload);
  assertStatus(atual, ["rascunho", "enviado"], "enviar");

  const enviado = recalcOrcamentoV3({
    ...atual,
    status: "enviado",
    enviadoEm: atual.enviadoEm ?? nowIso(),
    validoAte: new Date(Date.now() + VALIDADE_PADRAO_DIAS * 86400000).toISOString(),
    atualizadoEm: nowIso(),
  });
  const reenvio = atual.status === "enviado";
  const os = await gravar(sid, id, payload, {
    orcamento: enviado,
    statusOS: statusOSAposEnviarOrcamento(payload.status),
    eventos: [makeEvento("orcamento_enviado", operadorLabel(session), reenvio ? "Orçamento reenviado ao cliente." : "Orçamento enviado ao cliente.")],
  });

  // Espinha de eventos (3C.0): orçamento materializado e enviado ao cliente.
  emitirEventoOperacaoV3({
    tipo: "os_orcamento_criado",
    os,
    storeId: sid,
    origem: "orcamento",
    metadata: { reenvio, total: computeTotaisV3(enviado).total, validoAte: enviado.validoAte },
  });
  return os;
}

/**
 * Aprova o orçamento. GOAL OPS-V4-ORC-APROVACAO-SELECAO-026: quando o
 * orçamento tem grupos de escolha, EXIGE que toda linha `selecionadaV3`
 * já tenha sido gravada (via `salvarOrcamentoV3` com `gruposV3` — a seleção
 * acontece ANTES de aprovar, num passo separado) — se faltar seleção em
 * qualquer grupo, lança erro e NÃO aprova. Sem grupos, comportamento
 * idêntico ao anterior (N=0). Ao aprovar: congela um snapshot na mesma
 * lista de versões que `salvarOrcamentoV3` já usa (`orcamentoVersoesV3`) e,
 * melhor esforço, aplica a garantia da variante escolhida (a MENOR entre as
 * selecionadas que informam `garantiaDias` — nenhuma falha aqui desfaz a
 * aprovação, que já foi gravada).
 */
export async function aprovarOrcamentoV3(storeId: string, osId: string): Promise<OrdemServico> {
  const { sid, id, session, payload } = await carregar(storeId, osId);
  const atual = orcamentoEditavel(payload);
  assertStatus(atual, ["rascunho", "enviado"], "aprovar");

  const erroSelecao = validarSelecaoCompletaV3(atual);
  if (erroSelecao) throw new Error(erroSelecao);

  const aprovado = recalcOrcamentoV3({
    ...atual,
    status: "aprovado",
    respondidoEm: nowIso(),
    atualizadoEm: nowIso(),
  });

  const versoesAtuais = Array.isArray(payload.orcamentoVersoesV3) ? (payload.orcamentoVersoesV3 as OrcamentoVersaoV3[]) : [];
  const versaoAprovacao: OrcamentoVersaoV3 = {
    versao: versoesAtuais.length + 1,
    status: "aprovado",
    total: aprovado.total,
    desconto: aprovado.desconto ?? 0,
    registradoEm: nowIso(),
    registradoPor: operadorLabel(session),
    // Snapshot congelado: itens (com a seleção já marcada) + total resolvido.
    snapshot: aprovado,
  };

  const os = await gravar(sid, id, payload, {
    orcamento: aprovado,
    statusOS: statusOSAposAprovarOrcamento(payload.status),
    eventos: [makeEvento("orcamento_aprovado", operadorLabel(session), "Orçamento aprovado.")],
    versoes: [...versoesAtuais, versaoAprovacao],
  });

  // Garantia da variante escolhida — melhor esforço (best-effort): se falhar,
  // a aprovação já gravada NÃO é desfeita (efeito auxiliar, não o núcleo da
  // decisão comercial). Nenhuma sobrescrita quando nenhuma variante informa garantia.
  const garantia = garantiaResultanteAprovacaoV3(aprovado);
  if (garantia) {
    await salvarGarantiaOSV3(sid, id, {
      modeloId: "personalizado",
      prazoDias: garantia.prazoDias,
      termoCustom: garantia.rotulo ? `Garantia da opção aprovada: ${garantia.rotulo}.` : undefined,
    }).catch((err) => console.error("[orcamento] aplicar garantia da variante falhou", err));
  }

  // Espinha de eventos (3C.0): aprovação do orçamento.
  emitirEventoOperacaoV3({
    tipo: "os_orcamento_aprovado",
    os,
    storeId: sid,
    origem: "orcamento",
    metadata: { total: computeTotaisV3(aprovado).total },
  });
  return os;
}

/**
 * Recusa o orçamento. Aceita a entrada estruturada `{motivo, observacao?}`
 * (GOAL OPS-V4-ORC-APROVACAO-SELECAO-026) OU uma string livre legada —
 * chamadores antigos (ex. `use-orcamento-v3.ts`, hub V3) continuam
 * funcionando sem mudança. Transição de status preservada (nenhuma nova).
 */
export async function recusarOrcamentoV3(
  storeId: string,
  osId: string,
  motivo?: string | RecusarOrcamentoV3Input,
): Promise<OrdemServico> {
  const { sid, id, session, payload } = await carregar(storeId, osId);
  const atual = orcamentoEditavel(payload);
  assertStatus(atual, ["rascunho", "enviado"], "recusar");

  const recusado = recalcOrcamentoV3({
    ...atual,
    status: "recusado",
    respondidoEm: nowIso(),
    atualizadoEm: nowIso(),
  });
  const evt = montarEventoRecusaOrcamentoV3(motivo);
  return gravar(sid, id, payload, {
    orcamento: recusado,
    eventos: [makeEvento("orcamento_recusado", operadorLabel(session), evt.conteudo, Object.keys(evt.metadata).length ? evt.metadata : undefined)],
  });
}

// ----------------------------------------------------------------------------
// Registro de envio por canal (auditoria — não muda status do orçamento)
// ----------------------------------------------------------------------------

/**
 * Registra na timeline que o orçamento foi enviado ao cliente por um canal
 * específico (WhatsApp/impresso/presencial/outro). Best-effort, mesmo molde de
 * `registrarImpressaoDocumentoV3` (garantia-actions.ts): só grava evento +
 * timeline, NÃO altera `orcamento.status`/`validoAte` — complementa
 * `enviarOrcamentoV3` (que já muda status) para os casos em que o canal
 * precisa ficar auditado (reenvio por outro canal, envio manual/presencial).
 */
export async function registrarEnvioOrcamento(
  storeId: string,
  osId: string,
  canal: CanalEnvioOrcamentoV3,
): Promise<OrdemServico> {
  const { id, session, payload } = await carregar(storeId, osId);
  const atual = orcamentoEditavel(payload);
  const totalSnapshot = computeTotaisV3(atual).total;
  const evt = montarEventoEnvioOrcamentoV3(canal, totalSnapshot);
  const evento = makeEvento(evt.tipo, operadorLabel(session), evt.conteudo, evt.metadata);

  const timeline = Array.isArray(payload.timeline) ? (payload.timeline as EventoTimeline[]) : [];
  const nextPayload: OSPayloadFull = { ...payload, timeline: [...timeline, evento] };
  const data: Prisma.OrdemServicoUpdateInput = { payload: nextPayload as unknown as Prisma.InputJsonValue };
  await prisma.ordemServico.update({ where: { id }, data });
  revalidatePath("/dashboard/operacoes-v3");
  return nextPayload as unknown as OrdemServico;
}
