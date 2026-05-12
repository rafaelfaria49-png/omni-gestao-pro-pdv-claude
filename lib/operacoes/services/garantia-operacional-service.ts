import type { PrismaClient } from "@/generated/prisma";
import type { Garantia } from "@/types/os";

export async function expirarGarantiasVencidas(
  db: Pick<PrismaClient, "garantiaOrdemServico">,
  params: { storeId: string; ordemServicoId: string },
): Promise<number> {
  const now = new Date();
  const r = await db.garantiaOrdemServico.updateMany({
    where: {
      storeId: params.storeId,
      ordemServicoId: params.ordemServicoId,
      status: "ativa",
      dataFim: { lt: now },
    },
    data: { status: "expirada" },
  });
  return r.count;
}

export async function cancelarGarantiasAtivasOrdem(
  db: Pick<PrismaClient, "garantiaOrdemServico">,
  params: { storeId: string; ordemServicoId: string },
): Promise<number> {
  const r = await db.garantiaOrdemServico.updateMany({
    where: { storeId: params.storeId, ordemServicoId: params.ordemServicoId, status: "ativa" },
    data: { status: "cancelada" },
  });
  return r.count;
}

export async function criarGarantiaOrdemServicoDb(
  db: Pick<PrismaClient, "garantiaOrdemServico">,
  params: {
    storeId: string;
    ordemServicoId: string;
    garantia: Garantia;
    cobertura?: string;
    observacoes?: string;
  },
): Promise<{ id: string; prazoDias: number } | null> {
  const g = params.garantia;
  if (!g.ativa || !g.prazoDias || g.prazoDias <= 0) return null;

  const inicio = g.inicioEm ? new Date(g.inicioEm) : new Date();
  const fim = g.fimEm ? new Date(g.fimEm) : new Date(inicio.getTime() + g.prazoDias * 86400000);

  const cobertura =
    (params.cobertura ?? "").trim() ||
    (typeof g.termo === "string" && g.termo.trim().length > 0 ? g.termo.trim().slice(0, 4000) : "Garantia operacional da OS.");

  await cancelarGarantiasAtivasOrdem(db, { storeId: params.storeId, ordemServicoId: params.ordemServicoId });

  const row = await db.garantiaOrdemServico.create({
    data: {
      storeId: params.storeId,
      ordemServicoId: params.ordemServicoId,
      prazoDias: g.prazoDias,
      cobertura,
      observacoes: (params.observacoes ?? "").trim(),
      dataInicio: inicio,
      dataFim: fim,
      status: "ativa",
    },
    select: { id: true, prazoDias: true },
  });
  return row;
}

export async function possuiGarantiaAtiva(
  db: Pick<PrismaClient, "garantiaOrdemServico">,
  params: { storeId: string; ordemServicoId: string },
): Promise<boolean> {
  const n = await db.garantiaOrdemServico.count({
    where: { storeId: params.storeId, ordemServicoId: params.ordemServicoId, status: "ativa" },
  });
  return n > 0;
}
