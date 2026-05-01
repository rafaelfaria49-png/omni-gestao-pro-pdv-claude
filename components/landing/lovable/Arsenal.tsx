import { Bot, CreditCard, Video, AlertCircle, Package, BarChart3, Sparkles, Heart, MessageCircle, QrCode, CheckCircle2 } from "lucide-react";

export function Arsenal() {
  return (
    <section id="arsenal" className="relative py-24">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <div className="text-sm font-semibold uppercase tracking-widest text-neon-cyan">O Arsenal</div>
          <h2 className="mt-3 text-4xl font-bold md:text-5xl">
            🔥 Tudo que sua loja precisa para crescer, <span className="text-gradient-neon">em um só lugar</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-6 md:grid-rows-[auto_auto]">
          {/* Marketing IA - large */}
          <div className="glass relative overflow-hidden rounded-2xl p-7 md:col-span-3 md:row-span-2">
            <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full blur-3xl" style={{ background: "color-mix(in oklab, var(--neon-blue) 45%, transparent)" }} />
            <div className="relative">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-neon-blue/10 px-3 py-1 text-xs text-neon-cyan">
                <Video className="h-3.5 w-3.5" /> Estúdio IA
              </div>
              <h3 className="text-2xl font-bold">Marketing que gera conteúdo sozinho</h3>
              <p className="mt-2 text-muted-foreground">
                Vídeos verticais, reels e posts gerados por IA e publicados direto no Instagram, TikTok e Shorts.
              </p>

              {/* Phone + Instagram post mock */}
              <div className="mt-8 flex items-start justify-center gap-4">
                <div className="animate-float relative w-44 rounded-[2rem] border border-white/15 bg-black/60 p-2 shadow-[0_0_60px_-10px_oklch(0.75_0.22_230)]">
                  <div className="rounded-[1.6rem] overflow-hidden aspect-[9/16] bg-gradient-to-br from-neon-blue/30 via-background to-neon-green/30 relative">
                    <div className="absolute left-1/2 top-2 h-4 w-14 -translate-x-1/2 rounded-full bg-black" />
                    <div className="absolute bottom-4 left-3 right-3">
                      <div className="mb-2 h-1.5 w-3/4 rounded bg-white/60" />
                      <div className="h-1.5 w-1/2 rounded bg-white/40" />
                    </div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex h-14 w-14 items-center justify-center rounded-full bg-white/20 backdrop-blur">
                      <Sparkles className="h-6 w-6 text-neon-cyan" />
                    </div>
                  </div>
                </div>

                {/* Instagram post mock */}
                <div className="hidden sm:flex flex-col glass rounded-xl overflow-hidden w-40 shadow-[0_0_40px_-10px_oklch(0.85_0.25_145)]">
                  <div className="flex items-center gap-2 p-2">
                    <div className="h-6 w-6 rounded-full bg-[image:var(--gradient-neon)]" />
                    <div className="text-[10px] font-semibold">sua.loja</div>
                    <span className="ml-auto text-[9px] rounded px-1.5 py-0.5 bg-neon-green/20 text-neon-green">IA</span>
                  </div>
                  <div className="aspect-square bg-gradient-to-br from-neon-blue/40 via-neon-cyan/30 to-neon-green/40 relative">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-lg font-bold text-white drop-shadow-lg">-40% OFF</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 text-[10px] text-muted-foreground">
                    <Heart className="h-3 w-3 fill-red-500 text-red-500" /> 2.4k
                    <MessageCircle className="h-3 w-3" /> 187
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* PDV Ágil */}
          <div className="glass relative overflow-hidden rounded-2xl p-7 md:col-span-3">
            <div className="absolute -bottom-20 -left-20 h-48 w-48 rounded-full blur-3xl" style={{ background: "color-mix(in oklab, var(--neon-green) 50%, transparent)" }} />
            <div className="relative flex flex-col md:flex-row md:items-center md:gap-6">
              <div className="flex-1">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-neon-green/10 px-3 py-1 text-xs text-neon-green">
                  <CreditCard className="h-3.5 w-3.5" /> PDV Ágil
                </div>
                <h3 className="text-xl font-bold">Checkout aprovado em segundos</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">Venda rápido, sem travas, até offline.</p>
              </div>
              <div className="mt-4 md:mt-0 w-full md:w-52 shrink-0 glass rounded-xl p-3 text-xs">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>R$ 248,90</span></div>
                <div className="mt-1 flex justify-between font-semibold"><span>Total</span><span className="text-neon-green">R$ 248,90</span></div>
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-black/40 border border-white/10 p-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded bg-white">
                    <QrCode className="h-7 w-7 text-black" />
                  </div>
                  <div className="flex-1">
                    <div className="text-[10px] text-muted-foreground">Pix</div>
                    <div className="text-[10px] text-neon-green">Escaneie e pague</div>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-neon-green/20 border border-neon-green/40 py-1.5 text-neon-green font-semibold">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Venda concluída
                </div>
              </div>
            </div>
          </div>

          {/* IA Mestre */}
          <div className="glass relative overflow-hidden rounded-2xl p-7 md:col-span-3">
            <div className="absolute -top-16 -right-16 h-48 w-48 rounded-full blur-3xl" style={{ background: "color-mix(in oklab, var(--neon-cyan) 40%, transparent)" }} />
            <div className="relative">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-neon-cyan/10 px-3 py-1 text-xs text-neon-cyan">
                <Bot className="h-3.5 w-3.5" /> IA Mestre
              </div>
              <h3 className="text-xl font-bold">📊 Uma IA que analisa suas vendas e te ajuda a tomar decisões mais inteligentes</h3>

              <div className="mt-5 flex items-start gap-4">
                <div className="flex-1 space-y-2 text-sm">
                  <div className="glass ml-auto max-w-[90%] rounded-2xl rounded-tr-sm px-3 py-2 text-xs">
                    "Como estão minhas vendas?"
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[image:var(--gradient-neon)]">
                      <Sparkles className="h-2.5 w-2.5 text-neutral-950" />
                    </div>
                    <div className="rounded-2xl rounded-tl-sm bg-neon-blue/15 border border-neon-blue/30 px-3 py-2 text-xs">
                      <span className="flex items-center gap-1 text-neon-cyan">
                        <AlertCircle className="h-3 w-3" />
                        <strong>Estoque crítico</strong>
                      </span>
                      Camiseta P (3un). Reponha.
                    </div>
                  </div>
                </div>

                {/* Neon pie chart */}
                <div className="shrink-0 flex flex-col items-center">
                  <svg viewBox="0 0 42 42" className="h-20 w-20 -rotate-90 drop-shadow-[0_0_12px_oklch(0.75_0.22_230)]">
                    <circle cx="21" cy="21" r="15.9" fill="transparent" stroke="oklch(1 0 0 / 8%)" strokeWidth="6" />
                    <circle cx="21" cy="21" r="15.9" fill="transparent" stroke="oklch(0.85 0.25 145)" strokeWidth="6" strokeDasharray="55 100" strokeDashoffset="0" />
                    <circle cx="21" cy="21" r="15.9" fill="transparent" stroke="oklch(0.75 0.22 230)" strokeWidth="6" strokeDasharray="30 100" strokeDashoffset="-55" />
                    <circle cx="21" cy="21" r="15.9" fill="transparent" stroke="oklch(0.85 0.18 210)" strokeWidth="6" strokeDasharray="15 100" strokeDashoffset="-85" />
                  </svg>
                  <div className="mt-1 text-[10px] text-muted-foreground">Mix de vendas</div>
                </div>
              </div>
            </div>
          </div>

          {/* Extra row */}
          <div className="glass rounded-2xl p-6 md:col-span-2">
            <Package className="mb-3 h-6 w-6 text-neon-blue" />
            <h4 className="font-semibold">Multi-loja</h4>
            <p className="mt-1 text-sm text-muted-foreground">Unifique online + físico.</p>
          </div>
          <div className="glass rounded-2xl p-6 md:col-span-2">
            <BarChart3 className="mb-3 h-6 w-6 text-neon-green" />
            <h4 className="font-semibold">Relatórios em tempo real</h4>
            <p className="mt-1 text-sm text-muted-foreground">Decida com dados.</p>
          </div>
          <div className="glass rounded-2xl p-6 md:col-span-2">
            <Sparkles className="mb-3 h-6 w-6 text-neon-cyan" />
            <h4 className="font-semibold">Automações preditivas</h4>
            <p className="mt-1 text-sm text-muted-foreground">A IA antecipa demanda.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
