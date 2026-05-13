import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

/** Diagnóstico de deploy do módulo PDV layouts (sem secrets, sem dependência de DB). */
export async function GET() {
  return NextResponse.json({
    ok: true,
    version: "pdv-layouts-v4-debug-60e8e04",
    layouts: ["classic", "rapido", "assistencia", "supermercado"],
    count: 4,
    timestamp: new Date().toISOString(),
  })
}
