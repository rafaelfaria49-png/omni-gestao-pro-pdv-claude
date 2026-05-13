"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, Package, RefreshCw, Upload } from "lucide-react"
import { cn } from "@/lib/utils"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { MARKETPLACE_PROVIDER_META } from "@/lib/marketplace/providers"
import type { MarketplaceConnectionDTO } from "@/lib/marketplace/connection-api-types"
import type { MarketplaceCatalogProductDTO, MarketplaceProductLinkDTO } from "@/lib/marketplace/product-api-types"
import { StatusPill } from "@/components/marketplace/lovable/StatusPill"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"

function fmtBrl(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)
}

function publicationPill(link: MarketplaceProductLinkDTO | undefined) {
  if (!link || link.status === "NOT_PUBLISHED") {
    return <StatusPill status="warning" label="Não publicado" />
  }
  if (link.status === "ERROR" || link.syncStatus === "SYNC_ERROR") {
    return <StatusPill status="error" label="Erro" />
  }
  if (link.status === "PUBLISHED" && link.syncStatus === "SYNCED") {
    return <StatusPill status="online" label="Publicado" />
  }
  if (link.status === "PUBLISHED") {
    return <StatusPill status="syncing" label="Publicado" />
  }
  return <StatusPill status="warning" label="Não publicado" />
}

function syncPill(link: MarketplaceProductLinkDTO | undefined) {
  if (!link) return <span className="text-xs text-muted-foreground">—</span>
  if (link.syncStatus === "SYNCED") return <StatusPill status="online" label="Sincronizado" />
  if (link.syncStatus === "SYNC_ERROR") return <StatusPill status="error" label="Sync erro" />
  if (link.syncStatus === "PENDING") return <StatusPill status="syncing" label="Pendente" />
  return <span className="text-xs text-muted-foreground">—</span>
}

export function MarketplaceCatalogReal({
  storeId,
  connections,
  onCatalogActivity,
  onProductCount,
}: {
  storeId: string | null
  connections: MarketplaceConnectionDTO[]
  onCatalogActivity?: () => void | Promise<void>
  onProductCount?: (n: number) => void
}) {
  const { toast } = useToast()
  const [connectionId, setConnectionId] = useState<string>("")
  const [rows, setRows] = useState<MarketplaceCatalogProductDTO[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyProductId, setBusyProductId] = useState<string | null>(null)

  useEffect(() => {
    if (!connectionId && connections.length > 0) {
      setConnectionId(connections[0].id)
    }
  }, [connections, connectionId])

  const load = useCallback(async () => {
    const sid = storeId?.trim()
    if (!sid) {
      setRows([])
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const q = connectionId.trim() ? `?connectionId=${encodeURIComponent(connectionId.trim())}` : ""
      const r = await fetch(`/api/marketplace/produtos${q}`, {
        credentials: "include",
        cache: "no-store",
        headers: { [ASSISTEC_LOJA_HEADER]: sid },
      })
      const j = (await r.json().catch(() => null)) as { products?: MarketplaceCatalogProductDTO[]; error?: string }
      if (!r.ok) {
        setError(j?.error || `Erro ${r.status}`)
        setRows([])
        return
      }
      const list = Array.isArray(j?.products) ? j.products : []
      setRows(list)
      onProductCount?.(list.length)
    } catch {
      setError("Falha ao carregar catálogo")
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [storeId, connectionId, onProductCount])

  useEffect(() => {
    void load()
  }, [load])

  const connLabel = useMemo(() => {
    const c = connections.find((x) => x.id === connectionId)
    if (!c) return ""
    const meta = MARKETPLACE_PROVIDER_META[c.provider]
    return `${meta.label} · ${c.accountName}`
  }, [connections, connectionId])

  const runExport = async (productId: string) => {
    const sid = storeId?.trim()
    const cid = connectionId.trim()
    if (!sid || !cid) {
      toast({ title: "Selecione um canal", variant: "destructive" })
      return
    }
    setBusyProductId(productId)
    try {
      const r = await fetch("/api/marketplace/produtos/exportar", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          [ASSISTEC_LOJA_HEADER]: sid,
        },
        body: JSON.stringify({ connectionId: cid, productIds: [productId] }),
      })
      const j = (await r.json().catch(() => null)) as { error?: string }
      if (!r.ok) {
        toast({ title: "Exportação não concluída", description: j?.error || `HTTP ${r.status}`, variant: "destructive" })
        return
      }
      toast({ title: "Exportação simulada", description: "Registro gravado e log de sync criado." })
      await load()
      await onCatalogActivity?.()
    } finally {
      setBusyProductId(null)
    }
  }

  const runPatch = async (productId: string, action: "sync" | "update_stock") => {
    const sid = storeId?.trim()
    const cid = connectionId.trim()
    if (!sid || !cid) return
    setBusyProductId(productId)
    try {
      const r = await fetch(`/api/marketplace/produtos/${encodeURIComponent(productId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          [ASSISTEC_LOJA_HEADER]: sid,
        },
        body: JSON.stringify({ connectionId: cid, action }),
      })
      const j = (await r.json().catch(() => null)) as { error?: string }
      if (!r.ok) {
        toast({
          title: action === "sync" ? "Sincronização" : "Estoque",
          description: j?.error || `HTTP ${r.status}`,
          variant: "destructive",
        })
        return
      }
      toast({
        title: action === "sync" ? "Sincronização simulada" : "Estoque atualizado",
        description: "Alterações persistidas no vínculo e log gravado.",
      })
      await load()
      await onCatalogActivity?.()
    } finally {
      setBusyProductId(null)
    }
  }

  if (!storeId?.trim()) {
    return (
      <section className="rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center">
        <p className="text-sm font-medium text-foreground">Selecione uma unidade no cabeçalho</p>
        <p className="mt-1 text-xs text-muted-foreground">O catálogo de produtos reais é carregado por loja.</p>
      </section>
    )
  }

  if (connections.length === 0) {
    return (
      <section className="rounded-2xl border border-border bg-card p-8 text-center space-y-2">
        <Package className="h-10 w-10 mx-auto text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Nenhuma conta de marketplace</p>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">
          Conecte um canal acima para exportar produtos do cadastro (estoque) e simular publicação com logs persistidos.
        </p>
      </section>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Canal alvo</span>
          <select
            value={connectionId}
            onChange={(e) => setConnectionId(e.target.value)}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          >
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {MARKETPLACE_PROVIDER_META[c.provider].label} — {c.accountName}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Recarregar</span>
        </Button>
      </div>
      {connLabel ? <p className="text-xs text-muted-foreground">Publicação simulada em: {connLabel}</p> : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="surface-card rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="marketplace-catalog-table">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-5 py-3">Produto</th>
                <th className="text-left font-medium px-5 py-3">SKU</th>
                <th className="text-left font-medium px-5 py-3">Estoque ERP</th>
                <th className="text-left font-medium px-5 py-3">Publicação</th>
                <th className="text-left font-medium px-5 py-3">Sync</th>
                <th className="text-left font-medium px-5 py-3">Preço anúncio</th>
                <th className="text-left font-medium px-5 py-3">Estoque canal</th>
                <th className="text-right font-medium px-5 py-3">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((p) => {
                const link = p.links[0]
                const busy = busyProductId === p.id
                const canSync = link?.status === "PUBLISHED"
                return (
                  <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3.5 font-medium min-w-[140px]">{p.name}</td>
                    <td className="px-5 py-3.5 text-muted-foreground font-mono text-xs">{p.sku || "—"}</td>
                    <td className="px-5 py-3.5">
                      <span
                        className={cn(
                          "font-semibold",
                          p.stock === 0 ? "text-destructive" : p.stock < 10 ? "text-warning" : "text-foreground",
                        )}
                      >
                        {p.stock}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">{publicationPill(link)}</td>
                    <td className="px-5 py-3.5">{syncPill(link)}</td>
                    <td className="px-5 py-3.5 font-medium">{link ? fmtBrl(link.price) : fmtBrl(p.price)}</td>
                    <td className="px-5 py-3.5">{link ? link.stock : "—"}</td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-8"
                          disabled={busy}
                          onClick={() => void runExport(p.id)}
                          title="Exportar / simular publicação"
                        >
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                          <span className="ml-1 hidden sm:inline">Exportar</span>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          disabled={busy || !canSync}
                          onClick={() => void runPatch(p.id, "sync")}
                          title={!canSync ? "Exporte antes" : "Sincronizar (simulado)"}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          <span className="ml-1 hidden sm:inline">Sync</span>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          disabled={busy || !link}
                          onClick={() => void runPatch(p.id, "update_stock")}
                          title={!link ? "Exporte antes" : "Atualizar estoque no canal (simulado)"}
                        >
                          <Package className="h-3.5 w-3.5" />
                          <span className="ml-1 hidden lg:inline">Estoque</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-muted-foreground">
                    Nenhum produto ativo no cadastro desta unidade.
                  </td>
                </tr>
              ) : null}
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin inline mr-2 align-middle" />
                    Carregando produtos…
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
