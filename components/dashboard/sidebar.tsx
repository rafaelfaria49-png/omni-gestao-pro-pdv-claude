"use client"

import { 
  LayoutDashboard,
  ShoppingCart, 
  FileText, 
  ClipboardList,
  Activity,
  Bot,
  Sparkles,
  Package, 
  Wallet, 
  Users, 
  BarChart3, 
  Settings,
  Store,
  Zap,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  ShoppingBag,
  Receipt,
  MessageCircle,
  History,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { APP_DISPLAY_NAME } from "@/lib/app-brand"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import {
  nomeFantasiaOuFallbackUnidadePorOrdem,
} from "@/lib/store-display-name"
import { usePerfilLoja } from "@/lib/perfil-loja-provider"

type PremiumNavLink = {
  icon: React.ElementType
  label: string
  page?: string
  externalPath?: string
}

type PremiumNavGroup = {
  icon: React.ElementType
  label: string
  items: PremiumNavLink[]
}

interface SidebarProps {
  onNavigate?: (page: string) => void
  currentPage?: string
  collapsed?: boolean
  onToggleCollapse?: () => void
}

export function Sidebar({ onNavigate, currentPage = "dashboard", collapsed = false, onToggleCollapse }: SidebarProps) {
  const { lojas, lojaAtivaId, setLojaAtivaId } = useLojaAtiva()
  const { perfilLoja } = usePerfilLoja()
  const hideOsMenus = perfilLoja === "variedades" || perfilLoja === "supermercado"
  const mainNavItems: PremiumNavLink[] = [
    { icon: Sparkles, label: "IA Mestre", externalPath: "/dashboard/ia-mestre" },
    { icon: MessageCircle, label: "WhatsApp HUB", externalPath: "/dashboard/whatsapp-automation" },
    { icon: Bot, label: "Marketing IA", externalPath: "/dashboard/marketing-ia" },
    { icon: ShoppingBag, label: "Marketplace", externalPath: "/dashboard/marketplace" },
    { icon: ShieldCheck, label: "Master Console", externalPath: "/dashboard/master-console" },
    { icon: LayoutDashboard, label: "Painel Inicial", page: "dashboard-omni", externalPath: "/dashboard" },
  ]
  const standaloneNavItems: PremiumNavLink[] = [
    { icon: Users, label: "Clientes", page: "clientes-gestao", externalPath: "/dashboard/clientes" },
    { icon: BarChart3, label: "Relatórios", page: "relatorios" },
    { icon: Settings, label: "Configurações", externalPath: "/dashboard/configuracoes" },
  ]
  const navGroups: PremiumNavGroup[] = [
    {
      icon: ShoppingCart,
      label: "Operacional",
      items: [
        { icon: Activity, label: "Operações HUB", externalPath: "/dashboard/operacoes-v2" },
        { icon: ShoppingCart, label: "Vendas", page: "vendas", externalPath: "/dashboard/vendas" },
        { icon: Receipt, label: "Histórico de Vendas", externalPath: "/dashboard/vendas-arquivo-geral" },
        { icon: FileText, label: "Orçamentos (legado)", page: "orcamentos" },
        ...(hideOsMenus ? [] : [{ icon: ClipboardList, label: "OS — legado", page: "os", externalPath: "/dashboard/os" }]),
      ],
    },
    {
      icon: Package,
      label: "Estoque",
      items: [
        { icon: Package, label: "Cadastro de Produtos", page: "produtos" },
        { icon: Store, label: "Movimentação/Inventário", page: "planejamento-compras" },
        { icon: History, label: "Auditoria de Estoque", externalPath: "/dashboard/estoque/auditoria" },
      ],
    },
    {
      icon: Wallet,
      label: "Financeiro",
      items: [
        { icon: Wallet, label: "Contas a Pagar", page: "contas-pagar" },
        { icon: Wallet, label: "Contas a Receber", page: "contas-receber" },
        { icon: Wallet, label: "Fluxo de Caixa", page: "fluxo-caixa" },
      ],
    },
  ]

  const handleNavigation = (page?: string, externalPath?: string) => {
    if (externalPath) {
      window.location.href = externalPath
      return
    }
    if (page && onNavigate) {
      onNavigate(page)
    }
  }

  const isActive = (page?: string) => page === currentPage
  const isExternalActive = (externalPath?: string) => {
    if (!externalPath || typeof window === "undefined") return false
    const path = window.location.pathname
    return path === externalPath || path.startsWith(`${externalPath}/`)
  }
  const isNavActive = (item: PremiumNavLink) => isActive(item.page) || isExternalActive(item.externalPath)

  const defaultOpenGroups = navGroups
    .filter((g) => g.items.some((it) => isNavActive(it)))
    .map((g) => g.label)

  const navButtonClass = (active: boolean, highlighted = false) =>
    cn(
      "group relative flex items-center gap-3 w-full overflow-hidden rounded-xl border px-3 py-3 text-sm font-semibold transition-smooth",
      collapsed && "justify-center px-3",
      highlighted
        ? "border-primary/40 bg-gradient-primary text-primary-foreground shadow-elegant hover:shadow-glow"
        : active
          ? "border-primary/40 bg-primary/15 text-primary shadow-elegant border-r-2"
          : "border-border bg-muted/40 text-foreground/85 hover:bg-primary/10 hover:text-primary"
    )
  const submenuButtonClass = (active: boolean) =>
    cn(
      "group relative flex items-center gap-2 w-full overflow-hidden rounded-xl border px-3 py-2.5 pl-8 text-left text-sm font-semibold transition-smooth",
      active
        ? "border-primary/35 bg-primary/15 text-primary shadow-elegant border-r-2"
        : "border-border bg-muted/30 text-foreground/75 hover:bg-primary/10 hover:text-primary"
    )
  const iconTileClass = (active: boolean, highlighted = false) =>
    cn(
      "grid h-7 w-7 shrink-0 place-items-center rounded-md transition-smooth",
      highlighted
        ? "bg-primary-foreground/15 text-primary-foreground"
        : active
          ? "bg-primary/20 text-primary"
          : "bg-muted/60 text-foreground/70 group-hover:bg-primary/10 group-hover:text-primary"
    )
  const activeGlow = (active: boolean, highlighted = false) =>
    active || highlighted ? <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-primary shadow-glow" /> : null

  return (
    <aside
      className={cn(
        "hidden lg:flex flex-col border-r border-border bg-card text-foreground backdrop-blur-xl transition-all duration-300 ease-out",
        collapsed ? "w-20" : "w-64"
      )}
    >
      <div
        className={cn(
          "flex items-center border-b transition-colors duration-300",
          "border-border",
          collapsed ? "justify-center p-3" : "justify-between p-4"
        )}
      >
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary">
            <Zap className="w-5 h-5 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div>
              <h1
                className={cn(
                  "text-lg font-bold transition-colors duration-300",
                  "text-foreground"
                )}
              >
                {APP_DISPLAY_NAME}
              </h1>
              <p
                className={cn(
                  "text-xs transition-colors duration-300",
                  "text-muted-foreground"
                )}
              >
                ERP · gestão empresarial
              </p>
            </div>
          )}
        </div>
        {!collapsed && (
          <button
            onClick={onToggleCollapse}
            className={cn(
              "p-2 rounded-md transition-colors duration-300",
              "text-foreground hover:bg-muted/60"
            )}
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}
        {collapsed && (
          <button
            onClick={onToggleCollapse}
            className={cn(
              "absolute top-4 right-2 p-1 rounded-md transition-colors duration-300",
              "text-foreground hover:bg-muted/60"
            )}
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        )}
      </div>

      {!collapsed && lojas.length >= 2 && (
        <div
          className={cn(
            "px-4 pb-3 border-b transition-colors duration-300",
            "border-border"
          )}
        >
          <p
            className={cn(
              "text-xs mb-1.5 transition-colors duration-300",
              "text-muted-foreground"
            )}
          >
            Unidade ativa
          </p>
          <Select
            value={lojaAtivaId ?? lojas[0]?.id ?? ""}
            onValueChange={(v) => setLojaAtivaId(v)}
          >
            <SelectTrigger
              className={cn(
                "w-full h-9 transition-colors duration-300",
                "border-border bg-muted/40 text-foreground"
              )}
            >
              {(() => {
                const id = (lojaAtivaId ?? lojas[0]?.id ?? "").trim()
                const linha = lojas.find((x) => x.id === id)
                const idx = linha ? lojas.findIndex((x) => x.id === linha.id) : null
                const nome = linha ? nomeFantasiaOuFallbackUnidadePorOrdem(linha.id, linha.nomeFantasia, idx) : "Unidade"
                return (
                  <div className="flex items-center gap-2 min-w-0 flex-1 text-left">
                    <span
                      className={cn(
                        "truncate text-sm font-medium transition-colors duration-300",
                        "text-foreground"
                      )}
                    >
                      {nome}
                    </span>
                  </div>
                )
              })()}
            </SelectTrigger>
            <SelectContent>
              {lojas.map((l) => {
                const idx = lojas.findIndex((x) => x.id === l.id)
                const nome = nomeFantasiaOuFallbackUnidadePorOrdem(l.id, l.nomeFantasia, idx)
                return (
                  <SelectItem key={l.id} value={l.id} textValue={nome}>
                    <span className="truncate font-medium">{nome}</span>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>
      )}
      
      <nav className="flex-1 p-4 overflow-y-auto min-h-0">
        <div className="space-y-2">
          {mainNavItems.map((item) => (
            <button
              key={item.label}
              onClick={() => handleNavigation(item.page, item.externalPath)}
              className={navButtonClass(isNavActive(item))}
            >
              {activeGlow(isNavActive(item))}
              <span className={iconTileClass(isNavActive(item))}>
                <item.icon className="h-4 w-4 shrink-0" />
              </span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          ))}
        </div>

        {!collapsed ? (
          <Accordion type="multiple" defaultValue={defaultOpenGroups} className="mt-4 space-y-2">
            {navGroups.map((group) => (
              <AccordionItem key={group.label} value={group.label} className="border-0">
                <AccordionTrigger className="rounded-xl border border-border bg-muted/40 px-3 py-3 text-foreground transition-smooth hover:border-primary/25 hover:bg-muted/60 hover:no-underline">
                  <span className="flex items-center gap-3 text-sm font-semibold">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-muted/60 text-foreground/75">
                      <group.icon className="h-4 w-4 shrink-0" />
                    </span>
                    {group.label}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-1 pt-2">
                  <ul className="space-y-1">
                    {group.items.map((item) => (
                      <li key={item.label}>
                        <button
                          onClick={() => handleNavigation(item.page, item.externalPath)}
                          className={submenuButtonClass(isNavActive(item))}
                        >
                          {activeGlow(isNavActive(item))}
                          <span className={iconTileClass(isNavActive(item))}>
                            <item.icon className="h-4 w-4 shrink-0" />
                          </span>
                          <span className="truncate">{item.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <div className="mt-4 space-y-2">
            {navGroups.map((group) => (
              <button key={group.label} className={navButtonClass(false)} title={group.label}>
                <span className={iconTileClass(false)}>
                  <group.icon className="h-4 w-4 shrink-0" />
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 space-y-2">
          {standaloneNavItems.map((item) => (
            <button
              key={item.label}
              onClick={() => handleNavigation(item.page, item.externalPath)}
              className={navButtonClass(isNavActive(item))}
            >
              {activeGlow(isNavActive(item))}
              <span className={iconTileClass(isNavActive(item))}>
                <item.icon className="h-4 w-4 shrink-0" />
              </span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          ))}
        </div>
      </nav>
      
      <div
        className={cn(
          "p-4 border-t transition-colors duration-300",
          "border-border"
        )}
      >
        <div
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-300",
            "bg-muted/40",
            collapsed && "justify-center px-2"
          )}
        >
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
            A
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p
                className={cn(
                  "text-sm font-medium truncate transition-colors duration-300",
                  "text-foreground"
                )}
              >
                Admin
              </p>
              <p
                className={cn(
                  "text-xs truncate transition-colors duration-300",
                  "text-muted-foreground"
                )}
              >
                admin@seudominio.com
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
