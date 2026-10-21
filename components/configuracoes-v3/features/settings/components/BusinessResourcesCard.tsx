"use client"

import { useState } from "react"
import { useStoreBusiness } from "@/lib/use-store-business"
import {
  BUSINESS_BRANCHES, BUSINESS_RESOURCES, businessPresentation, resolveBusinessResource,
  type BusinessBranch, type BusinessPresentation, type BusinessResourceKey,
} from "@/lib/store-business-capabilities"
import type { StoreCapabilitiesV1 } from "@/lib/capabilities-persistence-v1"
import { SettingsCard } from "./SettingsCard"
import { Button } from "@/components/configuracoes-v3/components/ui/button"
import { Input } from "@/components/configuracoes-v3/components/ui/input"
import { useToast } from "@/components/configuracoes-v3/hooks/use-toast"

export function BusinessResourcesCard() {
  const business = useStoreBusiness()
  if (!business.ready && business.hydrated) return <div role="alert" className="space-y-2 text-sm">
    <p>Não foi possível carregar ramo e recursos desta unidade.</p>
    <Button type="button" variant="outline" onClick={() => void business.refresh()}>Tentar novamente</Button>
  </div>
  if (!business.ready) return <p role="status">Carregando ramo e recursos da unidade…</p>
  return <BusinessResourcesForm key={business.storeId} />
}

function BusinessResourcesForm() {
  const { branch, capabilities, canConfigure, ready, save, legacyProfile } = useStoreBusiness()
  const { toast } = useToast()
  const [selected, setSelected] = useState<BusinessBranch | null>(null)
  const [overrides, setOverrides] = useState<Partial<Record<BusinessResourceKey, boolean>>>({})
  const [presentation, setPresentation] = useState<BusinessPresentation>({})
  const [saving, setSaving] = useState(false)
  const draft: StoreCapabilitiesV1 = {
    version: 1,
    business: {
      ...capabilities?.business,
      ...(selected !== null ? { primaryBranch: selected } : {}),
      presentation: { ...capabilities?.business?.presentation, ...presentation },
    },
    overrides: { ...capabilities?.overrides, ...overrides },
  }
  const examples = businessPresentation(draft)
  const disabled = !ready || !canConfigure || saving
  const dirty = selected !== null || Object.keys(overrides).length > 0 || Object.keys(presentation).length > 0

  async function submit() {
    setSaving(true)
    try {
      // Somente escolhas tocadas; nunca reenviar o snapshot inteiro da loja.
      await save({ printerConfig: { capabilities: {
        version: 1,
        business: {
          ...(selected !== null ? { primaryBranch: selected } : {}),
          ...(Object.keys(presentation).length ? { presentation } : {}),
        },
        ...(Object.keys(overrides).length ? { overrides } : {}),
      } } })
      setSelected(null)
      setOverrides({})
      setPresentation({})
      toast({ title: "Ramo e recursos salvos", description: "Configuração atualizada para esta unidade." })
    } catch (error) {
      toast({ title: "Não foi possível salvar", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" })
    } finally { setSaving(false) }
  }

  return (
    <section id="ramo-recursos" className="scroll-mt-6">
      <SettingsCard title="Ramo e recursos" description="Escolha o ramo uma vez e combine os recursos que sua loja utiliza. Suas escolhas têm prioridade sobre as sugestões."
        footer={<Button type="button" disabled={disabled || !dirty} onClick={() => void submit()}>{saving ? "Salvando…" : "Salvar ramo e recursos"}</Button>}>
        {!canConfigure && <p className="mb-4 text-sm text-muted-foreground">Somente responsáveis com permissão de Configurações podem editar.</p>}
        <label htmlFor="business-branch" className="text-sm font-medium">Ramo principal</label>
        <select id="business-branch" value={selected ?? branch} disabled={disabled}
          onChange={(event) => setSelected(event.target.value as BusinessBranch)}
          className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
          {Object.entries(BUSINESS_BRANCHES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <div className="mt-5 divide-y divide-border">
          {BUSINESS_RESOURCES.map((item) => {
            const state = resolveBusinessResource(draft, item.key, legacyProfile)
            return <label key={item.key} className="flex cursor-pointer items-start gap-3 py-3">
              <input type="checkbox" checked={state.requested} disabled={disabled}
                onChange={(event) => setOverrides((current) => ({ ...current, [item.key]: event.target.checked }))}
                className="mt-1 h-4 w-4 shrink-0 accent-primary" />
              <span className="min-w-0 text-sm"><span className="font-medium">{item.label}</span>
                <span className="ml-2 text-xs text-muted-foreground">{state.source === "explicit" ? "Escolha explícita" : "Sugestão do ramo"}</span>
                {item.stage === "preparation" && <span className="mt-1 block text-xs text-muted-foreground">
                  Preparação de cadastro. {item.key === "catalog.weight" ? "Venda fracionada e baixa em kg/g ainda indisponíveis; produtos por peso ficam bloqueados para venda." : "Estoque por combinação e venda de variações ainda indisponíveis."}
                </span>}
              </span>
            </label>
          })}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Integração com balança: indisponível, depende de equipamento e homologação por terminal. Cor de acessórios não representa grade comercial.</p>
        <p className="mt-2 text-xs text-muted-foreground">Para padaria, recomendamos o PDV Clássico. Salvar o ramo preserva a escolha atual de PDV, preços, produtos e estoque.</p>
        <details className="mt-5 text-sm">
          <summary className="cursor-pointer font-medium">Padrões de apresentação do cadastro</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {([
              ["productExample", "Exemplo de produto"], ["categoryExample", "Exemplo de categoria"], ["brandExample", "Exemplo de marca"],
            ] as const).map(([key, label]) => <div key={key} className="space-y-1.5">
              <label htmlFor={`business-${key}`}>{label}</label>
              <Input id={`business-${key}`} maxLength={160} disabled={disabled} value={examples[key]}
                onChange={(event) => setPresentation((current) => ({ ...current, [key]: event.target.value }))} />
            </div>)}
          </div>
        </details>
      </SettingsCard>
    </section>
  )
}
