"use server";

import { prisma, withPrismaSafe } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma";
import type {
  EventoTimeline,
  Garantia,
  Orcamento,
  OrdemServico,
  OSStatus,
} from "@/types/os";
import { snapshotGarantia } from "@/lib/os/garantia";

export type OSPrioridade = "baixa" | "media" | "alta" | "critica";

export type OperacoesClienteSnapshot = {
  id: string;
  nome: string;
  documento?: string;
  telefone?: string;
  email?: string;
  whatsapp?: string;
  cidade?: string;
};

export type OperacoesTecnicoSnapshot = {
  id: string;
  nome: string;
  especialidades?: string[];
  cargo?: string;
};

export type OperacoesEquipamentoSnapshot = {
  id: string;
  tipo: string;
  marca: string;
  modelo: string;
  numeroSerie?: string;
  acessorios?: string[];
  defeitoRelatado: string;
  defeitosComuns?: string[];
  checklistRecomendado?: string[];
};

export type OperacoesServicoLinha = {
  servicoId: string;
  descricao: string;
  custoInterno: number;
  valorVenda: number;
  prazoGarantiaDias: number;
  termoGarantia: string;
};

export type OperacoesOSPayload = {
  id: string;
  codigo: string;
  storeId: string;
  clienteId: string;
  cliente: OperacoesClienteSnapshot;
  equipamento: OperacoesEquipamentoSnapshot;
  status: OSStatus;
  prioridade: OSPrioridade;
  tecnico?: OperacoesTecnicoSnapshot;
  criadoEm: string;
  atualizadoEm: string;
  entregueEm?: string;
  checklist?: unknown;
  servicosCatalogo?: OperacoesServicoLinha[];
  pecas?: unknown;
  observacoes?: unknown;
  anexos?: unknown;
  timeline?: unknown;
  garantia?: Garantia;
  orcamento?: Orcamento;
  faturamentoPendente?: boolean;
  faturamentoStatus?: "pendente" | "cancelado";
  faturamentoOrigem?: "orcamento_os";
  faturamentoTotal?: number;
  faturamentoCriadoEm?: string;
  faturamentoReferencia?: string;
  senhaEquipamento?: string;
  observacaoCliente?: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function asPayload(v: unknown): OrdemServico | null {
  if (!isRecord(v)) return null;
  if (typeof v.id !== "string") return null;
  if (typeof v.codigo !== "string") return null;
  if (typeof v.storeId !== "string") return null;
  return v as unknown as OrdemServico;
}

function nowIso() {
  return new Date().toISOString();
}

function toPrismaStatus(s: OSStatus): "Aberto" | "EmAnalise" | "Pronto" | "Entregue" {
  if (s === "pronta") return "Pronto";
  if (s === "entregue") return "Entregue";
  if (s === "diagnostico" || s === "aguardando_aprovacao" || s === "em_execucao") return "EmAnalise";
  return "Aberto";
}

async function nextCodigo(storeId: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await withPrismaSafe(
    (db) => db.ordemServico.count({ where: { storeId } }),
    0
  );
  const seq = String(count + 1).padStart(5, "0");
  return `OS-${year}-${seq}`;
}

export async function listOS(storeId: string): Promise<OperacoesOSPayload[]> {
  const rows = await prisma.ordemServico.findMany({
    where: { storeId },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });

  const out: OperacoesOSPayload[] = [];
  for (const r of rows) {
    const parsed = asPayload(r.payload as unknown);
    if (parsed) {
      out.push(parsed as unknown as OperacoesOSPayload);
      continue;
    }

    // Fallback mínimo (para linhas antigas sem payload).
    out.push({
      id: r.id,
      codigo: r.numero ?? `OS-${new Date(r.createdAt).getFullYear()}-${r.id.slice(-5)}`,
      storeId: r.storeId,
      clienteId: r.clienteId ?? "",
      cliente: {
        id: r.clienteId ?? "",
        nome: "—",
      },
      equipamento: {
        id: `eq_${r.id}`,
        tipo: "—",
        marca: "",
        modelo: "",
        defeitoRelatado: r.defeito ?? "",
      },
      status: "aberta",
      prioridade: "media",
      criadoEm: r.createdAt.toISOString(),
      atualizadoEm: r.updatedAt.toISOString(),
    });
  }
  return out;
}

export async function createOS(
  storeId: string,
  input: Omit<OperacoesOSPayload, "id" | "codigo" | "criadoEm" | "atualizadoEm">
): Promise<OperacoesOSPayload> {
  const codigo = await nextCodigo(storeId);
  const createdAtIso = nowIso();
  const payload: OperacoesOSPayload = {
    ...(input as unknown as OperacoesOSPayload),
    id: "", // preenchido após create
    codigo,
    storeId,
    criadoEm: createdAtIso,
    atualizadoEm: createdAtIso,
  };

  const created = await prisma.ordemServico.create({
    data: {
      storeId,
      numero: codigo,
      clienteId: input.clienteId || null,
      equipamento: `${input.equipamento.marca} ${input.equipamento.modelo}`.trim(),
      defeito: input.equipamento.defeitoRelatado,
      valorBase: 0,
      valorTotal: Number(
        (input.servicosCatalogo ?? []).reduce((acc, s) => acc + Number(s.valorVenda || 0), 0)
      ),
      status: toPrismaStatus(input.status),
      payload: {} as Prisma.InputJsonValue, // atualizado abaixo com id
    },
    select: { id: true, createdAt: true, updatedAt: true },
  });

  payload.id = created.id;
  payload.criadoEm = created.createdAt.toISOString();
  payload.atualizadoEm = created.updatedAt.toISOString();

  await prisma.ordemServico.update({
    where: { id: created.id },
    data: { payload: payload as unknown as Prisma.InputJsonValue },
  });

  revalidatePath("/dashboard/operacoes-v2");
  return payload;
}

export async function updateOSStatus(
  storeId: string,
  osId: string,
  status: OSStatus
): Promise<OperacoesOSPayload> {
  const existing = await prisma.ordemServico.findFirst({
    where: { id: osId, storeId },
    select: { id: true, payload: true, createdAt: true },
  });
  if (!existing) throw new Error("OS não encontrada");

  const current = asPayload(existing.payload as unknown);
  if (!current) throw new Error("OS sem payload (incompatível)");

  const next: OrdemServico = {
    ...current,
    status,
    atualizadoEm: nowIso(),
  };
  if (status === "entregue") {
    const entregueEm = next.entregueEm ?? nowIso();
    next.entregueEm = entregueEm;

    const snap = snapshotGarantia(next, entregueEm);
    if (snap?.prazoDias && snap.prazoDias > 0) {
      next.garantia = snap;

      const ev: EventoTimeline = {
        id: `ev_${Date.now()}`,
        tipo: "garantia_acionada",
        autor: "Sistema",
        autorTipo: "sistema",
        conteudo: `Garantia vinculada (${snap.prazoDias} dias).`,
        criadoEm: nowIso(),
      };
      next.timeline = [...(next.timeline ?? []), ev];
    }
  }

  await prisma.ordemServico.update({
    where: { id: osId },
    data: { status: toPrismaStatus(status), payload: next as unknown as Prisma.InputJsonValue },
  });

  revalidatePath("/dashboard/operacoes-v2");
  return next as unknown as OperacoesOSPayload;
}

export async function updateOSPayload(
  storeId: string,
  osId: string,
  patch: Partial<OperacoesOSPayload>
): Promise<OperacoesOSPayload> {
  const existing = await prisma.ordemServico.findFirst({
    where: { id: osId, storeId },
    select: { id: true, payload: true },
  });
  if (!existing) throw new Error("OS não encontrada");
  const current = asPayload(existing.payload as unknown);
  if (!current) throw new Error("OS sem payload (incompatível)");
  if (patch.storeId !== undefined && patch.storeId !== storeId) throw new Error("storeId inválido");
  if (patch.id !== undefined && patch.id !== osId) throw new Error("id inválido");

  const next = {
    ...(current as unknown as OperacoesOSPayload),
    ...patch,
    storeId,
    id: osId,
    atualizadoEm: nowIso(),
  } satisfies OperacoesOSPayload;

  await prisma.ordemServico.update({
    where: { id: osId },
    data: { payload: next as unknown as Prisma.InputJsonValue },
  });
  revalidatePath("/dashboard/operacoes-v2");
  return next;
}

