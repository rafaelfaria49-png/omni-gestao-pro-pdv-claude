import { Image, Video, Workflow, MessageCircle, Sparkles } from "lucide-react";

export function CreditsExplainer() {
  return (
    <section className="relative py-20">
      <div className="mx-auto max-w-5xl px-4">
        <div className="glass-strong animated-border relative overflow-hidden rounded-3xl p-8 md:p-12">
          <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-neon-cyan/15 blur-3xl" />

          <div className="relative text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-neon-cyan/30 bg-neon-cyan/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-neon-cyan">
              <Sparkles className="h-3 w-3" />
              Transparência Total
            </div>
            <h2 className="mt-4 text-3xl font-bold md:text-4xl">
              💡 Como funcionam os <span className="text-gradient-neon">créditos?</span>
            </h2>
            <p className="mt-4 text-muted-foreground md:text-lg">
              Você usa créditos apenas para tarefas <span className="text-foreground font-semibold">mais avançadas</span>, como:
            </p>
          </div>

          <div className="relative mt-10 grid gap-4 md:grid-cols-3">
            {[
              { icon: Image, title: "Criação de imagens", desc: "Artes, posts e banners com IA" },
              { icon: Video, title: "Vídeos com IA", desc: "Avatares, reels e narrações" },
              { icon: Workflow, title: "Automações", desc: "Fluxos de marketing e WhatsApp" },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="glass rounded-2xl p-6 text-center">
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-[image:var(--gradient-ai)]">
                  <Icon className="h-5 w-5 text-neutral-950" />
                </span>
                <div className="mt-3 font-semibold">{title}</div>
                <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>

          <div className="relative mt-8 flex items-center justify-center gap-3 rounded-xl border border-neon-green/30 bg-neon-green/10 px-5 py-4 text-center">
            <MessageCircle className="h-5 w-5 shrink-0 text-neon-green" />
            <p className="text-sm md:text-base">
              👉 O <span className="font-semibold text-neon-green">chat e o uso básico</span> continuam funcionando{" "}
              <span className="font-semibold">normalmente, sem consumir créditos.</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
