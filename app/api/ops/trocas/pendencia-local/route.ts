/**
 * POST /api/ops/trocas/pendencia-local — trilha AUDITÁVEL antes de arquivar, num terminal,
 * uma devolução antiga que existe só no navegador (OMNI-PDV-TROCAS-…-P1-002).
 *
 * O que É: registro append-only em `AuditoriaFinanceira` (tabela existente) com o que o
 * terminal declarava (itens, vale local, data), o operador autenticado e o motivo.
 * O que NÃO é: devolução, estoque, crédito ou lançamento financeiro — nada disso é criado.
 *
 * Só aceita quando o servidor confirma que essa devolução NÃO existe para essa venda
 * (mesmo `localId` gravado para a mesma venda = já persistida → 409). Idempotente por
 * (loja, venda, localId) sob advisory lock: repetir devolve o mesmo registro.
 */
import { requireModuleApi } from "@/lib/auth/module-access"
import { NextResponse } from "next/server"
import { z } from "zod"
import type { Prisma } from "@/generated/prisma"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { opsLojaIdFromRequestForWrite } from "@/lib/ops-api-gate"
import { apiGuardEnterpriseOrOps } from "@/lib/auth/api-enterprise-guard"
import { getOperatorLabelFromSession } from "@/lib/auth/session-operator"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const PENDENCIA_LOCAL_ENTIDADE = "devolucao_pdv_pendencia_local"

const schema = z.object({
  localId: z.string().min(3).max(80),
  pedidoId: z.string().min(1).max(80),
  motivo: z.string().min(10).max(300),
  declarado: z.object({
    at: z.string().max(40),
    tipo: z.string().max(30),
    creditoLocal: z.number().min(0).max(1_000_000),
    itens: z.array(z.object({ nome: z.string().max(200), quantidade: z.number().int().min(0).max(9999), valor: z.number().min(0).max(1_000_000) })).max(50),
    estavaComoSincronizada: z.boolean(),
  }),
})

export async function POST(req: Request) {
  const moduleDenied = await requireModuleApi(req, "sharedPayment")
  if (moduleDenied) return moduleDenied
  const lojaId = opsLojaIdFromRequestForWrite(req)
  if (!lojaId) return NextResponse.json({ error: "Unidade obrigatória." }, { status: 400 })
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos (motivo com no mínimo 10 caracteres).", code: "PAYLOAD_INVALIDO" }, { status: 422 })
  const denied = await apiGuardEnterpriseOrOps(lojaId, (p) => p.pdv.devolucao, "Sem permissão para tratar devoluções.")
  if (denied) return denied

  const session = await auth()
  const operador = (session?.user ? getOperatorLabelFromSession(session) : "").trim()
  const d = parsed.data
  const entidadeId = `${d.pedidoId}:${d.localId}`
  try {
    const out = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pdv-devolucao:${lojaId}:${d.pedidoId}`}))`
      const persistida = await tx.devolucaoVenda.findFirst({
        where: { storeId: lojaId, localId: d.localId, vendaLocalId: d.pedidoId },
        select: { id: true },
      })
      if (persistida) return { erro: "persistida" as const }
      const existente = await tx.auditoriaFinanceira.findFirst({
        where: { storeId: lojaId, entidade: PENDENCIA_LOCAL_ENTIDADE, entidadeId },
        select: { id: true, createdAt: true },
      })
      if (existente) return { registro: existente, replay: true }
      const registro = await tx.auditoriaFinanceira.create({
        data: {
          storeId: lojaId,
          entidade: PENDENCIA_LOCAL_ENTIDADE,
          entidadeId,
          acao: "arquivar",
          antes: d.declarado as unknown as Prisma.InputJsonValue,
          depois: { motivo: d.motivo, efeitoServidor: "nenhum", arquivadaNoTerminal: true } as Prisma.InputJsonValue,
          usuarioId: session?.user?.id ?? null,
          usuarioNome: operador || null,
        },
        select: { id: true, createdAt: true },
      })
      return { registro, replay: false }
    })
    if ("erro" in out) {
      return NextResponse.json(
        { error: "Esta devolução já existe no servidor para esta venda — não arquive; ela já conta como devolvida.", code: "DEVOLUCAO_JA_PERSISTIDA" },
        { status: 409 },
      )
    }
    return NextResponse.json({ ok: true, registroId: out.registro.id, replay: out.replay })
  } catch (e) {
    console.error("[ops/trocas/pendencia-local]", e instanceof Error ? e.message : String(e))
    return NextResponse.json({ error: "Falha ao registrar a trilha. Nada foi alterado." }, { status: 500 })
  }
}
