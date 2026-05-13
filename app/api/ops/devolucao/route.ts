import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireOpsSubscription, opsLojaIdFromRequestForWrite } from "@/lib/ops-api-gate"
import { createSaida } from "@/lib/financeiro/services/movimentacoes-service"
import { verificarPeriodoFechado } from "@/lib/financeiro/services/fechamento-service"
import type { Prisma } from "@/generated/prisma"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const itemSchema = z.object({
  inventoryId: z.string().optional(),
  nome: z.string().default(""),
  quantidade: z.number().int().min(1),
  valorUnitario: z.number().min(0).default(0),
  valorTotal: z.number().min(0).default(0),
})

const schema = z.object({
  localId: z.string().min(1),
  vendaLocalId: z.string().default(""),
  sessaoId: z.string().optional(),
  tipo: z.enum(["vale_credito", "somente_estoque", "troca"]),
  valorTotal: z.number().min(0).default(0),
  creditoEmitido: z.number().min(0).default(0),
  clienteNome: z.string().default(""),
  clienteDoc: z.string().default(""),
  operador: z.string().default(""),
  motivo: z.string().default(""),
  observacao: z.string().default(""),
  itens: z.array(itemSchema).min(1),
  /** Snapshot JSON da devolução para auditoria. */
  payload: z.record(z.unknown()).optional(),
})

export async function POST(req: Request) {
  const gate = await requireOpsSubscription()
  if (!gate.ok) return gate.res

  const lojaId = opsLojaIdFromRequestForWrite(req)
  if (!lojaId) {
    return NextResponse.json(
      { error: "Unidade obrigatória: envie o header x-assistec-loja-id." },
      { status: 400 }
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

  const data = parsed.data

  // ── Idempotência: se já existir, retornar como sucesso ──────────────────────
  const existing = await prisma.devolucaoVenda.findUnique({
    where: { storeId_localId: { storeId: lojaId, localId: data.localId } },
    select: { id: true, localId: true },
  })
  if (existing) {
    return NextResponse.json({ ok: true, devolucaoId: existing.id, idempotente: true })
  }

  const lock = await verificarPeriodoFechado(lojaId, new Date())
  if (lock.fechado) {
    return NextResponse.json(
      { error: "Período financeiro fechado. Reabra o fechamento para registrar devoluções.", code: "periodo_fechado" },
      { status: 409 },
    )
  }

  // ── Validar sessão se fornecida ─────────────────────────────────────────────
  if (data.sessaoId) {
    const sessao = await prisma.sessaoCaixa.findFirst({
      where: { id: data.sessaoId, storeId: lojaId },
      select: { id: true, status: true },
    })
    if (!sessao) {
      return NextResponse.json({ error: "Sessão de caixa não encontrada." }, { status: 404 })
    }
    // Aviso (não bloqueia): caixa fechado com override
    if (sessao.status === "FECHADA") {
      console.warn(`[ops/devolucao] sessão ${data.sessaoId} já fechada — devolução permitida com override`)
    }
  }

  try {
    const devolucao = await prisma.$transaction(async (tx) => {
      // 1. Criar documento de devolução
      const dev = await tx.devolucaoVenda.create({
        data: {
          storeId: lojaId,
          localId: data.localId,
          vendaLocalId: data.vendaLocalId,
          sessaoId: data.sessaoId ?? null,
          tipo: data.tipo,
          valorTotal: data.valorTotal,
          creditoEmitido: data.creditoEmitido,
          clienteNome: data.clienteNome,
          clienteDoc: data.clienteDoc,
          operador: data.operador,
          motivo: data.motivo,
          observacao: data.observacao,
          payload: data.payload ? (data.payload as Prisma.InputJsonValue) : undefined,
          itens: {
            create: data.itens.map((it) => ({
              inventoryId: it.inventoryId ?? null,
              nome: it.nome,
              quantidade: it.quantidade,
              valorUnitario: it.valorUnitario,
              valorTotal: it.valorTotal,
            })),
          },
        },
        include: { itens: true },
      })

      return dev
    })

    // 2. Integração financeira — saída por devolução (fora da tx para não bloquear)
    // Só cria movimentação se há valor devolvido real (não apenas troca de estoque)
    if (data.valorTotal > 0 && data.tipo !== "somente_estoque") {
      try {
        await createSaida({
          storeId: lojaId,
          valor: data.valorTotal,
          descricao: `Devolução PDV — ${data.localId}${data.clienteNome ? ` | ${data.clienteNome}` : ""}`,
          origem: "devolucao_pdv",
          referenciaId: devolucao.id,
        })
      } catch (finErr) {
        // Financeiro não deve bloquear a devolução
        console.warn("[ops/devolucao] Falha ao criar movimentação financeira:", finErr)
      }
    }

    return NextResponse.json({ ok: true, devolucaoId: devolucao.id, devolucao })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[ops/devolucao]", msg)
    return NextResponse.json({ error: "Falha ao persistir devolução" }, { status: 500 })
  }
}
