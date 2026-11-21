import type { Session } from "next-auth"
import type { AccessModule } from "@/lib/auth/access-policy"

/**
 * Sessão NextAuth de um usuário de LOJA (accessScope STORE), no contrato atual dos guards
 * (`lib/auth/module-access.ts`, `canAccessStore`, `getPermissionsFromSession`, desde `52c01c3`):
 * exige `user.id`, membership explícita em `allowedStoreIds` e módulos por loja em `storeModules`.
 *
 * Nunca promove a conta a PLATFORM (`platformAuthority` é sempre false). Os guards reais seguem
 * decidindo; o teste declara apenas o que o usuário legítimo possui.
 */
export function storeSession(opts: {
  stores: string[]
  /** Módulos liberados — iguais para todas as lojas, ou por loja. */
  modules: AccessModule[] | Record<string, AccessModule[]>
  id?: string
  role?: string
  name?: string
  email?: string
}): Session {
  const storeModules = Array.isArray(opts.modules)
    ? Object.fromEntries(opts.stores.map((sid) => [sid, [...(opts.modules as AccessModule[])]]))
    : opts.modules
  return {
    expires: "2099-01-01T00:00:00.000Z",
    user: {
      id: opts.id ?? "user-store-1",
      role: opts.role ?? "ADMIN",
      name: opts.name ?? "Tester",
      email: opts.email ?? "tester@loja.test",
      lojaId: opts.stores[0] ?? null,
      storeAccess: "restricted",
      accessScope: "STORE",
      platformAuthority: false,
      allowedStoreIds: [...opts.stores],
      storeModules,
    },
  }
}

/**
 * Sessão da autoridade de PLATAFORMA — só para rotas cujo contrato exige `requireModuleApi(req, "platform")`
 * (operações de plataforma, ex.: recuperação de vendas em quarentena). Nunca usar para "liberar" rota de loja.
 */
export function platformSession(opts: { id?: string; name?: string; email?: string } = {}): Session {
  return {
    expires: "2099-01-01T00:00:00.000Z",
    user: {
      id: opts.id ?? "user-platform-1",
      role: "SUPER_ADMIN",
      name: opts.name ?? "Plataforma",
      email: opts.email ?? "plataforma@omni.test",
      lojaId: null,
      storeAccess: "all",
      accessScope: "PLATFORM",
      platformAuthority: true,
      allowedStoreIds: [],
      storeModules: {},
    },
  }
}
