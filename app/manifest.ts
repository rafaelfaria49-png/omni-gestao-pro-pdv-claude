import type { MetadataRoute } from "next"
import { APP_DISPLAY_NAME } from "@/lib/app-brand"

export default function manifest(): MetadataRoute.Manifest {
  return {
    // `id` e `scope` permanecem "/" de propósito: `id` é a identidade do app já
    // instalado (mudar cria uma instalação nova) e `scope` precisa cobrir a app
    // inteira. Só o `start_url` muda — a landing "/" é comercial, não é a entrada
    // operacional; o app instalado abre no login canônico.
    id: "/",
    name: APP_DISPLAY_NAME,
    short_name: APP_DISPLAY_NAME,
    description:
      "ERP completo para varejo, supermercados, lojas de variedades e gestão empresarial.",
    start_url: "/login",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0c4a6e",
    theme_color: "#0ea5e9",
    lang: "pt-BR",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
