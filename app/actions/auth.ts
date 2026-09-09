"use server"

import { headers } from "next/headers"
import { signIn, signOut, auth } from "@/auth"
import { AuthError } from "next-auth"
import { evaluateLocalDevAuthBypass } from "@/lib/local-dev-auth-guard"

export async function signInAction(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  try {
    await signIn("credentials", {
      email: formData.get("email") as string,
      password: formData.get("password") as string,
      redirectTo: "/dashboard",
    })
    return { error: null }
  } catch (error) {
    // Re-throw Next.js redirect (NEXT_REDIRECT) — handled by the framework
    if (
      typeof error === "object" &&
      error !== null &&
      "digest" in error &&
      typeof (error as { digest: string }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error
    }
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return { error: "Email ou senha incorretos." }
        default:
          return { error: "Erro ao fazer login. Tente novamente." }
      }
    }
    console.error("[signInAction]", error)
    return { error: "Erro inesperado. Tente novamente." }
  }
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" })
}

/**
 * Login sem senha do AMBIENTE LOCAL DE DESENVOLVIMENTO (LOCALHOST-DEV-AUTH-BYPASS-002).
 *
 * Dupla verificação server-side: este guard aqui evita chamar o NextAuth fora de
 * um ambiente local seguro, e o `authorize` do NextAuth REVALIDA tudo de novo
 * (fonte autoritativa). Em produção/Vercel o guard nega e o botão nem é renderizado.
 */
export async function localDevSignInAction(): Promise<{ error: string | null }> {
  const guard = evaluateLocalDevAuthBypass({ hostHeader: (await headers()).get("host") })
  if (!guard.allowed) {
    return { error: "Bypass de autenticação indisponível neste ambiente." }
  }
  try {
    await signIn("credentials", {
      localBypass: "true",
      redirectTo: "/dashboard",
    })
    return { error: null }
  } catch (error) {
    // Re-throw Next.js redirect (NEXT_REDIRECT) — handled by the framework
    if (
      typeof error === "object" &&
      error !== null &&
      "digest" in error &&
      typeof (error as { digest: string }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error
    }
    if (error instanceof AuthError) {
      return { error: "Não foi possível entrar no ambiente de teste (admin local ausente ou inativo)." }
    }
    console.error("[localDevSignInAction]", error)
    return { error: "Erro inesperado. Tente novamente." }
  }
}

export async function getCurrentUser() {
  const session = await auth()
  return session?.user ?? null
}
