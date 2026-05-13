"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, Package, RefreshCw, RotateCcw, ScrollText } from "lucide-react"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { MARKETPLACE_PROVIDER_META } from "@/lib/marketplace/providers"
import type { MarketplaceConnectionDTO } from "@/lib/marketplace/connection-api-types"
import type {
  MarketplaceAnnouncementRowDTO,
  MarketplaceSyncLogEntryDTO,
} from "@/lib/marketplace/product-api-types"
import { StatusPill } from "@/components/marketplace/lovable/StatusPill"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useToast } from "@/hooks/use-toast"

function fmtBrl(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)
}

function fmtDt(iso: string | null) {
  if (!iso) return "—"
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso))
  } catch {
    return "—"
  }
}

function publicationPill(status: string) {
  if (status === "NOT_PUBLISHED") return <StatusPill status="warning" label="Não publicado" />
  if (status === "ERROR") return <StatusPill status="error" label="Erro" />
  if (status === "PUBLISHED") return <StatusPill status="online" label="Publicado" />
  return <StatusPill status="warning" label={status} />
}

function syncPill(sync: string) {
  if (sync === "SYNCED") return <StatusPill status="online" label="Sincronizado" />
  if (sync === "SYNC_ERROR") return <StatusPill status="error" label="Sync erro" />
  if (sync === "PENDING") return <StatusPill status="syncing" label="Pendente" />
  if (sync === "IDLE") return <span className="text-xs text-muted-foreground">Idle</span>
  return <span className="text-xs text-muted-foreground">{sync}</span>
}

export function MarketplaceAnnouncementsPanel({
  storeId,
  connections,
  onActivity,
}: {
  storeId: string | null
  connections: MarketplaceConnectionDTO[]
  onActivity?: () => void | Promise<void>
}) {
  const { toast } = useToast()
  const prevStoreRef = useRef<string | null>(null)
  const [filterConnection, setFilterConnection] = useState<string>("")
  const [filterStatus, setFilterStatus] = useState<string>("")
  const [filterSync, setFilterSync] = useState<string>("")
  const [q, setQ] = useState("")
  const [qDebounced, setQDebounced] = useState("")
  const [rows, setRows] = useState<MarketplaceAnnouncementRowDTO[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyLinkId, setBusyLinkId] = useState<string | null>(null)

  const [logsOpen, setLogsOpen] = useState(false)
  const [logsTitle, setLogsTitle] = useState("")
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsError, setLogsError] = useState<string | null>(null)
  const [logs, setLogs] = useState<MarketplaceSyncLogEntryDTO[]>([])
  const [logCtx, setLogCtx] = useState<{
    connectionId: string
    produtoId: string
    linkId: string
  } | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 400)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    const sid = storeId?.trim() ?? ""
    if (prevStoreRef.current !== null && prevStoreRef.current !== sid && sid) {
      setFilterConnection("")
      setFilterStatus("")
      setFilterSync("")
      setQ("")
      setQDebounced("")
    }
    prevStoreRef.current = sid || null
  }, [storeId])

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
      const p = new URLSearchParams()
      if (filterConnection.trim()) p.set("connectionId", filterConnection.trim())
      if (filterStatus.trim()) p.set("status", filterStatus.trim())
      if (filterSync.trim()) p.set("syncStatus", filterSync.trim())
      if (qDebounced) p.set("q", qDebounced)
      const qs = p.toString()
      const r = await fetch(`/api/marketplace/anuncios${qs ? `?${qs}` : ""}`, {
        credentials: "include",
        cache: "no-store",
        headers: { [ASSISTEC_LOJA_HEADER]: sid },
      })
      const j = (await r.json().catch(() => null)) as {
        announcements?: MarketplaceAnnouncementRowDTO[]
        error?: string
      }
      if (!r.ok) {
        setError(j?.error || `Erro ${r.status}`)
        setRows([])
        return
      }
      setRows(Array.isArray(j?.announcements) ? j.announcements : [])
    } catch {
      setError("Não foi possível carregar os anúncios. Verifique a conexão e tente de novo.")
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [storeId, filterConnection, filterStatus, filterSync, qDebounced])

  useEffect(() => {
    void load()
  }, [load])

  const fetchLogs = useCallback(
    async (ctx: { connectionId: string; produtoId: string; linkId: string }, title: string) => {
      const sid = storeId?.trim()
      if (!sid) return
      setLogsTitle(title)
      setLogCtx(ctx)
      setLogsLoading(true)
      setLogsError(null)
      setLogs([])
      try {
        const p = new URLSearchParams()
        p.set("connectionId", ctx.connectionId)
        p.set("produtoId", ctx.produtoId)
        p.set("linkId", ctx.linkId)
        p.set("limit", "40")
        const r = await fetch(`/api/marketplace/sync-logs?${p.toString()}`, {
          credentials: "include",
          cache: "no-store",
          headers: { [ASSISTEC_LOJA_HEADER]: sid },
        })
        const j = (await r.json().catch(() => null)) as { logs?: MarketplaceSyncLogEntryDTO[]; error?: string }
        if (!r.ok) {
          setLogsError(j?.error || `Erro ${r.status}`)
          return
        }
        setLogs(Array.isArray(j?.logs) ? j.logs : [])
      } catch {
        setLogsError("Falha ao carregar o histórico.")
      } finally {
        setLogsLoading(false)
      }
    },
    [storeId],
  )

  const openLogs = (row: MarketplaceAnnouncementRowDTO) => {
    setLogsOpen(true)
    void fetchLogs(
      {
        connectionId: row.link.connectionId,
        produtoId: row.produtoId,
        linkId: row.link.id,
      },
      row.produtoName,
    )
  }

  const runLinkAction = async (linkId: string, action: "sync" | "update_stock" | "republicate") => {
    const sid = storeId?.trim()
    if (!sid) return
    setBusyLinkId(linkId)
    try {
      const r = await fetch(`/api/marketplace/links/${encodeURIComponent(linkId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          [ASSISTEC_LOJA_HEADER]: sid,
        },
        body: JSON.stringify({ action }),
      })
      const j = (await r.json().catch(() => null)) as { error?: string }
      if (!r.ok) {
        toast({
          title: "Ação não concluída",
          description: j?.error || `HTTP ${r.status}`,
          variant: "destructive",
        })
        return
      }
      const titles: Record<typeof action, string> = {
        sync: "Sincronização simulada",
        update_stock: "Estoque atualizado",
        republicate: "Marcado para republicar",
      }
      toast({ title: titles[action], description: "Registro atualizado e log gravado." })
      await load()
      await onActivity?.()
      if (logsOpen && logCtx?.linkId === linkId) {
        void fetchLogs(logCtx, logsTitle)
      }
    } finally {
      setBusyLinkId(null)
    }
  }

  if (!storeId?.trim()) {
    return (
      <section className="rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center">
        <p className="text-sm font-medium text-foreground">Selecione uma unidade no cabeçalho</p>
        <p className="mt-1 text-xs text-muted-foreground">O painel de anúncios usa dados reais por loja.</p>
      </section>
    )
  }

  if (connections.length === 0) {
    return (
      <section className="rounded-2xl border border-border bg-card p-8 text-center space-y-2">
        <Package className="h-10 w-10 mx-auto text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Nenhuma conta conectada</p>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">
          Conecte um marketplace acima para ver vínculos e anúncios simulados por canal.
        </p>
      </section>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          <label className="text-xs text-muted-foreground flex items-center gap-2">
            <span className="font-medium text-foreground">Canal</span>
            <select
              value={filterConnection}
              onChange={(e) => setFilterConnection(e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground min-w-[180px]"
            >
              <option value="">Todos os canais</option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {MARKETPLACE_PROVIDER_META[c.provider].label} — {c.accountName}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground flex items-center gap-2">
            <span className="font-medium text-foreground">Status</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
            >
              <option value="">Todos</option>
              <option value="NOT_PUBLISHED">Não publicado</option>
              <option value="PUBLISHED">Publicado</option>
              <option value="ERROR">Erro</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground flex items-center gap-2">
            <span className="font-medium text-foreground">Sync</span>
            <select
              value={filterSync}
              onChange={(e) => setFilterSync(e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
            >
              <option value="">Todos</option>
              <option value="IDLE">Idle</option>
              <option value="PENDING">Pendente</option>
              <option value="SYNCED">Sincronizado</option>
              <option value="SYNC_ERROR">Sync erro</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Input
            placeholder="Buscar por nome do produto…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs bg-background"
            aria-label="Buscar produto"
          />
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Atualizar</span>
          </Button>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="surface-card rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]" data-testid="marketplace-announcements-table">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Produto</th>
                <th className="text-left font-medium px-4 py-3">Canal</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-left font-medium px-4 py-3">Sync</th>
                <th className="text-left font-medium px-4 py-3">Preço</th>
                <th className="text-left font-medium px-4 py-3">Estoque</th>
                <th className="text-left font-medium px-4 py-3">Publicado</th>
                <th className="text-left font-medium px-4 py-3">Atualizado</th>
                <th className="text-right font-medium px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const busy = busyLinkId === row.link.id
                const canSync = row.link.status === "PUBLISHED"
                const meta = MARKETPLACE_PROVIDER_META[row.provider as keyof typeof MARKETPLACE_PROVIDER_META]
                const channelLabel = `${meta?.label ?? row.provider} · ${row.connectionAccountName}`
                return (
                  <tr key={row.link.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{row.produtoName}</div>
                      <div className="text-xs text-muted-foreground font-mono">{row.produtoSku || "—"}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[200px]">{channelLabel}</td>
                    <td className="px-4 py-3">{publicationPill(row.link.status)}</td>
                    <td className="px-4 py-3">{syncPill(row.link.syncStatus)}</td>
                    <td className="px-4 py-3 font-medium">{fmtBrl(row.link.price)}</td>
                    <td className="px-4 py-3">{row.link.stock}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {fmtDt(row.link.publishedAt)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {fmtDt(row.link.updatedAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          disabled={busy || !canSync}
                          onClick={() => void runLinkAction(row.link.id, "sync")}
                          title={!canSync ? "Publique (exporte) antes" : "Sincronizar"}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          disabled={busy}
                          onClick={() => void runLinkAction(row.link.id, "update_stock")}
                          title="Atualizar estoque (simulado)"
                        >
                          <Package className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-8"
                          disabled={busy}
                          onClick={() => void runLinkAction(row.link.id, "republicate")}
                          title="Marcar para republicar"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8"
                          disabled={busy}
                          onClick={() => openLogs(row)}
                          title="Ver logs"
                        >
                          <ScrollText className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                    <p className="font-medium text-foreground">Nenhum vínculo ainda</p>
                    <p className="text-xs mt-1 max-w-md mx-auto">
                      Exporte produtos na secção de catálogo acima para criar anúncios simulados por canal. Os filtros
                      também podem estar a excluir todos os registos.
                    </p>
                  </td>
                </tr>
              ) : null}
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin inline mr-2 align-middle" />
                    A carregar anúncios…
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <Sheet open={logsOpen} onOpenChange={setLogsOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle>Logs do anúncio</SheetTitle>
            <SheetDescription className="line-clamp-2">{logsTitle}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 min-h-0 overflow-y-auto mt-4 space-y-2 pr-1">
            {logsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
                <Loader2 className="h-5 w-5 animate-spin" /> A carregar…
              </div>
            ) : null}
            {logsError ? (
              <p className="text-sm text-destructive" role="alert">
                {logsError}
              </p>
            ) : null}
            {!logsLoading && !logsError && logs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Sem entradas para este filtro.</p>
            ) : null}
            {logs.map((log) => (
              <div
                key={log.id}
                className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs space-y-1"
              >
                <div className="text-muted-foreground">{fmtDt(log.createdAt)}</div>
                <div className="text-foreground leading-snug">{log.message}</div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
