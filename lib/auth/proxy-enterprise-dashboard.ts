import type { Session } from "next-auth"
import { canAccessStore, getEnterprisePermissions } from "@/lib/auth/enterprise-permissions"

const DASH = "/dashboard"

function denyHome(origin: string): URL {
  const u = new URL(DASH, origin)
  u.searchParams.set("access", "denied")
  return u
}

/**
 * Se o utilizador não tem permissão enterprise para o caminho, devolve URL de redirecionamento.
 */
export function enterpriseDashboardRedirect(origin: string, pathname: string, session: Session): URL | null {
  const perms = getEnterprisePermissions(session.user?.role)

  const block = (cond: boolean) => cond

  if (block(pathname === `${DASH}/ia-mestre` || pathname.startsWith(`${DASH}/ia-mestre/`))) {
    if (!perms.workspace.iaMestre) return denyHome(origin)
  }
  if (block(pathname === `${DASH}/omni-agent` || pathname.startsWith(`${DASH}/omni-agent/`))) {
    if (!perms.workspace.omniAgent) return denyHome(origin)
  }
  if (block(pathname.includes("/marketing"))) {
    if (!perms.hubs.marketingIa) return denyHome(origin)
  }
  if (block(pathname === `${DASH}/whatsapp` || pathname.startsWith(`${DASH}/whatsapp`))) {
    if (!perms.hubs.whatsapp) return denyHome(origin)
  }
  if (block(pathname.includes("operacoes"))) {
    if (!perms.hubs.operacoes) return denyHome(origin)
  }
  if (block(pathname.includes("cadastros"))) {
    if (!perms.hubs.cadastros) return denyHome(origin)
  }
  if (
    block(
      pathname.startsWith("/vendas-hub") ||
        pathname === `${DASH}/vendas-hub` ||
        pathname.startsWith(`${DASH}/vendas-hub/`),
    )
  ) {
    if (!perms.hubs.vendas) return denyHome(origin)
  }
  if (block(pathname.includes("/vendas"))) {
    if (!perms.hubs.vendas) return denyHome(origin)
  }
  if (pathname.includes("/caixa/historico")) {
    if (!perms.hubs.caixaHistorico) return denyHome(origin)
  }
  if (block(pathname.includes("financeiro"))) {
    if (!perms.hubs.financeiro) return denyHome(origin)
  }
  if (block(pathname.includes("marketplace"))) {
    if (!perms.hubs.marketplace) return denyHome(origin)
  }
  if (block(pathname === `${DASH}/relatorios` || pathname.startsWith(`${DASH}/relatorios/`))) {
    if (!perms.hubs.relatorios) return denyHome(origin)
  }
  // Rotas legadas / atalhos fora do HUB — mesma matriz da sidebar.
  if (block(pathname === `${DASH}/clientes` || pathname.startsWith(`${DASH}/clientes/`))) {
    if (!perms.hubs.cadastros) return denyHome(origin)
  }
  if (block(pathname === `${DASH}/estoque` || pathname.startsWith(`${DASH}/estoque/`))) {
    if (!perms.hubs.cadastros) return denyHome(origin)
  }
  if (block(pathname === `${DASH}/produtos` || pathname.startsWith(`${DASH}/produtos/`))) {
    if (!perms.hubs.cadastros) return denyHome(origin)
  }
  if (block(pathname === `${DASH}/cadastros` || pathname.startsWith(`${DASH}/cadastros/`))) {
    if (!perms.hubs.cadastros) return denyHome(origin)
  }
  if (block(pathname === `${DASH}/os` || pathname.startsWith(`${DASH}/os/`))) {
    if (!perms.hubs.operacoes) return denyHome(origin)
  }
  if (block(pathname === `${DASH}/historico-vendas` || pathname.startsWith(`${DASH}/historico-vendas/`))) {
    if (!perms.hubs.vendas) return denyHome(origin)
  }
  if (block(pathname === `${DASH}/pdv` || pathname.startsWith(`${DASH}/pdv/`))) {
    if (!perms.hubs.vendas) return denyHome(origin)
  }
  if (block(pathname === `${DASH}/orcamentos` || pathname.startsWith(`${DASH}/orcamentos/`))) {
    if (!perms.hubs.operacoes && !perms.hubs.vendas) return denyHome(origin)
  }
  if (block(pathname === `${DASH}/expedicao` || pathname.startsWith(`${DASH}/expedicao/`))) {
    if (!perms.hubs.operacoes) return denyHome(origin)
  }
  if (block(pathname === `${DASH}/whatsapp-automation` || pathname.startsWith(`${DASH}/whatsapp-automation/`))) {
    if (!perms.hubs.whatsapp) return denyHome(origin)
  }
  if (block(pathname.includes("master-console"))) {
    if (!perms.admin.masterConsole) return denyHome(origin)
  }
  if (block(pathname.includes("unidades"))) {
    if (!perms.admin.unidades) return denyHome(origin)
  }
  if (block(pathname.includes("configuracoes"))) {
    if (!perms.admin.configuracoes) return denyHome(origin)
  }

  return null
}

export function enterpriseStoreCookieRedirect(origin: string, session: Session, storeCookie: string | undefined): URL | null {
  const sid = String(storeCookie || "").trim()
  if (!sid) return null
  if (!canAccessStore(session, sid)) {
    const u = new URL(DASH, origin)
    u.searchParams.set("storeAccess", "denied")
    return u
  }
  return null
}
