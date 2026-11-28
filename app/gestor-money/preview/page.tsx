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

/**
 * Rota exclusivamente para validação local/isolada da interface (mobile & desktop).
 * Bloqueada em produção (fail-closed -> 404) e exige opt-in explícito
 * `GESTOR_MONEY_ISOLATED_PREVIEW=1` fora de produção.
 */
export default async function GestorMoneyIsolatedPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ whatsapp?: string }>
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

  return <IsolatedPreviewClient whatsappMode={whatsappMode} />
}
