"use client"

import { usePathname } from "next/navigation"
import { AppOpsProviders } from "@/components/dashboard/app-ops-providers"
import { FirstAccessWizard } from "@/components/onboarding/first-access-wizard"
import { AppShell } from "@/components/painel-inicial/AppShell"
import { PwaUpdatePrompt } from "@/components/pwa/pwa-update-prompt"

export default function DashboardSegmentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // Rota isolada: PDV GitHub Original renderiza como mini-app standalone,
  // SEM AppShell (sidebar/topbar), SEM AccessGate, SEM AppOpsProviders.
  // O isolamento visual (CSS / theme / density) é feito no layout próprio
  // dessa rota (`app/dashboard/pdv-github-original/layout.tsx`).
  if (pathname?.startsWith("/dashboard/pdv-github-original")) {
    return <>{children}</>
  }

  // Telas-fixas de PDV (scroll interno próprio, sem scroll de página): apenas o
  // PDV principal, suas subrotas (ex.: /vendas/venda-completa) e o PDV Next.
  // Match exato + barra evita capturar rotas irmãs como /dashboard/vendas-arquivo-geral
  // e /dashboard/vendas-hub, que são páginas com fluxo natural e precisam rolar.
  // Telas-fixas de painel ou PDV (scroll interno próprio, sem scroll de página):
  // PDV principal, subrotas, PDV Next e a tela de Configurações V3.
  const isFixedScreen =
    pathname === "/dashboard/vendas" ||
    pathname?.startsWith("/dashboard/vendas/") ||
    pathname?.startsWith("/dashboard/pdv-next") ||
    pathname === "/dashboard/configuracoes" ||
    pathname?.startsWith("/dashboard/configuracoes/") ||
    pathname === "/dashboard/ia-mestre" ||
    pathname?.startsWith("/dashboard/ia-mestre/") ||
    pathname === "/dashboard/operacoes-v2" ||
    pathname?.startsWith("/dashboard/operacoes-v2/") ||
    pathname === "/dashboard/whatsapp" ||
    pathname?.startsWith("/dashboard/whatsapp/") ||
    pathname === "/dashboard/vendas-hub" ||
    pathname?.startsWith("/dashboard/vendas-hub/")

  const shell = (
    // Aviso de atualização (PWA) vai na faixa superior (abaixo da Topbar global),
    // no fluxo — nunca como overlay sobre carrinho/pagamento/workspace.
    <AppShell noPadding={isFixedScreen} topNotice={<PwaUpdatePrompt />}>
      <FirstAccessWizard />
      <div
        className={
          isFixedScreen
            ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden basis-0"
            : "min-h-0 flex-1 overflow-auto flex flex-col"
        }
      >
        {children}
      </div>
    </AppShell>
  )

  return <AppOpsProviders>{shell}</AppOpsProviders>
}
