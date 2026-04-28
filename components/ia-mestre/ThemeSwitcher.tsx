"use client"

import { motion } from "framer-motion"
import { Moon, Snowflake, Sun, Terminal } from "lucide-react"
import { useTheme, type Theme } from "./ThemeProvider"

const options: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "soft-ice", label: "Soft Ice", icon: Snowflake },
  { value: "midnight", label: "Midnight", icon: Moon },
  { value: "black-edition", label: "Black", icon: Terminal },
]

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="relative inline-flex items-center gap-1 rounded-full border border-border bg-surface/70 p-1 backdrop-blur-md">
      {options.map((opt) => {
        const Icon = opt.icon
        const active = theme === opt.value
        return (
          <button
            key={opt.value}
            onClick={() => setTheme(opt.value)}
            className="relative z-10 flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors"
            style={{
              color: active ? "var(--color-primary-foreground)" : "var(--color-muted-foreground)",
            }}
            aria-label={opt.label}
            type="button"
          >
            {active ? (
              <motion.span
                layoutId="theme-pill"
                className="absolute inset-0 -z-10 rounded-full bg-gradient-primary shadow-elegant"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            ) : null}
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}

