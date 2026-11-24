import type { Metadata } from "next"
import { CompatHub } from "@/components/dashboard/compat/compat-hub"

/**
 * COMPAT-PROFISSIONAL-001 — HUB do Compat (antes: tela isolada de consulta de películas).
 * A rota é mantida (links, permissões e E2E existentes continuam válidos).
 */

export const metadata: Metadata = {
  title: "Compat · OmniGestão Pro",
  description: "Compatibilidade de películas e capinhas, organização física, cores e relatórios.",
}

export default async function CatalogoAparelhosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  return <CompatHub areaInicial={one(sp.area)} abaInicial={one(sp.aba)} />
}
