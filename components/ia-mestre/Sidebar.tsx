"use client"

import { motion } from "framer-motion"
import {
  Bot,
  FolderKanban,
  GraduationCap,
  ImagePlus,
  MessageSquare,
  Settings,
  Sparkles,
  Wand2,
  Zap,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useUserCredits } from "@/hooks/useUserCredits"
import { useIaMestreChat } from "@/components/ia-mestre/IaMestreChatContext"
import { cn } from "@/lib/utils"

type NavId = "projects" | "templates" | "images" | "train" | "settings"

const NAV: { id: NavId; label: string; icon: typeof Bot; badge?: string; href?: string }[] = [
  {
    id: "projects",
    label: "Meus Projetos",
    icon: FolderKanban,
    badge: "Local",
    href: "/dashboard/ia-mestre/projetos",
  },
  { id: "templates", label: "Templates Mágicos", icon: Wand2 },
  {
    id: "images",
    label: "Gerador de Imagens",
    icon: ImagePlus,
    badge: "Em breve",
    href: "/dashboard/ia-mestre/gerador-imagens",
  },
  {
    id: "train",
    label: "Treinar IA",
    icon: GraduationCap,
    badge: "Local",
    href: "/dashboard/ia-mestre/treinar",
  },
  { id: "settings", label: "Configurações", icon: Settings, href: "/dashboard/ia-mestre/configuracoes" },
]

function fmtRelative(iso: string) {
  try {
    const d = new Date(iso)
    const diff = Date.now() - d.getTime()
    if (diff < 86_400_000) {
      return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    }
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
  } catch {
    return ""
  }
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { credits, loading: creditsLoading, error: creditsError } = useUserCredits()
  const {
    conversations,
    listLoading,
    listError,
    storeRequiredError,
    activeConversationId,
    setActiveConversationId,
  } = useIaMestreChat()

  const openTemplates = () => {
    if (pathname === "/dashboard/ia-mestre") {
      window.dispatchEvent(new Event("ia-mestre-open-templates"))
    } else {
      router.push("/dashboard/ia-mestre?templates=1")
    }
  }

  const openConversation = (id: string) => {
    setActiveConversationId(id)
    if (pathname !== "/dashboard/ia-mestre") {
      router.push(`/dashboard/ia-mestre?c=${encodeURIComponent(id)}`)
    } else {
      window.dispatchEvent(new CustomEvent("ia-mestre-open-conversation", { detail: { id } }))
    }
  }

  const navActive = (item: (typeof NAV)[number]) => {
    if (!item.href) return false
    if (item.href === "/dashboard/ia-mestre/projetos") return pathname.startsWith("/dashboard/ia-mestre/projetos")
    return pathname === item.href || pathname.startsWith(`${item.href}/`)
  }

  return (
    <aside className="flex h-full w-[250px] flex-none flex-col border-r border-border bg-panel/80 backdrop-blur-xl">
      <div className="flex items-center gap-3 px-5 py-5">
        <Link href="/dashboard/ia-mestre" className="shrink-0" onClick={() => setActiveConversationId(null)}>
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow"
          >
            <Bot className="h-5 w-5 text-primary-foreground" />
            <span
              className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-panel"
              style={{ background: "var(--color-primary-glow)" }}
            />
          </motion.div>
        </Link>
        <div className="min-w-0 leading-tight">
          <Link
            href="/dashboard/ia-mestre"
            className="block font-display text-base font-bold tracking-tight"
            onClick={() => setActiveConversationId(null)}
          >
            IA Mestre
          </Link>
          <p className="flex items-center gap-1 text-[12px] text-muted-foreground">
            <Sparkles className="h-2.5 w-2.5 shrink-0" /> Assistente ERP
          </p>
        </div>
      </div>

      <nav className="scroll-elegant flex-1 overflow-y-auto px-3 pb-4 pt-2">
        <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Navegação</p>
        <ul className="space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon
            const isActive = item.id === "templates" ? false : navActive(item)
            const inner = (
              <>
                {isActive ? (
                  <motion.span
                    layoutId="sidebar-active-pill"
                    className="absolute inset-0 -z-10 rounded-xl bg-gradient-primary shadow-elegant"
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                ) : null}
                <Icon
                  className="h-4 w-4 flex-none"
                  style={{ color: isActive ? "var(--color-primary-foreground)" : "var(--color-muted-foreground)" }}
                />
                <span className="flex-1 text-left">{item.label}</span>
                {item.badge ? (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                    style={{
                      background: isActive
                        ? "color-mix(in oklab, var(--color-primary-foreground) 22%, transparent)"
                        : "var(--color-muted)",
                      color: isActive ? "var(--color-primary-foreground)" : "var(--color-muted-foreground)",
                    }}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </>
            )

            return (
              <li key={item.id}>
                {item.href ? (
                  <Link
                    href={item.href}
                    className="relative flex w-full items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-medium transition"
                    style={{ color: isActive ? "var(--color-primary-foreground)" : "var(--color-foreground)" }}
                  >
                    {inner}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => openTemplates()}
                    className="relative flex w-full items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-medium transition"
                    style={{ color: "var(--color-foreground)" }}
                  >
                    {inner}
                  </button>
                )}
              </li>
            )
          })}
        </ul>

        <div className="mt-5 border-t border-border/60 pt-4">
          <div className="flex items-center justify-between px-2 pb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Conversas</p>
            {!listLoading ? (
              <span className="text-[11px] font-medium text-muted-foreground/70">{conversations.length}</span>
            ) : null}
          </div>
          {storeRequiredError ? (
            <p className="rounded-lg border border-border/80 bg-muted/20 px-3 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
              {storeRequiredError}
            </p>
          ) : listLoading ? (
            <p className="px-2 py-2 text-[12px] text-muted-foreground">Carregando conversas…</p>
          ) : listError ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              {listError}
            </p>
          ) : conversations.length === 0 ? (
            <p className="px-2 py-2 text-[12px] leading-relaxed text-muted-foreground">
              Nenhuma conversa salva nesta unidade. Envie a primeira mensagem no chat.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {conversations.map((chat) => {
                const selected = activeConversationId === chat.id
                return (
                  <li key={chat.id}>
                    <button
                      type="button"
                      onClick={() => openConversation(chat.id)}
                      className={cn(
                        "flex w-full min-w-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition",
                        selected
                          ? "bg-gradient-primary text-primary-foreground shadow-elegant"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <MessageSquare className="h-3.5 w-3.5 flex-none opacity-70" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{chat.title || "Nova conversa"}</span>
                        {chat.preview ? (
                          <span
                            className={cn(
                              "mt-0.5 block truncate text-[10px] font-normal",
                              selected ? "text-primary-foreground/80" : "text-muted-foreground",
                            )}
                          >
                            {chat.preview}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-[10px] tabular-nums",
                          selected ? "text-primary-foreground/80" : "text-muted-foreground/70",
                        )}
                      >
                        {fmtRelative(chat.updatedAt)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </nav>

      <div className="m-3 mt-2 rounded-2xl border border-border bg-card p-4 shadow-elegant">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-primary shadow-glow">
            <Zap className="h-3.5 w-3.5 text-primary-foreground" />
          </span>
          <span className="text-xs font-semibold">Créditos (usuário)</span>
        </div>
        {creditsLoading ? (
          <p className="text-[11px] text-muted-foreground">Carregando saldo…</p>
        ) : creditsError ? (
          <p className="text-[11px] text-muted-foreground">{creditsError}</p>
        ) : (
          <p className="text-xl font-semibold tabular-nums text-foreground">
            {(credits ?? 0).toLocaleString("pt-BR")}
          </p>
        )}
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
          Chat e imagem debitam após resposta bem-sucedida da IA.
        </p>
        <Link
          href="/dashboard/creditos"
          className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-full border border-border bg-background/80 text-[12px] font-semibold text-foreground transition hover:bg-muted"
        >
          <Zap className="h-3.5 w-3.5" />
          Ver créditos
        </Link>
      </div>
    </aside>
  )
}
