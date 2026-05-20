"use client"

import { Button } from "@/components/ui/button"

// TODO: substituir este conteúdo pelo código exportado do Lovable
export function LandingHero() {
  return (
    <section className="px-6 pt-14 pb-10">
      <div className="mx-auto w-full max-w-6xl">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">OmniGestão Pro</p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          ERP, marketing, inteligência artificial e vendas em múltiplos canais trabalhando por você 24h.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Uma base enxuta e escalável para receber a Landing Page exportada do Lovable sem misturar com o dashboard.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button className="h-11 rounded-xl px-5">Começar teste grátis</Button>
          <Button variant="outline" className="h-11 rounded-xl px-5">
            Ver demo
          </Button>
        </div>
      </div>
    </section>
  )
}

