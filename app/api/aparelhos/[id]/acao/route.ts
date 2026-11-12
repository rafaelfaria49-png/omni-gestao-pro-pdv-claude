import { NextResponse } from "next/server"
import { badJson, jsonResult, readJson, resolveAparelhoApi } from "@/lib/aparelhos/api-gate"
import {
  adicionarFotos, alterarStatus, cancelarReserva, fail, liberarParaVenda, registrarConferenciaRestricao, reservarAparelho,
} from "@/lib/aparelhos/service"

export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

/**
 * Ações sobre a unidade. `reservar`/`cancelar_reserva` também servem ao PDV (`?canal=venda`),
 * com gate de venda (caixa sem Cadastros); as demais exigem o HUB.
 */
export async function POST(req: Request, { params }: Params): Promise<NextResponse> {
  const body = (await readJson(req)) as Record<string, unknown> | null
  if (body === null || typeof body !== "object") return badJson()
  const acao = String(body.acao ?? "")
  const venda = (acao === "reservar" || acao === "cancelar_reserva") && new URL(req.url).searchParams.get("canal") === "venda"
  const gate = await resolveAparelhoApi(req, venda ? "venda" : "hub", true)
  if (!gate.ok) return gate.response
  const { id } = await params
  switch (acao) {
    case "liberar": return jsonResult(await liberarParaVenda(gate.ctx, id))
    case "status": return jsonResult(await alterarStatus(gate.ctx, id, body))
    case "conferencia": return jsonResult(await registrarConferenciaRestricao(gate.ctx, id, body))
    case "fotos": return jsonResult(await adicionarFotos(gate.ctx, id, body))
    case "reservar": return jsonResult(await reservarAparelho(gate.ctx, id, body))
    case "cancelar_reserva": return jsonResult(await cancelarReserva(gate.ctx, id, body))
    default: return jsonResult(fail(400, "VALIDACAO", "Ação desconhecida."))
  }
}
