"use server"

import { signIn, signOut, auth } from "@/auth"
import { AuthError } from "next-auth"

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

export async function getCurrentUser() {
  const session = await auth()
  return session?.user ?? null
}
