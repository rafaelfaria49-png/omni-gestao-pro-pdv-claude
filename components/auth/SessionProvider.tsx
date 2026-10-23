"use client"

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react"
import type { Session } from "next-auth"

export function SessionProvider({ children, session }: { children: React.ReactNode; session?: Session | null }) {
  // Credentials Server Actions update the server prop after login. NextAuth only
  // initializes its session state on mount; change identity/version atomically.
  const identity = JSON.stringify([session?.user?.id, session?.user?.sessionVersion])
  return <NextAuthSessionProvider key={identity} session={session} refetchInterval={30} refetchOnWindowFocus>{children}</NextAuthSessionProvider>
}
