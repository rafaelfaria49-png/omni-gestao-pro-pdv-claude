import { NextResponse } from "next/server"
import { prismaEnsureConnected } from "@/lib/prisma"
import { opsLojaIdFromRequestForWrite } from "@/lib/ops-api-gate"
import { apiGuardEnterpriseOrOps } from "@/lib/auth/api-enterprise-guard"
import { upsertContaPagar } from "@/lib/financeiro/services"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const MAX_ROWS = 8000

type ContaPagarIncomingRow = Record<string, unknown> & {
  id?: unknown
  localKey?: unknown
  descricao?: unknown
  fornecedor?: unknown
  fornecedorNome?: unknown
  fornecedorId?: unknown
  valor?: unknown
  vencimento?: unknown
  dataVencimento?: unknown
  status?: unknown
  numeroDocumento?: unknown
}

function safeStr(v: unknown): string {
  return typeof v === "string" ? v : ""
}

function safeNum(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0
}

function pickLocalKey(r: ContaPagarIncomingRow): string {
  const lk = safeStr(r.localKey) || safeStr(r.id)
  return lk.trim()
}

function rowToScalar(r: ContaPagarIncomingRow) {
  const venc = safeStr(r.vencimento) || safeStr(r.dataVencimento)
  return {
    descricao: safeStr(r.descricao),
    fornecedorNome: (safeStr(r.fornecedorNome) || safeStr(r.fornecedor)).trim(),
    fornecedorId: safeStr(r.fornecedorId).trim() || null,
    valor: safeNum(r.valor),
    vencimento: venc,
    status: safeStr(r.status) || "pendente",
    numeroDocumento: safeStr(r.numeroDocumento),
  }
}

export async function POST(req: Request) {
  const storeId = opsLojaIdFromRequestForWrite(req)
  if (!storeId) {
    return NextResponse.json(
      { error: "Unidade obrigatória: envie o header x-assistec-loja-id ou query storeId / lojaId." },
      { status: 400 },
    )
  }

  const denied = await apiGuardEnterpriseOrOps(
    storeId,
    (p) => p.financeiro.edit,
    "Sem permissão para sincronizar contas a pagar.",
  )
  if (denied) return denied

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const lojaIdBody = safeStr((body as { lojaId?: unknown }).lojaId).trim()
  if (lojaIdBody && lojaIdBody !== storeId) {
    return NextResponse.json(
      { error: "Unidade inconsistente: o corpo e o header devem referir a mesma loja." },
      { status: 400 },
    )
  }

  const rows = (body as { rows?: unknown }).rows
  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: "rows deve ser um array" }, { status: 400 })
  }

  const slice = rows.slice(0, MAX_ROWS) as unknown[]

  try {
    await prismaEnsureConnected()
    let applied = 0
    const warnings: string[] = []

    for (const raw of slice) {
      if (!raw || typeof raw !== "object") continue
      const r = raw as ContaPagarIncomingRow

      const localKey = pickLocalKey(r)
      if (!localKey) {
        if (warnings.length < 24) warnings.push("row_sem_localKey: id/localKey ausente")
        continue
      }

      const scal = rowToScalar(r)

      await upsertContaPagar({
        storeId,
        localKey,
        descricao: scal.descricao,
        fornecedorId: scal.fornecedorId,
        fornecedorNome: scal.fornecedorNome,
        valor: scal.valor,
        vencimento: scal.vencimento,
        status: scal.status,
        numeroDocumento: scal.numeroDocumento,
        payloadPatch: r as unknown as Record<string, unknown>,
        replacePayload: true,
      })
      applied += 1
    }

    return NextResponse.json({
      ok: true,
      count: applied,
      ...(warnings.length ? { warnings } : {}),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[ops/contas-pagar-persist]", msg)
    const dev = process.env.NODE_ENV === "development"
    return NextResponse.json(
      { error: "Falha ao salvar contas a pagar no servidor", ...(dev ? { detail: msg } : {}) },
      { status: 503 },
    )
  }
}

