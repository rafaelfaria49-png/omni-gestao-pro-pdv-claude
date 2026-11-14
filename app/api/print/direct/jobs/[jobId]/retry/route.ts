/** OMNI-PRINT-004C candidate — disabled unless the owner-approval gate is open (lib/printing/direct/activation.ts). */
import * as direct from "@/lib/printing/direct/http"
import { directPrintDeps } from "@/lib/printing/direct/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  return direct.retryJob(req, directPrintDeps(), (await ctx.params).jobId)
}
