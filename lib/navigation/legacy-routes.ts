import { configuracoesSectionHref } from "@/components/configuracoes-v3/features/settings/section-routing"
import { financeiroV2Enabled } from "@/lib/feature-flags"

/** Destino oficial do módulo financeiro (HUB ou painel legado). */
export const FINANCEIRO_HUB_PATH = financeiroV2Enabled
  ? "/dashboard/financeiro-v2"
  : "/dashboard/financeiro"

/**
 * Mapa `/?page=` (SPA antiga na home) → rotas App Router atuais.
 * Chaves em minúsculas.
 */
export const LEGACY_PAGE_REDIRECTS: Record<string, string> = {
  vendas: "/dashboard/vendas",
  "vendas-arquivo": "/dashboard/vendas-arquivo-geral",
  trocas: "/dashboard/vendas-arquivo-geral",
  os: "/dashboard/operacoes-v2",
  "dashboard-omni": "/dashboard",
  "dashboard-360": "/dashboard",
  "fluxo-caixa": FINANCEIRO_HUB_PATH,
  carteiras: FINANCEIRO_HUB_PATH,
  "contas-pagar": "/dashboard/financeiro/contas-a-pagar",
  "contas-receber": "/dashboard/financeiro/contas-a-receber",
  "relatorios-financeiros": "/dashboard/relatorios",
  relatorios: "/dashboard/relatorios",
  clientes: "/dashboard/clientes",
  "clientes-gestao": "/dashboard/clientes",
  produtos: "/dashboard/estoque",
  servicos: "/dashboard/operacoes-v2",
  orcamentos: "/dashboard/orcamentos",
  "planejamento-compras": "/dashboard/estoque",
  credito: "/dashboard/clientes",
  "controle-consumo": "/dashboard/vendas",
  "config-pdv": configuracoesSectionHref("pdv"),
  "config-multilojas": "/dashboard/unidades",
}

/** Rotas raiz legadas (`/vendas`, `/fluxo-caixa`, …) → dashboard moderno. */
export const ROOT_SEGMENT_REDIRECTS: Record<string, string> = {
  vendas: "/dashboard/vendas",
  "fluxo-caixa": FINANCEIRO_HUB_PATH,
  "contas-pagar": "/dashboard/financeiro/contas-a-pagar",
  "contas-receber": "/dashboard/financeiro/contas-a-receber",
  "relatorios-financeiros": "/dashboard/relatorios",
  os: "/dashboard/operacoes-v2",
}

/** Páginas antigas que exigiam assinatura ativa (proxy). */
export const CRITICAL_LEGACY_PAGES = new Set([
  "vendas",
  "os",
  "fluxo-caixa",
  "contas-pagar",
  "contas-receber",
  "relatorios-financeiros",
  "dashboard-360",
])

export function resolveLegacyPageRedirect(page: string | null | undefined): string | null {
  const key = String(page ?? "").trim().toLowerCase()
  if (!key) return null
  return LEGACY_PAGE_REDIRECTS[key] ?? null
}

/** Monta URL de destino preservando query params exceto `page`. */
export function buildLegacyPageRedirectUrl(
  page: string,
  searchParams?: URLSearchParams | { get: (key: string) => string | null },
): string {
  const base = resolveLegacyPageRedirect(page) ?? "/dashboard"
  if (!searchParams) return base

  const target = new URL(base, "http://local")
  if (searchParams instanceof URLSearchParams) {
    searchParams.forEach((value, key) => {
      if (key === "page") return
      target.searchParams.set(key, value)
    })
  } else {
    for (const key of ["sale", "sec", "access", "storeAccess"] as const) {
      const v = searchParams.get(key)
      if (v) target.searchParams.set(key, v)
    }
  }
  const qs = target.searchParams.toString()
  return qs ? `${target.pathname}?${qs}` : target.pathname
}
