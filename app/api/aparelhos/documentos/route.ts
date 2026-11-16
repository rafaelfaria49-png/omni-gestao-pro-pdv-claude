import { NextResponse } from "next/server"
import { jsonResult, resolveAparelhoApi } from "@/lib/aparelhos/api-gate"
import { errorPage } from "@/lib/aparelhos/documents"
import { documentoDaAquisicao, documentoDaVenda, garantiasDaVenda, parseFormato, previaTermo } from "@/lib/aparelhos/documents-service"
import { fail, type Fail } from "@/lib/aparelhos/service"
import type { DocTipo } from "@/lib/aparelhos/documents"

export const dynamic = "force-dynamic"

const HTML_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store, private",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'",
}

const TIPOS: readonly DocTipo[] = ["termo_garantia", "comprovante_venda", "termo_entrega", "protocolo_aquisicao"]

function htmlFail(f: Fail): NextResponse {
  return new NextResponse(errorPage(f.message), { status: f.status, headers: HTML_HEADERS })
}

/**
 * Navegado direto pelo popup (a CSP restritiva desta resposta vale no documento):
 * GET ?tipo=…&formato=a4|80mm&aparelhoVendaId=… → HTML pronto para imprimir (reimpressão = mesma versão).
 * GET ?previa=1&aparelhoId=…&contratualDias=… → prévia RASCUNHO (nada é gravado).
 * GET ?vendaId=… | ?pedidoId=… → JSON com as garantias da venda (pós-venda).
 */
export async function GET(req: Request): Promise<NextResponse> {
  const u = new URL(req.url)
  const previa = u.searchParams.get("previa") === "1"
  const gate = await resolveAparelhoApi(req, previa || u.searchParams.get("canal") === "venda" ? "venda" : "hub", false)
  if (!gate.ok) {
    if (u.searchParams.has("vendaId") || u.searchParams.has("pedidoId")) return gate.response
    const body = (await gate.response.json().catch(() => null)) as { error?: string } | null
    return htmlFail(fail(gate.response.status, "GATE", body?.error ?? "Sem permissão."))
  }
  if (previa) {
    const p = await previaTermo(gate.ctx, Object.fromEntries(u.searchParams.entries()))
    if (!p.ok) return htmlFail(p)
    return new NextResponse(p.html, { status: 200, headers: HTML_HEADERS })
  }
  const vendaId = u.searchParams.get("vendaId") ?? undefined
  const pedidoId = u.searchParams.get("pedidoId") ?? undefined
  if (vendaId || pedidoId) return jsonResult(await garantiasDaVenda(gate.ctx, { vendaId, pedidoId }))
  const tipo = u.searchParams.get("tipo") as DocTipo
  const formato = parseFormato(u.searchParams.get("formato"))
  if (!TIPOS.includes(tipo) || !formato) return htmlFail(fail(400, "VALIDACAO", "Documento ou formato inválido."))
  const r = tipo === "protocolo_aquisicao"
    ? await documentoDaAquisicao(gate.ctx, u.searchParams.get("aquisicaoId") ?? "", formato)
    : await documentoDaVenda(gate.ctx, u.searchParams.get("aparelhoVendaId") ?? "", tipo, formato)
  if (!r.ok) return htmlFail(r)
  return new NextResponse(r.html, { status: 200, headers: { ...HTML_HEADERS, "X-Documento-Emissoes": String(r.emissoes) } })
}

