"use client"

import { useEffect, useRef, useState } from "react"
import { Scale } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { useStoreBusiness } from "@/lib/use-store-business"

export function PdvScaleVisorSettingsCard() {
  const business = useStoreBusiness()
  if (!business.canConfigure) return null
  return (
    <section aria-labelledby="pdv-scale-settings-title" className="rounded-xl border border-border/50 bg-card/50 p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <Scale className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <h3 id="pdv-scale-settings-title" className="text-sm font-semibold text-foreground">Balança e visor de peso</h3>
      </div>
      {business.ready ? <ScaleVisorEditor key={business.storeId} business={business} /> : (
        <p role="status" className="text-xs text-muted-foreground">{business.hydrated ? "Configurações indisponíveis. Recarregue a página para tentar novamente." : "Carregando configurações da unidade…"}</p>
      )}
    </section>
  )
}

function ScaleVisorEditor({ business }: { business: ReturnType<typeof useStoreBusiness> }) {
  const [savedValue, setSavedValue] = useState(business.pdvScaleVisorVisible)
  const [draft, setDraft] = useState(business.pdvScaleVisorVisible)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const alive = useRef(true)
  const dirty = draft !== savedValue
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    if (!dirty && !saving) {
      setSavedValue(business.pdvScaleVisorVisible)
      setDraft(business.pdvScaleVisorVisible)
    }
  }, [business.pdvScaleVisorVisible, dirty, saving])

  const save = async () => {
    if (saving || !dirty || !business.ready || !business.canConfigure) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch(`/api/stores/${encodeURIComponent(business.storeId)}/settings`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json", [ASSISTEC_LOJA_HEADER]: business.storeId },
        body: JSON.stringify({ printerConfig: { pdvScaleVisorVisible: draft } }),
      })
      const result = await res.json().catch(() => null)
      if (!res.ok || result?.ok !== true || result?.settings?.storeId !== business.storeId ||
        result?.settings?.printerConfig?.pdvScaleVisorVisible !== draft) {
        throw new Error("Não foi possível confirmar o salvamento do visor. Tente novamente.")
      }
      if (!alive.current) return
      setSavedValue(draft)
      setSaved(true)
      await business.refresh()
    } catch {
      if (alive.current) setError("Não foi possível salvar o visor de peso. Suas alterações continuam pendentes; tente novamente.")
    } finally {
      if (alive.current) setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm font-medium text-foreground">
        <input type="checkbox" checked={draft} disabled={saving} className="mt-1 h-4 w-4 shrink-0 accent-primary"
          aria-describedby="pdv-scale-settings-help" onChange={(event) => { setDraft(event.target.checked); setError(null); setSaved(false) }} />
        Exibir visor de peso no PDV
      </label>
      <p id="pdv-scale-settings-help" className="text-xs leading-relaxed text-muted-foreground">Mostra o peso recebido da balança ao lado do total da venda. Não habilita automaticamente vendas por peso.</p>
      <p className="text-xs text-muted-foreground">Estado atual: {savedValue ? "visor visível" : "visor oculto"}. {typeof business.blob.pdvScaleVisorVisible === "boolean" ? "Escolha manual da unidade." : "Padrão do ramo da unidade."}</p>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {saved && <p role="status" className="text-xs text-muted-foreground">Preferência do visor salva nesta unidade.</p>}
      {dirty && <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" className="min-h-10 text-xs" disabled={saving}
          onClick={() => { setDraft(savedValue); setError(null); setSaved(false) }}>Cancelar visor</Button>
        <Button type="button" className="min-h-10 text-xs" disabled={saving} onClick={() => void save()}>{saving ? "Salvando visor…" : "Salvar visor"}</Button>
      </div>}
    </div>
  )
}
