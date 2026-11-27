"use client"

import * as React from "react"
import { StudioThemeContext } from "@/components/theme/ThemeProvider"
import {
  BarChart3,
  Bot,
  CheckCircle2,
  CreditCard,
  FlaskConical,
  LayoutDashboard,
  Lock,
  Menu,
  Moon,
  Plus,
  RefreshCw,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sun,
  Tag,
  Wallet,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type {
  AssistenteWhatsAppConfig,
  ConsultaFinanceiraSnapshot,
  FinanceiroPerfilSeletor,
  IntegrationReadiness,
  OperacaoFeedback,
  PerfilResumo,
  TipoPerfilFinanceiro,
} from "@/lib/gestor-money/contracts"
import {
  createRealBoundaryGateway,
  createSyntheticGestorMoneyGateway,
  type GestorMoneyGateway,
} from "@/lib/gestor-money/gateway"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ProfileSwitcher } from "./ProfileSwitcher"
import { DashboardView } from "./DashboardView"
import { QuickEntrySheet, type QuickEntryTab } from "./QuickEntrySheet"
import { DebtsView } from "./DebtsView"
import { CreditCardsView } from "./CreditCardsView"
import { AccountsWalletsView } from "./AccountsWalletsView"
import { CategoriesView } from "./CategoriesView"
import { ReportsView } from "./ReportsView"
import { AssistantSettingsView } from "./AssistantSettingsView"
import { DashboardSkeleton } from "./shared"

export type GestorMoneySection =
  | "dashboard"
  | "dividas"
  | "cartoes"
  | "contas"
  | "categorias"
  | "relatorios"
  | "assistente"

const NAV_ITEMS: Array<{
  id: GestorMoneySection
  label: string
  shortLabel: string
  icon: React.ComponentType<{ className?: string }>
}> = [
  { id: "dashboard", label: "Dashboard", shortLabel: "Início", icon: LayoutDashboard },
  { id: "dividas", label: "Dívidas", shortLabel: "Dívidas", icon: Scale },
  { id: "cartoes", label: "Cartões de Crédito", shortLabel: "Cartões", icon: CreditCard },
  { id: "contas", label: "Contas e Carteiras", shortLabel: "Contas", icon: Wallet },
  { id: "categorias", label: "Categorias", shortLabel: "Categorias", icon: Tag },
  { id: "relatorios", label: "Relatórios", shortLabel: "Relatórios", icon: BarChart3 },
  { id: "assistente", label: "Assistente WhatsApp", shortLabel: "Assistente", icon: Bot },
]

export function GestorMoneyApp({
  mode = "real",
  customGateway,
}: {
  mode?: "real" | "synthetic"
  customGateway?: GestorMoneyGateway
}) {
  const gateway = React.useMemo(
    () => customGateway ?? (mode === "synthetic" ? createSyntheticGestorMoneyGateway() : createRealBoundaryGateway()),
    [mode, customGateway]
  )
  const studioTheme = React.useContext(StudioThemeContext)
  const { toast } = useToast()

  const [mounted, setMounted] = React.useState(false)
  const [fallbackDark, setFallbackDark] = React.useState(true)
  const [section, setSection] = React.useState<GestorMoneySection>("dashboard")
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [readiness, setReadiness] = React.useState<IntegrationReadiness | null>(null)
  const [perfis, setPerfis] = React.useState<PerfilResumo[]>([])
  const [perfilTipo, setPerfilTipo] = React.useState<TipoPerfilFinanceiro>("PESSOAL")
  const [snapshot, setSnapshot] = React.useState<ConsultaFinanceiraSnapshot | null>(null)
  const [assistenteConfig, setAssistenteConfig] = React.useState<AssistenteWhatsAppConfig | null>(null)
  const [lastFeedback, setLastFeedback] = React.useState<string | null>(null)

  // Quick Entry modal & Mobile "More" sheet
  const [quickEntryOpen, setQuickEntryOpen] = React.useState(false)
  const [quickEntryTab, setQuickEntryTab] = React.useState<QuickEntryTab>("despesa")
  const [quickEntryDividaId, setQuickEntryDividaId] = React.useState<string | undefined>(undefined)
  const [mobileMoreOpen, setMobileMoreOpen] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const seletorFromPerfil = React.useCallback((p: PerfilResumo): FinanceiroPerfilSeletor => {
    if (p.tipo === "PESSOAL") {
      return { tipo: "PESSOAL", perfilId: p.perfilId }
    }
    return { tipo: "EMPRESA", perfilId: p.perfilId, storeId: p.storeId }
  }, [])

  const loadData = React.useCallback(
    async (targetTipo: TipoPerfilFinanceiro, isRefresh = false) => {
      if (isRefresh) setRefreshing(true)
      else setLoading(true)
      try {
        const [rd, listaPerfis] = await Promise.all([gateway.obterReadiness(), gateway.listarPerfis()])
        setReadiness(rd)
        setPerfis(listaPerfis)

        const escolhido =
          listaPerfis.find((p) => p.tipo === targetTipo) ?? listaPerfis[0] ?? null
        if (!escolhido) {
          setSnapshot(null)
          setAssistenteConfig(null)
          return
        }

        const sel = seletorFromPerfil(escolhido)
        const [snap, assist] = await Promise.all([
          gateway.obterSnapshot(sel),
          gateway.obterAssistenteConfig(sel),
        ])
        setSnapshot(snap)
        setAssistenteConfig(assist)
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [gateway, seletorFromPerfil]
  )

  React.useEffect(() => {
    void loadData(perfilTipo)
  }, [loadData, perfilTipo])

  const handleSelectProfile = (novoTipo: TipoPerfilFinanceiro) => {
    if (novoTipo === perfilTipo) return
    setPerfilTipo(novoTipo)
    setLastFeedback(null)
    toast({
      title: `Escopo alternado para ${novoTipo === "PESSOAL" ? "Pessoal" : "Empresa"}`,
      description:
        novoTipo === "PESSOAL"
          ? "Dados estritamente isolados no cofre pessoal (sem loja vinculada · G001)."
          : "Dados estritamente isolados no escopo empresarial da loja ativa (G001).",
    })
  }

  const handleOpenQuickEntry = (
    tab: QuickEntryTab = "despesa",
    preset?: { dividaId?: string }
  ) => {
    setQuickEntryTab(tab)
    setQuickEntryDividaId(preset?.dividaId)
    setQuickEntryOpen(true)
  }

  const handleOperationSuccess = async (feedback: OperacaoFeedback) => {
    setLastFeedback(`${feedback.mensagem} (${feedback.contratoG004})`)
    toast({
      title: "Operação registrada",
      description: `${feedback.mensagem} · Contrato ${feedback.contratoG004}`,
    })
    await loadData(perfilTipo, true)
  }

  const isDark = mounted
    ? studioTheme
      ? !["light", "classic", "soft-ice", "neon-ice", "violet-ice", "coffee-cream"].includes(studioTheme.mode)
      : fallbackDark
    : true

  const toggleTheme = () => {
    if (studioTheme) {
      studioTheme.setMode(isDark ? "soft-ice" : "black")
    } else {
      setFallbackDark((d) => !d)
    }
  }

  const perfilAtivo = snapshot?.perfil ?? perfis.find((p) => p.tipo === perfilTipo) ?? null
  const activeNavItem = NAV_ITEMS.find((n) => n.id === section) ?? NAV_ITEMS[0]

  return (
    <div
      className="flex min-h-screen w-full flex-col bg-background text-foreground"
      data-testid="gestor-money-root"
      data-profile-scope={perfilAtivo?.tipo ?? "NONE"}
    >
      {/* Unmistakable synthetic validation banner — NEVER disguise simulated data as real */}
      {gateway.mode === "synthetic" && (
        <div
          data-testid="synthetic-mode-banner"
          className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/35 bg-amber-500/15 px-3 py-1.5 text-[11px] font-medium text-amber-900 dark:text-amber-200"
        >
          <div className="flex items-center gap-2">
            <FlaskConical className="h-3.5 w-3.5 shrink-0" />
            <span>
              <strong>AMBIENTE ISOLADO · DADOS SINTÉTICOS</strong> — Valores ilustrativos para validação da interface G006-5. Não são dados reais.
            </span>
          </div>
          <span className="rounded-full border border-amber-500/40 bg-background/60 px-2 py-0.5 font-mono text-[10px]">
            PR #405 pendente
          </span>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Desktop Sidebar Rail */}
        <aside className="sticky top-0 hidden h-screen w-[272px] shrink-0 flex-col border-r border-border bg-card/70 lg:flex">
          <div className="border-b border-border p-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-sm">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <h1 className="font-display text-base font-bold leading-tight tracking-tight text-foreground">
                  Gestor Money
                </h1>
                <p className="text-[11px] text-muted-foreground">Omni Premium · G001–G006</p>
              </div>
            </div>

            <div className="mt-4">
              <ProfileSwitcher
                perfis={perfis}
                ativo={perfilAtivo}
                onSelect={handleSelectProfile}
                disabled={loading || perfis.length === 0}
              />
            </div>

            <Button
              type="button"
              className="mt-3.5 w-full rounded-xl font-semibold shadow-sm"
              disabled={!snapshot}
              data-testid="desktop-quick-entry-btn"
              onClick={() => handleOpenQuickEntry("despesa")}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Lançamento rápido
            </Button>
          </div>

          <nav className="flex-1 space-y-1 p-3" aria-label="Módulos do Gestor Money">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              const active = section === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`nav-${item.id}`}
                  onClick={() => setSection(item.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                    active
                      ? "bg-primary/12 text-primary shadow-xs"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              )
            })}
          </nav>

          <div className="border-t border-border p-3">
            <div className="flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground">
                Tema {isDark ? "Escuro" : "Claro"}
              </span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-lg"
                onClick={toggleTheme}
                data-testid="theme-toggle-desktop"
                aria-label="Alternar tema claro ou escuro"
              >
                {isDark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </aside>

        {/* Main Column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Topbar (Desktop & Mobile) */}
          <header className="sticky top-0 z-30 border-b border-border bg-background/95 px-3.5 backdrop-blur-md sm:px-6">
            <div className="flex h-14 items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 text-white lg:hidden">
                  <Wallet className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate font-display text-sm font-bold text-foreground sm:text-base">
                    {activeNavItem.label}
                  </h2>
                  {perfilAtivo && (
                    <p className="hidden truncate text-[11px] text-muted-foreground sm:block">
                      {perfilAtivo.nomeExibicao} · {perfilAtivo.subtitulo}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 rounded-xl"
                  disabled={loading || refreshing}
                  onClick={() => void loadData(perfilTipo, true)}
                  aria-label="Atualizar dados"
                >
                  <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 rounded-xl lg:hidden"
                  onClick={toggleTheme}
                  data-testid="theme-toggle-mobile"
                  aria-label="Alternar tema"
                >
                  {isDark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Mobile Profile Switcher Sub-row (zero truncation at 390px) */}
            <div className="pb-2.5 lg:hidden">
              <ProfileSwitcher
                perfis={perfis}
                ativo={perfilAtivo}
                onSelect={handleSelectProfile}
                disabled={loading || perfis.length === 0}
              />
            </div>
          </header>

          {/* Operation Feedback Inline Strip */}
          {lastFeedback && (
            <div
              role="status"
              data-testid="operation-feedback-banner"
              className="mx-3.5 mt-3 flex items-center justify-between gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs text-emerald-700 dark:text-emerald-300 sm:mx-6"
            >
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {lastFeedback}
              </span>
              <button
                type="button"
                className="text-[11px] underline opacity-80 hover:opacity-100"
                onClick={() => setLastFeedback(null)}
              >
                Fechar
              </button>
            </div>
          )}

          {/* Main Content */}
          <main className="mx-auto w-full max-w-7xl flex-1 px-3.5 py-5 pb-24 sm:px-6 lg:pb-8">
            {loading ? (
              <DashboardSkeleton />
            ) : !snapshot ? (
              /* Honest Real-Mode Boundary: NEVER shows fake data when foundation PR #405 isn't merged */
              <div className="mx-auto max-w-3xl space-y-5 py-4" data-testid="real-boundary-pending-panel">
                <div className="rounded-2xl border border-amber-500/30 bg-card p-6 shadow-sm">
                  <div className="flex items-start gap-3.5">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                      <ShieldAlert className="h-5 w-5" />
                    </div>
                    <div className="space-y-1.5">
                      <h2 className="font-display text-lg font-bold text-foreground">
                        Gestor Money · Aguardando fundação G001–G006 (PR #405)
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {readiness?.mensagem ??
                          "Os contratos reais do motor financeiro G001–G006 ainda estão em reconciliação na PR #405 e a flag GESTOR_MONEY_ENABLED permanece desligada."}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Para manter integridade financeira absoluta, nenhum dado simulado é apresentado no modo real e todas as ações de escrita permanecem bloqueadas até a integração definitiva.
                      </p>
                    </div>
                  </div>
                </div>

                {readiness && (
                  <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                    <div className="mb-3 flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      <h3 className="font-display text-sm font-semibold text-foreground">
                        Matriz de prontidão dos contratos (G001–G007)
                      </h3>
                    </div>
                    <div className="space-y-2">
                      {readiness.contratos.map((c) => (
                        <div
                          key={c.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/80 bg-muted/20 px-3.5 py-2.5 text-xs"
                        >
                          <div>
                            <p className="font-semibold text-foreground">
                              <span className="mr-2 font-mono text-primary">{c.id}</span>
                              {c.nome}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {c.origem} — {c.detalhe}
                            </p>
                          </div>
                          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            <Lock className="h-3 w-3 text-amber-500" />
                            {c.disponivelNoRuntime ? "Disponível" : "Pendente"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                {section === "dashboard" && (
                  <DashboardView
                    snapshot={snapshot}
                    onOpenQuickEntry={(t, preset) => handleOpenQuickEntry(t, preset)}
                    onNavigate={(target) => setSection(target)}
                  />
                )}
                {section === "dividas" && (
                  <DebtsView
                    snapshot={snapshot}
                    gateway={gateway}
                    onOpenQuickEntry={(t) => handleOpenQuickEntry(t)}
                    onMutationSuccess={handleOperationSuccess}
                  />
                )}
                {section === "cartoes" && (
                  <CreditCardsView
                    snapshot={snapshot}
                    gateway={gateway}
                    onMutationSuccess={handleOperationSuccess}
                  />
                )}
                {section === "contas" && (
                  <AccountsWalletsView
                    snapshot={snapshot}
                    gateway={gateway}
                    onOpenQuickEntry={(t) => handleOpenQuickEntry(t)}
                    onMutationSuccess={handleOperationSuccess}
                  />
                )}
                {section === "categorias" && (
                  <CategoriesView
                    snapshot={snapshot}
                    gateway={gateway}
                    onMutationSuccess={handleOperationSuccess}
                  />
                )}
                {section === "relatorios" && <ReportsView snapshot={snapshot} />}
                {section === "assistente" && assistenteConfig && (
                  <AssistantSettingsView
                    snapshot={snapshot}
                    config={assistenteConfig}
                    gateway={gateway}
                    onSaved={handleOperationSuccess}
                  />
                )}
              </>
            )}
          </main>
        </div>
      </div>

      {/* Mobile Fixed Bottom Navigation + Central Quick-Entry FAB */}
      <nav
        aria-label="Navegação inferior mobile"
        data-testid="mobile-bottom-nav"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden"
      >
        <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center">
          <button
            type="button"
            data-testid="mobile-nav-dashboard"
            onClick={() => setSection("dashboard")}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-medium",
              section === "dashboard" ? "text-primary" : "text-muted-foreground"
            )}
          >
            <LayoutDashboard className="h-5 w-5" />
            <span>Início</span>
          </button>

          <button
            type="button"
            data-testid="mobile-nav-dividas"
            onClick={() => setSection("dividas")}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-medium",
              section === "dividas" ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Scale className="h-5 w-5" />
            <span>Dívidas</span>
          </button>

          <div className="flex items-center justify-center">
            <button
              type="button"
              disabled={!snapshot}
              data-testid="mobile-fab-quick-entry"
              aria-label="Lançamento rápido"
              onClick={() => handleOpenQuickEntry("despesa")}
              className="flex h-12 w-12 -translate-y-2.5 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg ring-4 ring-background transition-transform active:scale-95 disabled:opacity-45"
            >
              <Plus className="h-6 w-6" />
            </button>
          </div>

          <button
            type="button"
            data-testid="mobile-nav-cartoes"
            onClick={() => setSection("cartoes")}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-medium",
              section === "cartoes" ? "text-primary" : "text-muted-foreground"
            )}
          >
            <CreditCard className="h-5 w-5" />
            <span>Cartões</span>
          </button>

          <button
            type="button"
            data-testid="mobile-nav-mais"
            onClick={() => setMobileMoreOpen(true)}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-medium",
              ["contas", "categorias", "relatorios", "assistente"].includes(section)
                ? "text-primary"
                : "text-muted-foreground"
            )}
          >
            <Menu className="h-5 w-5" />
            <span>Mais</span>
          </button>
        </div>
      </nav>

      {/* Mobile "Mais" Drawer */}
      <Sheet open={mobileMoreOpen} onOpenChange={setMobileMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl pb-8">
          <SheetHeader className="text-left">
            <SheetTitle className="font-display text-base">Módulos do Gestor Money</SheetTitle>
          </SheetHeader>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            {NAV_ITEMS.filter((n) => ["contas", "categorias", "relatorios", "assistente"].includes(n.id)).map(
              (item) => {
                const Icon = item.icon
                const active = section === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`mobile-more-${item.id}`}
                    onClick={() => {
                      setSection(item.id)
                      setMobileMoreOpen(false)
                    }}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border p-3.5 text-left text-xs font-semibold transition-colors",
                      active
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border bg-card text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                )
              }
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Quick Entry Sheet */}
      {snapshot && (
        <QuickEntrySheet
          open={quickEntryOpen}
          onOpenChange={setQuickEntryOpen}
          initialTab={quickEntryTab}
          presetDividaId={quickEntryDividaId}
          snapshot={snapshot}
          gateway={gateway}
          onSuccess={handleOperationSuccess}
        />
      )}
    </div>
  )
}
