import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: string
      lojaId: string | null
    } & DefaultSession["user"]
  }

  interface User {
    role: string
    lojaId: string | null
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string
    lojaId?: string | null
  }
}
