import type { OSStatus } from "@/types/os";
import { normalizeOperacaoStatus } from "@/components/operacoes/lovable/utils/os-status";
import { nowIso } from "@/lib/operacoes/services/os-helpers";

export function validatePatchIdentifiers(params: {
  storeId: string;
  osId: string;
  patch: { storeId?: string; id?: string };
}) {
  if (params.patch.storeId !== undefined && params.patch.storeId !== params.storeId) throw new Error("storeId inválido");
  if (params.patch.id !== undefined && params.patch.id !== params.osId) throw new Error("id inválido");
}

export function computeEffectiveOperacaoStatus(patch: { operacaoStatus?: OSStatus; status?: OSStatus }): OSStatus | undefined {
  const raw = patch.operacaoStatus ?? patch.status;
  return raw !== undefined ? normalizeOperacaoStatus(raw) : undefined;
}

export function mergePayload<T extends { storeId: string; id: string; atualizadoEm?: string }>(params: {
  current: T;
  patch: Partial<T>;
  storeId: string;
  osId: string;
  effectiveOperacao?: OSStatus;
}): T {
  const next = {
    ...(params.current as T),
    ...(params.patch as Partial<T>),
    storeId: params.storeId,
    id: params.osId,
    ...(params.effectiveOperacao ? ({ status: params.effectiveOperacao, operacaoStatus: params.effectiveOperacao } as unknown as Partial<T>) : {}),
    atualizadoEm: nowIso(),
  };
  return next as T;
}

