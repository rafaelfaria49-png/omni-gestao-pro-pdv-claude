/**
 * Adapter Prisma read-only da descoberta de identidade de Cliente.
 *
 * server-only: nunca importado por Client Components / localStorage.
 * Nenhuma escrita (`create`/`update`/`upsert`/`delete`) neste arquivo.
 *
 * `storeId` efetivo = scope autorizado. O body do caller não entra no WHERE.
 */
import "server-only"

import { prisma } from "@/lib/prisma"
import type { ClientIdentityLookupKeys, ClientIdentityRecordSource } from "./lookup"
import type { ClientIdentityRecord } from "./types"

const SELECT = {
  id: true,
  storeId: true,
  document: true,
  phone: true,
  email: true,
  name: true,
} as const

function phoneSearchTokens(phoneDigits: string): string[] {
  const tokens = new Set<string>()
  tokens.add(phoneDigits)
  if (phoneDigits.length >= 11) tokens.add(phoneDigits.slice(-11))
  if (phoneDigits.length >= 10) tokens.add(phoneDigits.slice(-10))
  return [...tokens]
}

export function createPrismaClientIdentitySource(): ClientIdentityRecordSource {
  return {
    async findByIdentityKeys(storeId, keys: ClientIdentityLookupKeys) {
      const sid = storeId.trim()
      if (!sid) return []
      const or: Array<Record<string, unknown>> = []
      if (keys.documentDigits) {
        or.push({ document: { contains: keys.documentDigits } })
      }
      if (keys.phoneDigits) {
        for (const token of phoneSearchTokens(keys.phoneDigits)) {
          or.push({ phone: { contains: token } })
        }
      }
      if (keys.email) {
        or.push({ email: { equals: keys.email, mode: "insensitive" as const } })
      }
      if (or.length === 0) return []

      const rows = await prisma.cliente.findMany({
        where: { storeId: sid, OR: or },
        select: SELECT,
        take: 40,
      })

      return rows
        .filter((row) => row.storeId === sid)
        .map(
          (row): ClientIdentityRecord => ({
            id: row.id,
            storeId: row.storeId,
            document: row.document,
            phone: row.phone,
            email: row.email,
            name: row.name,
          }),
        )
    },
  }
}
