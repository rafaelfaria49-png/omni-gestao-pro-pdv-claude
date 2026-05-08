// Camada async de Ordens de Serviço.
// Agora usa Prisma (via Server Actions) preservando a assinatura da UI.
import { nowIso, uid } from "./_helpers";
import type {
  Anexo,
  EventoTimeline,
  EventoTipo,
  ObservacaoTecnica,
  Orcamento,
  OrdemServico,
  OSStatus,
  PecaUsada,
  Tecnico,
} from "@/types/os";
import { reservarPeca } from "./estoque";
import { criarVendaDeOS } from "./vendas";
import { createOS, listOS, updateOSPayload, updateOSStatus } from "@/app/actions/operacoes";
import { buildFaturamentoFromOrcamento, buildFaturamentoRecusadoOrcamento } from "@/lib/os/faturamento";
import { snapshotGarantia } from "@/lib/os/garantia";
import { listTecnicos as listTecnicosCadastros } from "@/app/actions/cadastros";
import { normalizeOperacaoStatus } from "@/components/operacoes/lovable/utils/os-status";
import { normalizePecaUsada, normalizePecasUsadas } from "@/components/operacoes/lovable/utils/pecas-normalization";

let CURRENT_STORE_ID = "loja-1";

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function readTimeline(v: unknown): EventoTimeline[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => isRecord(x) && typeof x.id === "string" && typeof x.tipo === "string") as unknown as EventoTimeline[];
}

function readArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function isOrcamento(v: unknown): v is Orcamento {
  if (!isRecord(v)) return false;
  if (typeof v.id !== "string" || typeof v.status !== "string") return false;
  if (!Array.isArray(v.pecas) || !Array.isArray(v.servicos)) return false;
  const desconto = typeof v.desconto === "number" ? v.desconto : Number(v.desconto);
  const total = typeof v.total === "number" ? v.total : Number(v.total);
  const criadoEm = v.criadoEm;
  return typeof criadoEm === "string" && Number.isFinite(desconto) && Number.isFinite(total);
}

export function recalcularTotalOrcamento(o: Orcamento): Orcamento {
  const pecasSum = o.pecas.reduce(
    (s, p) => s + Math.max(0, p.quantidade * p.valorUnitario - (p.desconto ?? 0)),
    0,
  );
  const servSum = o.servicos.reduce((s, x) => s + Math.max(0, x.valor - (x.desconto ?? 0)), 0);
  const total = Math.max(0, pecasSum + servSum - o.desconto);
  return { ...o, total, atualizadoEm: nowIso() };
}

export type SalvarOrcamentoEvento =
  | { kind: "orcamento_atualizado" }
  | { kind: "orcamento_item_adicionado"; label: string }
  | { kind: "orcamento_item_removido"; label: string };

export async function criarOrcamentoRascunho(osId: string, autor: string): Promise<OrdemServico> {
  const rows = await listOS(CURRENT_STORE_ID);
  const current = rows.find((o) => o.id === osId);
  if (!current) throw new Error("OS não encontrada");

  const novo: Orcamento = {
    id: uid("orc"),
    status: "rascunho",
    pecas: [],
    servicos: [],
    desconto: 0,
    total: 0,
    criadoEm: nowIso(),
    atualizadoEm: nowIso(),
    observacao: "",
  };
  const timeline = [
    ...readTimeline((current as { timeline?: unknown }).timeline),
    newEvent("orcamento_criado", autor, "usuario", "Orçamento criado (rascunho)."),
  ];
  const patched = await updateOSPayload(CURRENT_STORE_ID, osId, {
    orcamento: novo,
    timeline,
  } as Partial<OrdemServico>);
  return patched as unknown as OrdemServico;
}

export async function salvarOrcamento(
  osId: string,
  orcamento: Orcamento,
  autor: string,
  evento: SalvarOrcamentoEvento,
): Promise<OrdemServico> {
  const rows = await listOS(CURRENT_STORE_ID);
  const current = rows.find((o) => o.id === osId);
  if (!current) throw new Error("OS não encontrada");

  const merged = recalcularTotalOrcamento({
    ...orcamento,
    pecas: normalizePecasUsadas(orcamento.pecas),
  });
  let tipo: EventoTipo = "orcamento_atualizado";
  let conteudo = "Orçamento atualizado.";
  if (evento.kind === "orcamento_item_adicionado") {
    tipo = "orcamento_item_adicionado";
    conteudo = `Item adicionado: ${evento.label}.`;
  } else if (evento.kind === "orcamento_item_removido") {
    tipo = "orcamento_item_removido";
    conteudo = `Item removido: ${evento.label}.`;
  }

  const timeline = [
    ...readTimeline((current as { timeline?: unknown }).timeline),
    newEvent(tipo, autor, "usuario", conteudo),
  ];
  const patched = await updateOSPayload(CURRENT_STORE_ID, osId, {
    orcamento: merged,
    timeline,
  } as Partial<OrdemServico>);
  return patched as unknown as OrdemServico;
}

export async function enviarOrcamentoAoCliente(osId: string, autor: string): Promise<OrdemServico> {
  const rows = await listOS(CURRENT_STORE_ID);
  const current = rows.find((o) => o.id === osId);
  if (!current) throw new Error("OS não encontrada");
  const curOrc = (current as { orcamento?: unknown }).orcamento;
  if (!isOrcamento(curOrc)) throw new Error("Orçamento inexistente");

  const orcamento: Orcamento = recalcularTotalOrcamento({
    ...curOrc,
    status: "enviado",
    enviadoEm: curOrc.enviadoEm ?? nowIso(),
  });
  const timeline = [
    ...readTimeline((current as { timeline?: unknown }).timeline),
    newEvent("orcamento_enviado", autor, "usuario", "Orçamento enviado ao cliente."),
  ];
  const patched = await updateOSPayload(CURRENT_STORE_ID, osId, {
    orcamento,
    timeline,
  } as Partial<OrdemServico>);
  return patched as unknown as OrdemServico;
}

const newEvent = (
  tipo: EventoTipo,
  autor: string,
  autorTipo: EventoTimeline["autorTipo"],
  conteudo: string,
  metadata?: Record<string, unknown>,
): EventoTimeline => ({
  id: uid("ev"),
  tipo,
  autor,
  autorTipo,
  conteudo,
  metadata,
  criadoEm: nowIso(),
});

export async function listOrdens(storeId?: string): Promise<OrdemServico[]> {
  if (!storeId) return [];
  CURRENT_STORE_ID = storeId;
  const rows = await listOS(storeId);
  return rows as unknown as OrdemServico[];
}

export async function listTecnicos(storeId?: string): Promise<Tecnico[]> {
  // Técnicos agora vem do Cadastros HUB (Prisma).
  // O tipo do Operações HUB (Tecnico) é um snapshot simplificado.
  const sid = storeId ?? CURRENT_STORE_ID;
  const rows = await listTecnicosCadastros(sid);
  return rows.map((t) => ({
    id: t.id,
    nome: t.name,
    avatarUrl: undefined,
    especialidades: t.specialty ? [t.specialty] : [],
    online: true,
  }));
}

export async function criarOS(
  input: Omit<OrdemServico, "id" | "codigo" | "criadoEm" | "atualizadoEm" | "timeline">,
  autor = "Você",
): Promise<OrdemServico> {
  const created = await createOS(input.storeId, {
    ...(input as unknown as Parameters<typeof createOS>[1]),
    operacaoStatus: normalizeOperacaoStatus((input as unknown as OrdemServico).status),
    timeline: [newEvent("criacao", autor, "usuario", "OS criada.")],
  });
  return created as unknown as OrdemServico;
}

export async function moveStatus(osId: string, status: OSStatus, autor: string): Promise<OrdemServico> {
  // mantém timeline via patch incremental
  const effective = normalizeOperacaoStatus(status);
  const updated = await updateOSStatus(CURRENT_STORE_ID, osId, effective);
  const nextTimeline = [
    ...readTimeline((updated as unknown as { timeline?: unknown }).timeline),
    newEvent("mudanca_status", autor, "usuario", `Status alterado para "${effective}".`, { para: effective }),
  ];
  const patched = await updateOSPayload(CURRENT_STORE_ID, osId, { timeline: nextTimeline } as Partial<OrdemServico>);
  return patched as unknown as OrdemServico;
}

export async function assignTecnico(osId: string, tecnico: Tecnico, autor: string): Promise<OrdemServico> {
  const existing = await updateOSPayload(CURRENT_STORE_ID, osId, { tecnico } as Partial<OrdemServico>);
  const nextTimeline = [
    ...readTimeline((existing as unknown as { timeline?: unknown }).timeline),
    newEvent("atribuicao_tecnico", autor, "usuario", `Atribuída a ${tecnico.nome}.`),
  ];
  const patched = await updateOSPayload(CURRENT_STORE_ID, osId, { timeline: nextTimeline } as Partial<OrdemServico>);
  return patched as unknown as OrdemServico;
}

export async function addObservacao(osId: string, obs: ObservacaoTecnica): Promise<OrdemServico> {
  // fetch atual via listOS e patch (mantém simples e seguro)
  const current = (await listOS(CURRENT_STORE_ID)).find((o) => o.id === osId) as unknown;
  const observacoes = [...readArray<ObservacaoTecnica>((current as { observacoes?: unknown } | null)?.observacoes), obs];
  const timeline = [
    ...readTimeline((current as { timeline?: unknown } | null)?.timeline),
    newEvent("observacao", obs.autor, "usuario", obs.interna ? "Observação interna registrada." : "Observação registrada."),
  ];
  const patched = await updateOSPayload(CURRENT_STORE_ID, osId, { observacoes, timeline } as Partial<OrdemServico>);
  return patched as unknown as OrdemServico;
}

export async function addAnexo(osId: string, anexo: Anexo): Promise<OrdemServico> {
  const current = (await listOS(CURRENT_STORE_ID)).find((o) => o.id === osId) as unknown;
  const anexos = [...readArray<Anexo>((current as { anexos?: unknown } | null)?.anexos), anexo];
  const timeline = [
    ...readTimeline((current as { timeline?: unknown } | null)?.timeline),
    newEvent("anexo_adicionado", anexo.enviadoPor, "usuario", `Anexo adicionado: ${anexo.nome}.`),
  ];
  const patched = await updateOSPayload(CURRENT_STORE_ID, osId, { anexos, timeline } as Partial<OrdemServico>);
  return patched as unknown as OrdemServico;
}

export async function removeAnexo(osId: string, anexoId: string, autor: string): Promise<OrdemServico> {
  const current = (await listOS(CURRENT_STORE_ID)).find((o) => o.id === osId) as unknown;
  const curAnexos = readArray<Anexo>((current as { anexos?: unknown } | null)?.anexos);
  const target = curAnexos.find((a) => a.id === anexoId);
  const anexos = curAnexos.filter((a) => a.id !== anexoId);
  const timeline = [
    ...readTimeline((current as { timeline?: unknown } | null)?.timeline),
    newEvent("anexo_removido", autor, "usuario", `Anexo removido: ${target?.nome ?? anexoId}.`, { anexoId }),
  ];
  const patched = await updateOSPayload(CURRENT_STORE_ID, osId, { anexos, timeline } as Partial<OrdemServico>);
  return patched as unknown as OrdemServico;
}

export async function approveOrcamento(osId: string, autor: string): Promise<OrdemServico> {
  const rows = await listOS(CURRENT_STORE_ID);
  const current = rows.find((o) => o.id === osId);
  if (!current) throw new Error("OS não encontrada");
  const base = current as unknown as OrdemServico;
  const currentOrcamento = base.orcamento;
  if (!isOrcamento(currentOrcamento)) throw new Error("Orçamento inexistente");

  const orcamento: Orcamento = recalcularTotalOrcamento({
    ...currentOrcamento,
    status: "aprovado",
    respondidoEm: nowIso(),
  });

  const virtual: OrdemServico = { ...base, orcamento, status: "em_execucao" };
  const ts = nowIso();
  const garantiaSnap = snapshotGarantia(virtual, ts);
  const garantia = garantiaSnap ?? base.garantia;

  const faturamento = buildFaturamentoFromOrcamento({
    os: { id: base.id, codigo: base.codigo },
    orcamento,
    criadoEm: ts,
  });

  const timeline = [
    ...readTimeline(base.timeline),
    newEvent("orcamento_aprovado", autor, "cliente", "Orçamento aprovado pelo cliente."),
    newEvent(
      "faturamento_os_pendente",
      "Sistema",
      "sistema",
      "Orçamento aprovado e faturamento pendente criado.",
    ),
  ];
  const patched = await updateOSPayload(CURRENT_STORE_ID, osId, {
    orcamento,
    status: "em_execucao",
    garantia,
    timeline,
    ...faturamento,
  } as Partial<OrdemServico>);
  return patched as unknown as OrdemServico;
}

export async function rejectOrcamento(osId: string, autor: string, motivo?: string): Promise<OrdemServico> {
  const rows = await listOS(CURRENT_STORE_ID);
  const current = rows.find((o) => o.id === osId);
  if (!current) throw new Error("OS não encontrada");
  const base = current as unknown as OrdemServico;
  const currentOrcamento = base.orcamento;
  if (!isOrcamento(currentOrcamento)) throw new Error("Orçamento inexistente");

  const orcamento: Orcamento = recalcularTotalOrcamento({
    ...currentOrcamento,
    status: "recusado",
    respondidoEm: nowIso(),
  });
  const faturamento = buildFaturamentoRecusadoOrcamento();
  const timeline = [
    ...readTimeline(base.timeline),
    newEvent("orcamento_recusado", autor, "cliente", motivo ?? "Orçamento recusado."),
    newEvent("faturamento_os_cancelado", "Sistema", "sistema", "Orçamento recusado; faturamento cancelado."),
  ];
  const patched = await updateOSPayload(CURRENT_STORE_ID, osId, {
    orcamento,
    timeline,
    ...faturamento,
  } as Partial<OrdemServico>);
  return patched as unknown as OrdemServico;
}

export async function addEvento(osId: string, conteudo: string, tipo: EventoTipo, autor: string): Promise<OrdemServico> {
  const current = (await listOS(CURRENT_STORE_ID)).find((o) => o.id === osId) as unknown;
  const timeline = [...readTimeline((current as { timeline?: unknown } | null)?.timeline), newEvent(tipo, autor, "usuario", conteudo)];
  const patched = await updateOSPayload(CURRENT_STORE_ID, osId, { timeline } as Partial<OrdemServico>);
  return patched as unknown as OrdemServico;
}

// Adiciona uma peça do estoque à OS e cria reserva (baixa ocorre no faturamento).
export async function addPecaFromEstoque(osId: string, peca: PecaUsada, autor: string): Promise<OrdemServico> {
  const normalized = normalizePecaUsada(peca);
  await reservarPeca(normalized.id, normalized.quantidade, osId);
  const current = (await listOS(CURRENT_STORE_ID)).find((o) => o.id === osId) as unknown;
  const pecas = [...readArray<PecaUsada>((current as { pecas?: unknown } | null)?.pecas), normalized];
  const timeline = [
    ...readTimeline((current as { timeline?: unknown } | null)?.timeline),
    newEvent(
      "peca_adicionada",
      autor,
      "usuario",
      `Peça adicionada: ${normalized.quantidade}× ${normalized.nome}.`,
      { pecaId: normalized.id, produtoId: normalized.produtoId, sku: normalized.sku },
    ),
  ];
  const patched = await updateOSPayload(CURRENT_STORE_ID, osId, { pecas, timeline } as Partial<OrdemServico>);
  return patched as unknown as OrdemServico;
}

// Faturar OS → gera Venda + baixa estoque + transiciona para entregue.
export async function faturarOS(osId: string, autor: string) {
  const os = (await listOS(CURRENT_STORE_ID)).find((o) => o.id === osId) as unknown as OrdemServico | undefined;
  if (!os) throw new Error("OS não encontrada");
  const venda = await criarVendaDeOS(os);
  const updated = await updateOSStatus(CURRENT_STORE_ID, osId, "entregue");
  const nextTimeline = [
    ...readTimeline((updated as unknown as { timeline?: unknown }).timeline),
    newEvent("mudanca_status", autor, "usuario", `Faturada como ${venda.numero}.`, { vendaId: venda.id }),
  ];
  const patched = await updateOSPayload(CURRENT_STORE_ID, osId, { timeline: nextTimeline } as Partial<OrdemServico>);
  return { os: patched as unknown as OrdemServico, venda };
}

export async function updateChecklist(osId: string, checklist: OrdemServico["checklist"], autor: string): Promise<OrdemServico> {
  const current = (await listOS(CURRENT_STORE_ID)).find((o) => o.id === osId) as unknown;
  const timeline = [
    ...readTimeline((current as { timeline?: unknown } | null)?.timeline),
    newEvent("mensagem_interna", autor, "usuario", "Checklist atualizado."),
  ];
  const patched = await updateOSPayload(CURRENT_STORE_ID, osId, { checklist, timeline } as Partial<OrdemServico>);
  return patched as unknown as OrdemServico;
}
