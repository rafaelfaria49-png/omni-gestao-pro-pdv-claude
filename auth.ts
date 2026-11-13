import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { z } from "zod"
import { authConfig } from "./auth.config"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { isPlatformAuthority, resolveStoreModules } from "@/lib/auth/access-policy"
import { isSessionRevocationEnabled, prismaAdminSessionStore, resolveAdminSession } from "@/lib/auth/admin-session"

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

const sessionStore = prismaAdminSessionStore(prisma)

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  events: {
    // Logout revoga SÓ esta sessão (outros dispositivos e usuários seguem ativos).
    async signOut(message) {
      if (!isSessionRevocationEnabled()) return
      const sid = "token" in message ? message.token?.sid : undefined
      if (typeof sid !== "string") return
      try {
        await sessionStore.revoke(sid, "logout")
      } catch {
        console.error("[auth] session_revoke_failed")
      }
    },
  },
  logger: { error() { console.error("[auth] authentication_failed") } },
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) token.sessionVersion = user.sessionVersion ?? 0
      if (!token.sub) return null
      // Nunca confiar no payload de update(). Relê autoridade e revogação por operação.
      const current = await prisma.adminUser.findUnique({
        where: { id: token.sub },
        include: { adminUserStores: { select: { storeId: true } } },
      })
      if (!current || !current.active || (token.sessionVersion ?? 0) !== current.sessionVersion) return null
      // Revogação por sessão no servidor: token de sessão encerrada (logout), expirada ou alheia
      // não vale mais, mesmo que o cookie volte por resposta atrasada ou cópia.
      if (isSessionRevocationEnabled()) {
        const session = await resolveAdminSession(sessionStore, { sid: token.sid, userId: current.id, isSignIn: Boolean(user) })
        if (!session.ok) return null
        token.sid = session.sid
      }
      const platform = isPlatformAuthority(current)
      const memberships = current.adminUserStores.map((s) => s.storeId)
      const ids = memberships.length ? memberships : current.lojaId ? [current.lojaId] : []
      const stores = platform ? [] : await prisma.store.findMany({
        where: { id: { in: ids } }, select: { id: true, moduleAccess: true },
      })
      token.name = current.name
      token.email = current.email
      token.role = current.role
      token.accessScope = current.accessScope
      token.platformAuthority = platform
      token.billingAccess = Boolean(current.stripeCustomerId && current.stripeSubscriptionId)
      token.lojaId = current.lojaId
      token.storeAccess = platform ? "all" : "restricted"
      token.allowedStoreIdsJson = JSON.stringify(stores.map((s) => s.id))
      token.storeModules = Object.fromEntries(stores.map((s) => [s.id, resolveStoreModules(s.moduleAccess)]))
      token.mustChangePassword = current.mustChangePassword
      return token
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return null

        const user = await prisma.adminUser.findUnique({
          where: { email: parsed.data.email.trim().toLowerCase() },
        })
        if (!user) return null
        if (user.active === false) return null

        const valid = await bcrypt.compare(parsed.data.password, user.password)
        if (!valid) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as string,
          lojaId: user.lojaId ?? null,
          storeAccess: "restricted" as const,
          sessionVersion: user.sessionVersion,
        }
      },
    }),
  ],
})
