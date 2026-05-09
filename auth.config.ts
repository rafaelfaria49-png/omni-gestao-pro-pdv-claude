import type { NextAuthConfig } from "next-auth"

/**
 * Configuração base do NextAuth — Edge-safe (sem Node.js deps).
 * Usada no proxy.ts (Edge middleware) para verificar a sessão JWT.
 * auth.ts estende esta config e adiciona o provider Credentials (Node.js only).
 */
export const authConfig = {
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: string }).role
        token.lojaId = (user as { lojaId: string | null }).lojaId
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.sub ?? ""
      session.user.role = (token.role as string) ?? "OPERADOR"
      session.user.lojaId = (token.lojaId as string | null) ?? null
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
} satisfies NextAuthConfig
