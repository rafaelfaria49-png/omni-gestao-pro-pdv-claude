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
  Trash2,
  Wand2,
  Zap,
} from "lucide-react"
import { useState } from "react"

type NavId = "projects" | "templates" | "images" | "train" | "settings"

const NAV: { id: NavId; label: string; icon: typeof Bot; badge?: string }[] = [
  { id: "projects", label: "Meus Projetos", icon: FolderKanban, badge: "12" },
  { id: "templates", label: "Templates Mágicos", icon: Wand2 },
  { id: "images", label: "Gerador de Imagens", icon: ImagePlus, badge: "Novo" },
  { id: "train", label: "Treinar IA", icon: GraduationCap },
  { id: "settings", label: "Configurações", icon: Settings },
]

const RECENT_CHATS = [
  "Relatório Mensal",
  "Campanha Dia das Mães",
  "Dúvida Estoque",
  "Promo iPhone 15",
  "Script WhatsApp",
  "Análise Concorrência",
  "Treino atendimento",
]

export function Sidebar({ onTemplatesClick }: { onTemplatesClick?: () => void }) {
  const [active, setActive] = useState<NavId>("projects")
  const pct = Math.round((2405 / 5000) * 100)

  return (
    <aside className="flex h-full w-[250px] flex-none flex-col border-r border-border bg-panel/80 backdrop-blur-xl">
      <div className="flex items-center gap-3 px-5 py-5">
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
        <div className="leading-tight">
          <h1 className="font-display text-base font-bold tracking-tight">IA Mestre</h1>
          <p className="flex items-center gap-1 text-[12px] text-muted-foreground">
            <Sparkles className="h-2.5 w-2.5" /> RafaCell · Pro
          </p>
        </div>
      </div>

      <nav className="scroll-elegant flex-1 overflow-y-auto px-3 pb-4 pt-2">
        <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Navegação</p>
        <ul className="space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon
            const isActive = active === item.id
            return (
              <li key={item.id}>
                <button
                  onClick={() => {
                    setActive(item.id)
                    if (item.id === "templates") onTemplatesClick?.()
                  }}
                  className="relative flex w-full items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-medium transition"
                  style={{ color: isActive ? "var(--color-primary-foreground)" : "var(--color-foreground)" }}
                  type="button"
                >
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
                </button>
              </li>
            )
          })}
        </ul>

        <div className="mt-5 border-t border-border/60 pt-4">
          <div className="flex items-center justify-between px-2 pb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Chats Recentes</p>
            <span className="text-[11px] font-medium text-muted-foreground/70">{RECENT_CHATS.length}</span>
          </div>
          <ul className="space-y-0.5">
            {RECENT_CHATS.map((chat) => (
              <li key={chat}>
                <button
                  className="group/chat flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  type="button"
                >
                  <MessageSquare className="h-3.5 w-3.5 flex-none opacity-60" />
                  <span className="flex-1 truncate">{chat}</span>
                  <span className="flex h-6 w-6 flex-none items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover/chat:opacity-100">
                    <Trash2 className="h-3 w-3" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className="m-3 mt-2 rounded-2xl border border-border bg-card p-4 shadow-elegant">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-primary shadow-glow">
              <Zap className="h-3.5 w-3.5 text-primary-foreground" />
            </span>
            <span className="text-xs font-semibold">Créditos</span>
          </div>
          <span className="text-[10px] font-medium text-muted-foreground">{pct}%</span>
        </div>
        <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            className="h-full rounded-full bg-gradient-primary"
          />
        </div>
        <div className="flex items-baseline justify-between text-[11px] text-muted-foreground">
          <span>
            <span className="font-semibold text-foreground">2.405</span> / 5.000
          </span>
          <button
            className="inline-flex h-7 items-center gap-1.5 rounded-full bg-gradient-primary px-3 text-[12px] font-semibold text-primary-foreground shadow-elegant transition hover:opacity-90 hover:shadow-glow"
            type="button"
          >
            <Zap className="h-3.5 w-3.5" />
            Upgrade
          </button>
        </div>
      </div>
    </aside>
  )
}

