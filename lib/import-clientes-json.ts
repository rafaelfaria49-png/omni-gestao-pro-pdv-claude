/**
 * Importação JSON de clientes via ClientWriteService (CAD-R2-008).
 * Campos persistidos: `storeId`, `name`, `phone`, `email`.
 */
import { NextResponse } from "next/server"
import { Prisma } from "@/generated/prisma"
import { getVerifiedSubscriptionFromCookies } from "@/lib/api-auth"
import { isVencimentoExpired } from "@/lib/subscription-seal"
import { getTrustedTimeMs } from "@/lib/trusted-time"
import { cellToTrimmedString } from "@/lib/import-normalize"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { auth } from "@/auth"
import { cadastrosAuditPrincipalFromSession } from "@/lib/cadastros/cadastros-audit-principal"
import { createClient } from "@/lib/cadastros/client-write-service"
import { clientWriteImportMessage } from "@/lib/cadastros/client-write-contract"

function missingClientesTableResponse() {
  return NextResponse.json(
    {
      error:
        'Tabela "clientes_importados" não existe no Postgres. Execute no SQL Editor do Supabase o arquivo prisma/supabase_only_clientes_importados.sql (ou prisma/supabase_manual_full_schema.sql).',
    },
    { status: 503 }
  )
}

function isMissingRelationError(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2021") return true
  const msg = e instanceof Error ? e.message : String(e)
  return /does not exist|não existe|relation.*does not exist/i.test(msg)
}

async function requireSubscription() {
  const sub = await getVerifiedSubscriptionFromCookies()
  if (!sub.ok) {
    return { ok: false as const, res: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) }
  }
  const now = await getTrustedTimeMs()
  if (isVencimentoExpired(now, sub.vencimento) || sub.status !== "ativa") {
    return { ok: false as const, res: NextResponse.json({ error: "Assinatura inválida" }, { status: 403 }) }
  }
  return { ok: true as const, sub }
}

function pickName(o: Record<string, unknown>): string {
  return cellToTrimmedString(o["Nome"] ?? o.name ?? o["nome"] ?? o["nome completo"])
}

function pickPhone(o: Record<string, unknown>): string {
  return cellToTrimmedString(
    o["Telefone/WhatsApp"] ??
      o["Telefone/WhatsApp "] ??
      o.telefone ??
      o.Telefone ??
      o.celular ??
      o.Celular ??
      o["Celular WhatsApp"] ??
      o["Celular/WhatsApp"] ??
      o.whatsapp ??
      o.WhatsApp
  )
}

function pickEmail(o: Record<string, unknown>): string {
  return cellToTrimmedString(o["Email"] ?? o["E-mail"] ?? o.email ?? o.Email ?? o.mail)
}

export async function importClientesJson(req: Request) {
  const gate = await requireSubscription()
  if (!gate.ok) return gate.res
  const storeId = storeIdFromAssistecRequestForWrite(req)
  if (!storeId) {
    return NextResponse.json(
      { error: "Unidade obrigatória: envie o header x-assistec-loja-id ou query storeId." },
      { status: 400 }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const items = (body as { items?: unknown }).items
  if (!Array.isArray(items)) {
    return NextResponse.json({ error: "items deve ser um array" }, { status: 400 })
  }

  let created = 0
  let updated = 0

  try {
    const session = await auth().catch(() => null)
    const principal = cadastrosAuditPrincipalFromSession(session)
    const writeContext = { storeId, principal }

    const batchSize = 10
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize)
      for (const raw of batch) {
        if (!raw || typeof raw !== "object") continue
        const o = raw as Record<string, unknown>
        const name = pickName(o)
        if (!name) continue
        const phone = pickPhone(o) || null
        const email = pickEmail(o) || null

        const written = await createClient(writeContext, { name, phone, email })
        if (written.ok) {
          created += 1
        } else if (
          written.code === "IDENTITY_REVIEW_REQUIRED" ||
          written.code === "IDENTITY_CONFLICT" ||
          written.code === "AMBIGUOUS"
        ) {
          console.info("[import-clientes-json] linha exigiu revisão de identidade:", written.code)
        } else {
          console.info("[import-clientes-json] linha ignorada:", clientWriteImportMessage(written))
        }
      }
    }

    return NextResponse.json({ ok: true, count: items.length, created, updated })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.log("[import-clientes-json] erro exato:", msg)
    console.log("[import clientes / api → clientes_importados] caught error:", e)
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("[import clientes] Prisma code:", e.code, "meta:", e.meta)
    }
    if (e instanceof Error && e.stack) console.error("[import clientes] stack:\n", e.stack)
    if (isMissingRelationError(e)) return missingClientesTableResponse()
    const dev = process.env.NODE_ENV === "development"
    return NextResponse.json(
      {
        error: "Falha ao importar clientes",
        ...(dev ? { detail: msg } : {}),
        ...(e instanceof Prisma.PrismaClientKnownRequestError ? { prismaCode: e.code } : {}),
      },
      { status: 503 }
    )
  }
}
