/**
 * Contador HUB · avaliação pura de escopo/ACL (GOAL 006). Sem IO — testável.
 * Separado de `scope.ts` para não arrastar `next/headers`/`auth` para os testes.
 */
import type { Session } from "next-auth"
import { canAccessStore } from "@/lib/auth/enterprise-permissions"

export type EscopoContador =
  | { ok: true; storeId: string }
  | { ok: false; motivo: "nao_autenticado" | "sem_loja" | "sem_acesso" }

/** Avaliação pura de escopo/ACL da loja ativa para o Contador HUB interno. */
export function avaliarEscopoContador(
  session: Session | null,
  storeIdSelecionado: string | null | undefined,
): EscopoContador {
  if (!session?.user) return { ok: false, motivo: "nao_autenticado" }
  const storeId = (storeIdSelecionado ?? "").trim()
  if (!storeId) return { ok: false, motivo: "sem_loja" }
  if (!canAccessStore(session, storeId)) return { ok: false, motivo: "sem_acesso" }
  return { ok: true, storeId }
}
