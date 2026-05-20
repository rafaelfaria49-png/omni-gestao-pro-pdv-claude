import { AlertTriangle, Clock, FileX, TrendingDown, TrendingUp, Sparkles, Bell, BarChart3, Zap } from "lucide-react";

const hiddenCosts = [
  { name: "ChatGPT / IA", price: 120 },
  { name: "Automação", price: 150 },
  { name: "ERP + PDV", price: 180 },
  { name: "Marketing", price: 150 },
];

export function BeforeAfter() {
  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-6xl px-4">
        {/* Hidden costs block */}
        <div className="mx-auto mb-20 max-w-4xl">
          <div className="mb-8 text-center">
            <div className="text-sm font-semibold uppercase tracking-widest text-destructive">Alerta de Custo</div>
            <h2 className="mt-3 text-3xl font-bold md:text-5xl">
              💸 Você está <span className="text-destructive">pagando caro</span>{" "}
              <span className="text-muted-foreground">sem perceber…</span>
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-2 md:items-stretch">
            <div className="glass rounded-2xl border border-destructive/20 p-6 md:p-8">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-destructive">
                <TrendingDown className="h-3.5 w-3.5" />
                Assinaturas separadas
              </div>
              <ul className="mt-5 space-y-3">
                {hiddenCosts.map((c) => (
                  <li key={c.name} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{c.name}</span>
                    <span className="font-semibold text-destructive line-through decoration-destructive/50">
                      R$ {c.price}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-5">
                <span className="text-sm font-semibold">Total</span>
                <span className="text-3xl font-bold text-destructive">
                  R$ 700+<span className="text-sm font-normal">/mês</span>
                </span>
              </div>
            </div>

            <div className="glass-strong glow-green relative overflow-hidden rounded-2xl border border-neon-green/40 p-6 md:p-8">
              <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full blur-3xl" style={{ background: "color-mix(in oklab, var(--neon-green) 40%, transparent)" }} />
              <div className="relative">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-neon-green">
                  <Zap className="h-3.5 w-3.5" />
                  No OmniGestão Pro
                </div>
                <p className="mt-5 text-xl font-bold md:text-2xl">
                  ⚡ Tudo isso por uma <span className="text-gradient-neon">fração do preço</span>
                </p>
                <div className="mt-6 flex items-baseline gap-2">
                  <span className="text-sm text-neon-green">A partir de</span>
                  <span className="text-5xl font-bold text-neon-green">R$ 59,90</span>
                  <span className="text-sm text-neon-green/80">/mês</span>
                </div>
                <p className="mt-3 text-sm text-neon-green/80">
                  Economia de mais de <span className="font-semibold">R$ 640/mês</span> · até 91% OFF
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto mb-16 max-w-2xl text-center">
          <div className="text-sm font-semibold uppercase tracking-widest text-neon-cyan">A Transformação</div>
          <h2 className="mt-3 text-4xl font-bold md:text-5xl">
            Sua loja hoje <span className="text-muted-foreground">vs.</span> Com{" "}
            <span className="text-gradient-neon">OmniGestão</span>
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* BEFORE */}
          <div className="relative overflow-hidden rounded-2xl border border-destructive/30 bg-destructive/5 p-8">
            <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full bg-destructive/20 blur-3xl" />
            <div className="relative">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-destructive/20 px-3 py-1 text-xs font-medium text-destructive-foreground">
                <AlertTriangle className="h-3.5 w-3.5" /> Antes
              </div>
              <h3 className="text-2xl font-bold">Caos operacional</h3>
              <p className="mt-2 text-muted-foreground">Tempo perdido, vendas paradas, decisões no escuro.</p>

              <ul className="mt-6 space-y-4">
                {[
                  { i: FileX, t: "Planilhas manuais e papelada" },
                  { i: Clock, t: "Horas perdidas em tarefas repetitivas" },
                  { i: TrendingDown, t: "Redes sociais paradas, zero engajamento" },
                  { i: AlertTriangle, t: "Estoque desencontrado e rupturas" },
                ].map(({ i: Icon, t }) => (
                  <li key={t} className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/15 text-destructive">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-sm">{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* AFTER */}
          <div className="relative overflow-hidden rounded-2xl border border-neon-green/40 p-8 glow-green">
            <div className="absolute inset-0 bg-[image:var(--gradient-card)]" />
            <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full blur-3xl" style={{ background: "color-mix(in oklab, var(--neon-green) 40%, transparent)" }} />
            <div className="relative">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-neon-green/20 px-3 py-1 text-xs font-medium text-neon-green">
                <Sparkles className="h-3.5 w-3.5" /> Depois
              </div>
              <h3 className="text-2xl font-bold">Crescimento automatizado</h3>
              <p className="mt-2 text-muted-foreground">IA que executa. Dashboards que decidem. Tempo que volta.</p>

              <ul className="mt-6 space-y-4">
                {[
                  { i: TrendingUp, t: "Gráficos subindo em tempo real" },
                  { i: Sparkles, t: "Conteúdo criado por IA automaticamente" },
                  { i: Bell, t: "Notificações de venda enquanto você dorme" },
                  { i: BarChart3, t: "Decisões baseadas em dados, não em achismo" },
                ].map(({ i: Icon, t }) => (
                  <li key={t} className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-neon-green/15 text-neon-green">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-sm">{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
