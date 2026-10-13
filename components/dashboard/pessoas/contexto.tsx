"use client"
import { createContext, useContext, useState, useCallback, type ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { listarEmpregadores, listarFuncionarios } from "@/app/actions/pessoas"
import { useDisponibilidade, type Disponibilidade } from "./use-disponibilidade"
import { control, Notice, useResource, type StoreAction } from "./ui"
type Context = { storeId: string; empregadorId: string; capacidades: string[]; categoriasDocumentais: string[]; podeConfigurar: boolean; listarFuncionarios: StoreAction<typeof listarFuncionarios> }
const Contexto = createContext<Context | null>(null)
export function usePessoas() {
  const value = useContext(Contexto)
  if (!value) throw new Error("Contexto Pessoas ausente")
  return value
}
type ProviderProps = { children: ReactNode; listarEmpregadoresAction: StoreAction<typeof listarEmpregadores>; listarFuncionariosAction: StoreAction<typeof listarFuncionarios> }
export function PessoasProvider({ children, listarEmpregadoresAction, listarFuncionariosAction }: ProviderProps) {
  const availability = useDisponibilidade()
  if (availability.error) return <Notice code={availability.error} retry={availability.refresh} />
  const retained = availability.data ?? availability.retainedData
  if (!retained) return <p role="status">Verificando acesso a Pessoas…</p>
  if (availability.data && !availability.disponivel) return <Notice code="ESCOPO_NEGADO" retry={availability.refresh} />
  return <>
    {!availability.data && <p role="status">Revalidando acesso a Pessoas…</p>}
    <div hidden={!availability.data} inert={!availability.data}>
      <ContextoAutorizado key={availability.contextKey + JSON.stringify(retained)} availability={retained} listarEmpregadoresAction={listarEmpregadoresAction} listarFuncionariosAction={listarFuncionariosAction}>{children}</ContextoAutorizado>
    </div>
  </>
}
function ContextoAutorizado({ children, availability, listarEmpregadoresAction, listarFuncionariosAction }: ProviderProps & { availability: Disponibilidade }) {
  const resource = useResource(useCallback(() => listarEmpregadoresAction(availability.storeId), [listarEmpregadoresAction, availability.storeId]))
  const [selected, setSelected] = useState<string | null>(null)
  const path = usePathname()
  if (resource.error) return <Notice code={resource.error} retry={resource.reload} />
  if (!resource.data) return <p role="status">Carregando empregadores…</p>
  const empregadorId = selected ?? resource.data[0]?.id ?? ""
  const scope = availability.escopos.find(item => item.empregadorId === empregadorId)
  const value = { storeId: availability.storeId, empregadorId, capacidades: scope?.capacidades ?? [], categoriasDocumentais: scope?.categoriasDocumentais ?? [], podeConfigurar: availability.podeConfigurarEmpregador, listarFuncionarios: listarFuncionariosAction }
  return <div className="min-w-0 space-y-6 text-foreground">
    <header className="flex min-w-0 flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
      <div className="min-w-0"><p className="text-xs uppercase tracking-widest text-muted-foreground">Departamento pessoal</p>
      <h1 className="font-display text-3xl font-semibold tracking-tight">Pessoas</h1>
      <p className="mt-1 text-sm text-muted-foreground">Cadastro, vínculos e documentos privados.</p></div>
      {!!resource.data.length && <label className="min-w-0 max-w-full text-sm">Empregador
        <select className={control} value={empregadorId} onChange={event => setSelected(event.target.value)}>
          {resource.data.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}
        </select></label>}
    </header>
    <nav aria-label="Pessoas" className="flex min-w-0 flex-wrap gap-2">
      {[["", "Visão geral"], ["/funcionarios", "Funcionários"], ["/configuracoes", "Configurações"]].map(([suffix, title]) =>
        <Link key={suffix} prefetch={false} href={"/dashboard/pessoas" + suffix} aria-current={path === "/dashboard/pessoas" + suffix ? "page" : undefined}
          className="rounded-md border border-border px-4 py-3 text-sm hover:bg-muted aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground">{title}</Link>)}
    </nav>
    <Contexto.Provider key={availability.storeId + ":" + empregadorId} value={value}>{children}</Contexto.Provider>
    <p className="text-xs text-muted-foreground">Dados privados. O acesso é revalidado ao retornar à aba. Trocar de contexto ou perder acesso descarta formulários não salvos.</p>
  </div>
}
