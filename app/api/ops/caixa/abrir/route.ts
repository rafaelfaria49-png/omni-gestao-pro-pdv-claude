import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { opsLojaIdFromRequestForWrite } from "@/lib/ops-api-gate"
import { apiGuardEnterpriseOrOps } from "@/lib/auth/api-enterprise-guard"
import { auth } from "@/auth"
import { getOperatorLabelFromSession } from "@/lib/auth/session-operator"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const schema = z.object({
  saldoInicial: z.number().min(0).default(0),
  operador: z.string().max(120).default(""),
  observacao: z.string().max(500).default(""),
  /** Terminal PDV (PDV1, PDV2...) que abre o caixa. Opcional p/ retrocompatibilidade. */
  terminalId: z.string().max(60).optional(),
})

export async function POST(req: Request) {
  const lojaId = opsLojaIdFromRequestForWrite(req)
  if (!lojaId) {
    return NextResponse.json(
      { error: "Unidade obrigatória: envie o header x-assistec-loja-id." },
      { status: 400 },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 })
  }

  const denied = await apiGuardEnterpriseOrOps(
    lojaId,
    (p) => p.pdv.abrirCaixa,
    "Sem permissão para abrir o caixa.",
  )
  if (denied) return denied

  const { saldoInicial, observacao } = parsed.data
  const terminalId = parsed.data.terminalId?.trim() || ""
  const session = await auth()
  const operador =
    parsed.data.operador?.trim() ||
    (session?.user ? getOperatorLabelFromSession(session) : "")

  const baseData = {
    storeId: lojaId,
    saldoInicial,
    operador,
    observacao,
    status: "ABERTA" as const,
  }
  const select = {
    id: true,
    abertaEm: true,
    storeId: true,
    operador: true,
    saldoInicial: true,
  }

  try {
    let sessao
    if (terminalId) {
      try {
        sessao = await prisma.sessaoCaixa.create({
          data: { ...baseData, terminalId },
          select,
        })
      } catch (terminalErr) {
        // A coluna terminalId pode ainda não existir no banco (migration não aplicada).
        // Retrocompatibilidade: reabre a sessão sem o vínculo de terminal.
        console.warn(
          "[ops/caixa/abrir] terminalId não persistido (fallback):",
          terminalErr instanceof Error ? terminalErr.message : terminalErr,
        )
        sessao = await prisma.sessaoCaixa.create({ data: baseData, select })
      }
    } else {
      sessao = await prisma.sessaoCaixa.create({ data: baseData, select })
    }
    return NextResponse.json({ ok: true, sessaoId: sessao.id, sessao })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[ops/caixa/abrir]", msg)
    return NextResponse.json({ error: "Falha ao abrir sessão de caixa" }, { status: 500 })
  }
}
