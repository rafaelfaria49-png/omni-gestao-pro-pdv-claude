import { Sparkles } from "lucide-react";

const AIS = [
  "ChatGPT (OpenAI)",
  "Claude (Anthropic)",
  "Gemini (Google)",
  "Midjourney",
  "HeyGen",
  "ElevenLabs",
];

export function AIMarquee() {
  const items = [...AIS, ...AIS]; // duplicate only for seamless marquee loop
  return (
    <section className="relative py-12 border-y border-white/5">
      <div className="mx-auto max-w-6xl px-4 text-center">
        <h2 className="flex flex-col items-center justify-center gap-2 text-lg md:text-2xl font-bold">
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-neon-cyan">
            <Sparkles className="h-3.5 w-3.5" />
            IA Mestre
          </span>
          <span>🧠 Uma IA que <span className="text-gradient-neon">responde clientes, cria conteúdo e te ajuda a vender mais</span> todos os dias</span>
        </h2>
      </div>

      <div className="relative mt-8 marquee-mask overflow-hidden">
        <div className="flex w-max animate-marquee gap-6">
          {items.map((name, i) => (
            <div
              key={`${name}-${i}`}
              className="glass flex items-center gap-3 rounded-2xl px-8 py-5 whitespace-nowrap"
            >
              <span className="h-2.5 w-2.5 rounded-full bg-[image:var(--gradient-neon)] shadow-[0_0_14px_oklch(0.85_0.25_145)]" />
              <span className="text-xl md:text-2xl font-bold tracking-tight text-gradient-neon">
                {name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
