/**
 * Persistência atômica de StoreSettings (N3-CORRECTION-01).
 *
 * Serializa TODOS os PUTs da mesma loja (admin e backfill) com
 * `pg_advisory_xact_lock` em transação. O lock é liberado no commit/rollback.
 *
 * Ordem inegociável dentro da transação:
 * 1. adquirir advisory lock por storeId
 * 2. re-ler StoreSettings
 * 3. merge (backfill = write-only-if-absent)
 * 4. upsert
 */

import { mergePrinterConfigServerSide } from "@/lib/pdv-settings-server-first"
import type { StoreSettingsPutPayload } from "@/lib/store-settings-types"

export const STORE_SETTINGS_ADVISORY_LOCK_PREFIX = "store-settings:"

export function storeSettingsAdvisoryLockKey(storeId: string): string {
  return `${STORE_SETTINGS_ADVISORY_LOCK_PREFIX}${storeId}`
}

export type StoreSettingsRow = {
  storeId: string
  contactEmail?: string | null
  contactWhatsapp?: string | null
  contactWhatsappDono?: string | null
  receiptFooter?: string | null
  mascotCharacterSeed?: string | null
  mascotPromptBase?: string | null
  printerConfig?: unknown
  cardFees?: unknown
  [key: string]: unknown
}

export type StoreSettingsPutBody = StoreSettingsPutPayload &
  Partial<{
    mascotCharacterSeed: string
    mascotPromptBase: string
  }>

export type StoreSettingsPutTx = {
  $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>
  storeSettings: {
    findUnique: (args: { where: { storeId: string } }) => Promise<StoreSettingsRow | null>
    upsert: (args: {
      where: { storeId: string }
      create: Record<string, unknown>
      update: Record<string, unknown>
    }) => Promise<StoreSettingsRow>
  }
}

export type StoreSettingsPutDb = {
  $transaction: <T>(fn: (tx: StoreSettingsPutTx) => Promise<T>) => Promise<T>
}

/**
 * Advisory lock transacional por loja.
 * O cast `::text AS lock` evita P2010 (void) no `$queryRaw` do Prisma.
 */
export async function acquireStoreSettingsAdvisoryLock(
  tx: Pick<StoreSettingsPutTx, "$queryRaw">,
  storeId: string,
): Promise<void> {
  const lockKey = storeSettingsAdvisoryLockKey(storeId)
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))::text AS lock`
}

function printerRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function resolveScalarField(
  incoming: string | null | undefined,
  current: string | null | undefined,
  isBackfill: boolean,
): string | undefined {
  if (incoming === undefined) return undefined
  if (isBackfill && current && current.trim() !== "") {
    return current.trim()
  }
  return incoming != null ? String(incoming).trim() : ""
}

export async function persistStoreSettingsPut(
  db: StoreSettingsPutDb,
  storeId: string,
  body: StoreSettingsPutBody,
): Promise<{ existing: StoreSettingsRow | null; settings: StoreSettingsRow }> {
  const isBackfill = !!body.backfill
  const incomingPrinter = printerRecord(body.printerConfig)

  return db.$transaction(async (tx) => {
    await acquireStoreSettingsAdvisoryLock(tx, storeId)
    const existing = await tx.storeSettings.findUnique({ where: { storeId } })

    const existingPrinter = printerRecord(existing?.printerConfig)
    const resolvedPrinter =
      incomingPrinter !== null
        ? mergePrinterConfigServerSide(existingPrinter, incomingPrinter, isBackfill)
        : existingPrinter

    const nextContactEmail = resolveScalarField(body.contactEmail, existing?.contactEmail, isBackfill)
    const nextContactWhatsapp = resolveScalarField(
      body.contactWhatsapp,
      existing?.contactWhatsapp,
      isBackfill,
    )
    const nextContactWhatsappDono = resolveScalarField(
      body.contactWhatsappDono,
      existing?.contactWhatsappDono,
      isBackfill,
    )
    const nextReceiptFooter = resolveScalarField(body.receiptFooter, existing?.receiptFooter, isBackfill)
    const nextMascotSeed = resolveScalarField(
      body.mascotCharacterSeed,
      existing?.mascotCharacterSeed,
      isBackfill,
    )
    const nextMascotPrompt = resolveScalarField(
      body.mascotPromptBase,
      existing?.mascotPromptBase,
      isBackfill,
    )

    const settings = await tx.storeSettings.upsert({
      where: { storeId },
      create: {
        storeId,
        contactEmail: (body.contactEmail || "").trim(),
        contactWhatsapp: (body.contactWhatsapp || "").trim(),
        contactWhatsappDono: (body.contactWhatsappDono || "").trim(),
        receiptFooter: (body.receiptFooter || "").trim(),
        mascotCharacterSeed: (body.mascotCharacterSeed || "").trim(),
        mascotPromptBase: (body.mascotPromptBase || "").trim(),
        printerConfig: (resolvedPrinter ?? {}) as object,
        cardFees: body.cardFees,
      },
      update: {
        ...(nextContactEmail !== undefined ? { contactEmail: nextContactEmail } : {}),
        ...(nextContactWhatsapp !== undefined ? { contactWhatsapp: nextContactWhatsapp } : {}),
        ...(nextContactWhatsappDono !== undefined ? { contactWhatsappDono: nextContactWhatsappDono } : {}),
        ...(nextReceiptFooter !== undefined ? { receiptFooter: nextReceiptFooter } : {}),
        ...(nextMascotSeed !== undefined ? { mascotCharacterSeed: nextMascotSeed } : {}),
        ...(nextMascotPrompt !== undefined ? { mascotPromptBase: nextMascotPrompt } : {}),
        ...(body.printerConfig !== undefined ? { printerConfig: resolvedPrinter as object } : {}),
        ...(body.cardFees !== undefined ? { cardFees: body.cardFees } : {}),
      },
    })

    return { existing, settings }
  })
}
