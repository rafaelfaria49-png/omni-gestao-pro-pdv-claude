"use client"

import { useEffect, useMemo, useState } from "react"
import { Briefcase, Flame, Zap, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { GlassCard } from "@/components/studio/ui"
import { useToast } from "@/hooks/use-toast"
import { useStudioTheme } from "@/components/theme/ThemeProvider"
import { cn } from "@/lib/utils"

export type CreationPayload = { prompt: string; tone: string; product?: string }

type Props = {
  onGenerate: (args: CreationPayload) => void | Promise<void>
  generating?: boolean
  selectedProduct?: string
  onSelectProduct: (p?: string) => void
  onDbStatus?: (s: "unknown" | "connected" | "fallback") => void
}

const PRODUCTS = [
  "Smartwatch Aurora Pro",
  "Aurora Fit Mini",
  "Fone Nebula ANC",
  "Pulseira Magnetic Loop",
  "Carregador Turbo 30W",
]

export function CreationPanel({ onGenerate, generating, selectedProduct, onSelectProduct, onDbStatus }: Props) {
  const { toast } = useToast()
  const { mode } = useStudioTheme()
  const classic = mode === "classic" || mode === "light" || mode === "soft-ice"
  const [tone, setTone] = useState<"pro" | "irr" | "urg">("pro")
  const [extraPrompt, setExtraPrompt] = useState(
    "Lançamento da nova coleção de smartwatches premium. Destacar bateria de 14 dias e design minimalista."
  )
  const [products, setProducts] = useState<string[]>(PRODUCTS)
  const [productsBusy, setProductsBusy] = useState(false)

  const productValue = selectedProduct || products[0]
  const tones = useMemo(
    () => [
      { id: "pro", label: "Profissional", icon: Briefcase },
      { id: "irr", label: "Irreverente", icon: Flame },
      { id: "urg", label: "Urgência", icon: Zap },
    ],
    []
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setProductsBusy(true)
      onDbStatus?.("unknown")
      try {
        const r = await fetch("/api/produtos", { credentials: "include", cache: "no-store" })
        const j = (await r.json().catch(() => null)) as { produtos?: Array<{ name?: string }> } | null
        if (!r.ok || !j || !Array.isArray(j.produtos)) {
          throw new Error("Falha ao carregar produtos")
        }
        const names = j.produtos
          .map((p) => String(p?.name || "").trim())
          .filter(Boolean)
          .slice(0, 60)
        if (names.length === 0) throw new Error("Sem produtos cadastrados")
        if (cancelled) return
        setProducts(names)
        onDbStatus?.("connected")
        if (selectedProduct && !names.includes(selectedProduct)) {
          onSelectProduct(names[0])
        }
      } catch {
        if (!cancelled) {
          setProducts(PRODUCTS)
          onDbStatus?.("fallback")
        }
      } finally {
        if (!cancelled) setProductsBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [onDbStatus, onSelectProduct, selectedProduct])

  return (
    <GlassCard className="rounded-3xl p-5 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-xl border transition-colors duration-300",
                "border-border bg-panel"
              )}
            >
              <Wand2 className="h-4 w-4 text-fuchsia-600 dark:text-fuchsia-300" />
            </div>
            <h2
              className={cn(
                  "text-base font-semibold tracking-tight text-foreground transition-colors duration-300"
              )}
            >
              Painel de Criação IA
            </h2>
          </div>
          <p
            className={cn(
              "mt-1 text-sm transition-colors duration-300",
              "text-muted-foreground"
            )}
          >
            Descreva o post — a IA cuida da arte e legenda
          </p>
        </div>

        <div
          className={cn(
            "inline-flex items-center gap-2 rounded-full border border-border bg-panel px-3 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground transition-colors duration-300"
          )}
        >
          GPT • 50x
        </div>
      </div>

      <div className="mt-4">
        <Textarea
          value={extraPrompt}
          onChange={(e) => setExtraPrompt(e.target.value)}
          rows={9}
          maxLength={500}
          disabled={!!generating}
          className={cn(
            "min-h-[240px] resize-none rounded-2xl border px-5 py-4 text-base leading-relaxed backdrop-blur-xl transition-colors duration-300 focus-visible:ring-0 focus-visible:ring-offset-0",
            "border-border bg-card text-foreground placeholder:text-muted-foreground"
          )}
        />
        <div
          className={cn(
            "mt-2 flex items-center justify-end gap-2 text-[10px] transition-colors duration-300",
              "text-muted-foreground"
          )}
        >
          <Wand2 className="h-3.5 w-3.5 text-fuchsia-500/90 dark:text-fuchsia-400/80" />
          <span>{Math.min(extraPrompt.length, 500)}/500</span>
        </div>
      </div>

      <div className="mt-4">
        <p
          className={cn(
            "text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground transition-colors duration-300"
          )}
        >
          TOM DE VOZ
        </p>
        <div className="mt-2 grid grid-cols-3 gap-3">
          {tones.map((t) => {
            const active = tone === t.id
            const Icon = t.icon
            return (
              <Button
                key={t.id}
                type="button"
                variant="outline"
                onClick={() => setTone(t.id as "pro" | "irr" | "urg")}
                disabled={!!generating}
                className={cn(
                  "h-12 rounded-xl text-base transition-colors duration-300",
                  active
                    ? classic
                      ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
                      : "border-primary/40 bg-primary text-primary-foreground hover:bg-primary/90"
                    : classic
                      ? "border-border bg-card text-foreground hover:bg-muted/60"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "mr-2 h-4 w-4",
                    active
                      ? classic
                        ? "text-white"
                        : "text-primary-foreground"
                      : classic
                        ? "text-slate-500"
                        : "text-white/70"
                  )}
                />
                {t.label}
              </Button>
            )
          })}
        </div>
      </div>

      <div className="mt-4">
        <p
          className={cn(
            "text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground transition-colors duration-300"
          )}
        >
          PRODUTO
        </p>
        <div className="mt-2">
          <Select value={productValue} onValueChange={(v) => onSelectProduct(v)} disabled={!!generating}>
            <SelectTrigger
              className={cn(
                "h-12 rounded-2xl text-base backdrop-blur-xl transition-colors duration-300",
                "border-border bg-card text-foreground"
              )}
            >
              <SelectValue placeholder="Selecione um produto" />
            </SelectTrigger>
            <SelectContent>
              {products.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p
            className={cn(
              "mt-1 text-[11px] transition-colors duration-300",
              "text-muted-foreground"
            )}
          >
            {productsBusy ? "Sincronizando produtos…" : "Clique para alternar"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(["Carrossel", "#hashtags", "PT-BR"] as const).map((label) => (
          <span
            key={label}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold transition-colors duration-300",
              "border-border bg-panel text-muted-foreground"
            )}
          >
            {label}
          </span>
        ))}
      </div>

      <div className="mt-5">
        <Button
          type="button"
          disabled={!!generating}
          onClick={async () => {
            const p = extraPrompt.trim()
            if (!p) {
              toast({ title: "Descreva o post", description: "Digite um brief antes de gerar." })
              return
            }
            await onGenerate({ tone, product: productValue, prompt: p })
          }}
          className="h-14 w-full rounded-2xl bg-gradient-to-r from-fuchsia-600 via-fuchsia-500 to-pink-500 text-base font-semibold text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset,0_0_42px_rgba(236,72,153,0.45),0_0_80px_rgba(217,70,239,0.35),0_18px_50px_rgba(0,0,0,0.55)] transition-[filter,transform,colors] duration-300 hover:from-fuchsia-500 hover:via-fuchsia-400 hover:to-pink-400 hover:brightness-[1.03] active:scale-[0.99] disabled:opacity-60 dark:font-black"
        >
          <Wand2 className="mr-2 h-4 w-4" />
          {generating ? "Gerando Pack…" : "Gerar Pack de Crescimento"}
        </Button>
      </div>
    </GlassCard>
  )
}
