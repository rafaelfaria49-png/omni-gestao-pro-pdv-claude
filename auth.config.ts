import type { NextAuthConfig } from "next-auth"

/**
 * Configuração base do NextAuth — Edge-safe (sem Node.js deps).
 * auth.ts estende esta config e revalida a identidade no banco, inclusive no proxy Node.
 */
export const authConfig = {
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const u = user as {
          role: string
          lojaId: string | null
          storeAccess: "all" | "restricted"
          allowedStoreIds?: string[]
        }
        token.role = u.role
        token.lojaId = u.lojaId
        token.storeAccess = u.storeAccess
        token.allowedStoreIdsJson =
          u.storeAccess === "restricted" && Array.isArray(u.allowedStoreIds) && u.allowedStoreIds.length > 0
            ? JSON.stringify(u.allowedStoreIds)
            : ""
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.sub ?? ""
      session.user.role = (token.role as string) ?? "OPERADOR"
      session.user.lojaId = (token.lojaId as string | null) ?? null
      session.user.platformAuthority = token.platformAuthority === true
      session.user.billingAccess = token.billingAccess === true
      session.user.accessScope = typeof token.accessScope === "string" || token.accessScope === null ? token.accessScope : undefined
      session.user.mustChangePassword = token.mustChangePassword === true
      session.user.sessionVersion = typeof token.sessionVersion === "number" ? token.sessionVersion : 0
      session.user.storeModules = (token.storeModules ?? {}) as NonNullable<typeof session.user.storeModules>
      session.user.storeAccess = token.platformAuthority === true ? "all" : "restricted"
      const raw = String(token.allowedStoreIdsJson || "").trim()
      if (session.user.storeAccess === "restricted") {
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as unknown
            session.user.allowedStoreIds = Array.isArray(parsed)
              ? parsed.filter((x): x is string => typeof x === "string" && x.length > 0)
              : []
          } catch {
            session.user.allowedStoreIds = []
          }
        } else if (session.user.lojaId?.trim()) {
          session.user.allowedStoreIds = [session.user.lojaId.trim()]
        } else {
          session.user.allowedStoreIds = []
        }
      } else {
        session.user.allowedStoreIds = undefined
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
} satisfies NextAuthConfig
