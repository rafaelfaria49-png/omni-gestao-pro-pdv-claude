import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { z } from "zod"
import { authConfig } from "./auth.config"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

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
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return null

        const user = await prisma.adminUser.findUnique({
          where: { email: parsed.data.email },
        })
        if (!user) return null

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
