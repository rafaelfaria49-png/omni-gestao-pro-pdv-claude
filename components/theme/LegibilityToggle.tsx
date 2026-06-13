"use client"

import { Eye } from "lucide-react"
import { useLegibility } from "@/components/theme/LegibilityProvider"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/**
 * Botão de Alta Legibilidade para a Topbar (ao lado do ThemeSwitcher).
 * Alterna `data-legibility` entre normal/high — opt-in, persistido.
 */
export function LegibilityToggle() {
  const { mode, toggle, mounted } = useLegibility()

  if (!mounted) {
    // placeholder estável (evita mismatch de hidratação)
    return <div className="h-8 w-8 shrink-0" aria-hidden />
  }

  const active = mode === "high"

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={toggle}
            aria-pressed={active}
            aria-label="Alta legibilidade"
            className={cn(
              "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border backdrop-blur-md transition-all duration-200",
              active
                ? "border-primary/60 bg-primary/15 text-primary shadow-sm"
                : "border-border/80 bg-card/60 text-muted-foreground hover:text-foreground hover:border-border-hover"
            )}
          >
            <Eye className="h-4 w-4" strokeWidth={active ? 2.4 : 1.9} />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          className="z-50 max-w-[220px] border border-border bg-popover px-2.5 py-2 text-popover-foreground shadow-md"
        >
          <div className="text-[12px] font-semibold">Alta legibilidade</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            Melhora contraste e leitura em monitores antigos.
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
