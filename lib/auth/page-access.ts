import type { EnterprisePermissions } from "./enterprise-permissions"

/** Uma decisão para navegação e páginas; caminhos desconhecidos são internos. */
export function canAccessPage(p: EnterprisePermissions | null, pathname: string): boolean {
  if (!p) return false
  const path = pathname.replace(/\/$/, "") || "/"
  if (path === "/conta/seguranca") return true
  if (p.platformAuthority) return true
  if (path === "/dashboard") return p.modules?.home === true
  const at = (base: string) => path === base || path.startsWith(base + "/")
  // Passagem externa: os guards DP continuam decidindo flag, Store, grants e dados.
  if (at("/dashboard/pessoas")) return true
  if (at("/meu-plano") || at("/dashboard/billing")) return p.billingAccess === true
  if (at("/dashboard/plataforma") || at("/dashboard/master-console") || at("/dashboard/unidades")) return false
  if (at("/dashboard/catalogo-aparelhos")) return p.hubs.cadastros && p.modules?.deviceCatalog === true
  if (at("/dashboard/ia-mestre") || at("/dashboard/produtos/assistente-ia") || at("/dashboard/creditos")) return p.workspace.iaMestre
  if (at("/dashboard/omni-agent")) return p.workspace.omniAgent
  if (at("/dashboard/marketing") || at("/dashboard/marketing-ia")) return p.hubs.marketingIa
  if (at("/dashboard/whatsapp") || at("/dashboard/whatsapp-automation")) return p.hubs.whatsapp
  if (at("/dashboard/marketplace") || at("/dashboard/marketplaces")) return p.hubs.marketplace
  if (at("/dashboard/contador")) return p.hubs.contador
  if (at("/dashboard/operacoes-v4-preview")) return p.hubs.operacoes && p.modules?.experiments === true
  if (at("/dashboard/pdv-next") || at("/dashboard/pdv-github-original")) return p.hubs.vendas && p.modules?.experiments === true
  if (at("/dashboard/operacoes-v3")) return p.hubs.operacoes
  if (at("/dashboard/vendas")) return p.hubs.vendas && p.modules?.pdv === true && !at("/dashboard/vendas/mesas")
  if (at("/dashboard/vendas-hub") || at("/vendas-hub") || at("/dashboard/historico-vendas") || at("/dashboard/vendas-arquivo-geral")) return p.hubs.vendas && p.modules?.sales === true
  if (at("/dashboard/caixa/historico")) return p.hubs.caixaHistorico
  if (at("/dashboard/cadastros-v2") || at("/dashboard/clientes") || at("/dashboard/produtos")) return p.hubs.cadastros
  if (at("/dashboard/estoque")) return p.hubs.cadastros && p.modules?.stock === true
  if (at("/dashboard/relatorios")) return p.hubs.relatorios
  if (at("/dashboard/configuracoes")) return p.admin.configuracoes
  if (at("/dashboard/financeiro") || at("/dashboard/financeiro-v2")) return p.hubs.financeiro
  return false
}

export function canAccessSettingsSection(p: EnterprisePermissions | null, section: string): boolean {
  if (!p) return false
  if (section === "seguranca") return true
  if (p.platformAuthority) return true
  if (!p.admin.configuracoes) return false
  if (["geral", "aparencia", "pdv", "vendas", "usuarios"].includes(section)) return true
  if (section === "financeiro") return p.hubs.financeiro
  if (section === "fiscal") return p.modules?.fiscal === true
  if (section === "ia") return p.workspace.iaMestre
  return false
}
