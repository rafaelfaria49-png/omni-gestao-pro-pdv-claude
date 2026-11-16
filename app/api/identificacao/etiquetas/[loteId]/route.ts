import { identificationAccess } from "@/lib/identificacao/access.server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(request: Request, route: { params: Promise<{ loteId: string }> }) {
  const url = new URL(request.url)
  const gate = await identificationAccess(url.searchParams.get("storeId"))
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" }
  if (!gate.ok) return Response.json(gate, { status: 403, headers })
  const [{ prisma }, { getJob }] = await Promise.all([import("@/lib/prisma"), import("@/lib/identificacao/service")])
  const job = await getJob(prisma, gate.value, (await route.params).loteId)
  if (!job.ok) return Response.json(job, { status: job.code === "NOT_FOUND" ? 404 : 409, headers })
  try {
    const renderer = await import("@/lib/identificacao/label-renderer.server")
    if (url.searchParams.get("format") === "html") return new Response(await renderer.renderLabelsHtml(job.value.snapshot), { headers: {
      ...headers, "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
    } })
    const pdf = await renderer.renderLabelsPdf(job.value.snapshot)
    return new Response(new Uint8Array(pdf), { headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="etiquetas-${job.value.id.replace(/[^a-zA-Z0-9-]/g, "")}.pdf"` } })
  } catch (e) {
    const unsupported = e instanceof Error && e.message.startsWith("LABEL_UNSUPPORTED_GLYPH")
    return Response.json({ ok: false, code: "RENDER_FAILED", message: unsupported ? "Há caracteres sem suporte na fonte. Revise o cadastro antes de gerar etiquetas." : "Falha ao gerar prévia/PDF. O lote permanece salvo; tente novamente." }, { status: 422, headers })
  }
}
