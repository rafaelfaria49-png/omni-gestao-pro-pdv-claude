import { NextResponse } from "next/server"
import { prismaEnsureConnected } from "@/lib/prisma"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { apiGuardFinanceiroViewOrOps } from "@/lib/auth/api-enterprise-guard"
import {
  listContasPagarByStore,
  buildContaPagarSummary,
  buildContaPagarAuditTrail,
} from "@/lib/financeiro/services"
import { parseDateStringSafe } from "@/lib/financeiro/contracts/valores"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

type ContaPagarItemLike = {
  id: string
  descricao: string
  fornecedor: string
  valor: number
  /** YYYY-MM-DD (painel legado) */
  dataVencimento: string
  status: "pendente" | "pago" | "atrasado" | string
  categoria: string
  // extras tolerados
  fornecedorId?: string
  numeroDocumento?: string
  vencimento?: string
}

function safeStr(v: unknown): string {
  return typeof v === "string" ? v : ""
}

function safeNum(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0
}

function rowFromContaPagarPayload(localKey: string, payload: unknown): ContaPagarItemLike | null {
  if (!payload || typeof payload !== "object") return null
  const o = payload as Partial<ContaPagarItemLike>
  if (o.id === undefined || String(o.id) !== localKey) return null
  // Se parece com o shape do painel legado, reaproveita direto.
  if (typeof o.descricao === "string" && typeof o.fornecedor === "string" && typeof o.dataVencimento === "string") {
    return o as ContaPagarItemLike
  }
  return null
}

function toISODateOrEmpty(raw: string): string {
  const d = parseDateStringSafe(raw)
  if (!d) return ""
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function buildContaPagarRowFallback(t: {
  id: string
  descricao: string
  valor: number
  vencimento: string
  status: string
  numeroDocumento: string
  fornecedorId?: string | null
  payload?: unknown
}): ContaPagarItemLike {
  const p = (t.payload && typeof t.payload === "object" ? (t.payload as Record<string, unknown>) : {}) as Record<
    string,
    unknown
  >
  const fornecedorNome = (safeStr(p.fornecedorNome) || safeStr(p.fornecedor) || "").trim()
  const categoria = safeStr(p.categoria).trim() || "Outros"
  const dataVencimento = toISODateOrEmpty(t.vencimento) || safeStr(p.dataVencimento) || ""

  return {
    id: t.id,
    descricao: t.descricao,
    fornecedor: fornecedorNome || "Fornecedor",
    valor: safeNum(t.valor),
    dataVencimento,
    status: t.status,
    categoria,
    fornecedorId: safeStr(p.fornecedorId) || (t.fornecedorId ?? undefined),
    numeroDocumento: t.numeroDocumento,
    vencimento: t.vencimento,
  }
}

export async function GET(req: Request) {
  const storeId = opsLojaIdFromRequest(req) || "loja-1"
  const denied = await apiGuardFinanceiroViewOrOps(storeId, { skipOpsInDev: true })
  if (denied) return denied

  try {
    await prismaEnsureConnected()
    const titulos = await listContasPagarByStore(storeId)

    const rows: ContaPagarItemLike[] = []
    for (const r of titulos) {
      const lk = r.localKey?.trim() || r.id
      if (!lk) continue
      const fromPayload = rowFromContaPagarPayload(lk, r.payload)
      if (fromPayload) {
        rows.push(fromPayload)
        continue
      }
      rows.push(
        buildContaPagarRowFallback({
          id: lk,
          descricao: r.descricao,
          valor: r.valor,
          vencimento: r.vencimento,
          status: r.status,
          numeroDocumento: r.numeroDocumento,
          fornecedorId: r.fornecedorId,
          payload: r.payload,
        }),
      )
    }

    const summary = buildContaPagarSummary(titulos)
    const audit = buildContaPagarAuditTrail(titulos)
    const generatedAt = new Date().toISOString()

    return NextResponse.json({
      ok: true,
      rows,
      summary,
      audit,
      metadata: {
        source: "server",
        storeId,
        generatedAt,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[ops/contas-pagar-list]", msg)
    const dev = process.env.NODE_ENV === "development"
    return NextResponse.json(
      { error: "Falha ao listar contas a pagar", rows: [], ...(dev ? { detail: msg } : {}) },
      { status: 503 },
    )
  }
}

