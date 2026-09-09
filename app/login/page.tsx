import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { evaluateLocalDevAuthBypass } from "@/lib/local-dev-auth-guard"
import { normalizeLocalCallbackPath } from "@/lib/local-dev-entry"
import { LoginForm } from "./login-form"

/**
 * Rota canônica de entrada operacional do sistema — é o `start_url` do PWA
 * instalado e o destino de todo logout / sessão expirada. A landing comercial
 * ("/") nunca é usada para isso.
 *
 * Quem já tem sessão válida não vê o formulário de novo: abrir o app instalado
 * cai direto no painel.
 *
 * Ambiente LOCAL autorizado (LOCALHOST-DEV-DIRECT-DASHBOARD-002B): nem a página
 * de login aparece — vai direto para a entrada automática local preservando o
 * callbackUrl (normalizado na rota interna, sem open redirect).
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const session = await auth()
  if (session?.user) {
    redirect("/dashboard")
  }

  const guard = evaluateLocalDevAuthBypass({ hostHeader: (await headers()).get("host") })
  if (guard.allowed) {
    const callbackPath = normalizeLocalCallbackPath((await searchParams).callbackUrl)
    redirect(`/api/local-dev-entry?callbackUrl=${encodeURIComponent(callbackPath)}`)
  }

  // Fora do ambiente local seguro: formulário normal. O bloco de bypass manual do
  // 002 continua disponível como fallback técnico quando o guard libera — inatingível
  // neste fluxo (o redirect acima ocorre antes), mas preservado.
  return <LoginForm localBypassAvailable={guard.allowed} />
}
