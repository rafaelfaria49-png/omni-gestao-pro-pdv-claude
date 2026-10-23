import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"

export const ADDRESS_FIELDS = ["rua", "numero", "bairro", "cidade", "estado", "cep"] as const
export type AddressField = (typeof ADDRESS_FIELDS)[number]
export type BasicField = "name" | "cnpj" | "phone" | "contactEmail" | "contactWhatsapp" | "contactWhatsappDono"
const STORE_FIELDS = ["name", "cnpj", "phone"] as const
const CONTACT_FIELDS = ["contactEmail", "contactWhatsapp", "contactWhatsappDono"] as const
export type StoreBasics = Record<BasicField, string> & {
  address: Record<string, unknown> & Record<AddressField, string>
  /** Preserve the JSON reader's exact values/types for fields the operator did not edit. */
  addressSource: Record<string, unknown>
}
export type BasicsIntent = Partial<Record<BasicField, string>> & { address?: Partial<Record<AddressField, string>> }

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
const text = (value: unknown) => typeof value === "string" ? value.trim() : ""

export function parseStoreBasics(store: Record<string, unknown>, settings: Record<string, unknown>): StoreBasics {
  const addressSource = { ...record(store.address) }
  const address = { ...addressSource } as StoreBasics["address"]
  for (const key of ADDRESS_FIELDS) address[key] = String(addressSource[key] ?? "").trim()
  return {
    name: text(store.name), cnpj: text(store.cnpj), phone: text(store.phone), address, addressSource,
    contactEmail: text(settings.contactEmail), contactWhatsapp: text(settings.contactWhatsapp), contactWhatsappDono: text(settings.contactWhatsappDono),
  }
}

/** Only the operator's edits are replayable; omitted fields never become empty writes. */
export function basicsIntent(before: StoreBasics, draft: StoreBasics): BasicsIntent {
  const intent: BasicsIntent = {}
  for (const key of [...STORE_FIELDS, ...CONTACT_FIELDS]) if (text(draft[key]) !== before[key]) intent[key] = text(draft[key])
  for (const key of ADDRESS_FIELDS) {
    if (text(draft.address[key]) !== before.address[key]) (intent.address ??= {})[key] = text(draft.address[key])
  }
  return intent
}

export function applyBasicsIntent(current: StoreBasics, intent: BasicsIntent): StoreBasics {
  return { ...current, ...intent, address: { ...current.address, ...intent.address } }
}

export type BasicsFetch = typeof fetch
export async function readStoreBasics(storeId: string, signal: AbortSignal, request: BasicsFetch = fetch): Promise<StoreBasics> {
  signal.throwIfAborted()
  const options = { credentials: "include" as const, cache: "no-store" as const, signal, headers: { [ASSISTEC_LOJA_HEADER]: storeId } }
  const url = `/api/stores/${encodeURIComponent(storeId)}`
  const [storeResponse, settingsResponse] = await Promise.all([request(url, options), request(`${url}/settings`, options)])
  if (!storeResponse.ok || !settingsResponse.ok) throw new Error("READ_FAILED")
  const [storeData, settingsData] = await Promise.all([storeResponse.json(), settingsResponse.json()])
  signal.throwIfAborted()
  if (storeData.store?.id !== storeId || !Object.hasOwn(settingsData, "settings") || (settingsData.settings !== null && settingsData.settings?.storeId !== storeId)) throw new Error("STORE_MISMATCH")
  return parseStoreBasics(storeData.store, record(settingsData.settings))
}

export type BasicsSaveResult = { ok: boolean; current: StoreBasics | null; message: string }

/** Separate canonical writers, with a fresh read before every attempt and reconciliation afterwards. */
export async function saveStoreBasics(storeId: string, intent: BasicsIntent, signal: AbortSignal, request: BasicsFetch = fetch): Promise<BasicsSaveResult> {
  let current: StoreBasics
  try { current = await readStoreBasics(storeId, signal, request) } catch {
    signal.throwIfAborted()
    return { ok: false, current: null, message: "Não foi possível conferir os dados salvos. Nenhuma nova gravação foi enviada. Tente novamente para reler a unidade." }
  }
  const remaining = basicsIntent(current, applyBasicsIntent(current, intent))
  const storePatch: Record<string, unknown> = {}
  const contactPatch: Record<string, unknown> = {}
  for (const key of STORE_FIELDS) if (remaining[key] !== undefined) storePatch[key] = remaining[key]
  for (const key of CONTACT_FIELDS) if (remaining[key] !== undefined) contactPatch[key] = remaining[key]
  if (remaining.address) storePatch.address = { ...current.addressSource, ...remaining.address }
  let failed = false
  const url = `/api/stores/${encodeURIComponent(storeId)}`
  try {
    for (const [endpoint, payload] of [[url, storePatch], [`${url}/settings`, contactPatch]] as const) {
      signal.throwIfAborted()
      if (Object.keys(payload).length === 0) continue
      const response = await request(endpoint, {
        method: "PUT", credentials: "include", signal,
        headers: { "Content-Type": "application/json", [ASSISTEC_LOJA_HEADER]: storeId }, body: JSON.stringify(payload),
      })
      signal.throwIfAborted()
      if (!response.ok) { failed = true; break }
    }
  } catch { signal.throwIfAborted(); failed = true }
  try {
    const persisted = await readStoreBasics(storeId, signal, request)
    const coherent = Object.keys(basicsIntent(persisted, applyBasicsIntent(persisted, intent))).length === 0
    // Even an uncertain response can be resolved by the authorized readers, without repeating writes.
    if (coherent) return { ok: true, current: persisted, message: "Dados básicos salvos e conferidos." }
    return { ok: false, current: persisted, message: failed
      ? "Salvamento incompleto. Parte dos dados pode ter sido salva. Seu preenchimento foi mantido; tente novamente para conferir e salvar apenas o que falta."
      : "A releitura ainda não confirmou todos os dados. Seu preenchimento foi mantido. Confira e tente novamente." }
  } catch {
    signal.throwIfAborted()
    return { ok: false, current: null, message: "A resposta do salvamento não pôde ser confirmada. Seu preenchimento foi mantido. A próxima tentativa relerá os dados antes de gravar." }
  }
}
