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
    text: "Texto IA",
  }

  return map[action] ?? action
}

