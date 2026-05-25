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

interface ThemeOption {
  value: Exclude<StudioThemeMode, "classic">
  label: string
  icon: React.ComponentType<{ className?: string }>
  swatch: string
}

interface ThemeFamily {
  name: string
  themes: ThemeOption[]
}

const themeFamilies: ThemeFamily[] = [
  {
    name: "Família Vermelha RafaCell",
    themes: [
      { value: "light", label: "Light", icon: Sun, swatch: "bg-[oklch(0.98_0_0)]" },
      { value: "ruby-black", label: "Ruby Black", icon: Moon, swatch: "bg-[oklch(0.60_0.25_25)]" },
    ]
  },
  {
    name: "Família Azul",
    themes: [
      { value: "soft-ice", label: "Soft Ice", icon: Snowflake, swatch: "bg-[oklch(0.9_0.04_220)]" },
      { value: "midnight", label: "Midnight", icon: Moon, swatch: "bg-[oklch(0.76_0.22_235)]" },
    ]
  },
  {
    name: "Família Verde Neon",
    themes: [
      { value: "neon-ice", label: "Neon Ice", icon: Sun, swatch: "bg-[oklch(0.70_0.20_145)]" },
      { value: "black", label: "Black", icon: Terminal, swatch: "bg-[oklch(0.82_0.22_145)]" },
    ]
  },
  {
    name: "Família Roxa",
    themes: [
      { value: "violet-ice", label: "Violet Ice", icon: Sun, swatch: "bg-[oklch(0.60_0.18_295)]" },
      { value: "quantum-violet", label: "Quantum Violet", icon: Sparkles, swatch: "bg-[oklch(0.65_0.25_310)]" },
    ]
  },
  {
    name: "Família Coffee",
    themes: [
      { value: "coffee-cream", label: "Coffee Cream", icon: Coffee, swatch: "bg-[oklch(0.66_0.12_65)]" },
      { value: "coffee-gold", label: "Coffee Gold", icon: Coffee, swatch: "bg-[oklch(0.78_0.14_75)]" },
    ]
  }
];

const themeOptions: ThemeOption[] = themeFamilies.flatMap((f) => f.themes);

export function ThemeToggle() {
  const { mode, setMode } = useStudioTheme()
  const [mounted, setMounted] = React.useState(false)
  const current = mode === "classic" ? "light" : mode
  const selected = themeOptions.find((opt) => opt.value === current) ?? themeOptions[0]
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
      <DropdownMenuContent align="end" className="w-56 rounded-xl border-border bg-popover p-1 shadow-card max-h-[380px] overflow-y-auto scroll-elegant">
        {themeFamilies.map((family) => (
          <div key={family.name} className="space-y-0.5">
            <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
              {family.name}
            </div>
            {family.themes.map((option) => {
              const Icon = option.icon
              const active = option.value === current
              return (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => setMode(option.value)}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium"
                >
                  <span className={cn("h-2.5 w-2.5 rounded-full ring-1 ring-border shrink-0", option.swatch)} />
                  <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate">{option.label}</span>
                  {active ? <Check className="h-3.5 w-3.5 text-primary shrink-0" /> : null}
                </DropdownMenuItem>
              )
            })}
            <div className="my-1 border-t border-border/40 last:hidden" />
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
