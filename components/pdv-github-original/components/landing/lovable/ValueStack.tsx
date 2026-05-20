import { Check, Sparkles, TrendingDown, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

const benefits = [
  "ChatGPT, Claude, Gemini, Midjourney e HeyGen",
  "Acesso completo à OmniAcademy (vídeos práticos)",
  "+500 Templates Mágicos para Vendas e Estoque",
  "Sistema completo de PDV e Notas Fiscais",
];

const separateCosts = [
  { name: "ChatGPT Plus", price: 120 },
  { name: "Claude Pro", price: 110 },
  { name: "Gemini Advanced", price: 115 },
  { name: "Midjourney", price: 160 },
  { name: "HeyGen", price: 150 },
  { name: "ERP + PDV", price: 180 },
];

export function ValueStack({ onCta }: { onCta: () => void }) {
  return (
    <section className="relative py-20">
      <div className="mx-auto max-w-6xl px-4">
        <div className="glass-strong animated-border relative overflow-hidden rounded-3xl p-8 md:p-12">
          {/* background glow */}
          <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-neon-green/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-neon-blue/20 blur-3xl" />

          <div className="relative grid gap-10 lg:grid-cols-2 lg:items-center">
            {/* LEFT: Copy + benefits */}
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-neon-green/30 bg-neon-green/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-neon-green">
                <Sparkles className="h-3 w-3" />
                Oferta Irresistível
              </div>

              <h2 className="mt-4 text-3xl font-bold leading-tight md:text-5xl">
                As inteligências{" "}
                <span className="text-gradient-neon">mais avançadas do mundo</span>{" "}
                em um só lugar.{" "}
                <span className="text-muted-foreground">Por uma fração do preço.</span>
              </h2>

              <ul className="mt-8 space-y-3">
                {benefits.map((b) => (
                  <li key={b} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[image:var(--gradient-neon)] shadow-[0_0_14px_-2px_oklch(0.85_0.25_145)]">
                      <Check className="h-3 w-3 text-neutral-950" strokeWidth={3} />
                    </span>
                    <span className="text-sm md:text-base text-foreground/90">{b}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* RIGHT: Savings math */}
            <div className="glass rounded-2xl p-6 md:p-8">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                <TrendingDown className="h-3.5 w-3.5 text-destructive" />
                A matemática da economia
              </div>

              <div className="mt-5 space-y-2.5">
                {separateCosts.map((c) => (
                  <div
                    key={c.name}
                    className="flex items-center justify-between text-sm text-muted-foreground"
                  >
                    <span className="line-through decoration-destructive/60">{c.name}</span>
                    <span className="line-through decoration-destructive/60">
                      R$ {c.price.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-5 border-t border-white/10 pt-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-destructive">Assinar tudo separado</span>
                  <span className="text-xl font-bold text-destructive line-through">
                    R$ 725,00<span className="text-sm font-normal">/mês</span>
                  </span>
                </div>

                <div className="mt-4 rounded-xl border border-neon-green/40 bg-neon-green/10 p-4 shadow-[0_0_30px_-8px_oklch(0.85_0.25_145)]">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-neon-green">
                    <Zap className="h-3.5 w-3.5" />
                    No OmniGestão Pro
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-sm text-neon-green">A partir de</span>
                    <span className="text-4xl font-bold text-neon-green">R$ 59,90</span>
                    <span className="text-sm text-neon-green/80">/mês</span>
                  </div>
                  <p className="mt-2 text-xs text-neon-green/80">
                    Economia de mais de R$ 665/mês · até 91% OFF
                  </p>
                </div>

                <Button
                  onClick={onCta}
                  variant="neon"
                  size="lg"
                  className="mt-5 w-full"
                >
                  Começar teste grátis de 7 dias
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
