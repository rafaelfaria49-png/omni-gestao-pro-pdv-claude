"use client"
import { useCallback, useState, useRef, useEffect } from "react"
import type { obterFuncionario, atualizarDadosPessoais, completarVinculoRascunho, criarVersaoContrato, listarHistorico } from "@/app/actions/pessoas"
import { usePessoas } from "./contexto"
import { CommandForm, Notice, Section, useResource, type StoreAction } from "./ui"
import { personal, vinculo, contrato, motivo, vigencia } from "./campos"
import { civilDisplay, decimalInput, moneyDisplay } from "@/lib/pessoas/adapters/cadastro-ui"
import { Documentos, type DocumentActions } from "./documentos"
type FichaActions = {
  obterFuncionario: StoreAction<typeof obterFuncionario>; listarHistorico: StoreAction<typeof listarHistorico>
  atualizarDadosPessoais: StoreAction<typeof atualizarDadosPessoais>; completarVinculoRascunho: StoreAction<typeof completarVinculoRascunho>
  criarVersaoContrato: StoreAction<typeof criarVersaoContrato>
}
export function FichaFuncionario({ id, actions, documentActions }: { id: string; actions: FichaActions; documentActions: DocumentActions }) {
  const { storeId, empregadorId, capacidades } = usePessoas()
  const resource = useResource(useCallback(() => actions.obterFuncionario(storeId, empregadorId, id), [actions, storeId, empregadorId, id]))
  const [documentPending, setDocumentPending] = useState(false)
  const [sectionPending, setSectionPending] = useState(false)
  const mutation = useRef<"section" | "document" | null>(null)
  const acquireSection = useCallback(() => {
    if (mutation.current && mutation.current !== "section") return false
    mutation.current = "section"; return true
  }, [])
  const acquireDocument = useCallback(() => {
    if (mutation.current && mutation.current !== "document") return false
    mutation.current = "document"; return true
  }, [])
  const sectionChanged = useCallback((pending: boolean) => {
    if (!pending && mutation.current === "section") mutation.current = null
    setSectionPending(pending)
  }, [])
  const documentChanged = useCallback((pending: boolean) => {
    if (!pending && mutation.current === "document") mutation.current = null
    setDocumentPending(pending)
  }, [])
  const blocked = documentPending || sectionPending || resource.refreshing
  const [edit, setEdit] = useState("")
  const [revision, setRevision] = useState(0)
  const [message, setMessage] = useState("")
  const feedback = useRef<HTMLParagraphElement>(null)
  useEffect(() => { if (message) feedback.current?.focus() }, [message, resource.data])
  const reload = (conflict = false) => {
    setMessage(conflict ? "O cadastro foi relido. Revise os dados atuais e escolha novamente a seção que deseja editar." : "Seção salva. As outras seções permanecem independentes.")
    setEdit(""); resource.reload(true); setRevision(n => n + 1)
  }
  if (resource.error) return <Notice code={resource.error} retry={resource.reload} />
  if (!resource.data) return <p role="status">Carregando ficha…</p>
  const f = resource.data
  const c = f.contrato
  const canEdit = capacidades.includes("editCadastro") && f.status !== "ARQUIVADO"
  const canContract = capacidades.includes("editContrato") && f.status !== "ARQUIVADO"
  const readSalary = capacidades.includes("viewRemuneracao")
  return <div className="min-w-0 space-y-5 [overflow-wrap:anywhere]">
    <div className="min-w-0 border-l-4 border-primary bg-muted/40 p-4">
      <h2 className="[overflow-wrap:anywhere] font-display text-2xl font-semibold">{f.nome ?? "Nome não informado"}</h2>
      <p className="mt-1 text-sm">{f.status} · Vínculo v{f.versaoAtual}</p>
      <p className="mt-2 text-sm text-muted-foreground">{f.pendencias.length ? "Pendências: " + f.pendencias.join(", ") : "Cadastro completo segundo os dados do servidor."}</p>
      {f.pendencias.length > 0 && <div className="mt-2 flex min-w-0 flex-wrap gap-3">
        {canEdit && <a className="min-h-11 text-sm text-primary underline" href="#dados-pessoais">Revisar dados pessoais</a>}
        {canEdit && f.status === "RASCUNHO" && <a className="min-h-11 text-sm text-primary underline" href="#vinculo">Completar vínculo</a>}
        {canContract ? <a className="min-h-11 text-sm text-primary underline" href="#contrato">Completar contrato</a> : <span className="text-sm">Pendências contratuais: procure um responsável autorizado.</span>}
      </div>}
    </div>
    <p ref={feedback} tabIndex={-1} role="status" className="text-sm">{message}</p>
    <div id="dados-pessoais"><Section title="Dados pessoais">
      <dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-3">
        <div className="min-w-0"><dt className="text-muted-foreground">CPF</dt><dd>{f.cpf ?? "Não informado"}</dd></div>
        <div className="min-w-0"><dt className="text-muted-foreground">Nascimento</dt><dd>{civilDisplay(f.nascimento)}</dd></div>
        <div className="min-w-0"><dt className="text-muted-foreground">Versão pessoal</dt><dd>{f.pessoaVersaoAtual}</dd></div>
      </dl>
      {canEdit && <button className="min-h-11 text-sm text-primary underline" disabled={blocked} onClick={() => setEdit("pessoal")}>Editar dados pessoais</button>}
      {edit === "pessoal" && <CommandForm key={"p" + f.pessoaVersaoAtual} fields={[...personal.map(field => ({ ...field, value: f[field.name as "nome" | "cpf" | "nascimento"] })), { ...vigencia, required: false }, motivo]}
        disabled={documentPending || resource.refreshing} onPendingChange={sectionChanged} acquireMutation={acquireSection}
        onSaved={() => reload()} onConflict={() => reload(true)}
        action={(v, comandoId) => actions.atualizarDadosPessoais(storeId, { empregadorId, vinculoId: id, comandoId, expectedPersonVersion: f.pessoaVersaoAtual,
          nome: v.nome, cpf: v.cpf, nascimento: v.nascimento, validFrom: v.validFrom || undefined, motivo: v.motivo })} />}
    </Section></div>
    <div id="vinculo"><Section title="Vínculo">
      <dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">{vinculo.map(field => <div key={field.name} className="min-w-0"><dt className="text-muted-foreground">{field.label}</dt><dd className="[overflow-wrap:anywhere]">{field.name === "admissao" ? civilDisplay(f.admissao) : f[field.name as "matricula" | "regime" | "categoria"] ?? "Não informado"}</dd></div>)}</dl>
      {canEdit && f.status === "RASCUNHO" && <button className="min-h-11 text-sm text-primary underline" disabled={blocked} onClick={() => setEdit("vinculo")}>Preencher lacunas do vínculo</button>}
      {edit === "vinculo" && <CommandForm fields={[...vinculo.filter(field => f[field.name as "matricula" | "admissao" | "regime" | "categoria"] == null), motivo]}
        disabled={documentPending || resource.refreshing} onPendingChange={sectionChanged} acquireMutation={acquireSection}
        onSaved={() => reload()} onConflict={() => reload(true)} action={(v, comandoId) => actions.completarVinculoRascunho(storeId, { ...v, empregadorId, vinculoId: id, comandoId, expectedVersion: f.versaoAtual, motivo: v.motivo })} />}
    </Section></div>
    <div id="contrato"><Section title="Contrato atual">
      <p className="text-sm text-muted-foreground">Cada alteração cria uma versão e conserva o histórico.</p>
      <dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
        <div className="min-w-0"><dt className="text-muted-foreground">Cargo / CBO</dt><dd>{c?.cargo ?? "Não informado"} / {c?.cbo ?? "Não informado"}</dd></div>
        <div className="min-w-0"><dt className="text-muted-foreground">Salário base</dt><dd>{moneyDisplay(c?.salarioBase, !readSalary || !!c?.remuneracaoOculta)}</dd></div>
        <div className="min-w-0"><dt className="text-muted-foreground">Jornada / divisor</dt><dd>{c?.jornadaSemanal ?? "Não informado"} / {c?.divisor ?? "Não informado"}</dd></div>
        <div className="min-w-0"><dt className="text-muted-foreground">Vigência</dt><dd>{civilDisplay(c?.validFrom)} · v{c?.versao ?? "—"}</dd></div>
      </dl>
      {canContract && c && <button className="min-h-11 text-sm text-primary underline" disabled={blocked} onClick={() => setEdit("contrato")}>Criar versão do contrato</button>}
      {edit === "contrato" && c && <CommandForm fields={[...contrato.map(field => ({ ...field, value: c[field.name as keyof typeof c] as string | number | null, required: !["tipoContrato", "cctRef"].includes(field.name) })),
        { name: "tipoMudanca", label: "Tipo de mudança", options: ["ALTERACAO", "CORRECAO"], required: true }, vigencia, { name: "validTo", label: "Fim da vigência (opcional)", type: "date" }, motivo]}
        disabled={documentPending || resource.refreshing} onPendingChange={sectionChanged} acquireMutation={acquireSection}
        onSaved={() => reload()} onConflict={() => reload(true)} action={async (v, comandoId) => {
          let salarioBase: string | undefined, jornadaSemanal: string | undefined
          try { salarioBase = decimalInput(v.salarioBase); jornadaSemanal = decimalInput(v.jornadaSemanal) }
          catch { return { ok: false, code: "DECIMAL_INVALIDO" } }
          return actions.criarVersaoContrato(storeId, { empregadorId, vinculoId: id, comandoId, expectedVersion: f.versaoAtual, supersedesId: c.id,
            tipoMudanca: v.tipoMudanca as "ALTERACAO" | "CORRECAO", validFrom: v.validFrom, validTo: v.validTo || undefined,
            cargo: v.cargo, cbo: v.cbo, tipoContrato: v.tipoContrato || undefined, salarioBase: salarioBase ?? "", unidadeSalario: v.unidadeSalario,
            jornadaSemanal: jornadaSemanal ?? "", divisor: Number(v.divisor), cctRef: v.cctRef || undefined, motivo: v.motivo })
        }} />}
    </Section></div>
    <Historico key={revision} id={id} load={actions.listarHistorico} />
    {capacidades.includes("viewDocumento") ? <Documentos id={id} actions={documentActions} disabled={sectionPending || resource.refreshing} onPendingChange={documentChanged} acquireMutation={acquireDocument} /> : <Section title="Documentos"><p className="text-sm">Acesso documental não concedido.</p></Section>}
  </div>
}
function Historico({ id, load }: { id: string; load: StoreAction<typeof listarHistorico> }) {
  const { storeId, empregadorId, capacidades } = usePessoas()
  const resource = useResource(useCallback(() => load(storeId, empregadorId, id), [load, storeId, empregadorId, id]))
  if (resource.error) return <Notice code={resource.error} retry={resource.reload} />
  if (!resource.data) return <p role="status">Carregando histórico…</p>
  return <Section title="Histórico">
    {[{ title: "Dados pessoais", rows: resource.data.pessoa }, { title: "Contratos", rows: resource.data.contratos }].map(group => <div key={group.title} className="min-w-0">
      <h3 className="font-medium">{group.title}</h3><ol className="divide-y divide-border">{group.rows.map(row => <li key={row.id} className="min-w-0 space-y-1 py-3 text-sm">
        <p className="font-medium">Versão {row.versao} · Vigência {civilDisplay(row.validFrom)}</p>
        <p className="text-xs text-muted-foreground">Registrado {new Date(row.recordedAt).toLocaleString("pt-BR")} · Autor {row.autorId}</p>
        {"salarioBase" in row && <p>{moneyDisplay(row.salarioBase, row.remuneracaoOculta || !capacidades.includes("viewRemuneracao"))}</p>}
        {!("salarioBase" in row) ? <p className="[overflow-wrap:anywhere]">{row.motivo ?? "Motivo restrito"}</p> : !row.remuneracaoOculta && capacidades.includes("viewRemuneracao") && <p className="[overflow-wrap:anywhere]">{row.motivo}</p>}
        <p className="break-all text-xs text-muted-foreground">{row.supersedesId ? "Substitui " + row.supersedesId : "Versão inicial"}{"supersededAt" in row && row.supersededAt ? " · Substituída em " + new Date(row.supersededAt).toLocaleString("pt-BR") : ""}</p>
      </li>)}</ol>
    </div>)}
  </Section>
}
