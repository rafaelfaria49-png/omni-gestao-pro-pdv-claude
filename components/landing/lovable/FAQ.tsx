import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const faqs = [
  {
    q: "Posso cancelar quando quiser?",
    a: "Sim. Sem multa, sem pegadinhas. Cancele direto no painel em 2 cliques, a qualquer momento. Você mantém acesso até o fim do ciclo pago.",
  },
  {
    q: "Como funciona o limite de IA?",
    a: "Cada plano traz uma cota mensal de créditos (vídeos, imagens e textos gerados). Acompanhe o consumo em tempo real no dashboard. Upgrades são instantâneos.",
  },
  {
    q: "Preciso de um computador potente?",
    a: "Não. O OmniGestão roda 100% na nuvem. Funciona no navegador, tablet ou celular — até em máquinas modestas. O processamento pesado de IA fica nos nossos servidores.",
  },
  {
    q: "Meus dados estão seguros?",
    a: "Criptografia AES-256 em repouso, TLS 1.3 em trânsito, backups diários e conformidade com a LGPD. Seus dados são seus — sempre.",
  },
  {
    q: "Vocês migram meus dados da ferramenta antiga?",
    a: "Sim, gratuitamente nos planos Ouro e Diamante. Nosso time importa planilhas, estoque, clientes e histórico de vendas para você começar sem retrabalho.",
  },
];

export function FAQ() {
  return (
    <section id="faq" className="relative py-24">
      <div className="mx-auto max-w-3xl px-4">
        <div className="mb-12 text-center">
          <div className="text-sm font-semibold uppercase tracking-widest text-neon-cyan">FAQ</div>
          <h2 className="mt-3 text-4xl font-bold md:text-5xl">
            Perguntas <span className="text-gradient-neon">frequentes</span>
          </h2>
        </div>

        <Accordion type="single" collapsible className="glass rounded-2xl p-2">
          {faqs.map((f, i) => (
            <AccordionItem key={i} value={`item-${i}`} className="border-white/10 px-4 last:border-b-0">
              <AccordionTrigger className="text-left text-base font-medium hover:no-underline">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
