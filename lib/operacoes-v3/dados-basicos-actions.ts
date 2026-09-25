"use server";

// ============================================================================
// Operações V3 — write-path dos DADOS BÁSICOS da OS (side-effect-free) · slice 3B
// ----------------------------------------------------------------------------
// Grava SOMENTE dados operacionais básicos no `payload` (JSONB) + a coluna
// denormalizada `defeito` (busca/fallback de hidratação) + um evento de timeline
// (auditoria). Mesma disciplina de `workspace-actions` / `prova-entrada-actions`:
// grava payload DIRETO via Prisma — deliberadamente SEM `updateOSPayload` do V2
// (que sincroniza Financeiro). NÃO muda status, orçamento, diagnóstico, valor,
// estoque, caixa, garantia, WhatsApp. Nada de automação.
//
// Campos: defeito relatado · prioridade · recebido por · localização física ·
// previsão/SLA · origem · observações internas. Reusa os contratos/validadores
// puros de `dados-basicos-model`.
// ============================================================================

import { revalidatePath } from "next/cache";
import type { Session } from "next-auth";
import type { Prisma } from "@/generated/prisma";
import type { OrdemServico } from "@/types/os";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireEnterpriseWith } from "@/lib/auth/guard-enterprise";
import { assertActiveStoreId } from "@/lib/operacoes/assert-active-store";
import type { SalvarDadosBasicosInputV3 } from "./dados-basicos-model";
import {
  erroConflitoConcorrenciaV3,
  montarProximosDadosBasicos,
  type EsperadosDadosBasicosV3,
} from "@/lib/operacoes-v4/entrada-form";

type OSPayloadFull = OrdemServico & Record<string, unknown>;

function nowIso(): string {
  return new Date().toISOString();
}
function operadorLabel(session: Session | null): string {
  const u = session?.user;
  return (u?.name || u?.email || "Você").trim() || "Você";
}
function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

async function carregar(
  storeId: string,
  osId: string,
): Promise<{ id: string; session: Session | null; payload: OSPayloadFull }> {
  const sid = (storeId ?? "").trim();
  const id = (osId ?? "").trim();
  assertActiveStoreId(sid, "Operações V3");
  if (!id) throw new Error("OS não informada.");

  const session = await auth();
  if (!session?.user?.id) throw new Error("Faça login para editar a OS.");
  const guard = await requireEnterpriseWith(sid, (p) => p.operacoes.editarOs, "Sem permissão para editar esta OS.");
  if (!guard.ok) throw new Error(guard.error);

  const row = await prisma.ordemServico.findFirst({ where: { id, storeId: sid }, select: { id: true, payload: true } });
  if (!row) throw new Error("OS não encontrada.");
  const payload = row.payload as unknown as OSPayloadFull | null;
  if (!payload || typeof payload !== "object") throw new Error("OS sem payload compatível.");
  return { id, session, payload };
}

/**
 * Salva os dados básicos da OS (recepção). NÃO altera status/orçamento/diagnóstico/
 * financeiro/estoque/caixa. Retorna o payload atualizado (mesmo shape que `getOrdem`).
 *
 * R02: releitura dentro da transação + escrita condicionada a `updatedAt`.
 * Gravação concorrente de outra sessão não é sobrescrita em silêncio — vira
 * erro de conflito explícito (sem motor global: só este write-path).
 */
export async function salvarDadosBasicosOSV3(
  storeId: string,
  osId: string,
  input: SalvarDadosBasicosInputV3,
  esperados?: EsperadosDadosBasicosV3,
): Promise<OrdemServico> {
  const { id, session } = await carregar(storeId, osId);
  const sid = (storeId ?? "").trim();
  const operador = operadorLabel(session);

  const saida = await prisma.$transaction(async (tx) => {
    const latest = await tx.ordemServico.findFirst({
      where: { id },
      select: { id: true, storeId: true, payload: true, updatedAt: true },
    });
    if (!latest || latest.storeId !== sid) throw new Error("OS não encontrada.");
    const payload = latest.payload as unknown as OSPayloadFull | null;
    if (!payload || typeof payload !== "object") throw new Error("OS sem payload compatível.");
    const { next, defeito } = montarProximosDadosBasicos(payload, input, operador, esperados);
    // Escreve o payload + a coluna denormalizada `defeito` (usada em busca e como
    // fallback de hidratação). NÃO toca status/valorBase/valorTotal nem qualquer
    // outra coluna. Sem `updateOSPayload` do V2 → sem sync de Financeiro.
    const data: Prisma.OrdemServicoUpdateInput = {
      payload: next as unknown as Prisma.InputJsonValue,
      defeito,
    };
    const r = await tx.ordemServico.updateMany({ where: { id, updatedAt: latest.updatedAt }, data });
    if (r.count === 0) throw erroConflitoConcorrenciaV3("os dados básicos");
    const row = await tx.ordemServico.findFirst({ where: { id }, select: { payload: true } });
    if (!row) throw new Error("OS não encontrada.");
    return row.payload as unknown as OrdemServico;
  });
  revalidatePath("/dashboard/operacoes-v3");
  return saida;
}
