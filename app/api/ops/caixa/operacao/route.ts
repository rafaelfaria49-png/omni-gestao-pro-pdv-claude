import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { opsLojaIdFromRequestForWrite } from "@/lib/ops-api-gate"
import { apiGuardEnterpriseOrOps } from "@/lib/auth/api-enterprise-guard"
import { auth } from "@/auth"
import { getOperatorLabelFromSession } from "@/lib/auth/session-operator"
import { verificarPeriodoFechado } from "@/lib/financeiro/services/fechamento-service"
import { createEntrada, createSaida } from "@/lib/financeiro/services/movimentacoes-service"
import type { EnterprisePermissions } from "@/lib/auth/enterprise-permissions"
import type { Prisma } from "@/generated/prisma"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const schema = z.object({
  sessaoId: z.string().min(1),
  tipo: z.enum(["sangria", "suprimento", "devolucao"]),
  valor: z.number().min(0.01),
  motivo: z.string().trim().min(1, "Motivo obrigatório.").max(500),
  operador: z.string().max(120).default(""),
  payload: z.record(z.unknown()).optional(),
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

  const { sessaoId, tipo, valor, motivo, operador, payload } = parsed.data

  const permCheck: (p: EnterprisePermissions) => boolean =
    tipo === "devolucao" ? (p) => p.pdv.devolucao : (p) => p.pdv.abrirCaixa
  const forbidden =
    tipo === "devolucao"
      ? "Sem permissão para registrar devolução no caixa."
      : "Sem permissão para sangria ou suprimento de caixa."

  const denied = await apiGuardEnterpriseOrOps(lojaId, permCheck, forbidden)
  if (denied) return denied

  const session = await auth()
  const operadorLabel =
    operador?.trim() || (session?.user ? getOperatorLabelFromSession(session) : "")

  try {
    const lock = await verificarPeriodoFechado(lojaId, new Date())
    if (lock.fechado) {
      return NextResponse.json(
        { error: "Período financeiro fechado. Reabra o fechamento para registrar operações de caixa.", code: "periodo_fechado" },
        { status: 409 },
      )
    }

    const sessao = await prisma.sessaoCaixa.findFirst({
      where: { id: sessaoId, storeId: lojaId, status: "ABERTA" },
      select: { id: true },
    })

    if (!sessao) {
      return NextResponse.json(
        { error: "Sessão de caixa não encontrada ou já fechada." },
        { status: 404 }
      )
    }

    const op = await prisma.caixaOperacao.create({
      data: {
        sessaoId,
        storeId: lojaId,
        tipo,
        valor,
        motivo,
        operador: operadorLabel,
        payload: payload ? (payload as Prisma.InputJsonValue) : undefined,
      },
      select: { id: true, tipo: true, valor: true, at: true },
    })

    // Sangria/suprimento: integra ao financeiro (devolução financeira continua em /api/ops/devolucao)
    if (tipo === "sangria" || tipo === "suprimento") {
      const origem = tipo === "sangria" ? "sangria_pdv" : "suprimento_pdv"
      const dup = await prisma.movimentacaoFinanceira.findFirst({
        where: { storeId: lojaId, referenciaId: op.id, origem },
        select: { id: true },
      })
      if (!dup) {
        const descBase = tipo === "sangria" ? "Sangria de caixa PDV" : "Suprimento de caixa PDV"
        const descricao = `${descBase} — ${motivo.slice(0, 120)}`
        try {
          if (tipo === "sangria") {
            await createSaida({
              storeId: lojaId,
              valor,
              descricao,
              origem,
              referenciaId: op.id,
            })
          } else {
            await createEntrada({
              storeId: lojaId,
              valor,
              descricao,
              origem,
              referenciaId: op.id,
            })
          }
        } catch (finErr) {
          console.warn("[ops/caixa/operacao] Falha ao espelhar em MovimentacaoFinanceira:", finErr)
        }
      }
    }

    return NextResponse.json({ ok: true, operacao: op })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[ops/caixa/operacao]", msg)
    return NextResponse.json({ error: "Falha ao registrar operação de caixa" }, { status: 500 })
  }
}
