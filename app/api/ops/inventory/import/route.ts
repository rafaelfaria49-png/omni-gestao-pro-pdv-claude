import { NextResponse } from "next/server"
import type { Prisma } from "@/generated/prisma"
import { prisma } from "@/lib/prisma"
import { normalizeSkuForSave } from "@/lib/produto-sku"
import { normalizeProdutoSku } from "@/lib/produto-sku-normalize"
import { getVerifiedSubscriptionFromCookies } from "@/lib/api-auth"
import { isVencimentoExpired } from "@/lib/subscription-seal"
import { getTrustedTimeMs } from "@/lib/trusted-time"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { requireAdmin } from "@/lib/require-admin"
import { auth } from "@/auth"
import { cadastrosAuditPrincipalFromSession } from "@/lib/cadastros/cadastros-audit-principal"
import { canAuthorizeCadastrosStore } from "@/lib/cadastros/cadastros-api-access"
import type { ProductWriteInput } from "@/lib/cadastros/product-write-contract"
import { createProduct, updateProduct } from "@/lib/cadastros/product-write-service"

export const runtime = "nodejs"

type InvPayload = {
  id: string
  name: string
  stock: number
  cost: number
  price: number
  category: string
}

async function requireSubscription() {
  try {
    const session = await auth()
    if (session?.user) return { ok: true as const }
  } catch {
    // fora de contexto de request; tenta fallback legacy
  }
  const sub = await getVerifiedSubscriptionFromCookies()
  if (!sub.ok) {
    return { ok: false as const, res: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) }
  }
  const now = await getTrustedTimeMs()
  if (isVencimentoExpired(now, sub.vencimento) || sub.status !== "ativa") {
    return { ok: false as const, res: NextResponse.json({ error: "Assinatura inválida" }, { status: 403 }) }
  }
  return { ok: true as const }
}

export async function PUT(req: Request) {
  const gate = await requireSubscription()
  if (!gate.ok) return gate.res
  const adminGate = await requireAdmin()
  if (!adminGate.ok) return adminGate.res

  const storeId = storeIdFromAssistecRequestForWrite(req)
  if (!storeId) {
    return NextResponse.json(
      { error: "Unidade obrigatória: envie o header x-assistec-loja-id ou query storeId." },
      { status: 400 }
    )
  }

  // CAD-R2-014: loja autorizada fail-closed (header nunca é prova sozinho).
  // ADMIN/SUPER_ADMIN têm acesso global; demais perfis exigem membership.
  if (!canAuthorizeCadastrosStore(adminGate.session, storeId)) {
    return NextResponse.json({ error: "Sem permissão para esta unidade" }, { status: 403 })
  }
  // Principal humano canônico quando houver; null = origem técnica honesta.
  const principal = cadastrosAuditPrincipalFromSession(adminGate.session)
  const wctx = { storeId, principal }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const items = (body as { items?: unknown }).items
  if (!Array.isArray(items)) {
    return NextResponse.json({ error: "items deve ser um array" }, { status: 400 })
  }

  const normalized: InvPayload[] = []
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue
    const o = raw as Record<string, unknown>
    const idRaw = typeof o.id === "string" ? o.id.trim() : ""
    const id = normalizeSkuForSave(idRaw)
    const name = typeof o.name === "string" ? o.name.trim() : ""
    if (!id || !name) continue
    const category =
      typeof o.category === "string" && o.category.trim() ? o.category.trim() : ""
    normalized.push({
      id,
      name,
      stock: typeof o.stock === "number" && Number.isFinite(o.stock) ? o.stock : 0,
      cost: typeof o.cost === "number" && Number.isFinite(o.cost) ? o.cost : 0,
      price: typeof o.price === "number" && Number.isFinite(o.price) ? o.price : 0,
      category,
    })
  }
  if (normalized.length === 0) {
    return NextResponse.json({ error: "Nenhum item válido para importar" }, { status: 400 })
  }

  // Modo mesclagem (segurança): não apaga itens antigos e NÃO sobrescreve o estoque
  // de produtos já existentes — importação comum não pode reverter saldo vendido.
  // Estoque só muda por entrada/ajuste/inventário auditado. Produto novo entra com
  // o estoque inicial da planilha.
  let created = 0
  let updated = 0

  for (const it of normalized) {
    console.log("IMPORT ESTOQUE (merge):", it.name, "->", it.category)
    const skuToSave = normalizeSkuForSave(it.id)
    const skuNorm = normalizeProdutoSku(skuToSave)
    const orMatch: Prisma.ProdutoWhereInput[] = [{ sku: skuToSave }]
    if (it.id !== skuToSave) orMatch.push({ sku: it.id })
    if (skuNorm && skuNorm !== skuToSave.toLowerCase()) orMatch.push({ sku: skuNorm })
    if (skuNorm) orMatch.push({ sku: `gc-${skuNorm}` })

    const existing = await prisma.produto.findFirst({
      where: { storeId, OR: orMatch },
      select: { id: true },
    })

    // CAD-R2-014: cadastral via ProductWriteService; estoque inicial de novo
    // via ledger `cadastro` na mesma transação. Existente nunca tem saldo
    // tocado (sem `estoque`/`stock` no input de update).
    const cadastral: Record<string, unknown> = {
      nome: it.name,
      custo: it.cost,
      preco: it.price,
    }
    if (it.category && it.category.length > 0) cadastral.categoria = it.category

    if (existing) {
      // Existente: atualiza só cadastral; preserva o estoque atual.
      const res = await updateProduct(wctx, existing.id, cadastral as unknown as ProductWriteInput)
      if (res.ok) {
        updated += 1
        continue
      }
      if (res.code === "NOT_FOUND") {
        // Corrida: deletado entre find e update → cria como novo (paridade).
      } else if (res.code === "UNTRUSTED_CONTEXT") {
        return NextResponse.json({ error: res.message || "Não autorizado" }, { status: 401 })
      } else if (res.code === "CROSS_STORE") {
        return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 })
      } else if (res.code === "VALIDATION") {
        return NextResponse.json({ error: res.message }, { status: 400 })
      } else if (res.code === "DUPLICATE") {
        return NextResponse.json({ error: res.message || "Produto já cadastrado" }, { status: 409 })
      } else {
        return NextResponse.json({ error: "Falha ao salvar produto" }, { status: 503 })
      }
    }
    // Novo (ou fallback NOT_FOUND): pode iniciar com o estoque da planilha.
    const createInput: Record<string, unknown> = {
      nome: it.name,
      sku: skuToSave,
      custo: it.cost,
      preco: it.price,
      estoque: Math.max(0, Math.floor(it.stock)),
    }
    if (it.category && it.category.length > 0) createInput.categoria = it.category
    const cres = await createProduct(wctx, createInput as unknown as ProductWriteInput)
    if (cres.ok) {
      // Fallback NOT_FOUND (recriação) ou novo: ambos nascem como criados.
      created += 1
      continue
    }
    if (cres.code === "DUPLICATE") {
      // Corrida: outra request criou o mesmo SKU entre find e create.
      // Reconcilia como update cadastral (preserva estoque, sem duplicar ledger).
      const retry = await prisma.produto.findFirst({
        where: { storeId, OR: orMatch },
        select: { id: true },
      })
      if (retry) {
        const ures = await updateProduct(wctx, retry.id, cadastral as unknown as ProductWriteInput)
        if (ures.ok) {
          updated += 1
          continue
        }
      }
      return NextResponse.json({ error: cres.message || "Produto já cadastrado" }, { status: 409 })
    }
    if (cres.code === "UNTRUSTED_CONTEXT") {
      return NextResponse.json({ error: cres.message || "Não autorizado" }, { status: 401 })
    }
    if (cres.code === "VALIDATION") {
      return NextResponse.json({ error: cres.message }, { status: 400 })
    }
    if (cres.code === "CROSS_STORE") {
      return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 })
    }
    return NextResponse.json({ error: "Falha ao salvar produto" }, { status: 503 })
  }

  return NextResponse.json({
    ok: true,
    received: normalized.length,
    created,
    updated,
  })
}

