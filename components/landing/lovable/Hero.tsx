import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Check, Apple, Smartphone, Monitor } from "lucide-react";

export function Hero({ onCta }: { onCta: () => void }) {
  return (
    <section className="relative overflow-hidden pt-36 pb-24">
      <div className="absolute inset-0 grid-bg opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "var(--gradient-hero)" }}
      />

      <div className="relative mx-auto max-w-6xl px-4 text-center">
        <div className="glass mx-auto mb-8 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs">
          <Sparkles className="h-3.5 w-3.5 text-neon-cyan" />
          <span className="text-muted-foreground">Novo: IA Generativa + Vídeos com Avatares</span>
        </div>

        <h1 className="mx-auto max-w-4xl text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl">
          🔥 Sua loja{" "}
          <span className="text-gradient-neon">vendendo no automático</span>.
        </h1>

        <p className="mx-auto mt-7 max-w-2xl text-lg text-muted-foreground md:text-xl">
          ERP, marketing, inteligência artificial e vendas em{" "}
          <span className="text-foreground font-semibold">múltiplos canais</span> trabalhando por você{" "}
          <span className="text-neon-green font-semibold">24h</span>.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button variant="neon" size="xl" onClick={onCta} className="group animate-pulse-glow">
            🚀 Começar teste grátis de 7 dias
            <ArrowRight className="transition-transform group-hover:translate-x-1" />
          </Button>
          <Button variant="glass" size="xl" asChild>
            <a href="#arsenal">Ver recursos</a>
          </Button>
        </div>

        {/* Social proof */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <div className="flex -space-x-2">
            {[
              "from-neon-blue to-neon-cyan",
              "from-neon-violet to-neon-blue",
              "from-neon-green to-neon-cyan",
              "from-neon-cyan to-neon-violet",
              "from-neon-blue to-neon-green",
            ].map((g, i) => (
              <div
                key={i}
                className={`h-8 w-8 rounded-full bg-gradient-to-br ${g} ring-2 ring-background`}
              />
            ))}
          </div>
          <span className="text-sm text-muted-foreground">
            🚀 Junte-se a <span className="font-semibold text-foreground">+2.300 lojistas</span> faturando mais
          </span>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Check className="h-4 w-4 text-neon-green" />
            Setup em 5 minutos
          </div>
          <div className="flex items-center gap-1.5">
            <Check className="h-4 w-4 text-neon-green" />
            Cancele quando quiser
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
          <span>Disponível para</span>
          <div className="glass flex items-center gap-3 rounded-full px-4 py-1.5">
            <Monitor className="h-4 w-4 text-neon-cyan" />
            <span className="text-foreground/90">Web</span>
            <span className="text-white/20">•</span>
            <Apple className="h-4 w-4 text-neon-cyan" />
            <span className="text-foreground/90">iOS</span>
            <span className="text-white/20">•</span>
            <Smartphone className="h-4 w-4 text-neon-cyan" />
            <span className="text-foreground/90">Android</span>
          </div>
        </div>

        {/* Mock dashboard preview */}
        <div className="relative mx-auto mt-20 max-w-5xl">
          <div className="absolute inset-0 -z-10 blur-3xl" style={{ background: "var(--gradient-neon)", opacity: 0.25 }} />

          {/* Floating badges */}
          <div className="animate-float pointer-events-none absolute -left-4 top-10 z-10 hidden md:block">
            <div className="glass-strong flex items-center gap-2 rounded-xl px-3 py-2 text-xs shadow-[0_0_30px_-10px_oklch(0.85_0.25_145)]">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-neon-green/20">
                <Check className="h-3.5 w-3.5 text-neon-green" strokeWidth={3} />
              </div>
              <div className="text-left">
                <div className="text-[10px] text-muted-foreground">Venda aprovada</div>
                <div className="font-semibold text-neon-green">+R$ 489,00</div>
              </div>
            </div>
          </div>

          <div className="animate-float pointer-events-none absolute -right-4 top-32 z-10 hidden md:block" style={{ animationDelay: "1.2s" }}>
            <div className="glass-strong flex items-center gap-2 rounded-xl px-3 py-2 text-xs shadow-[0_0_30px_-10px_oklch(0.65_0.25_295)]">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[image:var(--gradient-ai)]">
                <Sparkles className="h-3.5 w-3.5 text-neutral-950" />
              </div>
              <div className="text-left">
                <div className="text-[10px] text-muted-foreground">IA Mestre</div>
                <div className="font-semibold text-neon-cyan">3 reels prontos</div>
              </div>
            </div>
          </div>

          <div className="glass-strong rounded-2xl border p-2">
            <div className="rounded-xl bg-background/60 p-6">
              <div className="mb-4 flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-destructive/60" />
                <div className="h-3 w-3 rounded-full bg-yellow-500/60" />
                <div className="h-3 w-3 rounded-full bg-neon-green/70" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { l: "Vendas hoje", v: "R$ 12.400", c: "text-neon-green" },
                  { l: "Pedidos", v: "284", c: "text-neon-blue" },
                  { l: "IA Insights", v: "17 novos", c: "text-neon-cyan" },
                ].map((k) => (
                  <div key={k.l} className="glass rounded-lg p-4 text-left">
                    <div className="text-xs text-muted-foreground">{k.l}</div>
                    <div className={`mt-1 text-2xl font-bold ${k.c}`}>{k.v}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 h-40 rounded-lg bg-gradient-to-br from-neon-blue/20 via-transparent to-neon-green/20">
                <svg viewBox="0 0 400 120" className="h-full w-full">
                  <defs>
                    <linearGradient id="g" x1="0" x2="1">
                      <stop offset="0" stopColor="oklch(0.75 0.22 230)" />
                      <stop offset="1" stopColor="oklch(0.85 0.25 145)" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0,90 L40,75 L80,80 L120,55 L160,60 L200,40 L240,45 L280,25 L320,30 L360,15 L400,10"
                    fill="none"
                    stroke="url(#g)"
                    strokeWidth="2.5"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
