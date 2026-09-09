import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { z } from "zod"
import { authConfig } from "./auth.config"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { evaluateLocalDevAuthBypass } from "@/lib/local-dev-auth-guard"
import { resolveLocalDevBypassUser } from "@/lib/local-dev-auth"

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
        localBypass: { label: "Local Dev Auth Bypass", type: "text" },
      },
      async authorize(credentials, request) {
        // ── Bypass LOCAL/DEV (LOCALHOST-DEV-AUTH-BYPASS-002) — FAIL-CLOSED ──
        // Só existe fora de produção, com flag explícita, request em loopback e
        // banco local omnigestao_visual_dev. Reutiliza o MESMO mecanismo oficial
        // de sessão do NextAuth; em produção o ramo nunca é usado: sem a flag o
        // campo é ignorado e a autenticação por senha segue intacta.
        if (credentials?.localBypass === "true") {
          const guard = evaluateLocalDevAuthBypass({
            hostHeader: request?.headers?.get("host") ?? null,
          })
          if (!guard.allowed) return null
          return resolveLocalDevBypassUser()
        }

        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return null

        const user = await prisma.adminUser.findUnique({
          where: { email: parsed.data.email },
        })
        if (!user) return null
        if (user.active === false) return null

        const valid = await bcrypt.compare(parsed.data.password, user.password)
        if (!valid) return null

        const roleUpper = String(user.role).toUpperCase()
        const isAdmin = roleUpper === "SUPER_ADMIN" || roleUpper === "ADMIN"

        let storeAccess: "all" | "restricted" = "all"
        let allowedStoreIds: string[] | undefined

        if (!isAdmin) {
          const memberships = await prisma.adminUserStore.findMany({
            where: { adminUserId: user.id },
            select: { storeId: true },
          })
          if (memberships.length > 0) {
            storeAccess = "restricted"
            allowedStoreIds = memberships.map((m) => m.storeId)
          } else if (user.lojaId?.trim()) {
            storeAccess = "restricted"
            allowedStoreIds = [user.lojaId.trim()]
          }
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as string,
          lojaId: user.lojaId ?? null,
          storeAccess,
          allowedStoreIds,
        }
      },
    }),
  ],
})
