/**
 * Descoberta store-scoped de candidatos. Sem escrita. Sem lookup global.
 *
 * O `storeId` efetivo é SOMENTE o do scope autorizado. Qualquer `storeId`
 * no input do caller é ignorado e não amplia o alcance.
 */
import type {
  ClientIdentityInput,
  ClientIdentityRecord,
  ClientIdentityScope,
  ClientIdentitySignals,
  ClientIdentityVerdict,
} from "./types"
import { classifyClientIdentity } from "./policy"
import { hasAnyIdentitySignal, toClientIdentitySignals } from "./signals"

export type ClientIdentityLookupKeys = {
  documentDigits: string | null
  phoneDigits: string | null
  email: string | null
}

export type ClientIdentityRecordSource = {
  findByIdentityKeys(
    storeId: string,
    keys: ClientIdentityLookupKeys,
  ): Promise<readonly ClientIdentityRecord[]> | readonly ClientIdentityRecord[]
}

export function lookupKeysFromSignals(signals: ClientIdentitySignals): ClientIdentityLookupKeys {
  return {
    documentDigits: signals.document.present && signals.document.strong ? signals.document.digits : null,
    phoneDigits: signals.phone.present ? signals.phone.digits : null,
    email: signals.email.present ? signals.email.value : null,
  }
}

export function createMemoryClientIdentitySource(
  rows: readonly ClientIdentityRecord[],
): ClientIdentityRecordSource {
  return {
    findByIdentityKeys(storeId, keys) {
      const sid = storeId.trim()
      if (!sid) return []
      const doc = keys.documentDigits
      const phone = keys.phoneDigits
      const email = keys.email
      if (!doc && !phone && !email) return []
      return rows.filter((row) => {
        if ((row.storeId ?? "").trim() !== sid) return false
        const signals = toClientIdentitySignals({
          document: row.document,
          phone: row.phone,
          email: row.email,
          name: row.name,
        })
        if (doc && signals.document.present && signals.document.strong && signals.document.digits === doc) {
          return true
        }
        if (phone && signals.phone.present && signals.phone.digits === phone) return true
        if (email && signals.email.present && signals.email.value === email) return true
        return false
      })
    },
  }
}

export async function discoverClientIdentityCandidates(args: {
  scope: ClientIdentityScope
  input: ClientIdentityInput
  source: ClientIdentityRecordSource
}): Promise<ClientIdentityVerdict> {
  const storeId = typeof args.scope?.storeId === "string" ? args.scope.storeId.trim() : ""
  const incoming = toClientIdentitySignals(args.input)
  if (!storeId) {
    return classifyClientIdentity({
      scope: { storeId: "" },
      incoming,
      records: [],
    })
  }

  if (!hasAnyIdentitySignal(incoming)) {
    return classifyClientIdentity({
      scope: { storeId },
      incoming,
      records: [],
    })
  }

  const keys = lookupKeysFromSignals(incoming)
  const loaded = await args.source.findByIdentityKeys(storeId, keys)
  const scoped = loaded.filter((row) => (row.storeId ?? "").trim() === storeId)
  return classifyClientIdentity({
    scope: { storeId },
    incoming,
    records: scoped,
  })
}
