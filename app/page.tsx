import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { evaluateLocalDevAuthBypass } from "@/lib/local-dev-auth-guard"
import LandingPage from "./landing-client"

/**
 * Raiz do app. Em produção/Vercel (NODE_ENV=production, ou flag ausente, ou host
 * não-loopback, ou banco não-local) o guard NUNCA libera e a landing page pública
 * renderiza exatamente como sempre — zero mudança visual.
 *
 * No ambiente LOCAL de desenvolvimento autorizado (LOCALHOST-DEV-DIRECT-DASHBOARD-002B),
 * `/` não mostra landing nem login: vai direto para a rota interna `/local-dev-entry`,
 * que reaproveita a sessão existente ou cria a sessão oficial do admin local
 * (mesmo mecanismo do LOCALHOST-DEV-AUTH-BYPASS-002) e segue para /dashboard.
 */
export default async function RootPage() {
  const guard = evaluateLocalDevAuthBypass({ hostHeader: (await headers()).get("host") })
  if (guard.allowed) {
    redirect("/api/local-dev-entry")
  }

  return <LandingPage />
}
