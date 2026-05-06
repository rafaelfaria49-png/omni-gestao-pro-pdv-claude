// Camada async de Ordens de Serviço.
// Toda mutação passa por aqui — pronta para virar fetch/PUT/POST real.
import { db } from "./_db";
import { delay, nowIso, uid } from "./_helpers";
import type {
  Anexo,
  EventoTimeline,
  EventoTipo,
  ObservacaoTecnica,
  OrdemServico,
  OSStatus,
  PecaUsada,
  Tecnico,
} from "@/types/os";
import { TECNICOS_SEED } from "@/data/osSeed";
import { reservarPeca } from "./estoque";
import { criarVendaDeOS } from "./vendas";

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

const mutate = (osId: string, fn: (os: OrdemServico) => OrdemServico): OrdemServico => {
  const idx = db.ordens.findIndex((o) => o.id === osId);
  if (idx === -1) throw new Error(`OS ${osId} não encontrada`);
  const updated = { ...fn(db.ordens[idx]), atualizadoEm: nowIso() };
  db.ordens[idx] = updated;
  return updated;
};

export async function listOrdens(storeId?: string): Promise<OrdemServico[]> {
  await delay();
  return storeId ? db.ordens.filter((o) => o.storeId === storeId) : [...db.ordens];
}

export async function listTecnicos(): Promise<Tecnico[]> {
  await delay(40);
  return [...TECNICOS_SEED];
}

export async function criarOS(
  input: Omit<OrdemServico, "id" | "codigo" | "criadoEm" | "atualizadoEm" | "timeline">,
  autor = "Você",
): Promise<OrdemServico> {
  await delay(80);
  const ano = new Date().getFullYear();
  const seq = (db.ordens.length + 1).toString().padStart(5, "0");
  const novo: OrdemServico = {
    ...input,
    id: uid("os"),
    codigo: `OS-${ano}-${seq}`,
    criadoEm: nowIso(),
    atualizadoEm: nowIso(),
    timeline: [newEvent("criacao", autor, "usuario", "OS criada.")],
  };
  db.ordens.push(novo);
  return novo;
}

export async function moveStatus(osId: string, status: OSStatus, autor: string): Promise<OrdemServico> {
  await delay(60);
  return mutate(osId, (os) => ({
    ...os,
    status,
    timeline: [...os.timeline, newEvent("mudanca_status", autor, "usuario", `Status alterado para "${status}".`, { de: os.status, para: status })],
  }));
}

export async function assignTecnico(osId: string, tecnico: Tecnico, autor: string): Promise<OrdemServico> {
  await delay(60);
  return mutate(osId, (os) => ({
    ...os,
    tecnico,
    timeline: [...os.timeline, newEvent("atribuicao_tecnico", autor, "usuario", `Atribuída a ${tecnico.nome}.`)],
  }));
}

export async function addObservacao(osId: string, obs: ObservacaoTecnica): Promise<OrdemServico> {
  await delay(60);
  return mutate(osId, (os) => ({
    ...os,
    observacoes: [...os.observacoes, obs],
    timeline: [...os.timeline, newEvent("observacao", obs.autor, "usuario", obs.interna ? "Observação interna registrada." : "Observação registrada.")],
  }));
}

export async function addAnexo(osId: string, anexo: Anexo): Promise<OrdemServico> {
  await delay(60);
  return mutate(osId, (os) => ({
    ...os,
    anexos: [...os.anexos, anexo],
    timeline: [...os.timeline, newEvent("anexo_adicionado", anexo.enviadoPor, "usuario", `Anexo adicionado: ${anexo.nome}.`)],
  }));
}

export async function approveOrcamento(osId: string, autor: string): Promise<OrdemServico> {
  await delay(60);
  return mutate(osId, (os) => ({
    ...os,
    orcamento: os.orcamento ? { ...os.orcamento, status: "aprovado", respondidoEm: nowIso() } : os.orcamento,
    status: "em_execucao",
    timeline: [...os.timeline, newEvent("orcamento_aprovado", autor, "cliente", "Orçamento aprovado pelo cliente.")],
  }));
}

export async function rejectOrcamento(osId: string, autor: string, motivo?: string): Promise<OrdemServico> {
  await delay(60);
  return mutate(osId, (os) => ({
    ...os,
    orcamento: os.orcamento ? { ...os.orcamento, status: "recusado", respondidoEm: nowIso() } : os.orcamento,
    timeline: [...os.timeline, newEvent("orcamento_recusado", autor, "cliente", motivo ?? "Orçamento recusado.")],
  }));
}

export async function addEvento(osId: string, conteudo: string, tipo: EventoTipo, autor: string): Promise<OrdemServico> {
  await delay(40);
  return mutate(osId, (os) => ({
    ...os,
    timeline: [...os.timeline, newEvent(tipo, autor, "usuario", conteudo)],
  }));
}

// Adiciona uma peça do estoque à OS e cria reserva (baixa ocorre no faturamento).
export async function addPecaFromEstoque(osId: string, peca: PecaUsada, autor: string): Promise<OrdemServico> {
  await delay(60);
  await reservarPeca(peca.id, peca.quantidade, osId);
  return mutate(osId, (os) => ({
    ...os,
    pecas: [...os.pecas, peca],
    timeline: [...os.timeline, newEvent("peca_adicionada", autor, "usuario", `Peça adicionada: ${peca.quantidade}× ${peca.nome}.`, { pecaId: peca.id })],
  }));
}

// Faturar OS → gera Venda + baixa estoque + transiciona para entregue.
export async function faturarOS(osId: string, autor: string) {
  await delay(80);
  const os = db.ordens.find((o) => o.id === osId);
  if (!os) throw new Error("OS não encontrada");
  const venda = await criarVendaDeOS(os);
  const updated = mutate(osId, (curr) => ({
    ...curr,
    status: "entregue",
    entregueEm: nowIso(),
    timeline: [...curr.timeline, newEvent("mudanca_status", autor, "usuario", `Faturada como ${venda.numero}.`, { vendaId: venda.id })],
  }));
  return { os: updated, venda };
}
