"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import type { setupEmpregador, obterEmpregador, editarEmpregador, criarEstabelecimento, editarEstabelecimento } from "@/app/actions/pessoas"
import { usePessoas } from "./contexto"
import { CommandForm, Notice, Section, useResource, type Field, type StoreAction } from "./ui"
import { refreshPessoas } from "./use-disponibilidade"
import { motivo, vigencia } from "./campos"
const identity: Field[] = [{ name: "nome", label: "Nome", required: true }, { name: "tipoInscricao", label: "Tipo de inscrição", required: true, maxLength: 12 }, { name: "inscricao", label: "Inscrição", required: true, maxLength: 32 }]
const address: Field[] = ["logradouro", "numero", "complemento", "bairro", "cidade", "uf", "cep"].map(name => ({ name, label: "Endereço · " + name, maxLength: 160 }))
function endereco(v: Record<string, string>) { return Object.fromEntries(address.map(field => [field.name, v[field.name] ?? ""])) }
type ConfigActions = {
  setupEmpregador: StoreAction<typeof setupEmpregador>; obterEmpregador: StoreAction<typeof obterEmpregador>
  editarEmpregador: StoreAction<typeof editarEmpregador>; criarEstabelecimento: StoreAction<typeof criarEstabelecimento>
  editarEstabelecimento: StoreAction<typeof editarEstabelecimento>
}
export function ConfiguracoesPessoas({ actions }: { actions: ConfigActions }) {
  const { storeId, empregadorId, podeConfigurar } = usePessoas()
  if (!empregadorId) return podeConfigurar ? <Section title="Configurar empregador">
    <p className="text-sm text-muted-foreground">Identifique o empregador e seu estabelecimento. A loja atual será vinculada explicitamente a esse estabelecimento.</p>
    <CommandForm fields={[...identity, ...address, { name: "regime", label: "Regime do empregador" }, ...identity.map(field => ({ ...field, name: "est_" + field.name, label: "Estabelecimento · " + field.label })), vigencia, motivo]}
      submitLabel="Criar empregador e estabelecimento" onSaved={refreshPessoas} onConflict={refreshPessoas}
      action={(v, comandoId) => actions.setupEmpregador(storeId, { comandoId, nome: v.nome, tipoInscricao: v.tipoInscricao, inscricao: v.inscricao,
        regime: v.regime || undefined, endereco: endereco(v), validFrom: v.validFrom, motivo: v.motivo,
        estabelecimento: { nome: v.est_nome, tipoInscricao: v.est_tipoInscricao, inscricao: v.est_inscricao } })} />
  </Section> : <Notice code="ESCOPO_NEGADO" />
  return <Manutencao key={storeId + ":" + empregadorId} id={empregadorId} actions={actions} />
}
function Manutencao({ id, actions }: { id: string; actions: ConfigActions }) {
  const { storeId, capacidades } = usePessoas()
  const resource = useResource(useCallback(() => actions.obterEmpregador(storeId, id), [actions, storeId, id]))
  const [edit, setEdit] = useState("")
  const [conflict, setConflict] = useState(false)
  const [message, setMessage] = useState("")
  const feedback = useRef<HTMLParagraphElement>(null)
  const focusAfterReload = useRef(false)
  useEffect(() => {
    if (resource.data && focusAfterReload.current && feedback.current) {
      feedback.current.focus(); focusAfterReload.current = false
    }
  }, [resource.data])
  const reload = (hasConflict = false) => {
    setEdit(""); setConflict(hasConflict)
    setMessage(hasConflict ? "Configuração relida. Revise os dados antes de editar novamente." : "Configuração salva e atualizada.")
    focusAfterReload.current = true; resource.reload()
  }
  const onConflict = () => reload(true)
  if (resource.error) return <Notice code={resource.error} retry={resource.reload} />
  if (!resource.data) return <p role="status">Carregando configuração…</p>
  const employer = resource.data
  const latest = employer.versoes[0]
  const manage = capacidades.includes("manageAccess")
  return <div className="min-w-0 space-y-5">
    <p ref={feedback} tabIndex={-1} role="status" className="text-sm">{message}</p>
    {conflict && <Notice code="VERSION_CONFLICT" />}
    <Section title={employer.nome}>
      <p className="text-sm">{employer.tipoInscricao} · {employer.inscricao} · Versão {employer.versaoAtual}</p>
      {manage && employer.storeGestoraId === storeId && <button className="min-h-11 text-sm text-primary underline" onClick={() => { setEdit("emp"); setConflict(false) }}>Editar empregador</button>}
      {edit === "emp" && <CommandForm fields={[...identity.map(field => ({ ...field, value: employer[field.name as "nome" | "inscricao" | "tipoInscricao"] })), ...address.map(field => ({ ...field, value: latest?.endereco && typeof latest.endereco === "object" && !Array.isArray(latest.endereco) ? String(latest.endereco[field.name] ?? "") : "" })), { name: "regime", label: "Regime", value: latest?.regime }, vigencia, motivo]}
        onSaved={reload} onConflict={onConflict} action={(v, comandoId) => actions.editarEmpregador(storeId, { empregadorId: id, comandoId, expectedVersion: employer.versaoAtual,
          nome: v.nome, inscricao: v.inscricao, tipoInscricao: v.tipoInscricao, regime: v.regime || undefined, endereco: endereco(v), validFrom: v.validFrom, motivo: v.motivo })} />}
    </Section>
    <Section title="Estabelecimentos">
      {employer.estabelecimentos.map(est => <div key={est.id} className="min-w-0 space-y-3 border-b border-border py-4">
        <p className="font-medium">{est.nome ?? "Sem nome"}</p><p className="text-sm text-muted-foreground">{est.tipoInscricao} · {est.inscricao} · Versão {est.versaoAtual}</p>
        {manage && <button className="min-h-11 text-sm text-primary underline" onClick={() => { setEdit(est.id); setConflict(false) }}>Editar estabelecimento</button>}
        {edit === est.id && <CommandForm fields={[...identity.map(field => ({ ...field, value: est[field.name as "nome" | "inscricao" | "tipoInscricao"] })), ...address.map(field => ({ ...field, value: est.versoes[0]?.endereco && typeof est.versoes[0].endereco === "object" && !Array.isArray(est.versoes[0].endereco) ? String(est.versoes[0].endereco[field.name] ?? "") : "" })), { name: "lotacaoRef", label: "Referência de lotação", value: est.versoes[0]?.lotacaoRef }, vigencia, motivo]} onSaved={reload} onConflict={onConflict}
          action={(v, comandoId) => actions.editarEstabelecimento(storeId, { empregadorId: id, estabelecimentoId: est.id, comandoId, expectedVersion: est.versaoAtual,
            nome: v.nome, tipoInscricao: v.tipoInscricao, inscricao: v.inscricao, endereco: endereco(v), lotacaoRef: v.lotacaoRef || undefined, validFrom: v.validFrom, motivo: v.motivo })} />}
      </div>)}
      {manage && <button className="min-h-11 text-sm text-primary underline" onClick={() => setEdit("novo")}>Novo estabelecimento</button>}
      {edit === "novo" && <CommandForm fields={[...identity, ...address, { name: "lotacaoRef", label: "Referência de lotação" }, vigencia, motivo]} onSaved={reload} onConflict={onConflict}
        action={(v, comandoId) => actions.criarEstabelecimento(storeId, { empregadorId: id, comandoId, nome: v.nome, tipoInscricao: v.tipoInscricao, inscricao: v.inscricao,
          endereco: endereco(v), lotacaoRef: v.lotacaoRef || undefined, validFrom: v.validFrom, motivo: v.motivo })} />}
    </Section>
  </div>
}
