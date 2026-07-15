/**
 * Contador HUB · avaliação pura de escopo/ACL (GOAL 006). Sem IO — testável.
 * Separado de `scope.ts` para não arrastar `next/headers`/`auth` para os testes.
 */
import type { Session } from "next-auth"
import { canAccessStore, getPermissionsFromSession } from "@/lib/auth/enterprise-permissions"

declare const CONTADOR_SCOPE_VALIDADO: unique symbol

/** Escopo nominal produzido exclusivamente pelo gate server-side do Contador HUB. */
export type ContadorScopeInterno = Readonly<{
  ok: true
  storeId: string
  [CONTADOR_SCOPE_VALIDADO]: true
}>

export type EscopoContador =
  | ContadorScopeInterno
  | {
      ok: false
      motivo: "nao_autenticado" | "loja_ausente" | "sem_acesso_loja" | "sem_permissao"
    }

/** Avaliação pura de escopo/ACL da loja ativa para o Contador HUB interno. */
export function avaliarEscopoContador(
  session: Session | null,
  storeIdSelecionado: string | null | undefined,
): EscopoContador {
  if (!session?.user) return { ok: false, motivo: "nao_autenticado" }
  const storeId = (storeIdSelecionado ?? "").trim()
  if (!storeId) return { ok: false, motivo: "loja_ausente" }
  if (!canAccessStore(session, storeId)) return { ok: false, motivo: "sem_acesso_loja" }
  if (!getPermissionsFromSession(session).hubs.financeiro) {
    return { ok: false, motivo: "sem_permissao" }
  }

  // O brand existe apenas no sistema de tipos; o valor serializavel nao vaza detalhes de ACL.
  return Object.freeze({ ok: true, storeId }) as ContadorScopeInterno
}
