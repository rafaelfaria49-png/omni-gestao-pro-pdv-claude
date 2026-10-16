import type { ReactNode } from "react"
import { listarEmpregadores, listarFuncionarios } from "@/app/actions/pessoas"
import { exigirAtor } from "@/lib/pessoas/scope"
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
  async function empregadores(expectedStoreId: string) {
    "use server"
    try {
      const ator = await exigirAtor()
      if (ator.storeId !== expectedStoreId) return { ok: false as const, code: "LOJA_DIVERGENTE" }
      return await listarEmpregadores()
    } catch (error) { return { ok: false as const, code: error instanceof PessoasError ? error.code : "FALHA_INTERNA" } }
  }
  async function funcionarios(expectedStoreId: string, empregadorId: string) {
    "use server"
    try {
      const ator = await exigirAtor()
      if (ator.storeId !== expectedStoreId) return { ok: false as const, code: "LOJA_DIVERGENTE" }
      return await listarFuncionarios(empregadorId)
    } catch (error) { return { ok: false as const, code: error instanceof PessoasError ? error.code : "FALHA_INTERNA" } }
  }
  return <PessoasProvider listarEmpregadoresAction={empregadores} listarFuncionariosAction={funcionarios}>{children}</PessoasProvider>
}
