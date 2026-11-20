"use client"
import { useEffect, useState } from "react"
import { BASIC_MODULE_ACCESS, MODULES, resolveStoreModules, type AccessModule } from "@/lib/auth/access-policy"
import { BUSINESS_BRANCHES } from "@/lib/store-business-capabilities"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { instrucoesDeAcesso } from "@/lib/comercial/atendimento"

const MODULE_LABELS: Record<AccessModule, string> = { home: "Início", pdv: "PDV Clássico", sales: "Vendas", cash: "Caixa e histórico", catalog: "Cadastros", stock: "Estoque", reports: "Relatórios", settings: "Configurações", service: "Assistência técnica", deviceCatalog: "Catálogo de aparelhos", ai: "IA Mestre", agent: "Omni Agent", marketing: "Marketing", marketplace: "Marketplace", accountant: "Contador", whatsapp: "WhatsApp", finance: "Financeiro completo", fiscal: "Fiscal", experiments: "Experimentos" }

/** Pré-preenchimento vindo de uma solicitação da página comercial (`/gestao-lojas`). */
export type ProvisioningPrefill = { key: string; storeName: string; name: string; email: string; branch: string; solicitacaoId?: string; protocolo?: string }

export function PilotProvisioning({ prefill, onProvisionado }: { prefill?: ProvisioningPrefill | null; onProvisionado?: () => void } = {}) {
  const [storeName, setStoreName] = useState("")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [branch, setBranch] = useState("padaria")
  const [message, setMessage] = useState("")
  const [credential, setCredential] = useState("")
  /** Pedido de `/gestao-lojas` ligado a este provisionamento (vai para o histórico do pedido). */
  const [vinculo, setVinculo] = useState<{ id: string; protocolo: string; email: string } | null>(null)
  const [instrucoes, setInstrucoes] = useState("")
  const [busy, setBusy] = useState(false)
  const [stores, setStores] = useState<Array<{ id: string; name: string; moduleAccess: unknown }>>([])
  const [selected, setSelected] = useState("")
  const [modules, setModules] = useState<AccessModule[]>(BASIC_MODULE_ACCESS.modules)
  async function refresh() {
    const r = await fetch("/api/stores", { cache: "no-store" })
    if (!r.ok) throw new Error("Falha ao consultar lojas.")
    setStores((await r.json()).stores)
  }
  useEffect(() => { void refresh().catch(() => setMessage("Falha ao consultar lojas.")) }, [])
  useEffect(() => {
    if (!prefill) return
    setStoreName(prefill.storeName); setName(prefill.name); setEmail(prefill.email); setBranch(prefill.branch)
    setVinculo(prefill.solicitacaoId && prefill.protocolo ? { id: prefill.solicitacaoId, protocolo: prefill.protocolo, email: prefill.email.trim().toLowerCase() } : null)
    setMessage("Dados da solicitação copiados para o formulário. Confira antes de provisionar.")
  }, [prefill])
  return <div className="mx-auto w-full max-w-4xl space-y-8 pb-8">
    <header><p className="text-xs uppercase tracking-wide text-muted-foreground">Administração da plataforma</p><h1 className="mt-2 text-2xl font-semibold">Clientes piloto</h1><p className="mt-2 text-sm text-muted-foreground">Provisionamento controlado. A liberação piloto não confirma assinatura paga.</p></header>
    <form id="provisionar-cliente" className="space-y-4 rounded-lg border border-border bg-card p-5" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setMessage(""); setCredential(""); setInstrucoes("")
      try {
        // Email trocado = outra pessoa: o pedido não recebe a loja de outro cliente.
        const ligado = vinculo && vinculo.email === email.trim().toLowerCase() ? vinculo : null
        const r = await fetch("/api/platform/provision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storeName, name, email, branch, ...(ligado ? { solicitacaoId: ligado.id } : {}) }) })
        const data = await r.json()
        if (!r.ok) throw new Error(data.error)
        setCredential(data.temporaryPassword)
        setInstrucoes(instrucoesDeAcesso({ loginUrl: `${window.location.origin}/login`, email: data.user.email, nomeLoja: data.store.name }))
        const pedido = ligado ? (data.solicitacao?.ok ? ` Pedido ${ligado.protocolo} marcado como acesso liberado.` : ` Atenção: o pedido ${ligado.protocolo} não foi marcado (${data.solicitacao?.erro ?? "erro"}). Marque na lista acima.`) : vinculo ? ` O email foi alterado, então o pedido ${vinculo.protocolo} não foi marcado. Marque na lista acima se for a mesma pessoa.` : ""
        setMessage(`Loja e conta criadas. A senha deverá ser trocada no primeiro acesso.${pedido}`); setVinculo(null); onProvisionado?.(); await refresh()
      } catch (e) { setMessage(e instanceof Error ? e.message : "Falha de conexão.") } finally { setBusy(false) }
    }}>
      <h2 className="font-semibold">Provisionar cliente com acesso básico</h2>
      {vinculo && <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">Ligado ao pedido <strong className="text-foreground">{vinculo.protocolo}</strong>: ao provisionar, o pedido fica como acesso liberado, com a loja criada no histórico (só se o email continuar o do pedido).<Button type="button" size="sm" variant="ghost" onClick={() => setVinculo(null)}>Desligar do pedido</Button></p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="pilot-store">Nome da loja</Label><Input id="pilot-store" value={storeName} onChange={(e) => setStoreName(e.target.value)} required /></div>
        <div className="space-y-2"><Label htmlFor="pilot-owner">Responsável da loja</Label><Input id="pilot-owner" value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div className="space-y-2"><Label htmlFor="pilot-email">Email de acesso</Label><Input id="pilot-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div className="space-y-2"><Label htmlFor="pilot-branch">Ramo principal</Label><select id="pilot-branch" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={branch} onChange={(e) => setBranch(e.target.value)}>{Object.entries(BUSINESS_BRANCHES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
      </div><Button disabled={busy} type="submit">{busy ? "Provisionando…" : "Provisionar cliente"}</Button>
    </form>
    {message && <p role="status" className="text-sm">{message}</p>}
    {credential && <div className="space-y-3 rounded-lg border border-border p-4"><p className="text-sm">Copie e entregue a senha individual por um canal privado. Ela não poderá ser consultada novamente.</p><Label htmlFor="pilot-secret">Senha temporária individual</Label><Input id="pilot-secret" type="password" autoComplete="off" value={credential} readOnly /><Button onClick={() => void navigator.clipboard.writeText(credential)}>Copiar senha</Button><Button variant="outline" onClick={() => setCredential("")}>Ocultar e descartar</Button></div>}
    {instrucoes && <div className="space-y-3 rounded-lg border border-border p-4"><Label htmlFor="pilot-instrucoes">Instruções de entrada para o cliente (sem a senha)</Label><textarea id="pilot-instrucoes" readOnly rows={8} className="w-full rounded-md border border-input bg-background p-3 text-sm" value={instrucoes} /><p className="text-xs text-muted-foreground">Envie estas instruções e, em mensagem separada, a senha temporária.</p><Button type="button" variant="outline" onClick={() => void navigator.clipboard.writeText(instrucoes)}>Copiar instruções</Button></div>}
    <section className="space-y-4 rounded-lg border border-border bg-card p-5"><h2 className="font-semibold">Liberação por loja</h2><Label htmlFor="pilot-policy-store">Unidade</Label><select id="pilot-policy-store" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={selected} onChange={(e) => { setSelected(e.target.value); setModules(resolveStoreModules(stores.find((s) => s.id === e.target.value)?.moduleAccess)) }}><option value="">Selecione uma loja</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.name || s.id}</option>)}</select>
      {selected && <><div className="grid gap-3 sm:grid-cols-3">{MODULES.map((m) => <label key={m} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={modules.includes(m)} onChange={(e) => setModules((old) => e.target.checked ? [...old, m] : old.filter((v) => v !== m))} />{MODULE_LABELS[m]}</label>)}</div><p className="text-xs text-muted-foreground">A liberação conserva os gates técnicos e as permissões dos funcionários.</p><Button disabled={busy} onClick={async () => { setBusy(true); try { const r = await fetch(`/api/platform/stores/${encodeURIComponent(selected)}/access`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: 1, modules }) }); if (!r.ok) throw new Error(); setMessage("Liberação atualizada. Operações no servidor já usam a nova política."); await refresh() } catch { setMessage("Não foi possível atualizar a liberação.") } finally { setBusy(false) } }}>Salvar liberação</Button></>}
    </section>
  </div>
}
