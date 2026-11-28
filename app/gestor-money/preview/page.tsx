import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { IsolatedPreviewClient } from "@/components/gestor-money/IsolatedPreviewClient"

export const metadata: Metadata = {
  title: "Gestor Money · Ambiente Isolado (Sintético)",
  description: "Validação isolada da interface mobile e desktop do Gestor Money com dados sintéticos.",
}

export const dynamic = "force-dynamic"

const WHATSAPP_MODES = new Set([
  "desligado",
  "ativo",
  "vinculado",
  "expirado",
  "bloqueado",
  "canal_inativo",
])

const MULTIMODAL_MODES = new Set(["ativo", "indisponivel"])

/**
 * Rota exclusivamente para validação local/isolada da interface (mobile & desktop).
 * Bloqueada em produção (fail-closed -> 404) e exige opt-in explícito
 * `GESTOR_MONEY_ISOLATED_PREVIEW=1` fora de produção.
 */
export default async function GestorMoneyIsolatedPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ whatsapp?: string; multimodal?: string }>
}) {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.GESTOR_MONEY_ISOLATED_PREVIEW !== "1"
  ) {
    notFound()
  }

  const sp = await searchParams
  const raw = typeof sp?.whatsapp === "string" ? sp.whatsapp : "desligado"
  const whatsappMode = WHATSAPP_MODES.has(raw)
    ? (raw as "desligado" | "ativo" | "vinculado" | "expirado" | "bloqueado" | "canal_inativo")
    : "desligado"

  const rawMultimodal = typeof sp?.multimodal === "string" ? sp.multimodal : "indisponivel"
  const multimodalMode = MULTIMODAL_MODES.has(rawMultimodal)
    ? (rawMultimodal as "ativo" | "indisponivel")
    : "indisponivel"

  return <IsolatedPreviewClient whatsappMode={whatsappMode} multimodalMode={multimodalMode} />
}
