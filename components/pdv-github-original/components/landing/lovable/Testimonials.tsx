import { Star } from "lucide-react";

const testimonials = [
  {
    name: "Mariana Costa",
    role: "CEO • Boutique Aurora",
    initials: "MC",
    quote:
      "Em 60 dias minhas vendas subiram 42%. A IA gera os reels sozinha e eu só aprovo. Virou meu braço direito de marketing.",
    color: "from-neon-blue to-neon-cyan",
  },
  {
    name: "Rafael Mendes",
    role: "Fundador • TechStore BR",
    initials: "RM",
    quote:
      "Saí de 3 sistemas diferentes para UM só. Economizei R$ 1.800/mês e o PDV não trava nem na Black Friday.",
    color: "from-neon-green to-neon-cyan",
  },
  {
    name: "Juliana Araújo",
    role: "Diretora • Rede Moda+",
    initials: "JA",
    quote:
      "As automações preditivas me avisaram sobre um estoque crítico antes de eu perder venda. Isso é ouro.",
    color: "from-neon-cyan to-neon-blue",
  },
];

export function Testimonials() {
  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <div className="text-sm font-semibold uppercase tracking-widest text-neon-green">
            Quem usa, aprova
          </div>
          <h2 className="mt-3 text-4xl font-bold md:text-5xl">
            Lojistas que <span className="text-gradient-neon">venderam mais</span> com OmniGestão
          </h2>
          <p className="mt-4 text-muted-foreground">
            +12.000 lojas ativas em todo o Brasil.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {testimonials.map((t) => (
            <div
              key={t.name}
              className="glass relative flex flex-col rounded-2xl p-6 transition hover:-translate-y-1"
            >
              <div className="mb-4 flex gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className="h-4 w-4 fill-neon-green text-neon-green drop-shadow-[0_0_6px_oklch(0.85_0.25_145)]"
                  />
                ))}
              </div>

              <p className="flex-1 text-sm leading-relaxed text-foreground/90">
                "{t.quote}"
              </p>

              <div className="mt-5 flex items-center gap-3 border-t border-white/10 pt-4">
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br ${t.color} font-bold text-neutral-950`}
                >
                  {t.initials}
                </div>
                <div>
                  <div className="text-sm font-semibold">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
