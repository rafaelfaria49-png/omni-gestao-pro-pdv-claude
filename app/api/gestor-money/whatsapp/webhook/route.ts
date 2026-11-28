/**
 * Webhook Meta do canal de GESTÃO do Gestor Money (G007). DESLIGADO por padrão (404).
 * Lógica em `lib/gestor-money-assistente/whatsapp/webhook.ts`; o webhook comercial das lojas
 * (`/api/whatsapp/webhook`) não é alterado. Conexão SÓ com o papel `omni_gastos_ingress`.
 */
import { NextResponse } from "next/server"
import { PrismaClient } from "@/generated/prisma"
import { canalGestaoLigado, handshakeGestao, processarWebhookGestao } from "@/lib/gestor-money-assistente/whatsapp/webhook"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

let ingress: PrismaClient | null = null
function clienteIngress() {
  const url = process.env.GESTOR_MONEY_INGRESS_DATABASE_URL?.trim()
  if (!url || !canalGestaoLigado(process.env)) return null
  ingress ??= new PrismaClient({ datasources: { db: { url } }, log: [] })
  return ingress
}

export async function GET(req: Request) {
  const r = handshakeGestao(new URL(req.url), process.env)
  return new Response(r.body, { status: r.status, headers: { "content-type": "text/plain" } })
}

export async function POST(req: Request) {
  const rawBody = await req.text()
  const r = await processarWebhookGestao({ rawBody, assinatura: req.headers.get("x-hub-signature-256"), env: process.env, ingress: clienteIngress() })
  return NextResponse.json(r.body, { status: r.status })
}
