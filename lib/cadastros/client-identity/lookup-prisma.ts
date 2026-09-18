/**
 * Adapter Prisma read-only da descoberta de identidade de Cliente.
 *
 * server-only: nunca importado por Client Components / localStorage.
 * Nenhuma escrita (`create`/`update`/`upsert`/`delete`) neste arquivo.
 *
 * `storeId` efetivo = scope autorizado. O body do caller não entra no WHERE.
 *
 * CAD-R2-019 — documento forte usa a chave canônica (`documentKey`, exata)
 * como caminho preferencial: máscara vs. dígitos equivalentes colidem no
 * banco. O predicado legado (`document contains`) permanece como fallback
 * de rollout para linhas ainda não backfilladas; ambos alimentam o MESMO
 * classificador (sem segundo motor de identidade — o `classifyClientIdentity`
 * revalida DV e igualdade exata dos dígitos).
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

/** Delegate mínimo (Prisma ou TransactionClient) — lookup permanece read-only. */
export type ClientIdentityPrismaLike = {
  cliente: {
    findMany(args: {
      where: unknown
      select: typeof SELECT
      take: number
    }): Promise<
      Array<{
        id: string
        storeId: string
        document: string
        phone: string | null
        email: string | null
        name: string
      }>
    >
  }
}

function phoneSearchTokens(phoneDigits: string): string[] {
  const tokens = new Set<string>()
  tokens.add(phoneDigits)
  if (phoneDigits.length >= 11) tokens.add(phoneDigits.slice(-11))
  if (phoneDigits.length >= 10) tokens.add(phoneDigits.slice(-10))
  return [...tokens]
}

/**
 * Adapter Prisma read-only. Quando `client` é uma TransactionClient, o lookup
 * ocorre DENTRO da mesma transação da escrita (CAD-R2-008) — sem janela
 * lookup-fora / write-desconectado. Sem `client`, usa o singleton.
 */
export function createPrismaClientIdentitySource(
  client: ClientIdentityPrismaLike = prisma as unknown as ClientIdentityPrismaLike,
): ClientIdentityRecordSource {
  return {
    async findByIdentityKeys(storeId, keys: ClientIdentityLookupKeys) {
      const sid = storeId.trim()
      if (!sid) return []
      const or: Array<Record<string, unknown>> = []
      if (keys.documentDigits) {
        // Preferencial/exato: chave canônica CAD-R2-019.
        or.push({ documentKey: keys.documentDigits })
        // Fallback de rollout: linhas legadas ainda sem `documentKey`.
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

      const rows = await client.cliente.findMany({
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
