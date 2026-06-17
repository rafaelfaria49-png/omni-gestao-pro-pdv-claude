import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { isValidPhoneBr } from "@/lib/phone-br"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

/**
 * Cadastro RÁPIDO de cliente a partir do PDV (à prazo / carnê) — sem perder o carrinho.
 *
 * Diferenças deliberadas do `POST /api/clientes` (Cadastros HUB):
 *  - Aberto a QUALQUER usuário autenticado (operador), não só ADMIN — criar um cliente
 *    é ação de baixo risco; a decisão de crédito segue protegida no fluxo à prazo.
 *  - `phone` é OPCIONAL (coluna é nullable). Só valida o formato se vier preenchido.
 *  - Campos mínimos: name (obrigatório), phone/document (opcionais). Sem tags/totais.
 *
 * Multi-loja: `storeId` SEMPRE do header `x-assistec-loja-id` (sem fallback loja-1).
 */
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return json({ error: "Não autorizado. Faça login." }, { status: 401 })
    }

    const storeId = storeIdFromAssistecRequestForWrite(req)
    if (!storeId) {
      return json({ error: "Unidade obrigatória: envie o header x-assistec-loja-id." }, { status: 400 })
    }

    const body = (await req.json().catch(() => ({}))) as {
      name?: unknown
      phone?: unknown
      document?: unknown
      kind?: unknown
    }

    const name = typeof body.name === "string" ? body.name.trim() : ""
    const phone = typeof body.phone === "string" ? body.phone.trim() : ""
    const document = typeof body.document === "string" ? body.document.trim() : ""
    const kindRaw = typeof body.kind === "string" ? body.kind.trim().toUpperCase() : ""
    const kind = kindRaw === "PJ" ? "PJ" : "PF"

    if (!name) return json({ error: 'Campo "name" é obrigatório' }, { status: 400 })
    if (phone && !isValidPhoneBr(phone)) {
      return json({ error: "Telefone inválido (use DDD + número, 10 ou 11 dígitos)" }, { status: 400 })
    }

    const created = await prisma.cliente.create({
      data: {
        name,
        phone: phone || null,
        document,
        kind,
        storeId,
      },
      select: { id: true, name: true, phone: true, email: true, document: true },
    })

    return json({ ok: true, cliente: created }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[api/clientes/quick POST]", msg)
    return json(
      { error: "Falha ao cadastrar cliente", ...(process.env.NODE_ENV === "development" ? { detail: msg } : {}) },
      { status: 503 },
    )
  }
}
