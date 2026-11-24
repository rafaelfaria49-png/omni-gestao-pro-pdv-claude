"use client"

import { useEffect, useState } from "react"
import { ChevronRight, Loader2, Plug, Search, Unplug } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import type { MarketplaceReadConnection, MarketplaceReadListing, MarketplaceReadPage } from "@/lib/marketplace/read-only-types"
import { StatusPill } from "./lovable/StatusPill"

const endpoint = "/api/marketplace/mercado-livre"
const statusLabels = {
  not_configured: "Não configurado",
  awaiting_authorization: "Aguardando autorização",
  validated: "Conectado e validado",
  token_expired: "Token expirado",
  reconnect_required: "Reconexão necessária",
  insufficient_permissions: "Permissão insuficiente",
  disconnected: "Conta desconectada",
  communication_error: "Erro de comunicação",
} satisfies Record<MarketplaceReadConnection["state"], string>

const notices = new Map([
  ["denied", "Autorização cancelada no Mercado Livre."],
  ["invalid_state", "Autorização inválida ou expirada. Reinicie a conexão."],
  ["session_required", "Entre com o mesmo usuário que iniciou a autorização e confirme o acesso à unidade."],
  ["account_mismatch", "A conta escolhida não pode ser vinculada nesta unidade. Use a conta autorizada para a loja."],
  ["insufficient_permissions", "Confira as permissões de leitura e acesso offline no Mercado Livre antes de reconectar."],
  ["reconnect_required", "A autorização do Mercado Livre expirou ou foi revogada. Reconecte a conta."],
  ["rate_limited", "O Mercado Livre limitou as tentativas. Aguarde e reinicie a autorização."],
  ["communication_error", "Não foi possível confirmar a autorização no Mercado Livre. Tente novamente."],
])

function priceLabel(price: number | null, currency: string | null) {
  if (price === null) return "Não informado"
  return currency ? new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(price) : price.toLocaleString("pt-BR")
}

function ListingImages({ urls }: { urls: string[] }) {
  return urls.length > 0 && (
    <div className="flex flex-wrap gap-2">
      {Array.from(new Set(urls)).map((url, index) => (
        // O adapter restringe as origens de mídia e o navegador consulta a imagem diretamente.
        // eslint-disable-next-line @next/next/no-img-element
        <img key={url} src={url} alt={`Imagem ${index + 1} do anúncio`} loading="lazy" referrerPolicy="no-referrer"
          width={56} height={56} className="size-14 rounded-md border border-border bg-muted object-contain" />
      ))}
    </div>
  )
}

function ListingCard({ listing }: { listing: MarketplaceReadListing }) {
  return (
    <li className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="space-y-1">
        <h4 className="break-words font-medium">{listing.title}</h4>
        <p className="break-words text-xs text-muted-foreground">{listing.id} · {listing.status}</p>
      </div>
      <div className="space-y-1 break-words text-sm">
        <p className="font-semibold tabular-nums">{priceLabel(listing.price, listing.currency)}</p>
        <p>Disponibilidade no canal: {listing.availableQuantity ?? "Não informada"}</p>
        {listing.categoryId && <p>Categoria: {listing.categoryId}</p>}
        {listing.sku && <p>SKU: {listing.sku}</p>}
        {listing.sellerCustomField && <p>Código do vendedor: {listing.sellerCustomField}</p>}
        {listing.color && <p>Cor: {listing.color}</p>}
        {listing.size && <p>Tamanho: {listing.size}</p>}
        {listing.userProductId && <p className="text-muted-foreground">User Product: {listing.userProductId}</p>}
        {(listing.familyName || listing.familyId) && <p>Família: {listing.familyName || listing.familyId}</p>}
      </div>
      <ListingImages urls={listing.images} />
      {listing.variations.length > 0 && (
        <details className="rounded-lg border border-border p-2 text-sm">
          <summary className="cursor-pointer font-medium">Variações ({listing.variations.length})</summary>
          <ul className="divide-y divide-border">
            {listing.variations.map((variation) => (
              <li key={variation.id} className="space-y-1 break-words py-2">
                <p className="font-medium">{[variation.color, variation.size].filter(Boolean).join(" · ") || `Variação ${variation.id}`}</p>
                <p className="text-xs text-muted-foreground">ID: {variation.id}</p>
                {variation.sku && <p>SKU: {variation.sku}</p>}
                {variation.sellerCustomField && <p>Código do vendedor: {variation.sellerCustomField}</p>}
                <p>Disponibilidade no canal: {variation.availableQuantity ?? "Não informada"}</p>
                <p>Preço: {priceLabel(variation.price, listing.currency)}</p>
                <ListingImages urls={variation.images} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  )
}

async function request<T>(storeId: string, path: string, method: "POST" | "DELETE", body?: { cursor?: string }): Promise<T> {
  const response = await fetch(endpoint + path, {
    method, cache: "no-store", credentials: "same-origin",
    headers: { [ASSISTEC_LOJA_HEADER]: storeId, ...(body && { "Content-Type": "application/json" }) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload) throw new Error(payload?.error ?? "Não foi possível concluir a operação.")
  return payload as T
}

export function MercadoLivreConnection({ storeId, connection, refetch }: {
  storeId: string
  connection: MarketplaceReadConnection
  refetch: () => Promise<void>
}) {
  const [busy, setBusy] = useState<"authorize" | "disconnect" | "list" | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState<(MarketplaceReadPage & { number: number }) | null>(null)

  useEffect(() => {
    const url = new URL(window.location.href)
    const result = url.searchParams.get("meli")
    if (!result) return
    setNotice(notices.get(result) ?? null)
    url.searchParams.delete("meli")
    window.history.replaceState(window.history.state, "", url)
  }, [])

  useEffect(() => {
    if (!connection.canRead) setPage(null)
  }, [connection.canRead])

  useEffect(() => {
    function restoreConnection(event: PageTransitionEvent) {
      if (!event.persisted) return
      setBusy(null)
      void refetch()
    }
    window.addEventListener("pageshow", restoreConnection)
    return () => window.removeEventListener("pageshow", restoreConnection)
  }, [refetch])

  async function authorize() {
    setBusy("authorize")
    setError(null)
    setNotice(null)
    try {
      const result = await request<{ authorizationUrl: string }>(storeId, "", "POST")
      window.location.assign(result.authorizationUrl)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Falha ao iniciar a autorização.")
      setBusy(null)
    }
  }

  async function disconnect() {
    if (!window.confirm("Desconectar o Mercado Livre nesta unidade? A autorização no canal pode ser revogada na conta Mercado Livre.")) return
    setBusy("disconnect")
    setError(null)
    setNotice(null)
    try {
      await request(storeId, "", "DELETE")
      setPage(null)
      await refetch()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Falha ao desconectar a conta.")
    } finally {
      setBusy(null)
    }
  }

  async function loadListings(cursor?: string) {
    const number = cursor ? (page?.number ?? 1) + 1 : 1
    setBusy("list")
    setError(null)
    try {
      const result = await request<MarketplaceReadPage>(storeId, "/anuncios", "POST", { cursor })
      setPage({ ...result, number })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Falha ao consultar os anúncios.")
      // O scroll é mantido pelo canal. Uma falha no multiget pode ter consumido a página.
      if (cursor) setPage((previous) => previous && { ...previous, nextCursor: null })
    } finally {
      await refetch()
      setBusy(null)
    }
  }

  const state = connection.state
  const authorizeLabel = state === "awaiting_authorization" ? "Reiniciar autorização" :
    connection.seller || state === "reconnect_required" || state === "insufficient_permissions" ? "Reconectar Mercado Livre" : "Conectar Mercado Livre"
  const showAuthorize = connection.enabled && state !== "validated" && state !== "token_expired"
  const pillStatus = state === "validated" ? "online" : state === "awaiting_authorization" ? "syncing" :
    state === "communication_error" || state === "insufficient_permissions" ? "error" : "warning"

  return (
    <div className="surface-card space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="font-semibold">Mercado Livre</h3>
          <p className="text-sm text-muted-foreground">
            {connection.enabled ? "Consulte os anúncios existentes da conta vinculada." : "Conexão oficial indisponível para esta unidade."}
          </p>
        </div>
        <StatusPill status={pillStatus} label={statusLabels[state]} />
      </div>
      {connection.seller && (
        <dl className="grid min-w-0 gap-3 rounded-xl border border-border bg-muted/30 p-3 text-sm sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Conta do vendedor</dt>
            <dd className="break-words">{connection.seller.nickname ?? "Mercado Livre"} · {connection.seller.id}</dd>
            {connection.seller.testAccount && <dd className="text-xs text-muted-foreground">Usuário de teste Mercado Livre</dd>}
          </div>
          {connection.seller.siteStatus && <div><dt className="text-xs text-muted-foreground">Status da conta</dt><dd>{connection.seller.siteStatus}</dd></div>}
          {connection.scopes.length > 0 && <div><dt className="text-xs text-muted-foreground">Permissões</dt><dd>Leitura e acesso offline</dd></div>}
        </dl>
      )}
      {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {state === "awaiting_authorization" && <p className="text-sm text-muted-foreground">Conclua a autorização na página do Mercado Livre.</p>}
      {state === "token_expired" && <p className="text-sm text-muted-foreground">A próxima consulta tenta renovar a autorização.</p>}
      {state === "communication_error" && !connection.canRead && connection.seller &&
        <p className="text-sm text-muted-foreground">Reconecte a conta para retomar a leitura.</p>}
      {state === "disconnected" && <p className="text-sm text-muted-foreground">Para revogar a autorização externa, remova o aplicativo na conta Mercado Livre.</p>}
      {connection.enabled && (
        <div className="flex flex-wrap gap-2">
          {showAuthorize && <Button type="button" size="sm" disabled={!!busy} onClick={() => void authorize()}>
            {busy === "authorize" ? <Loader2 className="animate-spin" /> : <Plug />}
            {busy === "authorize" ? "Abrindo autorização…" : authorizeLabel}
          </Button>}
          {connection.canRead && <Button type="button" size="sm" variant={showAuthorize ? "outline" : "default"} disabled={!!busy} onClick={() => void loadListings()}>
            {busy === "list" ? <Loader2 className="animate-spin" /> : <Search />}{page ? "Primeira página" : "Consultar anúncios"}
          </Button>}
          {connection.canDisconnect && <Button type="button" size="sm" variant="outline" disabled={!!busy} onClick={() => void disconnect()}>
            {busy === "disconnect" ? <Loader2 className="animate-spin" /> : <Unplug />}{state === "awaiting_authorization" ? "Cancelar autorização" : "Desconectar"}
          </Button>}
        </div>
      )}
      {connection.canRead && (page || busy === "list") && (
        <section aria-label="Anúncios do Mercado Livre" aria-busy={busy === "list"} className="space-y-3 border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">Anúncios do Mercado Livre <span className="text-xs font-normal text-muted-foreground">· Somente leitura</span></h3>
            {page && <p role="status" className="text-xs text-muted-foreground">Página {page.number}</p>}
          </div>
          {busy === "list" && <p role="status" className="text-sm text-muted-foreground">Consultando anúncios…</p>}
          {page && page.unavailable > 0 && <p className="text-sm text-muted-foreground">Anúncios indisponíveis nesta página: {page.unavailable}.</p>}
          {page?.listings.length === 0 && <p className="text-sm text-muted-foreground">{page.number === 1 ? "Nenhum anúncio disponível." : "Fim da consulta de anúncios."}</p>}
          {page && page.listings.length > 0 && (
            <ul className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {page.listings.map((listing) => <ListingCard key={listing.id} listing={listing} />)}
            </ul>
          )}
          {page?.nextCursor && <Button type="button" size="sm" variant="outline" disabled={!!busy} onClick={() => void loadListings(page.nextCursor ?? undefined)}>
            Próxima página <ChevronRight />
          </Button>}
        </section>
      )}
    </div>
  )
}
