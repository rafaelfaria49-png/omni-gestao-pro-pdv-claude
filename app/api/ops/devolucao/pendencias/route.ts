import { requireModuleApi } from "@/lib/auth/module-access"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { opsLojaIdFromRequestForWrite } from "@/lib/ops-api-gate"
import { apiGuardEnterpriseOrOps } from "@/lib/auth/api-enterprise-guard"
import { auth } from "@/auth"
import { getOperatorLabelFromSession } from "@/lib/auth/session-operator"
import { canAccessStore } from "@/lib/auth/enterprise-permissions"
import {
  CATEGORIAS_PENDENCIA,
  ESTADOS_ENCAMINHAVEIS,
  PendenciaError,
  encaminharPendenciaDevolucao,
  listarPendenciasEncaminhadas,
} from "@/lib/pdv/devolucao/pendencia-financeiro"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * PDV-F8-FINALIZACAO-COMPLETA-001 — pendências de devolução encaminhadas ao Financeiro.
 * GET lista; POST encaminha (idempotente por localId). Nenhum lançamento financeiro,
 * vale ou estoque é criado: só o registro auditável para conciliação manual.
 */

const schema = z.object({
  localId: z.string().min(1).max(120),
  vendaLocalId: z.string().max(120).default(""),
  categoria: z.enum(CATEGORIAS_PENDENCIA),
  estado: z.enum(ESTADOS_ENCAMINHAVEIS),
  valorDeclarado: z.number().min(0).max(1_000_000),
  motivoRecusa: z.string().max(1000).default(""),
  justificativa: z.string().max(1000).default(""),
  itens: z
    .array(
      z.object({
        inventoryId: z.string().max(200).optional(),
        produtoId: z.string().max(200).optional(),
        nome: z.string().max(300).optional(),
        quantidade: z.number().int().min(0).max(100_000),
      }),
    )
    .max(50)
    .default([]),
})

export async function GET(req: Request) {
  const moduleDenied = await requireModuleApi(req, "sharedPayment")
  if (moduleDenied) return moduleDenied
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  const lojaId = opsLojaIdFromRequestForWrite(req)
  if (!lojaId) return NextResponse.json({ error: "Unidade obrigatória: envie o header x-assistec-loja-id." }, { status: 400 })
  if (!canAccessStore(session, lojaId)) return NextResponse.json({ error: "Sem acesso à loja" }, { status: 403 })
  const denied = await apiGuardEnterpriseOrOps(lojaId, (p) => p.pdv.devolucao, "Sem permissão para consultar devoluções.")
  if (denied) return denied
  const pendencias = await listarPendenciasEncaminhadas(prisma, lojaId)
  return NextResponse.json({ ok: true, pendencias })
}

export async function POST(req: Request) {
  const moduleDenied = await requireModuleApi(req, "sharedPayment")
  if (moduleDenied) return moduleDenied
  const lojaId = opsLojaIdFromRequestForWrite(req)
  if (!lojaId) return NextResponse.json({ error: "Unidade obrigatória: envie o header x-assistec-loja-id." }, { status: 400 })

  // Reconciliação SUPERVISIONADA: exige operador autenticado (NextAuth) com permissão de
  // devolução E de cancelamento de venda — o cookie legado de assinatura não basta.
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Entre com um usuário para encaminhar pendências.", code: "SESSAO_OBRIGATORIA" }, { status: 401 })
  }
  if (!canAccessStore(session, lojaId)) return NextResponse.json({ error: "Sem acesso à loja" }, { status: 403 })
  const denied = await apiGuardEnterpriseOrOps(
    lojaId,
    (p) => p.pdv.devolucao && p.pdv.cancelarVenda,
    "Encaminhar pendência de devolução exige permissão de supervisor (devolução + cancelamento).",
  )
  if (denied) return denied

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 422 })

  const usuarioNome = getOperatorLabelFromSession(session) || session.user.id
  try {
    const registro = await prisma.$transaction(
      (tx) =>
        encaminharPendenciaDevolucao(tx, {
          storeId: lojaId,
          ...parsed.data,
          usuarioId: session.user!.id!,
          usuarioNome,
        }),
      { maxWait: 10_000, timeout: 15_000 },
    )
    return NextResponse.json({ ok: true, ...registro })
  } catch (e) {
    if (e instanceof PendenciaError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.code === "DEVOLUCAO_JA_GRAVADA" ? 409 : 422 })
    }
    console.error("[ops/devolucao/pendencias]", e instanceof Error ? e.message : String(e))
    return NextResponse.json({ error: "Falha ao encaminhar pendência" }, { status: 500 })
  }
}
