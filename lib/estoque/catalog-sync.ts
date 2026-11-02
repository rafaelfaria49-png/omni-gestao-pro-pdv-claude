/**
 * Sincronização automática do catálogo do PDV (PDV-CADASTROS-SYNC-AUTOMATICO-001).
 *
 * Antes, o PDV só baixava o catálogo ao montar o provider (troca de loja / F5). Um SKU
 * editado no Cadastros deixava o carrinho com uma referência que o servidor já não
 * resolvia (`PRODUTO_NAO_RESOLVIDO`, incidente 2026-11-01).
 *
 * Gatilhos (todos estritamente por `storeId`):
 * - mesma aba / outras abas do navegador: `notifyCatalogChanged` após salvar um cadastro
 *   (evento local + BroadcastChannel + `storage` como fallback);
 * - outros aparelhos: versão do catálogo (`?versionOnly=1`, dezenas de bytes) perguntada no
 *   foco, ao voltar a aba, ao voltar a rede, ao abrir o PDV e a cada 30 s com a aba visível.
 *   O snapshot inteiro só é baixado quando a versão muda.
 *
 * Módulo sem React. O controlador garante: um voo por vez, a resposta mais nova vence
 * (resposta atrasada de pedido anterior é descartada) e nada é aplicado depois do dispose.
 */

import { isCatalogVersion } from "@/lib/estoque/catalog-version"

export const CATALOG_SYNC_INTERVAL_MS = 30_000
/** Checks não forçados mais próximos que isto são ignorados (foco + visibilidade juntos). */
export const CATALOG_SYNC_MIN_GAP_MS = 3_000

export const CATALOG_CHANNEL_NAME = "omni-catalog-v1"
const BUMP_KEY_PREFIX = "omni-catalog-bump:"
const SAME_TAB_EVENT = "omni:catalog-changed"

export type CatalogSnapshot<T> = { items: T[]; version: string | null }

export type CatalogCheckStatus =
  | "updated"
  | "unchanged"
  | "throttled"
  | "superseded"
  | "unavailable"
  | "disabled"
  | "disposed"

export type CatalogSyncDeps<T> = {
  storeId: string
  /** `null` = versão indisponível (rede, 4xx/5xx). Nunca lança para o controlador. */
  fetchVersion: (storeId: string, signal: AbortSignal) => Promise<string | null>
  /** `null` = snapshot indisponível; o catálogo atual permanece. */
  fetchSnapshot: (storeId: string, signal: AbortSignal) => Promise<CatalogSnapshot<T> | null>
  apply: (snapshot: CatalogSnapshot<T>) => void
  now?: () => number
  minGapMs?: number
}

export function createCatalogSyncController<T>(deps: CatalogSyncDeps<T>) {
  const now = deps.now ?? (() => Date.now())
  const minGapMs = deps.minGapMs ?? CATALOG_SYNC_MIN_GAP_MS
  let known: string | null = null
  let enabled = false
  let disposed = false
  let seq = 0
  let lastStartedAt = Number.NEGATIVE_INFINITY
  let inFlight: { seq: number; abort: AbortController; promise: Promise<CatalogCheckStatus> } | null = null

  async function run(mySeq: number, abort: AbortController, force: boolean): Promise<CatalogCheckStatus> {
    const stale = () => disposed || mySeq !== seq
    let remote: string | null = null
    if (!force) {
      remote = await deps.fetchVersion(deps.storeId, abort.signal).catch(() => null)
      if (stale()) return disposed ? "disposed" : "superseded"
      if (!isCatalogVersion(remote)) return "unavailable"
      if (remote === known) return "unchanged"
    }
    const snapshot = await deps.fetchSnapshot(deps.storeId, abort.signal).catch(() => null)
    if (stale()) return disposed ? "disposed" : "superseded"
    if (!snapshot) return "unavailable"
    deps.apply(snapshot)
    const applied = isCatalogVersion(snapshot.version) ? snapshot.version : remote
    if (applied) known = applied
    return "updated"
  }

  return {
    storeId: deps.storeId,
    knownVersion: (): string | null => known,
    /** Versão do snapshot carregado fora do controlador (carga inicial do provider). */
    setKnownVersion(version: unknown): void {
      if (isCatalogVersion(version)) known = version
    },
    /** Só checa depois da carga inicial — evita corrida com o snapshot do mount. */
    enable(): void {
      enabled = true
    },
    /**
     * `force` pula a pergunta de versão e baixa o snapshot (cadastro salvo agora, descarte
     * de pendência). Um check forçado substitui o que estiver em voo.
     */
    check(opts: { force?: boolean } = {}): Promise<CatalogCheckStatus> {
      if (disposed) return Promise.resolve("disposed")
      if (!enabled) return Promise.resolve("disabled")
      const force = opts.force === true
      if (!force) {
        if (inFlight) return inFlight.promise
        if (now() - lastStartedAt < minGapMs) return Promise.resolve("throttled")
      }
      inFlight?.abort.abort()
      const mySeq = ++seq
      lastStartedAt = now()
      const abort = new AbortController()
      const promise = run(mySeq, abort, force).finally(() => {
        if (inFlight?.seq === mySeq) inFlight = null
      })
      inFlight = { seq: mySeq, abort, promise }
      return promise
    },
    dispose(): void {
      disposed = true
      inFlight?.abort.abort()
      inFlight = null
    },
  }
}

export type CatalogSyncController<T> = ReturnType<typeof createCatalogSyncController<T>>

export type CatalogChangedMessage = {
  type: "catalog-changed"
  storeId: string
  at: number
  /** Id aleatório por emissão — o mesmo aviso chega por até 3 vias e conta uma vez. */
  nonce: string
}

function parseMessage(value: unknown): CatalogChangedMessage | null {
  if (!value || typeof value !== "object") return null
  const m = value as Partial<CatalogChangedMessage>
  if (m.type !== "catalog-changed") return null
  if (typeof m.storeId !== "string" || !m.storeId.trim()) return null
  if (typeof m.nonce !== "string" || !m.nonce) return null
  return { type: "catalog-changed", storeId: m.storeId, at: typeof m.at === "number" ? m.at : 0, nonce: m.nonce }
}

function newNonce(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  }
}

/**
 * Avisa todas as abas deste navegador (e esta) que o catálogo da loja mudou. Chamar
 * só depois do servidor confirmar a escrita. Best-effort: nunca lança.
 */
export function notifyCatalogChanged(storeId: string): void {
  if (typeof window === "undefined") return
  const id = typeof storeId === "string" ? storeId.trim() : ""
  if (!id) return
  const msg: CatalogChangedMessage = { type: "catalog-changed", storeId: id, at: Date.now(), nonce: newNonce() }
  try {
    window.dispatchEvent(new CustomEvent(SAME_TAB_EVENT, { detail: msg }))
  } catch {
    /* sem CustomEvent */
  }
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(CATALOG_CHANNEL_NAME)
      channel.postMessage(msg)
      channel.close()
    }
  } catch {
    /* canal indisponível — o `storage` cobre */
  }
  try {
    window.localStorage.setItem(`${BUMP_KEY_PREFIX}${id}`, JSON.stringify(msg))
  } catch {
    /* storage bloqueado — a versão no foco/intervalo cobre */
  }
}

/** Escuta avisos SÓ da loja informada. Devolve a função de cancelamento. */
export function subscribeCatalogChanged(storeId: string, onChange: (msg: CatalogChangedMessage) => void): () => void {
  if (typeof window === "undefined") return () => {}
  const seen: string[] = []
  const deliver = (raw: unknown) => {
    const msg = parseMessage(raw)
    if (!msg || msg.storeId !== storeId) return
    if (seen.includes(msg.nonce)) return
    seen.push(msg.nonce)
    if (seen.length > 50) seen.shift()
    onChange(msg)
  }
  const onLocal = (e: Event) => deliver((e as CustomEvent).detail)
  const onStorage = (e: StorageEvent) => {
    if (e.key !== `${BUMP_KEY_PREFIX}${storeId}` || !e.newValue) return
    try {
      deliver(JSON.parse(e.newValue))
    } catch {
      /* valor corrompido */
    }
  }
  window.addEventListener(SAME_TAB_EVENT, onLocal)
  window.addEventListener("storage", onStorage)
  let channel: BroadcastChannel | null = null
  try {
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(CATALOG_CHANNEL_NAME)
      channel.onmessage = (e) => deliver(e.data)
    }
  } catch {
    channel = null
  }
  return () => {
    window.removeEventListener(SAME_TAB_EVENT, onLocal)
    window.removeEventListener("storage", onStorage)
    channel?.close()
  }
}
