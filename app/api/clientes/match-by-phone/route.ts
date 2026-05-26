import { NextResponse } from "next/server"
import { matchClientesByPhone } from "@/lib/cliente-phone-match"
import { storeIdFromAssistecRequestForRead } from "@/lib/store-id-from-request"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

function badRequest(message: string) {
  return json({ error: message }, { status: 400 })
}

/**
 * GET /api/clientes/match-by-phone?phone=5511999990000
 * Match seguro de cliente por telefone WhatsApp na loja ativa.
 */
export async function GET(req: Request) {
  try {
    const storeId = storeIdFromAssistecRequestForRead(req)
    if (!storeId) {
      return badRequest(
        "Unidade obrigatória: envie o header x-assistec-loja-id ou query storeId."
      )
    }

    const url = new URL(req.url)
    const phone = url.searchParams.get("phone")?.trim() ?? ""
    if (!phone) {
      return badRequest('Query "phone" é obrigatória')
    }

    const result = await matchClientesByPhone(storeId, phone)

    return json({
      ok: true,
      status: result.status,
      phoneNormalized: result.phoneNormalized,
      candidates: result.candidates,
      uniqueMatch:
        result.candidates.length === 1 ? result.candidates[0] : null,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[api/clientes/match-by-phone GET]", msg)
    return json(
      {
        error: "Falha ao buscar match por telefone",
        ...(process.env.NODE_ENV === "development" ? { detail: msg } : {}),
      },
      { status: 503 }
    )
  }
}
