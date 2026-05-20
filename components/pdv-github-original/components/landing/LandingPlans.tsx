"use client"

import { cn } from "@/lib/utils"

// TODO: substituir este conteúdo pelo código exportado do Lovable
export function LandingPlans() {
  const cards = [
    { title: "Essencial", desc: "Operação e controle do dia a dia." },
    { title: "Pro", desc: "Crescimento com automações e IA." },
    { title: "Enterprise", desc: "Rede de lojas, governança e suporte premium." },
  ]

  return (
    <section className="px-6 py-10">
      <div className="mx-auto w-full max-w-6xl">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Planos</h2>
        <p className="mt-1 text-sm text-muted-foreground">Estrutura pronta para receber o layout final do Lovable.</p>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          {cards.map((c, idx) => (
            <div
              key={c.title}
              className={cn(
                "rounded-2xl border border-border bg-background/70 p-5 shadow-card backdrop-blur",
                idx === 1 ? "ring-1 ring-primary/25" : ""
              )}
            >
              <div className="text-sm font-semibold text-foreground">{c.title}</div>
              <div className="mt-1 text-sm text-muted-foreground">{c.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

