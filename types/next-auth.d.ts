import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: string
      lojaId: string | null
      /** "all" = qualquer loja; "restricted" = apenas `allowedStoreIds`. */
      storeAccess: "all" | "restricted"
      allowedStoreIds?: string[]
    } & DefaultSession["user"]
  }

  interface User {
    role: string
    lojaId: string | null
    storeAccess: "all" | "restricted"
    allowedStoreIds?: string[]
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string
    lojaId?: string | null
    storeAccess?: "all" | "restricted"
    /** JSON array de storeIds quando `storeAccess` === "restricted". */
    allowedStoreIdsJson?: string
  }
}
