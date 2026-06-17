import { NextResponse } from "next/server"

/**
 * Versão do DEPLOY atual (PWA stale guard).
 *
 * `buildId`/`buildTime` são gravados em build (`next.config.mjs` → `env`) e inlined
 * neste handler. Como a rota roda no deploy ATUAL, devolve sempre a versão viva do
 * servidor. O cliente compara com a versão embutida no seu bundle (`lib/pwa-version`):
 * se divergir, está rodando um bundle desatualizado (cache/PWA defasado).
 *
 * `force-dynamic` + `no-store`: nunca prerenderizada nem cacheada (CDN/SW), senão a
 * própria resposta de versão ficaria velha e mascararia o problema.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export function GET() {
  return NextResponse.json(
    {
      buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? "dev",
      buildTime: process.env.NEXT_PUBLIC_BUILD_TIME ?? null,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  )
}
