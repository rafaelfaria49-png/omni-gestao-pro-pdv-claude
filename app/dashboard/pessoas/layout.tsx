import type { ReactNode } from "react"
import { lerDisponibilidade } from "@/lib/pessoas/readers/disponibilidade"
import { PessoasError } from "@/lib/pessoas/domain"
import { PessoasProvider } from "@/components/dashboard/pessoas/contexto"
import { Notice } from "@/components/dashboard/pessoas/ui"
export const dynamic = "force-dynamic"
export const revalidate = 0
export default async function Layout({ children }: { children: ReactNode }) {
  try {
    const availability = await lerDisponibilidade()
    if (!availability.disponivel) return <Notice code="ESCOPO_NEGADO" />
  } catch (error) { return <Notice code={error instanceof PessoasError ? error.code : "FALHA_INTERNA"} /> }
  return <PessoasProvider>{children}</PessoasProvider>
}
