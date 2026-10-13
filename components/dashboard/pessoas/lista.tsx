"use client"
import { useCallback, useState } from "react"
import Link from "next/link"
import { usePessoas } from "./contexto"
import { control, Notice, Section, useResource } from "./ui"
import { civilDisplay } from "@/lib/pessoas/adapters/cadastro-ui"
export function ListaPessoas({ overview = false }: { overview?: boolean }) {
  const { storeId, empregadorId, capacidades, podeConfigurar, listarFuncionarios } = usePessoas()
  const load = useCallback(() => empregadorId ? listarFuncionarios(storeId, empregadorId) : Promise.resolve({ ok: true as const, data: [] }), [listarFuncionarios, storeId, empregadorId])
  const resource = useResource(load)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("")
  const [cargo, setCargo] = useState("")
  if (!empregadorId) return <Section title="Configure seu primeiro empregador"><p className="text-sm text-muted-foreground">O cadastro começa pela identificação do empregador e do estabelecimento.</p>
    {podeConfigurar && <Link prefetch={false} className="inline-block rounded-md bg-primary px-4 py-3 text-sm text-primary-foreground" href="/dashboard/pessoas/configuracoes">Configurar empregador</Link>}</Section>
  if (resource.error) return <Notice code={resource.error} retry={resource.reload} />
  if (!resource.data) return <p role="status">Carregando funcionários…</p>
  const rows = resource.data.filter(row => (row.nome ?? "").toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")) || (row.matricula ?? "").toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")))
    .filter(row => (!status || row.status === status) && (!cargo || row.cargo === cargo))
  return <Section title={overview ? "Situação cadastral" : "Funcionários"}>
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
      <p className="text-sm text-muted-foreground">{resource.data.length} vínculo(s) nesta loja</p>
      {capacidades.includes("editCadastro") && <Link href="/dashboard/pessoas/funcionarios/novo" prefetch={false} className="rounded-md bg-primary px-4 py-3 text-sm text-primary-foreground">Novo funcionário</Link>}
    </div>
    {overview && <dl className="grid min-w-0 grid-cols-3 divide-x divide-border rounded-md border border-border py-4">
      {["ATIVO", "RASCUNHO", "ARQUIVADO"].map(value => <div key={value} className="min-w-0 px-3"><dt className="text-xs text-muted-foreground">{value === "ATIVO" ? "Ativos" : value === "RASCUNHO" ? "Rascunhos" : "Arquivados"}</dt><dd className="mt-1 font-display text-2xl">{resource.data!.filter(row => row.status === value).length}</dd></div>)}</dl>}
    <div className="grid min-w-0 gap-3 sm:grid-cols-3">
      <label className="min-w-0 text-sm">Nome ou matrícula<input className={control} value={query} onChange={event => setQuery(event.target.value)} /></label>
      <label className="min-w-0 text-sm">Situação<select className={control} value={status} onChange={event => setStatus(event.target.value)}><option value="">Todas</option>{["ATIVO", "RASCUNHO", "ARQUIVADO"].map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="min-w-0 text-sm">Cargo<select className={control} value={cargo} onChange={event => setCargo(event.target.value)}><option value="">Todos</option>{Array.from(new Set(resource.data.map(row => row.cargo).filter((value): value is string => !!value))).map(value => <option key={value}>{value}</option>)}</select></label>
    </div>
    {!resource.data.length ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhum funcionário cadastrado nesta loja.</p> : !rows.length ? <p role="status" className="py-8 text-center text-sm">Nenhum resultado para esses filtros.</p> :
      <ul className="divide-y divide-border">{rows.map(row => <li key={row.id} className="grid min-w-0 gap-2 py-4 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-center">
        <div className="min-w-0"><Link prefetch={false} className="min-w-0 [overflow-wrap:anywhere] font-medium text-primary underline-offset-4 hover:underline" href={"/dashboard/pessoas/funcionarios/" + row.id}>{row.nome ?? "Nome não informado"}</Link><p className="min-w-0 [overflow-wrap:anywhere] text-xs text-muted-foreground">Matrícula {row.matricula ?? "não informada"}</p></div>
        <span className="min-w-0 [overflow-wrap:anywhere] text-sm text-muted-foreground">{row.cargo ?? "Cargo não informado"}</span>
        <span className="min-w-0 text-sm">Admissão: {civilDisplay(row.admissao)}</span><span className="min-w-0 text-xs font-semibold">{row.status}</span>
      </li>)}</ul>}
  </Section>
}
