"use client"

import { Button } from "@/components/ui/button"

// TODO: substituir este conteúdo pelo código exportado do Lovable
export function LandingCTA() {
  return (
    <section className="px-6 pb-16 pt-6">
      <div className="mx-auto w-full max-w-6xl">
        <div className="rounded-2xl border border-border bg-muted/20 p-6 shadow-card">
          <div className="text-lg font-semibold tracking-tight text-foreground">Pronto para começar?</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Comece seu teste grátis e veja o OmniGestão Pro em ação.
          </p>
          <div className="mt-4">
            <Button className="h-11 rounded-xl px-5">Começar teste grátis</Button>
          </div>
        </div>
      </div>
    </section>
  )
}

