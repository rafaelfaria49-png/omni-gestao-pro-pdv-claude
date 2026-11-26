import { PrismaClient } from "@/generated/prisma"
import { runtimeDatasource } from "@/lib/db/datasource-policy.mjs"

const globalForPrisma = globalThis as unknown as { omniRuntimePrisma: PrismaClient | undefined }

/** Margem para `$connect` explícito (ms). Complementa `connect_timeout` na `DATABASE_URL`. */
const PRISMA_CONNECT_WAIT_MS = Math.min(
  90_000,
  Math.max(8_000, Number(process.env.PRISMA_CONNECT_WAIT_MS || "35000"))
)

/**
 * Uma única instância por processo Node (evita estourar conexões com o Postgres no dev/HMR).
 * Timeouts: use `connect_timeout` e `sslmode` na URL (ver `.env`).
 *
 * O Prisma Client não faz cache HTTP de `findMany`; para evitar respostas antigas no Next.js,
 * use `export const dynamic = "force-dynamic"` nas rotas de API que leem dados ao vivo.
 */
function getPrismaClient(): PrismaClient {
  if (globalForPrisma.omniRuntimePrisma) return globalForPrisma.omniRuntimePrisma

  const datasource = runtimeDatasource()
  const client = new PrismaClient({
    // Prisma error events can embed customer values and SQL parameters.
    log: [],
    ...(datasource.kind === "nonproduction" ? { datasourceUrl: datasource.url } : {}),
  })
  globalForPrisma.omniRuntimePrisma = client
  return client
}

// A build may import auth and route modules without a datasource. Creating a
// client is deferred to the first access, including explicit $connect and raw SQL.
export const prisma = new Proxy({} as PrismaClient, {
  has(target, key) {
    if (Reflect.has(target, key)) return true
    if (typeof key === "symbol" || key === "then") return false
    return Reflect.has(globalForPrisma.omniRuntimePrisma ?? PrismaClient.prototype, key)
  },
  get(target, key) {
    if (Object.hasOwn(target, key)) return Reflect.get(target, key)
    if (typeof key === "symbol" || key === "then") return undefined
    const client = getPrismaClient()
    const value = Reflect.get(client, key, client)
    return typeof value === "function" ? value.bind(client) : value
  },
})

/**
 * Aguarda o banco aceitar conexão (útil se a rede oscila 1–2s). Não obrigatório — o Prisma conecta sob demanda.
 */
export async function prismaEnsureConnected(): Promise<void> {
  await Promise.race([
    prisma.$connect(),
    new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error(`Prisma $connect > ${PRISMA_CONNECT_WAIT_MS}ms`)), PRISMA_CONNECT_WAIT_MS)
    ),
  ])
}

/**
 * Executa uma operação Prisma com tratamento seguro: não lança se o banco estiver indisponível (evita 500 genérico).
 */
export async function withPrismaSafe<T>(
  op: (db: PrismaClient) => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await op(prisma)
  } catch (e) {
    console.error("[prisma:safe] operation_failed")
    return fallback
  }
}
