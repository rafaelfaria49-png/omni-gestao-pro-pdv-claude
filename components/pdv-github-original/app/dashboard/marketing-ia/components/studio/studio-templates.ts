export type StudioTemplate = "bomDia" | "servico" | "antesDepois";

type Take = { title: string; script: string };

export const TEMPLATES: Record<
  StudioTemplate,
  { title: string; subtitle: string; takes: Take[]; caption: string }
> = {
  bomDia: {
    title: "Bom Dia Automático",
    subtitle: "3 takes rápidos pra abrir o dia da sua loja com energia.",
    takes: [
      {
        title: "Rosto / Bom dia",
        script:
          "Sorriso largo, 3 segundos: 'Bom dia! Hoje a vitrine tá especial...'",
      },
      {
        title: "Produto / Loja",
        script:
          "Close de 5s na peça do dia. Mostre detalhe, tecido ou etiqueta.",
      },
      {
        title: "Chamada pra ação",
        script:
          "Aponte pra câmera: 'Chama no direct e garanta a sua antes que acabe!'",
      },
    ],
    caption:
      "☀️ Bom dia! Hoje tem peça novinha esperando por você. Corre no direct! ✨",
  },
  servico: {
    title: "Status de Serviço",
    subtitle: "Mostre que o trabalho tá rolando — gera confiança no cliente.",
    takes: [
      { title: "Diagnóstico", script: "Mostre o equipamento e descreva o problema em 5s." },
      { title: "Mãos à obra", script: "Close nas suas mãos trabalhando. 'Tô resolvendo agora.'" },
      { title: "Entrega", script: "Equipamento funcionando. 'Pronto e testado, pode buscar!'" },
    ],
    caption:
      "🔧 Serviço concluído com cuidado e garantia. Sua confiança é o nosso compromisso.",
  },
  antesDepois: {
    title: "Showcase Antes e Depois",
    subtitle: "A transformação vende sozinha — em 3 takes.",
    takes: [
      { title: "O Problema", script: "Grave 4s do estado original. Sem cortes, mostre a verdade." },
      { title: "A Solução", script: "Time-lapse de 6s do trabalho acontecendo." },
      { title: "O Brilho Final", script: "Panorâmica lenta do resultado. Deixe a mágica falar." },
    ],
    caption: "✨ Antes e depois que fala por si. Resultado que você merece.",
  },
};

export const STUDIO_MOODS = [
  { id: "animado" as const, label: "Animado", desc: "Pop / energia" },
  { id: "relaxante" as const, label: "Relaxante", desc: "Lo-fi / calmo" },
  { id: "promocao" as const, label: "Promoção", desc: "Beat urgente" },
];

export type StudioMood = (typeof STUDIO_MOODS)[number]["id"];

export const PREVIEW_HASHTAGS: Record<StudioTemplate, string> = {
  bomDia: "#bomdia #loja #novidades",
  servico: "#servico #assistencia #garantia",
  antesDepois: "#antesedepois #transformacao #resultado",
};

export const PREVIEW_CENTER_LABEL: Record<StudioTemplate, string> = {
  bomDia: "Bom dia",
  servico: "Status",
  antesDepois: "Antes & depois",
};
