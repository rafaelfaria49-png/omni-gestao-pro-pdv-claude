import { prisma } from "@/lib/prisma"
import type { WhatsAppCloudCredentials } from "@/lib/whatsapp"

/**
 * Decisão pura: extrai as credenciais Meta da linha do mapa + ambiente, sem I/O.
 * Testável isoladamente (precedente: `resolveSeedStoreId` em loja-ativa-seed).
 *
 * Retorna `null` quando falta número, falta `tokenEnvKey`, ou a env do token está vazia —
 * o caller NÃO deve enviar nem cair em configuração global (F-04/DT-07 · ADR-0006).
 */
export function resolveCredentialsFromRow(
  row: { phoneNumberId: string | null; tokenEnvKey: string | null } | null,
  env: Record<string, string | undefined> = process.env
): WhatsAppCloudCredentials | null {
  if (!row) return null
  const phoneNumberId = (row.phoneNumberId ?? "").trim()
  const tokenEnvKey = (row.tokenEnvKey ?? "").trim()
  if (!phoneNumberId || !tokenEnvKey) return null
  const accessToken = (env[tokenEnvKey] ?? "").trim()
  if (!accessToken) return null
  return { phoneNumberId, accessToken }
}

/**
 * Resolve as credenciais Meta (phone_number_id + access token) da loja via mapa
 * `WhatsAppPhoneNumber`. O token NÃO é persistido: é lido da env nomeada em `tokenEnvKey`
 * (Vercel secret). Retorna `null` se a loja não tem número ATIVO ou o token está ausente.
 */
export async function resolveStoreWhatsAppCredentials(
  storeId: string
): Promise<WhatsAppCloudCredentials | null> {
  const id = (storeId ?? "").trim()
  if (!id) return null
  const row = await prisma.whatsAppPhoneNumber.findFirst({
    where: { storeId: id, active: true },
    orderBy: { createdAt: "asc" },
    select: { phoneNumberId: true, tokenEnvKey: true },
  })
  return resolveCredentialsFromRow(row)
}
