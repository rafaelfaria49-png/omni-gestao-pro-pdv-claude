import { requireModuleApi } from "@/lib/auth/module-access"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { apiGuardEnterpriseOrOps } from "@/lib/auth/api-enterprise-guard"
import type { Prisma } from "@/generated/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const SKIP_MAX = 1_000_000
const INVALID = Symbol("invalid")

/** Inteiro em [min, max]; ausente ou não numérico = `fallback` (antes `NaN` virava erro 500). */
function parseIntParam(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(raw ?? "", 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** Instante ISO; ausente = `null`; data inválida = `INVALID` (400, nunca filtro silencioso). */
function parseInstant(raw: string | null): Date | null | typeof INVALID {
  const v = raw?.trim()
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? INVALID : d
}

export async function GET(req: Request) {
  const moduleDenied = await requireModuleApi(req, "cash")
  if (moduleDenied) return moduleDenied

  const lojaId = opsLojaIdFromRequest(req)
  if (!lojaId) {
    return NextResponse.json(
      { error: "Unidade obrigatória: envie o header x-assistec-loja-id." },
      { status: 400 }
    )
  }

  const denied = await apiGuardEnterpriseOrOps(
    lojaId,
    (p) => p.hubs.caixaHistorico,
    "Sem permissão para consultar o histórico de caixa.",
  )
  if (denied) return denied

  const url = new URL(req.url)
  const status = url.searchParams.get("status") ?? undefined
  const take = parseIntParam(url.searchParams.get("take"), 50, 1, 200)
  // Paginação e período (RELATORIOS-FASE-A-001 · A5). Ausentes = comportamento anterior.
  const skip = parseIntParam(url.searchParams.get("skip"), 0, 0, SKIP_MAX)
  const from = parseInstant(url.searchParams.get("from"))
  const to = parseInstant(url.searchParams.get("to"))
  if (from === INVALID || to === INVALID) {
    return NextResponse.json({ error: "Período inválido: use datas ISO em `from`/`to`." }, { status: 400 })
  }
  // Filtro por terminal: id, "sem" (sessões sem terminal) ou ausente.
  const terminalIdParam = url.searchParams.get("terminalId")?.trim() ?? ""
  const terminalWhere =
    terminalIdParam === "sem"
      ? { terminalId: null as string | null }
      : terminalIdParam
        ? { terminalId: terminalIdParam }
        : {}

  const where: Prisma.SessaoCaixaWhereInput = {
    storeId: lojaId,
    ...(status === "ABERTA" || status === "FECHADA" ? { status } : {}),
    ...terminalWhere,
    // `abertaEm` no intervalo [from, to]: o cliente envia os limites do dia no fuso dele.
    ...(from || to ? { abertaEm: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
  }

  try {
    const [sessoes, total] = await Promise.all([prisma.sessaoCaixa.findMany({
      where,
      orderBy: [{ abertaEm: "desc" }, { id: "desc" }],
      take,
      skip,
      select: {
        id: true,
        storeId: true,
        operador: true,
        saldoInicial: true,
        saldoFinal: true,
        saldoContado: true,
        observacao: true,
        status: true,
        abertaEm: true,
        fechadaEm: true,
        terminalId: true,
        _count: { select: { operacoes: true } },
      },
    }), prisma.sessaoCaixa.count({ where })])

    return NextResponse.json({ ok: true, sessoes, total })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[ops/caixa/sessoes]", msg)
    return NextResponse.json({ error: "Falha ao listar sessões de caixa" }, { status: 500 })
  }
}
