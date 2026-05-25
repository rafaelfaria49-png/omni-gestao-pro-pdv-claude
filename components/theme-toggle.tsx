"use client"

import * as React from "react"
import { Check, ChevronDown, Moon, Snowflake, Sun, Terminal, Sparkles, Coffee } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useStudioTheme, type StudioThemeMode } from "@/components/theme/ThemeProvider"
import { cn } from "@/lib/utils"

const themeOptions: Array<{
  value: Exclude<StudioThemeMode, "classic">
  label: string
  icon: typeof Sun
  swatch: string
}> = [
  { value: "light", label: "Light", icon: Sun, swatch: "bg-[oklch(0.98_0_0)]" },
  { value: "soft-ice", label: "Soft Ice", icon: Snowflake, swatch: "bg-[oklch(0.9_0.04_220)]" },
  { value: "midnight", label: "Midnight", icon: Moon, swatch: "bg-[oklch(0.76_0.22_235)]" },
  { value: "black", label: "Black", icon: Terminal, swatch: "bg-[oklch(0.82_0.22_145)]" },
  { value: "quantum-violet", label: "Quantum Violet", icon: Sparkles, swatch: "bg-[oklch(0.65_0.25_310)]" },
  { value: "coffee-gold", label: "Coffee Gold", icon: Coffee, swatch: "bg-[oklch(0.78_0.14_75)]" },
]

export function ThemeToggle() {
  const { mode, setMode } = useStudioTheme()
  const [mounted, setMounted] = React.useState(false)
  const current = mode === "classic" ? "light" : mode
  const selected = themeOptions.find((opt) => opt.value === current) ?? themeOptions[3]
  const SelectedIcon = selected.icon

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Button variant="ghost" size="sm" className="h-10 rounded-xl border border-border bg-card px-3">
        <Sun className="h-4 w-4" />
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 gap-2 rounded-xl border-border bg-card px-3 text-foreground shadow-card transition-smooth hover:bg-panel"
          aria-label="Selecionar tema"
        >
          <span className={cn("h-2.5 w-2.5 rounded-full ring-2 ring-border", selected.swatch)} />
          <SelectedIcon className="h-4 w-4 text-primary" />
          <span className="hidden text-xs font-semibold sm:inline">{selected.label}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 rounded-xl border-border bg-popover p-1 shadow-card">
        {themeOptions.map((option) => {
          const Icon = option.icon
          const active = option.value === current
          return (
            <DropdownMenuItem
              key={option.value}
              onClick={() => setMode(option.value)}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium"
            >
              <span className={cn("h-3 w-3 rounded-full ring-2 ring-border", option.swatch)} />
              <Icon className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1">{option.label}</span>
              {active ? <Check className="h-4 w-4 text-primary" /> : null}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
