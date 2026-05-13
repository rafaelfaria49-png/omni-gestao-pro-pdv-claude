import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * Diagnóstico de deploy (sem secrets). Em Vercel, `VERCEL_GIT_COMMIT_SHA` reflecte o commit deployado.
 */
export async function GET() {
  const commit =
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.trim() ||
    null
  const ref = process.env.VERCEL_GIT_COMMIT_REF?.trim() || null
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID?.trim() || null

  return NextResponse.json({
    message: "pdv-layouts-v4",
    commit,
    ref,
    deploymentId,
    /** ISO no momento do pedido (serverless); não é o instante exato do build, mas prova código novo a correr. */
    timestamp: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV ?? null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
  })
}
