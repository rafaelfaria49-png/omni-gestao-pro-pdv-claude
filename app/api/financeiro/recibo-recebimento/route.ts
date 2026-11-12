import { requireModuleApi } from "@/lib/auth/module-access"
/**
 * GET /api/financeiro/recibo-recebimento
 *
 * 2ª via do comprovante NÃO FISCAL a partir do registro ORIGINAL do pagamento
 * (`payload.historico` do título). Somente leitura: nunca baixa, nunca lança.
 *
 *  - `?localKey=<k>`                 → lista os pagamentos do título (para escolher);
 *  - `?localKey=<k>&index=<n>`       → comprovante daquele pagamento; se ele pertence a
 *    uma operação em lote (`loteId`), devolve o comprovante CONSOLIDADO da operação.
 *
 * Escopo: loja do header; títulos de outra unidade não são lidos.
 */
import { NextResponse } from "next/server"
import { prisma, prismaEnsureConnected } from "@/lib/prisma"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { apiGuardFinanceiroViewOrOps } from "@/lib/auth/api-enterprise-guard"
import { buildContaReceberAuditTrail } from "@/lib/financeiro/services"
import { operacoesDoTitulo, reconstruirReciboRecebimento, type TituloLedger } from "@/lib/financeiro/recibo-recebimento"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function err(error: string, code: string, status: number) {
  return NextResponse.json({ ok: false, error, code }, { status })
}

function toLedger(t: { id: string; localKey: string | null; descricao: string; cliente: string; valor: number; payload: unknown }): TituloLedger {
  return { id: t.id, localKey: t.localKey, descricao: t.descricao, cliente: t.cliente, valor: t.valor, payload: t.payload }
}

export async function GET(req: Request) {
  const moduleDenied = await requireModuleApi(req, "finance")
  if (moduleDenied) return moduleDenied
  const storeId = opsLojaIdFromRequest(req)
  if (!storeId) return err("Unidade obrigatória", "store_missing", 400)
  const denied = await apiGuardFinanceiroViewOrOps(storeId, { skipOpsInDev: true })
  if (denied) return denied

  const url = new URL(req.url)
  const localKey = url.searchParams.get("localKey")?.trim() ?? ""
  const indexRaw = url.searchParams.get("index")
  if (!localKey || localKey.length > 260) return err("localKey obrigatório", "localKey_missing", 400)
  const index = indexRaw == null ? null : Number(indexRaw)
  if (index != null && (!Number.isInteger(index) || index < 0)) return err("index inválido", "index_invalido", 400)

  try {
    await prismaEnsureConnected()
    const titulo = await prisma.contaReceberTitulo.findUnique({ where: { storeId_localKey: { storeId, localKey } } })
    if (!titulo) return err("Título não encontrado", "not_found", 404)

    const ledger = toLedger(titulo)
    if (index == null) {
      return NextResponse.json({ ok: true, pagamentos: operacoesDoTitulo(ledger) })
    }

    const pagamento = operacoesDoTitulo(ledger).find((p) => p.index === index)
    if (!pagamento) return err("Pagamento não encontrado neste título", "pagamento_nao_encontrado", 404)

    let titulos: TituloLedger[] = [ledger]
    if (pagamento.loteId) {
      // Os outros títulos da MESMA operação, só desta loja (containment JSONB, parametrizado).
      const filtro = JSON.stringify([{ loteId: pagamento.loteId }])
      const ids = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "contas_receber_titulos"
        WHERE "storeId" = ${storeId} AND "payload"->'historico' @> ${filtro}::jsonb
        LIMIT 50`
      const outros = ids.length
        ? await prisma.contaReceberTitulo.findMany({ where: { storeId, id: { in: ids.map((r) => r.id) } } })
        : []
      const porId = new Map([titulo, ...outros].map((t) => [t.id, toLedger(t)]))
      titulos = [...porId.values()]
    }

    const r = reconstruirReciboRecebimento(
      titulos,
      pagamento.loteId ? { loteId: pagamento.loteId } : { localKey: titulo.localKey ?? titulo.id, index },
    )
    if (!r.ok) {
      const msg =
        r.code === "pagamento_estornado"
          ? "Este pagamento foi estornado — não há comprovante válido para reimprimir."
          : r.code === "operacao_incompleta"
            ? "Operação com dados inconsistentes; reimpressão recusada."
            : "Pagamento não encontrado."
      return err(msg, r.code, r.code === "pagamento_nao_encontrado" ? 404 : 409)
    }

    // Saldo ATUAL do título (informativo na 2ª via; o comprovante mostra o saldo da época).
    const saldoAtual = buildContaReceberAuditTrail([titulo])[0]?.saldoAberto ?? 0
    return NextResponse.json({ ok: true, recibo: r.recibo, saldoAtualTitulo: saldoAtual })
  } catch (e) {
    console.error("[financeiro/recibo-recebimento]", e instanceof Error ? e.message : "erro")
    return err("Falha ao montar o comprovante", "db_error", 503)
  }
}
