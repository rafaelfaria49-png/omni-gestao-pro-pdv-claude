export function getActionLabel(action: string) {
  const map: Record<string, string> = {
    image: "Imagem IA",
    marketing_image: "Imagem IA",
    voice: "Voz IA",
    marketing_voice: "Voz IA",
    video: "Vídeo IA",
    marketing_video: "Vídeo IA",
    avatar: "Avatar IA",
    marketing_avatar: "Avatar IA",
    text: "Chat IA Mestre",
    ia_mestre_text: "Chat IA Mestre",
    ia_mestre_image: "Imagem IA Mestre",
  }

  return map[action] ?? action
}

