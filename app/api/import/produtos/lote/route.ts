import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { getVerifiedSubscriptionFromCookies } from "@/lib/api-auth"
import { isVencimentoExpired } from "@/lib/subscription-seal"
import { getTrustedTimeMs } from "@/lib/trusted-time"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { prisma } from "@/lib/prisma"
import { persistirLoteProdutos } from "@/lib/importador-produtos/persist"
import type {
  LoteRequest,
  LoteResult,
  ProdutoNormalizado,
} from "@/lib/importador-produtos/types"

export const runtime = "nodejs"
export const maxDuration = 120

const MAX_ITENS_LOTE = 1000

/**
 * Trava de segurança contra "update massivo" indevido (incidente Smart):
 *  - Se o lote atualizou mais que UPDATE_RATIO_LIMIT do tamanho do lote E
 *    nenhum produto foi criado → muito provavelmente bug de matching.
 *  - O persist já é executado, mas se a trava dispara DESFAZEMOS via toda a
 *    operação ser cancelada NÃO. (Cada update é atômico no Prisma; rollback
 *    completo exigiria transaction com escopo de lote inteiro — fora desta entrega.)
 *  - Por ora: retornamos erro forte (HTTP 422) e o cliente bloqueia próximos
 *    lotes. Operador pode reverter manualmente no Estoque se necessário.
 */
const UPDATE_RATIO_LIMIT = 0.5 // se >50% das linhas viraram update + 0 criados → suspeito

async function requireAuth(): Promise<
  { ok: true; userLabel: string } | { ok: false; res: NextResponse }
> {
  try {
    const session = await auth()
    if (session?.user) {
      return {
        ok: true,
        userLabel: session.user.email ?? session.user.name ?? "",
      }
    }
  } catch {
    /* fallback */
  }
  const sub = await getVerifiedSubscriptionFromCookies()
  if (!sub || !sub.ok) {
    return { ok: false, res: NextResponse.json({ error: "forbidden" }, { status: 403 }) }
  }
  const now = await getTrustedTimeMs()
  if (isVencimentoExpired(now, sub.vencimento)) {
    return {
      ok: false,
      res: NextResponse.json({ error: "subscription_expired" }, { status: 402 }),
    }
  }
  return { ok: true, userLabel: "" }
}

function isProdutoNormalizado(x: unknown): x is ProdutoNormalizado {
  if (!x || typeof x !== "object") return false
  const o = x as Record<string, unknown>
  return (
    typeof o.linha === "number" &&
    typeof o.nome === "string" &&
    typeof o.sku === "string" &&
    typeof o.barcode === "string" &&
    typeof o.custo === "number" &&
    typeof o.preco === "number" &&
    typeof o.estoque === "number" &&
    typeof o.categoria === "string"
  )
}

export async function POST(req: NextRequest) {
  const a = await requireAuth()
  if (!a.ok) return a.res

  const storeId = storeIdFromAssistecRequestForWrite(req)
  if (!storeId) {
    return NextResponse.json(
      { error: "Unidade ativa não enviada (header x-assistec-loja-id obrigatório)" },
      { status: 400 },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Payload vazio" }, { status: 400 })
  }
  const b = body as Partial<LoteRequest>
  const batchId = (b.batchId ?? "").trim()
  const arquivo = (b.arquivo ?? "").trim()
  const modoConflito =
    b.modoConflito === "atualizar"
      ? "atualizar"
      : b.modoConflito === "pular"
        ? "pular"
        : "criar"
  const loteIndex = Number(b.loteIndex ?? 0)
  const totalLotes = Number(b.totalLotes ?? 1)
  const itens = Array.isArray(b.itens) ? b.itens : []
  const lojaAtivaIdConfirmado = (b.lojaAtivaIdConfirmado ?? "").trim()

  if (!batchId) return NextResponse.json({ error: "batchId obrigatório" }, { status: 400 })

  // Defesa em profundidade contra race de troca de unidade no client:
  // o cliente envia o storeId que está vendo na UI; servidor confere que
  // bate com o header. Discrepância = aborta.
  if (!lojaAtivaIdConfirmado) {
    return NextResponse.json(
      { error: "lojaAtivaIdConfirmado ausente — recarregue a página e tente novamente" },
      { status: 400 },
    )
  }
  if (lojaAtivaIdConfirmado !== storeId) {
    console.error(
      `[import/produtos/lote] BLOQUEIO storeId divergente: header=${storeId} confirmado=${lojaAtivaIdConfirmado} batchId=${batchId}`,
    )
    return NextResponse.json(
      {
        error: "Unidade ativa divergente entre cabeçalho e UI — operação abortada por segurança",
        detalhe: `Header recebido (${storeId}) não corresponde à loja que o usuário acredita ter selecionado (${lojaAtivaIdConfirmado}). Recarregue a página e refaça o preview.`,
      },
      { status: 409 },
    )
  }

  if (!Number.isFinite(loteIndex) || loteIndex < 0) {
    return NextResponse.json({ error: "loteIndex inválido" }, { status: 400 })
  }
  if (itens.length === 0) {
    return NextResponse.json({ error: "Lote vazio" }, { status: 400 })
  }
  if (itens.length > MAX_ITENS_LOTE) {
    return NextResponse.json(
      { error: `Lote excede o limite de ${MAX_ITENS_LOTE} itens` },
      { status: 413 },
    )
  }
  if (!itens.every(isProdutoNormalizado)) {
    return NextResponse.json({ error: "Itens com formato inválido" }, { status: 400 })
  }

  const resultado = await persistirLoteProdutos(storeId, itens as ProdutoNormalizado[], modoConflito)

  // Trava de segurança anti-update massivo (incidente Smart).
  // Se quase tudo virou update e nada foi criado, alta probabilidade de
  // matching errado — alerta logs + retorna 422.
  const ratioAtualizado = itens.length > 0 ? resultado.atualizados / itens.length : 0
  const suspeito =
    (resultado.criados === 0 && resultado.atualizados === itens.length) ||
    (ratioAtualizado > UPDATE_RATIO_LIMIT && resultado.criados === 0 && resultado.atualizados >= 50)

  if (suspeito) {
    console.error(
      `[import/produtos/lote] TRAVA acionada storeId=${storeId} batchId=${batchId} ` +
        `lote=${loteIndex + 1}/${totalLotes} criados=${resultado.criados} ` +
        `atualizados=${resultado.atualizados} pulados=${resultado.pulados} erros=${resultado.erros}`,
    )
    // Best-effort: registra a tentativa em auditoria mesmo no caso bloqueado.
    try {
      await prisma.logsAuditoria.create({
        data: {
          action: "import.produtos.lote.bloqueado",
          userLabel: (a.userLabel || "Importador de Produtos").slice(0, 500),
          detail: `BLOQUEIO trava anti-update massivo (lote ${loteIndex + 1}/${totalLotes})`.slice(0, 4000),
          source: "importador_produtos",
          metadata: JSON.stringify({
            batchId,
            storeId,
            arquivo,
            loteIndex,
            totalLotes,
            modoConflito,
            motivo: "atualizados em massa sem criados — possível matching agressivo",
            totaisTentados: {
              criados: resultado.criados,
              atualizados: resultado.atualizados,
              pulados: resultado.pulados,
              erros: resultado.erros,
            },
          }).slice(0, 8000),
        },
      })
    } catch {
      /* auditoria não bloqueia resposta */
    }
    return NextResponse.json(
      {
        ok: false,
        error: "Importação bloqueada por segurança",
        detalhe:
          `O lote tentou atualizar ${resultado.atualizados} produtos existentes sem criar nenhum novo. ` +
          `Provavelmente o mapeamento de SKU/código/barcode está casando produtos errados. ` +
          `Refaça o preview e confira as colunas mapeadas, ou troque para o modo "Criar novos (seguro)".`,
        totaisTentados: {
          criados: resultado.criados,
          atualizados: resultado.atualizados,
          pulados: resultado.pulados,
          erros: resultado.erros,
        },
      },
      { status: 422 },
    )
  }

  // Log do lote em LogsAuditoria (best-effort, não bloqueia a resposta).
  try {
    const detalhe =
      `Lote ${loteIndex + 1}/${totalLotes} — ${resultado.criados} criados · ` +
      `${resultado.atualizados} atualizados · ${resultado.pulados} pulados · ${resultado.erros} erros`
    await prisma.logsAuditoria.create({
      data: {
        action: resultado.erros === 0 ? "import.produtos.lote" : "import.produtos.lote.erro",
        userLabel: (a.userLabel || "Importador de Produtos").slice(0, 500),
        detail: detalhe.slice(0, 4000),
        source: "importador_produtos",
        metadata: JSON.stringify({
          batchId,
          storeId,
          arquivo,
          loteIndex,
          totalLotes,
          modoConflito,
          duracaoMs: resultado.duracaoMs,
          telemetria: resultado.telemetria,
          totais: {
            criados: resultado.criados,
            atualizados: resultado.atualizados,
            pulados: resultado.pulados,
            erros: resultado.erros,
          },
          // Mantém só erros e pulados no log (criados/atualizados podem ser ~500 entradas).
          falhas: resultado.itens.filter((i) => i.acao === "erro" || i.acao === "pulado").slice(0, 100),
        }).slice(0, 8000),
      },
    })
  } catch (e) {
    console.warn(
      "[import/produtos/lote] auditoria falhou:",
      e instanceof Error ? e.message : String(e),
    )
  }

  const resp: LoteResult = {
    ok: resultado.erros === 0,
    batchId,
    loteIndex,
    totalLotes,
    criados: resultado.criados,
    atualizados: resultado.atualizados,
    pulados: resultado.pulados,
    erros: resultado.erros,
    duracaoMs: resultado.duracaoMs,
    itens: resultado.itens,
  }
  return NextResponse.json(resp)
}
