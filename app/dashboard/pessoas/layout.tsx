import type { ReactNode } from "react"
import { lerDisponibilidade } from "@/lib/pessoas/readers/disponibilidade"
import { PessoasError } from "@/lib/pessoas/domain"
import { PessoasProvider } from "@/components/dashboard/pessoas/contexto"
import { Notice } from "@/components/dashboard/pessoas/ui"
export const dynamic = "force-dynamic"
export const revalidate = 0
export default async function Layout({ children }: { children: ReactNode }) {
  let code: string | undefined
  try {
    const availability = await lerDisponibilidade()
    if (!availability.disponivel) code = "ESCOPO_NEGADO"
  } catch (error) { code = error instanceof PessoasError ? error.code : "FALHA_INTERNA" }
  if (code) return <Notice code={code} />
  return <PessoasProvider>{children}</PessoasProvider>
}
