/**
 * Contador HUB · escopo server-side interno (GOAL 006).
 *
 * Resolve a loja ativa para leituras do HUB interno e aplica a ACL multi-loja
 * (`canAccessStore`, mesma do GOAL 004 / `/api/ops/vendas-list`). A seleção da loja
 * vem do cookie de loja ativa — jamais é autorização por si só; a ACL da sessão decide.
 * A avaliação pura vive em `scope-core.ts` (testável); aqui fica só o IO.
 */
import { cookies } from "next/headers"
import { auth } from "@/auth"
import { ASSISTEC_ACTIVE_STORE_COOKIE } from "@/lib/store-defaults"
import { avaliarEscopoContador, type EscopoContador } from "./scope-core"

export { avaliarEscopoContador } from "./scope-core"
export type { ContadorScopeInterno, EscopoContador } from "./scope-core"

/** Resolve o escopo real (sessão NextAuth + cookie de loja ativa + ACL). */
export async function requireContadorScope(): Promise<EscopoContador> {
  const session = await auth()
  const store = (await cookies()).get(ASSISTEC_ACTIVE_STORE_COOKIE)?.value ?? null
  return avaliarEscopoContador(session, store)
}
