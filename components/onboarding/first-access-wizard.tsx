"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ASSISTEC_STORES_SYNC_STORAGE_KEY, useLojaAtiva } from "@/lib/loja-ativa"
import { useStoreBusiness } from "@/lib/use-store-business"
import { BUSINESS_BRANCHES, BUSINESS_RESOURCES, BUSINESS_SETTINGS_HREF } from "@/lib/store-business-capabilities"
import { useStoreSettings } from "@/lib/store-settings-provider"
import { useStoreBasics, useStoreBasicsScope } from "@/lib/use-store-basics"
import type { AddressField, BasicField } from "@/lib/store-basics"

export function FirstAccessWizard() {
  const { storeId, scope } = useStoreBasicsScope()
  const business = useStoreBusiness()
  if (!storeId || !business.canConfigure) return null
  return <FirstAccessForStore key={scope} storeId={storeId} />
}

function FirstAccessForStore({ storeId }: { storeId: string }) {
  const { storesLoaded, cadastroBasicoIncompleto } = useLojaAtiva()
  const business = useStoreBusiness()
  const [started, setStarted] = useState(false)
  const [open, setOpen] = useState(true)
  // Persisted completeness, never a local "completed" flag. Existing complete stores stay untouched.
  useEffect(() => {
    if (storesLoaded && business.ready && cadastroBasicoIncompleto) setStarted(true)
  }, [storesLoaded, business.ready, cadastroBasicoIncompleto])
  if (!started) return null
  return <>
    {!open && cadastroBasicoIncompleto && <div className="flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm">
      <p>Os dados básicos desta unidade ainda estão incompletos.</p>
      <Button variant="outline" onClick={() => setOpen(true)}>Retomar configuração inicial</Button>
    </div>}
    {open && <WizardEditor storeId={storeId} open={open} onOpenChange={setOpen} onCompletedClose={() => { setStarted(false); setOpen(true) }} />}
  </>
}

function WizardEditor({ storeId, open, onOpenChange, onCompletedClose }: { storeId: string; open: boolean; onOpenChange: (open: boolean) => void; onCompletedClose: () => void }) {
  const business = useStoreBusiness()
  const { lojaAtivaRaw, refreshStoresList } = useLojaAtiva()
  const { refresh: refreshSettings } = useStoreSettings()
  const editor = useStoreBasics(storeId)
  const { draft, loading, saving, message } = editor
  const [step, setStep] = useState(1)
  const [validation, setValidation] = useState("")
  const [finished, setFinished] = useState(false)
  const title = finished ? "Dados básicos da loja concluídos" : step === 1 ? "Boas-vindas! Vamos configurar sua loja" : step === 2 ? "Endereço e contatos" : "Ramo e recursos da loja"
  const busy = loading || saving || !draft
  const changeOpen = (value: boolean) => {
    if (saving) return
    if (!value && finished) onCompletedClose()
    else onOpenChange(value)
  }
  const field = (key: BasicField, label: string, type = "text") => <div className="min-w-0 space-y-2" key={key}>
    <Label htmlFor={`first-access-${key}`}>{label}</Label>
    <Input id={`first-access-${key}`} type={type} value={draft?.[key] ?? ""} disabled={busy} onChange={(e) => editor.setField(key, e.target.value)} />
  </div>
  const addressField = (key: AddressField, label: string) => <div className="min-w-0 space-y-2" key={key}>
    <Label htmlFor={`first-access-${key}`}>{label}</Label>
    <Input id={`first-access-${key}`} value={draft?.address[key] ?? ""} disabled={busy} onChange={(e) => editor.setAddressField(key, e.target.value)} />
  </div>
  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogContent className="max-h-[90dvh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-[720px]" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => { if (saving) e.preventDefault() }}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{finished ? "O cadastro básico foi salvo e relido. Continue pelas funcionalidades disponíveis para sua loja." : "Complete os dados da própria unidade. Você pode corrigi-los depois em Configurações → Geral."}</DialogDescription>
      </DialogHeader>
      <p className="break-words text-sm font-medium" data-testid="first-access-store">Unidade: {lojaAtivaRaw?.nomeFantasia || storeId}</p>
      {loading && <p role="status">Carregando dados salvos…</p>}
      {!loading && !draft && <div role="alert" className="space-y-3"><p>{message}</p><Button onClick={editor.retryLoad}>Carregar novamente</Button></div>}
      {draft && !finished && <form className="min-w-0 space-y-5" onSubmit={(e) => {
        e.preventDefault()
        if (saving) return
        if (!draft.name.trim() || !draft.cnpj.trim()) { setValidation("Informe o nome da loja e o CNPJ para continuar."); setStep(1); return }
        setValidation("")
        if (step < 3) { setStep((value) => value + 1); return }
        void (async () => {
          if (!await editor.save(true)) return
          setFinished(true)
          void refreshStoresList()
          void refreshSettings()
          try { localStorage.setItem(ASSISTEC_STORES_SYNC_STORAGE_KEY, String(Date.now())) } catch { /* optional cross-tab signal, no registration data */ }
        })()
      }}>
        {step === 1 && <div className="grid gap-4">{field("name", "Nome da loja (nome fantasia)")}{field("cnpj", "CNPJ")}</div>}
        {step === 2 && <div className="grid gap-3 sm:grid-cols-2">
          {addressField("rua", "Rua")}{addressField("numero", "Número")}{addressField("bairro", "Bairro")}{addressField("cidade", "Cidade")}{addressField("estado", "Estado")}{addressField("cep", "CEP")}
          {field("phone", "Telefone", "tel")}{field("contactWhatsapp", "WhatsApp da loja", "tel")}{field("contactWhatsappDono", "WhatsApp do responsável", "tel")}{field("contactEmail", "E-mail", "email")}
        </div>}
        {step === 3 && <div className="space-y-3">
          <p className="text-sm">Ramo principal: <strong>{business.configured ? BUSINESS_BRANCHES[business.branch] : "Ainda não configurado"}</strong></p>
          <ul className="space-y-2 text-sm">{BUSINESS_RESOURCES.filter(({ key }) => business.resource(key).enabled).map(({ key, label }) => <li key={key}>{label}: {business.resource(key).operational ? "disponível" : "em preparação / homologação"}</li>)}</ul>
          <p className="text-sm text-muted-foreground">Ramo, liberação de módulos e layout do PDV são configurações separadas. Concluir estes dados não libera novas funcionalidades.</p>
          <Link href={BUSINESS_SETTINGS_HREF} className="text-sm underline" onClick={() => changeOpen(false)}>Revisar ramo e recursos em Configurações</Link>
        </div>}
        {(validation || message) && <p role="alert" className="text-sm">{validation || message}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <span className="text-xs text-muted-foreground">Passo {step} de 3</span>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={() => changeOpen(false)}>Voltar depois</Button>
            {step > 1 && <Button type="button" variant="outline" disabled={saving} onClick={() => setStep((value) => value - 1)}>Voltar</Button>}
            <Button type="submit" disabled={busy}>{saving ? "Salvando e conferindo…" : step < 3 ? "Continuar" : "Concluir"}</Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Voltar depois mantém os dados já salvos. Ao fechar o assistente, o preenchimento ainda não salvo é descartado.</p>
      </form>}
      {finished && <div className="space-y-4">
        <p role="status">Dados básicos salvos e conferidos.</p>
        <ul className="space-y-3 text-sm">
          {business.permissions?.hubs.cadastros && <><li><Link className="underline" href="/dashboard/cadastros-v2" onClick={() => changeOpen(false)}>Acessar Cadastros para incluir produtos</Link></li><li><Link className="underline" href="/dashboard/clientes" onClick={() => changeOpen(false)}>Acessar Clientes</Link></li></>}
          {business.canConfigure && <li><Link className="underline" href="/dashboard/configuracoes?sec=geral" onClick={() => changeOpen(false)}>Revisar dados e configurações operacionais</Link></li>}
        </ul>
        <Button onClick={() => changeOpen(false)}>Fechar</Button>
      </div>}
    </DialogContent>
  </Dialog>
}
