import { Play, Clock } from "lucide-react";

const lessons = [
  { t: "Configurando seu PDV", c: "neon-blue" },
  { t: "Criando seu 1º vídeo IA", c: "neon-green" },
  { t: "Integrando Instagram", c: "neon-cyan" },
  { t: "Automações de estoque", c: "neon-blue" },
  { t: "Relatórios avançados", c: "neon-green" },
];

export function Academy() {
  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto mb-14 max-w-3xl text-center">
          <div className="text-sm font-semibold uppercase tracking-widest text-neon-cyan">OmniAcademy</div>
          <h2 className="mt-3 text-4xl font-bold md:text-5xl">
            Você não estará sozinho.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Tutoriais rápidos de <span className="text-neon-green font-semibold">1 minuto</span> para dominar cada ferramenta.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {lessons.map((l) => (
            <div key={l.t} className="glass group relative overflow-hidden rounded-xl">
              <div className="aspect-video relative bg-gradient-to-br from-neon-blue/25 via-background to-neon-green/25">
                <div className="absolute inset-0 grid-bg opacity-50" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[image:var(--gradient-neon)] glow-blue transition-transform group-hover:scale-110">
                    <Play className="h-5 w-5 fill-neutral-950 text-neutral-950" />
                  </div>
                </div>
                <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-medium">
                  <Clock className="h-2.5 w-2.5" /> 1:00
                </div>
              </div>
              <div className="p-3">
                <p className="text-sm font-medium">{l.t}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
