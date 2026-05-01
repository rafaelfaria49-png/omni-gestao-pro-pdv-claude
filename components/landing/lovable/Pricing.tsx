import { useState, type ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { Check, Sparkles, Zap, Crown, Gem, Phone, Building2, ShieldCheck } from "lucide-react";

type Plan = {
  name: string;
  icon: ComponentType<{ className?: string }>;
  monthly: number;
  desc: string;
  features: string[];
  aiCredits: number; // 0-100 bar fill
  aiLabel: string;
  ctaLabel: string;
  highlighted?: boolean;
};

const plans: Plan[] = [
  {
    name: "Bronze",
    icon: Zap,
    monthly: 59.9,
    desc: "💡 Ideal para começar · 250 créditos ≈ até 50 conteúdos gerados",
    features: [
      "PDV Rápido",
      "Gestão de Estoque Básica",
      "1 Usuário",
      "Suporte via Chat",
    ],
    aiCredits: 25,
    aiLabel: "250 Créditos de IA/mês",
    ctaLabel: "Quero o Plano Bronze",
  },
  {
    name: "Prata",
    icon: Sparkles,
    monthly: 149.9,
    desc: "🚀 Para quem quer crescer · 700 créditos ≈ uso diário moderado",
    features: [
      "Tudo do Bronze",
      "Emissão de NF-e / NFC-e",
      "Relatórios de Vendas",
      "3 Usuários",
    ],
    aiCredits: 50,
    aiLabel: "700 Créditos de IA/mês",
    ctaLabel: "Quero Mais Vendas",
  },
  {
    name: "Ouro",
    icon: Crown,
    monthly: 279.9,
    desc: "🔥 Para escalar vendas · 2.000 créditos ≈ automações + marketing ativo",
    features: [
      "Tudo do Prata",
      "Estúdio de Marketing IA",
      "500+ Prompts Mágicos",
      "Multi-Lojas (Master Console)",
      "Automação de WhatsApp",
    ],
    aiCredits: 80,
    aiLabel: "2.000 Créditos de IA/mês",
    ctaLabel: "Quero Escalar Minhas Vendas",
    highlighted: true,
  },
  {
    name: "Diamante",
    icon: Gem,
    monthly: 499.9,
    desc: "💎 Uso profissional completo · 7.000 créditos ≈ uso pesado + IA avançada",
    features: [
      "Tudo do Ouro",
      "Avatares em Vídeo com IA",
      "IA Preditiva de Estoque",
      "Até 25 Lojas",
      "Acesso API & Integrações",
    ],
    aiCredits: 100,
    aiLabel: "7.000 Créditos de IA/mês",
    ctaLabel: "Quero a Gestão Completa",
  },
];

export function Pricing({
  onSelect,
  onCompare,
}: {
  onSelect: (plan: string) => void;
  onCompare?: () => void;
}) {
  const [annual, setAnnual] = useState(false);

  const price = (m: number) => {
    const v = annual ? m * 0.8 : m;
    return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <section id="pricing" className="relative py-24">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <div className="text-sm font-semibold uppercase tracking-widest text-neon-cyan">Planos</div>
          <h2 className="mt-3 text-4xl font-bold md:text-5xl">
            Escolha seu <span className="text-gradient-neon">poder de fogo</span>
          </h2>
          <p className="mt-4 text-muted-foreground">
            Comece com 7 dias grátis em qualquer plano. Sem cartão.
          </p>

          {/* Toggle */}
          <div className="glass mx-auto mt-8 inline-flex items-center gap-1 rounded-full p-1 text-sm">
            <button
              onClick={() => setAnnual(false)}
              className={`rounded-full px-5 py-2 transition ${!annual ? "bg-[image:var(--gradient-neon)] text-neutral-950 font-semibold" : "text-muted-foreground"}`}
            >
              Mensal
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`flex items-center gap-2 rounded-full px-5 py-2 transition ${annual ? "bg-[image:var(--gradient-neon)] text-neutral-950 font-semibold" : "text-muted-foreground"}`}
            >
              Anual
              <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${annual ? "bg-neutral-950/20 text-neutral-950" : "bg-neon-green/20 text-neon-green"}`}>
                -20%
              </span>
            </button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 items-stretch">
          {plans.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.name}
                className={`relative flex flex-col rounded-2xl p-6 transition ${
                  p.highlighted
                    ? "animated-border overflow-visible glass-strong glow-green lg:scale-105 lg:-my-2 animate-pulse-glow"
                    : "glass"
                }`}
              >
                {p.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[image:var(--gradient-neon)] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-neutral-950 shadow-[0_0_20px_-2px_oklch(0.85_0.25_145)]">
                    ⭐ Mais escolhido
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                    p.highlighted
                      ? "bg-[image:var(--gradient-neon)]"
                      : p.name === "Diamante"
                        ? "bg-[image:var(--gradient-ai)] shadow-[0_0_25px_-8px_var(--neon-violet)]"
                        : "glass"
                  }`}>
                    <Icon className={`h-4 w-4 ${p.highlighted || p.name === "Diamante" ? "text-neutral-950" : "text-neon-cyan"}`} />
                  </span>
                  <h3 className="text-xl font-bold">{p.name}</h3>
                </div>

                <p className="mt-3 text-sm text-muted-foreground">{p.desc}</p>

                <div className="mt-5">
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm text-muted-foreground">R$</span>
                    <span className="text-4xl font-bold tracking-tight">{price(p.monthly)}</span>
                    <span className="text-sm text-muted-foreground">/mês</span>
                  </div>
                  {annual && (
                    <p className="mt-1 text-xs text-neon-green">
                      Pago anualmente • Economize R$ {(p.monthly * 12 * 0.2).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </p>
                  )}
                </div>

                <Button
                  onClick={() => onSelect(p.name)}
                  variant={p.highlighted ? "neon" : "neonOutline"}
                  className="mt-6 w-full"
                  size="lg"
                >
                  {p.ctaLabel}
                </Button>

                <ul className="mt-6 space-y-2.5 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className={`mt-0.5 h-4 w-4 shrink-0 ${p.highlighted ? "text-neon-green" : "text-neon-blue"}`} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {/* AI Credits bar */}
                <div className="mt-auto pt-6">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Sparkles className="h-3 w-3 text-neon-cyan" /> Créditos de IA Mensais
                    </span>
                    <span className="text-neon-cyan font-medium">{p.aiLabel}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[image:var(--gradient-neon)]"
                      style={{ width: `${p.aiCredits}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Risk-free guarantee badge */}
        <div className="mt-8 flex justify-center">
          <div className="glass inline-flex items-center gap-3 rounded-full border border-neon-green/30 px-5 py-2.5 text-sm shadow-[0_0_30px_-12px_oklch(0.85_0.25_145)]">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neon-green/15">
              <ShieldCheck className="h-4 w-4 text-neon-green" />
            </span>
            <span>
              <span className="font-semibold text-foreground">Risco Zero:</span>{" "}
              <span className="text-muted-foreground">Garantia Incondicional de 7 Dias. Cancele quando quiser.</span>
            </span>
          </div>
        </div>

        {/* Enterprise Banner */}
        <div className="mt-10 w-full bg-slate-900 border border-slate-800 rounded-xl p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 hover:border-neon-blue/40 transition-colors">
          <div className="flex items-start gap-4">
            <span className="hidden sm:flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-neon-blue/10 border border-neon-blue/30">
              <Building2 className="h-5 w-5 text-neon-cyan" />
            </span>
            <div>
              <h3 className="text-xl font-bold">
                Precisa de volume para Agência ou Redes de Lojas?
              </h3>
              <p className="mt-1 text-muted-foreground max-w-2xl">
                Temos pacotes customizados acima de 8.000 créditos mensais, com suporte VIP e integrações dedicadas.
              </p>
            </div>
          </div>
          <Button
            variant="neonOutline"
            size="lg"
            asChild
            className="shrink-0"
          >
            <a
              href="https://wa.me/5500000000000?text=Quero%20conhecer%20o%20plano%20Enterprise%20do%20OmniGest%C3%A3o%20Pro"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Phone className="h-4 w-4" />
              Falar com Especialista
            </a>
          </Button>
        </div>

        <div className="mt-8 text-center space-y-3">
          <p className="text-xs text-muted-foreground">
            Pacotes de recarga de créditos avulsos disponíveis em todos os planos.
          </p>
          <div>
            <button
              type="button"
              onClick={() => onSelect("Créditos Extras")}
              className="inline-flex items-center gap-2 rounded-full border border-neon-cyan/30 bg-neon-cyan/5 px-4 py-2 text-sm text-neon-cyan hover:bg-neon-cyan/10 transition-colors"
            >
              👉 Comprar créditos extras
            </button>
          </div>
          <button
            type="button"
            onClick={onCompare}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-neon-cyan transition-colors"
          >
            Ver comparativo completo de recursos
            <span aria-hidden>→</span>
          </button>
        </div>
      </div>
    </section>
  );
}
