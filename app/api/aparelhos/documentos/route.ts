import { NextResponse } from "next/server"
import { badJson, failResponse, jsonResult, readJson, resolveAparelhoApi } from "@/lib/aparelhos/api-gate"
import { documentoDaAquisicao, documentoDaVenda, garantiasDaVenda, parseFormato, previaTermo } from "@/lib/aparelhos/documents-service"
import { fail } from "@/lib/aparelhos/service"
import type { DocTipo } from "@/lib/aparelhos/documents"

export const dynamic = "force-dynamic"

const HTML_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store, private",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'",
}

const TIPOS: readonly DocTipo[] = ["termo_garantia", "comprovante_venda", "termo_entrega", "protocolo_aquisicao"]

/**
 * GET ?tipo=…&formato=a4|80mm&aparelhoVendaId=… → HTML pronto para imprimir (reimpressão = mesma versão).
 * GET ?vendaId=… | ?pedidoId=… → lista as garantias da venda (pós-venda).
 */
export async function GET(req: Request): Promise<NextResponse> {
  const u = new URL(req.url)
  const gate = await resolveAparelhoApi(req, u.searchParams.get("canal") === "venda" ? "venda" : "hub", false)
  if (!gate.ok) return gate.response
  const vendaId = u.searchParams.get("vendaId") ?? undefined
  const pedidoId = u.searchParams.get("pedidoId") ?? undefined
  if (vendaId || pedidoId) return jsonResult(await garantiasDaVenda(gate.ctx, { vendaId, pedidoId }))
  const tipo = u.searchParams.get("tipo") as DocTipo
  const formato = parseFormato(u.searchParams.get("formato"))
  if (!TIPOS.includes(tipo) || !formato) return failResponse(fail(400, "VALIDACAO", "Documento ou formato inválido."))
  const r = tipo === "protocolo_aquisicao"
    ? await documentoDaAquisicao(gate.ctx, u.searchParams.get("aquisicaoId") ?? "", formato)
    : await documentoDaVenda(gate.ctx, u.searchParams.get("aparelhoVendaId") ?? "", tipo, formato)
  if (!r.ok) return failResponse(r)
  return new NextResponse(r.html, { status: 200, headers: { ...HTML_HEADERS, "X-Documento-Emissoes": String(r.emissoes) } })
}

/** Prévia RASCUNHO antes de confirmar a venda (nada é gravado). */
export async function POST(req: Request): Promise<NextResponse> {
  const gate = await resolveAparelhoApi(req, "venda", false)
  if (!gate.ok) return gate.response
  const body = await readJson(req, 20_000)
  if (body === null) return badJson()
  return jsonResult(await previaTermo(gate.ctx, body))
}
