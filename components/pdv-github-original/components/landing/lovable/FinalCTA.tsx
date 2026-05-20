import { Button } from "@/components/ui/button";
import { ArrowRight, Clock, Flame, ShoppingCart } from "lucide-react";

export function FinalCTA({ onCta }: { onCta: () => void }) {
  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-5xl px-4">
        {/* Urgency banner */}
        <div className="mb-8 grid gap-3 md:grid-cols-2">
          <div className="glass flex items-center gap-3 rounded-xl border border-neon-violet/30 px-5 py-4">
            <Clock className="h-5 w-5 shrink-0 text-neon-violet" />
            <span className="text-sm md:text-base">
              ⏳ <span className="font-semibold">Oferta válida por tempo limitado</span>
            </span>
          </div>
          <div className="glass flex items-center gap-3 rounded-xl border border-neon-green/30 px-5 py-4">
            <Flame className="h-5 w-5 shrink-0 text-neon-green" />
            <span className="text-sm md:text-base">
              🔥 <span className="font-semibold">+120 lojistas</span> começaram essa semana
            </span>
          </div>
        </div>

        <div className="glass-strong animated-border glow-green relative overflow-hidden rounded-3xl p-10 md:p-16 text-center">
          <div className="pointer-events-none absolute inset-0" style={{ background: "var(--gradient-hero)" }} />
          <div className="relative">
            <h2 className="text-3xl font-bold leading-tight md:text-5xl">
              🚀 Comece agora — leve sua loja para o{" "}
              <span className="text-gradient-neon">próximo nível com IA</span>
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-muted-foreground md:text-lg">
              Teste grátis por 7 dias. Sem cartão. Cancele com 1 clique.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button variant="neon" size="xl" onClick={onCta} className="group animate-pulse-glow">
                👉 Testar grátis agora
                <ArrowRight className="transition-transform group-hover:translate-x-1" />
              </Button>
              <Button variant="glass" size="xl" onClick={onCta}>
                <ShoppingCart className="h-4 w-4" />
                Comprar créditos extras
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
