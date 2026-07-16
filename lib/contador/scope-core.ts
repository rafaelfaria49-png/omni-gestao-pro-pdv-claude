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
  userId: string
  permissaoFinanceiro: true
  [CONTADOR_SCOPE_VALIDADO]: true
}>

export type FalhaEscopoContador = Readonly<{
  ok: false
  motivo: "nao_autenticado" | "loja_ausente" | "sem_acesso_loja" | "sem_permissao"
}>

export type AvaliacaoAcessoContador =
  | Readonly<{
      ok: true
      storeId: string
      userId: string
      permissaoFinanceiro: true
    }>
  | FalhaEscopoContador

export type EscopoContador = ContadorScopeInterno | FalhaEscopoContador

/** Avaliação pura de escopo/ACL da loja ativa para o Contador HUB interno. */
export function avaliarAcessoContador(
  session: Session | null,
  storeIdSelecionado: string | null | undefined,
): AvaliacaoAcessoContador {
  if (!session?.user) return { ok: false, motivo: "nao_autenticado" }
  const userId = String(session.user.id ?? "").trim()
  if (!userId) return { ok: false, motivo: "nao_autenticado" }
  const storeId = (storeIdSelecionado ?? "").trim()
  if (!storeId) return { ok: false, motivo: "loja_ausente" }
  if (!canAccessStore(session, storeId)) return { ok: false, motivo: "sem_acesso_loja" }
  if (!getPermissionsFromSession(session).hubs.financeiro) {
    return { ok: false, motivo: "sem_permissao" }
  }

  // Decisao serializavel e ainda nao nominal; somente o gate com IO aplica o brand interno.
  return Object.freeze({ ok: true, storeId, userId, permissaoFinanceiro: true })
}
