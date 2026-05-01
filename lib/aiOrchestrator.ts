type AIAction = "text" | "image"

export function detectIntent(prompt: string): AIAction {
  const lower = prompt.toLowerCase()

  if (
    lower.includes("logo") ||
    lower.includes("logotipo") ||
    lower.includes("marca") ||
    lower.includes("identidade visual") ||
    lower.includes("imagem") ||
    lower.includes("arte") ||
    lower.includes("banner") ||
    lower.includes("post") ||
    lower.includes("anúncio") ||
    lower.includes("anuncio") ||
    lower.includes("flyer") ||
    lower.includes("criar arte") ||
    lower.includes("foto")
  ) {
    return "image"
  }

  return "text"
}

