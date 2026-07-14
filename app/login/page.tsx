import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { LoginForm } from "./login-form"

/**
 * Rota canônica de entrada operacional do sistema — é o `start_url` do PWA
 * instalado e o destino de todo logout / sessão expirada. A landing comercial
 * ("/") nunca é usada para isso.
 *
 * Quem já tem sessão válida não vê o formulário de novo: abrir o app instalado
 * cai direto no painel.
 */
export default async function LoginPage() {
  const session = await auth()
  if (session?.user) {
    redirect("/dashboard")
  }

  return <LoginForm />
}
