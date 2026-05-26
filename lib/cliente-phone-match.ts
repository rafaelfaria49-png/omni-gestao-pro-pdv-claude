import { phoneDigitsAll, phonesAreCompatibleBr } from "@/lib/phone-br"
import { prisma } from "@/lib/prisma"

export type ClientePhoneMatchStatus = "too_short" | "none" | "unique" | "multiple"

export type ClientePhoneMatchCandidate = {
  id: string
  name: string
  phone: string
  email: string | null
}

function buildPhoneLookupSuffixes(waDigits: string): string[] {
  const d = phoneDigitsAll(waDigits)
  const suffixes = new Set<string>()
  if (d.length >= 11) suffixes.add(d.slice(-11))
  if (d.length >= 10) suffixes.add(d.slice(-10))
  if (d.length >= 8 && d.length < 10) suffixes.add(d)
  return [...suffixes]
}

function resolveStatus(count: number): ClientePhoneMatchStatus {
  if (count === 0) return "none"
  if (count === 1) return "unique"
  return "multiple"
}

/**
 * Busca clientes da loja compatíveis com telefone WhatsApp (matching estrito).
 */
export async function matchClientesByPhone(
  storeId: string,
  waPhone: string
): Promise<{
  status: ClientePhoneMatchStatus
  phoneNormalized: string
  candidates: ClientePhoneMatchCandidate[]
}> {
  const phoneNormalized = phoneDigitsAll(waPhone)
  if (phoneNormalized.length < 10) {
    return { status: "too_short", phoneNormalized, candidates: [] }
  }

  const suffixes = buildPhoneLookupSuffixes(phoneNormalized)
  if (suffixes.length === 0) {
    return { status: "too_short", phoneNormalized, candidates: [] }
  }

  const rows = await prisma.cliente.findMany({
    where: {
      storeId,
      OR: suffixes.map((suffix) => ({ phone: { endsWith: suffix } })),
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
    },
    take: 40,
  })

  const seen = new Set<string>()
  const candidates: ClientePhoneMatchCandidate[] = []

  for (const row of rows) {
    if (seen.has(row.id)) continue
    const phone = String(row.phone ?? "")
    if (!phone || !phonesAreCompatibleBr(phoneNormalized, phone)) continue
    seen.add(row.id)
    candidates.push({
      id: row.id,
      name: row.name,
      phone,
      email: row.email,
    })
  }

  return {
    status: resolveStatus(candidates.length),
    phoneNormalized,
    candidates,
  }
}
