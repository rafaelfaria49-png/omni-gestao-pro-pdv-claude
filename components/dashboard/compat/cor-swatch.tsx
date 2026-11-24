"use client"

/**
 * Representação visual (swatch) de cores de acessórios (domínio de produto, compatível com os
 * quatro temas do OmniGestão Pro via borda semântica `border-border`).
 */

import type { CSSProperties } from "react"
import { COR_VISUAL_DEFAULT_LOJA, COR_VISUAL_PRESETS, sanitizeCorVisual } from "@/lib/compat/cores-loja"
import { cn } from "@/lib/utils"

function swatchStyle(visual: string): CSSProperties {
  if (visual === "transparente") {
    return {
      backgroundImage:
        "linear-gradient(45deg, rgba(148,163,184,0.35) 25%, transparent 25%, transparent 75%, rgba(148,163,184,0.35) 75%), linear-gradient(45deg, rgba(148,163,184,0.35) 25%, transparent 25%, transparent 75%, rgba(148,163,184,0.35) 75%)",
      backgroundSize: "8px 8px",
      backgroundPosition: "0 0, 4px 4px",
    }
  }
  if (visual === "fume") {
    return {
      backgroundImage: "linear-gradient(135deg, rgba(30,41,59,0.82) 0%, rgba(100,116,139,0.45) 100%)",
    }
  }
  if (visual === "colorida") {
    return {
      backgroundImage: "conic-gradient(#EF4444, #EAB308, #22C55E, #3B82F6, #A855F7, #EC4899, #EF4444)",
    }
  }
  if (visual === "outra") {
    return {}
  }
  const safe = sanitizeCorVisual(visual) ?? COR_VISUAL_DEFAULT_LOJA
  return { backgroundColor: safe }
}

export function rotuloVisualCor(visual: string): string {
  if (visual === "transparente") return "Transparente"
  if (visual === "fume") return "Fumê"
  if (visual === "colorida") return "Colorida"
  if (visual === "outra") return "Livre"
  return sanitizeCorVisual(visual) ?? COR_VISUAL_DEFAULT_LOJA
}

export function CorSwatch({
  visual,
  size = "sm",
  className,
}: {
  visual: string
  size?: "xs" | "sm" | "md"
  className?: string
}) {
  const dims = size === "xs" ? "h-3 w-3" : size === "md" ? "h-5 w-5" : "h-3.5 w-3.5"
  return (
    <span
      aria-hidden
      data-cor-visual={visual}
      style={swatchStyle(visual)}
      className={cn(
        "inline-block shrink-0 rounded-full border border-border shadow-xs",
        visual === "outra" && "border-dashed bg-muted",
        dims,
        className,
      )}
    />
  )
}

export function CorVisualPicker({
  value,
  onChange,
  disabled = false,
  id,
  label = "Representação visual",
}: {
  value: string
  onChange: (visual: string) => void
  disabled?: boolean
  id?: string
  label?: string
}) {
  const hexValue = /^#[0-9A-F]{6}$/i.test(value) ? value : COR_VISUAL_DEFAULT_LOJA
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label
          htmlFor={id}
          className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground"
        >
          <CorSwatch visual={value} size="md" />
          <input
            id={id}
            type="color"
            aria-label={label}
            disabled={disabled}
            value={hexValue}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="h-5 w-7 cursor-pointer border-0 bg-transparent p-0"
          />
          <span className="font-mono text-[11px] text-muted-foreground">{rotuloVisualCor(value)}</span>
        </label>
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Estilos rápidos de cor">
          {COR_VISUAL_PRESETS.map((preset) => {
            const selected = value.toLowerCase() === preset.visual.toLowerCase()
            return (
              <button
                key={preset.visual}
                type="button"
                disabled={disabled}
                title={preset.label}
                aria-label={`Cor visual ${preset.label}`}
                aria-pressed={selected}
                onClick={() => onChange(preset.visual)}
                className={cn(
                  "grid h-6 w-6 place-items-center rounded-full border transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                  selected ? "scale-110 border-primary ring-2 ring-primary/40" : "border-border hover:scale-105",
                )}
              >
                <CorSwatch visual={preset.visual} size="sm" className="border-0" />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
