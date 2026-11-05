import { requireModuleApi } from "@/lib/auth/module-access"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { opsLojaIdFromRequestForWrite } from "@/lib/ops-api-gate"
import { apiGuardEnterpriseOrOps } from "@/lib/auth/api-enterprise-guard"
import { auth } from "@/auth"
import { getOperatorLabelFromSession } from "@/lib/auth/session-operator"
import { verificarPeriodoFechado } from "@/lib/financeiro/services/fechamento-service"
import { isPrismaUniqueConstraintError } from "@/lib/ops-upsert-venda"
import {
  DevolucaoBusinessError,
  assertDevolucaoPermitidaPorPolitica,
  classifyDevolucaoAfterUniqueConflict,
  registrarDevolucaoInTransaction,
  type RegistrarDevolucaoInput,
} from "@/lib/pdv/devolucao/registrar-devolucao"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const itemSchema = z.object({
  inventoryId: z.string().optional(),
  /** Chave histórica da linha (Produto.id) vinda da elegibilidade — autoridade de identidade. */
  produtoId: z.string().optional(),
  nome: z.string().default(""),
  quantidade: z.number().int().min(1),
  // Aceitos por compatibilidade com clientes antigos; IGNORADOS — o servidor deriva
  // unitário e total dos itens persistidos da venda de origem.
  valorUnitario: z.number().min(0).optional(),
  valorTotal: z.number().min(0).optional(),
})

const schema = z.object({
  localId: z.string().min(1),
  vendaLocalId: z.string().default(""),
  sessaoId: z.string().optional(),
  tipo: z.enum(["vale_credito", "somente_estoque", "troca", "devolucao"]),
  // Compatibilidade: valores do client NÃO são autoridade (recalculados no servidor).
  valorTotal: z.number().min(0).optional(),
  creditoEmitido: z.number().min(0).optional(),
  clienteNome: z.string().default(""),
  clienteDoc: z.string().default(""),
  operador: z.string().default(""),
  motivo: z.string().default(""),
  observacao: z.string().default(""),
  itens: z.array(itemSchema).min(1),
  /** Snapshot JSON da devolução para auditoria. */
  payload: z.record(z.unknown()).optional(),
})

function businessStatus(e: DevolucaoBusinessError): number {
  if (e.code === "VENDA_ORIGEM_OBRIGATORIA" || e.code === "ITENS_DUPLICADOS" || e.code === "CLIENTE_DOC_OBRIGATORIO") return 422
  return 409
}

export async function POST(req: Request) {
  const moduleDenied = await requireModuleApi(req, "sharedPayment")
  if (moduleDenied) return moduleDenied

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
    (p) => p.pdv.devolucao,
    "Sem permissão para registrar devoluções.",
  )
  if (denied) return denied

  const data = parsed.data

  // Política: reembolso em dinheiro não tem fluxo aprovado. Exceção única: o REENVIO
  // de um reembolso legado que já está gravado (mesmo localId) é reconhecido como
  // replay — senão a fila do navegador nunca o confirmaria. Nada é gravado aqui.
  try {
    if (data.tipo === "devolucao") {
      const replay = await classifyDevolucaoAfterUniqueConflict(prisma, {
        storeId: lojaId,
        localId: data.localId,
        vendaLocalId: data.vendaLocalId,
        tipo: data.tipo,
        clienteNome: data.clienteNome,
        clienteDoc: data.clienteDoc,
        operador: "",
        ledgerOperator: null,
        motivo: data.motivo,
        observacao: data.observacao,
        itens: data.itens,
      })
      if (replay) return NextResponse.json(replay)
    }
    assertDevolucaoPermitidaPorPolitica(data.tipo)
  } catch (e) {
    if (e instanceof DevolucaoBusinessError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: businessStatus(e) })
    }
    throw e
  }

  const session = await auth()
  const sessionLabel = session?.user ? getOperatorLabelFromSession(session) : ""
  const operadorFinal = data.operador?.trim() || sessionLabel

  const lock = await verificarPeriodoFechado(lojaId, new Date())
  if (lock.fechado) {
    return NextResponse.json(
      { error: "Período financeiro fechado. Reabra o fechamento para registrar devoluções.", code: "periodo_fechado" },
      { status: 409 },
    )
  }

  // Sessão informada precisa ser desta loja. Devolução não move dinheiro do caixa
  // (vale/estoque), então sessão já FECHADA não bloqueia — só fica registrada.
  if (data.sessaoId) {
    const sessao = await prisma.sessaoCaixa.findFirst({
      where: { id: data.sessaoId, storeId: lojaId },
      select: { id: true },
    })
    if (!sessao) {
      return NextResponse.json({ error: "Sessão de caixa não encontrada." }, { status: 404 })
    }
  }

  const input: RegistrarDevolucaoInput = {
    storeId: lojaId,
    localId: data.localId,
    vendaLocalId: data.vendaLocalId,
    sessaoId: data.sessaoId ?? null,
    tipo: data.tipo,
    clienteNome: data.clienteNome,
    clienteDoc: data.clienteDoc,
    operador: operadorFinal,
    ledgerOperator: sessionLabel.trim() || null,
    motivo: data.motivo,
    observacao: data.observacao,
    itens: data.itens,
    payload: data.payload,
  }

  try {
    const result = await prisma.$transaction((tx) => registrarDevolucaoInTransaction(tx, input), {
      maxWait: 15_000,
      timeout: 20_000,
    })
    return NextResponse.json(result)
  } catch (e) {
    let error: unknown = e
    // Corrida no mesmo localId sem venda para travar: a transação perdedora já
    // reverteu; relê FORA dela e classifica (replay idêntico ou conflito).
    if (isPrismaUniqueConstraintError(e)) {
      try {
        const replay = await classifyDevolucaoAfterUniqueConflict(prisma, input)
        if (replay) return NextResponse.json(replay)
      } catch (classificationError) {
        error = classificationError
      }
    }
    if (error instanceof DevolucaoBusinessError) {
      console.warn("[ops/devolucao] recusada", JSON.stringify({ lojaId, localId: data.localId, code: error.code, ...error.detail }))
      return NextResponse.json(
        { error: error.message, code: error.code, ...(error.detail ? { detail: error.detail } : {}) },
        { status: businessStatus(error) },
      )
    }
    const msg = error instanceof Error ? error.message : String(error)
    console.error("[ops/devolucao]", msg)
    return NextResponse.json({ error: "Falha ao persistir devolução" }, { status: 500 })
  }
}
