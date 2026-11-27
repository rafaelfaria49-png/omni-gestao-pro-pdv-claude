import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { GestorMoneyApp } from "@/components/gestor-money/GestorMoneyApp"

export const metadata: Metadata = {
  title: "Gestor Money · Ambiente Isolado (Sintético)",
  description: "Validação isolada da interface mobile e desktop do Gestor Money com dados sintéticos.",
}

export const dynamic = "force-dynamic"

/**
 * Rota exclusivamente para validação local/isolada da interface (mobile & desktop).
 * Bloqueada em produção (fail-closed -> 404) e exige opt-in explícito
 * `GESTOR_MONEY_ISOLATED_PREVIEW=1` fora de produção.
 */
export default function GestorMoneyIsolatedPreviewPage() {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.GESTOR_MONEY_ISOLATED_PREVIEW !== "1"
  ) {
    notFound()
  }

  return <GestorMoneyApp mode="synthetic" />
}
