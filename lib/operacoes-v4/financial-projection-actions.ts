"use server";

import { auth } from "@/auth";
import { requireEnterpriseWith } from "@/lib/auth/guard-enterprise";
import { assertActiveStoreId } from "@/lib/operacoes/assert-active-store";
import { localKeyContaReceberOSV3 } from "@/lib/operacoes-v3/payment-model";
import { prisma } from "@/lib/prisma";
import type { OrdemServico } from "@/types/os";
import {
  projectFinancialOSV4,
  unknownFinancialProjectionOSV4,
  type FinancialProjectionOSV4,
} from "./financial-projection";

function normalizeIds(osIds: string[]): string[] {
  return [...new Set(osIds.map((id) => (id ?? "").trim()).filter(Boolean))].slice(0, 200);
}

async function authorizeFinancialProjection(storeId: string): Promise<string> {
  const sid = (storeId ?? "").trim();
  assertActiveStoreId(sid, "Operações V4");
  const session = await auth();
  if (!session?.user?.id) throw new Error("Faça login para consultar o financeiro da OS.");
  const guard = await requireEnterpriseWith(
    sid,
    (permissions) => permissions.operacoes.editarOs,
    "Sem permissão para consultar o financeiro desta OS.",
  );
  if (!guard.ok) throw new Error(guard.error);
  return sid;
}

async function loadFinancialProjections(
  storeId: string,
  osIds: string[],
): Promise<FinancialProjectionOSV4[]> {
  const sid = await authorizeFinancialProjection(storeId);
  const ids = normalizeIds(osIds);
  if (ids.length === 0) return [];

  const rows = await prisma.ordemServico.findMany({
    where: { storeId: sid, id: { in: ids } },
    select: { id: true, numero: true, status: true, valorTotal: true, payload: true },
  });
  if (rows.length === 0) return [];
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const loadedAt = new Date().toISOString();
  const localKeys = rows.map((row) => localKeyContaReceberOSV3(sid, row.id));

  let titleReadFailed = false;
  let titles: Array<{
    id: string;
    storeId: string;
    localKey: string | null;
    valor: number;
    status: string;
    payload: unknown;
  }> = [];
  try {
    titles = await prisma.contaReceberTitulo.findMany({
      where: { storeId: sid, localKey: { in: localKeys } },
      select: { id: true, storeId: true, localKey: true, valor: true, status: true, payload: true },
    });
  } catch {
    titleReadFailed = true;
  }
  const titlesByKey = new Map(titles.map((title) => [title.localKey, title]));

  return ids.flatMap((osId) => {
    const row = rowsById.get(osId);
    if (!row) return [];
    const rawPayload = row.payload;
    if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
      return [unknownFinancialProjectionOSV4({
        storeId: sid,
        osId,
        osCode: row.numero,
        operationalStatus: String(row.status),
        loadedAt,
        errorCode: "OS_PAYLOAD_INVALID",
      })];
    }
    if (titleReadFailed) {
      return [unknownFinancialProjectionOSV4({
        storeId: sid,
        osId,
        osCode: row.numero,
        operationalStatus: String(row.status),
        loadedAt,
        errorCode: "RECEIVABLE_READ_FAILED",
      })];
    }

    const payload = {
      ...(rawPayload as Record<string, unknown>),
      id: osId,
      codigo: (rawPayload as Record<string, unknown>).codigo ?? row.numero ?? osId,
    } as OrdemServico & Record<string, unknown>;
    const title = titlesByKey.get(localKeyContaReceberOSV3(sid, osId)) ?? null;
    return [projectFinancialOSV4({
      storeId: sid,
      osId,
      osCode: typeof payload.codigo === "string" ? payload.codigo : row.numero,
      operationalStatus: typeof payload.operacaoStatusV3 === "string"
        ? payload.operacaoStatusV3
        : typeof payload.status === "string"
          ? payload.status
          : String(row.status),
      payload,
      prismaValorTotal: row.valorTotal,
      titulo: title,
      loadedAt,
    })];
  });
}

/** Reader único da OS selecionada. Read-only, autenticado e scoped pela loja ativa. */
export async function lerProjecaoFinanceiraOSV4(storeId: string, osId: string): Promise<FinancialProjectionOSV4> {
  const id = (osId ?? "").trim();
  if (!id) throw new Error("OS não informada.");
  const projections = await loadFinancialProjections(storeId, [id]);
  const projection = projections[0];
  if (!projection) throw new Error("OS não encontrada.");
  return projection;
}

/** Reader em lote para o rail PDV, evitando uma consulta por linha. */
export async function lerProjecoesFinanceirasOSV4(storeId: string, osIds: string[]): Promise<FinancialProjectionOSV4[]> {
  return loadFinancialProjections(storeId, osIds);
}
