"use client"

import { useState } from "react"
import { Loader2, Plug, Plus, RefreshCw, Unplug } from "lucide-react"
import { cn } from "@/lib/utils"
import type { MarketplaceConnectionsHub } from "@/components/marketplace/use-marketplace-connections"
import { MARKETPLACE_PROVIDER_IDS, MARKETPLACE_PROVIDER_META } from "@/lib/marketplace/providers"
import type { MarketplaceConnectionDTO, MarketplaceProviderCode } from "@/lib/marketplace/connection-api-types"
import { StatusPill } from "@/components/marketplace/lovable/StatusPill"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { MercadoLivreConnection } from "./MercadoLivreConnection"

const simulatedProviders = MARKETPLACE_PROVIDER_IDS.filter((id) => id !== "MERCADO_LIVRE")

function formatTimeAgoPt(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  if (diffMs < 0) return "—"
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return "agora"
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  const days = Math.floor(h / 24)
  return `há ${days} d`
}

function connectionStatusPill(c: MarketplaceConnectionDTO) {
  if (c.status === "DISCONNECTED") return <StatusPill status="warning" label="Simulação inativa" />
  if (c.status === "ERROR") return <StatusPill status="error" label="Erro na simulação" />
  return <StatusPill status="warning" label="Simulada" />
}

export function MarketplaceConnectionsReal({
  storeId,
  hub,
}: {
  storeId: string | null
  hub: MarketplaceConnectionsHub
}) {
  const { toast } = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [providerPick, setProviderPick] = useState<MarketplaceProviderCode>("SHOPEE")
  const [accountName, setAccountName] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)

  const onConnect = async () => {
    setBusyId("__dialog__")
    const r = await hub.connect(providerPick, accountName)
    setBusyId(null)
    if (!r.ok) {
      toast({ title: "Não foi possível criar a simulação", description: r.error, variant: "destructive" })
      return
    }
    toast({ title: "Simulação registrada para a unidade" })
    setDialogOpen(false)
    setAccountName("")
  }

  const onDisconnect = async (c: MarketplaceConnectionDTO) => {
    if (!confirm(`Desativar a simulação "${c.accountName}" (${MARKETPLACE_PROVIDER_META[c.provider].label})?`)) return
    setBusyId(c.id)
    const r = await hub.disconnect(c.id)
    setBusyId(null)
    if (!r.ok) {
      toast({ title: "Erro ao desativar a simulação", description: r.error, variant: "destructive" })
      return
    }
    toast({ title: "Simulação desativada" })
  }

  const onSync = async (c: MarketplaceConnectionDTO) => {
    setBusyId(c.id)
    const r = await hub.simulateSync(c.id)
    setBusyId(null)
    if (!r.ok) {
      toast({ title: "Falha na simulação", description: r.error, variant: "destructive" })
      return
    }
    toast({ title: "Simulação registrada no histórico local" })
  }

  if (!storeId?.trim()) {
    return (
      <section className="rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center">
        <p className="text-sm font-medium text-foreground">Selecione uma unidade no cabeçalho</p>
        <p className="mt-1 text-xs text-muted-foreground">
          As conexões de marketplace são salvas por loja. Escolha a unidade ativa para continuar.
        </p>
      </section>
    )
  }

  return (
    <>
      {hub.mercadoLivre && <MercadoLivreConnection key={storeId} storeId={storeId} connection={hub.mercadoLivre} refetch={hub.refetch} />}

      <div className="mb-4 mt-6 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Conexões simuladas</h3>
        <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setDialogOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Criar simulação
        </Button>
      </div>

      {hub.error && (
        <div role="alert" className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {hub.error}
        </div>
      )}

      {hub.loading && hub.connections.length === 0 ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Carregando conexões…</span>
        </div>
      ) : hub.connections.length === 0 ? (
        <section className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-muted/30 p-10 text-center shadow-sm">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Plug className="h-8 w-8" />
          </div>
          <h4 className="relative mt-5 font-display text-xl font-bold tracking-tight">Nenhuma conexão simulada</h4>
          <p className="relative mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            As simulações gravam resultados de demonstração no histórico desta unidade.
          </p>
        </section>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {hub.connections.map((c) => {
            const meta = MARKETPLACE_PROVIDER_META[c.provider]
            const busy = busyId === c.id
            return (
              <div
                key={c.id}
                className="surface-card surface-card-hover flex flex-col gap-4 rounded-2xl border border-border bg-card p-5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl text-sm font-bold", meta.badgeClass)}>
                    {meta.initials}
                  </div>
                  {connectionStatusPill(c)}
                </div>
                <div className="min-w-0">
                  <h4 className="font-semibold leading-tight">{meta.label}</h4>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">{c.accountName}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Última simulação:{" "}
                    <span className="font-medium text-foreground">{formatTimeAgoPt(c.lastSyncAt)}</span>
                  </p>
                  {c.lastSyncMessage ? (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{c.lastSyncMessage}</p>
                  ) : null}
                </div>
                <div className="mt-auto flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="gap-1.5"
                    disabled={busy || c.status !== "CONNECTED"}
                    onClick={() => void onSync(c)}
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Simular sincronização
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-destructive hover:text-destructive"
                    disabled={busy || c.status === "DISCONNECTED"}
                    onClick={() => void onDisconnect(c)}
                  >
                    <Unplug className="h-3.5 w-3.5" />
                    Desativar simulação
                  </Button>
                </div>
                {c.recentSyncLogs.length > 0 && (
                  <ul className="border-t border-border pt-3 text-xs text-muted-foreground space-y-1.5 max-h-28 overflow-y-auto">
                    {c.recentSyncLogs.slice(0, 6).map((l) => (
                      <li key={l.id} className="flex justify-between gap-2">
                        <span className="min-w-0 truncate">{l.message}</span>
                        <span className="shrink-0 tabular-nums opacity-80">{formatTimeAgoPt(l.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-8">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Canais em preparação</p>
        <div className="flex flex-wrap gap-2">
          {simulatedProviders.map((pid) => {
            const m = MARKETPLACE_PROVIDER_META[pid]
            return (
              <span
                key={pid}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium",
                )}
              >
                <span className={cn("grid h-6 w-6 place-items-center rounded-md text-[10px] font-bold", m.badgeClass)}>
                  {m.initials}
                </span>
                {m.label}
              </span>
            )
          })}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Criar conexão simulada</DialogTitle>
            <DialogDescription>
              Registra uma demonstração local para a unidade selecionada.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="mp-provider">Provedor</Label>
              <select
                id="mp-provider"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                value={providerPick}
                onChange={(e) => setProviderPick(e.target.value as MarketplaceProviderCode)}
              >
                {simulatedProviders.map((pid) => (
                  <option key={pid} value={pid}>
                    {MARKETPLACE_PROVIDER_META[pid].label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mp-account">Nome da conta</Label>
              <Input
                id="mp-account"
                placeholder="Ex.: Loja principal"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={busyId === "__dialog__"} onClick={() => void onConnect()}>
              {busyId === "__dialog__" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar simulação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
