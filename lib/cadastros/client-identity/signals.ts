import type { ClientIdentityInput, ClientIdentitySignals } from "./types"
import { toDocumentSignal } from "./document"
import { toEmailSignal } from "./email"
import { toPhoneSignal } from "./phone"
import { toNameSignal } from "./name"

/**
 * Extrai sinais do payload cru do caller. Campos de autoridade
 * (`storeId`, `actor`, `userId`) são deliberadamente ignorados.
 */
export function toClientIdentitySignals(input: ClientIdentityInput | null | undefined): ClientIdentitySignals {
  const src = input ?? {}
  return {
    document: toDocumentSignal(src.document),
    phone: toPhoneSignal(src.phone),
    email: toEmailSignal(src.email),
    name: toNameSignal(src.name),
  }
}

export function signalsFromRecord(record: {
  document?: string | null
  phone?: string | null
  email?: string | null
  name?: string | null
}): ClientIdentitySignals {
  return toClientIdentitySignals({
    document: record.document,
    phone: record.phone,
    email: record.email,
    name: record.name,
  })
}

export function hasStrongIdentityKey(signals: ClientIdentitySignals): boolean {
  return signals.document.present && signals.document.strong
}

export function hasContactSignal(signals: ClientIdentitySignals): boolean {
  return signals.phone.present || signals.email.present
}

export function hasAnyIdentitySignal(signals: ClientIdentitySignals): boolean {
  return hasStrongIdentityKey(signals) || hasContactSignal(signals)
}
