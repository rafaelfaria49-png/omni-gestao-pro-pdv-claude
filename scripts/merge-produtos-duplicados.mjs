/**
 * Merge de produtos duplicados (gc- vs SKU cru) — DRY-RUN por padrão.
 *
 * Estratégia (decidida com o usuário):
 *   - Mantém o registro com prefixo `gc-` como CANÔNICO (futuras importações do
 *     importador universal/legado convergem nele, sem tocar no endpoint PDV).
 *   - Enriquece o canônico com o barcode/EAN do registro avançado (que tinha o EAN).
 *   - Preserva estoque/categoria não-vazios (nunca zera, nunca soma).
 *   - A "sobra" (registro avançado redundante) é EXCLUÍDA se não tiver vínculos;
 *     se tiver vínculo (OS/marketplace), é apenas INATIVADA.
 *   - Só atua em grupos onde TODOS os nomes conferem. Colisão de código curto
 *     (ex.: "10" = capinha vs TELA) é IGNORADA.
 *
 * Uso:
 *   node --env-file=.env scripts/merge-produtos-duplicados.mjs            (dry-run)
 *   node --env-file=.env scripts/merge-produtos-duplicados.mjs --apply    (executa)
 *   node --env-file=.env scripts/merge-produtos-duplicados.mjs --store loja-1 --apply
 */
import { PrismaClient } from "../generated/prisma/index.js"

const prisma = new PrismaClient()

const args = process.argv.slice(2)
const APPLY = args.includes("--apply")
const storeArgIdx = args.indexOf("--store")
const STORE_ID = storeArgIdx >= 0 ? args[storeArgIdx + 1] : "loja-1"

function normName(name) {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}
function normSku(sku) {
  if (!sku) return ""
  return String(sku).trim().toLowerCase().replace(/^(?:gc-|imp-|prod-|id-)+/i, "")
}
const hasGcPrefix = (sku) => /^(?:gc-|imp-)/i.test(sku ?? "")

async function vinculosDe(id) {
  const [os, links, listings] = await Promise.all([
    prisma.ordemServicoItem.count({ where: { produtoId: id } }).catch(() => 0),
    prisma.marketplaceProductLink.count({ where: { produtoId: id } }).catch(() => 0),
    prisma.marketplaceListing.count({ where: { productId: id } }).catch(() => 0),
  ])
  return { os, links, listings, total: os + links + listings }
}

try {
  await prisma.$connect()
  console.log(`[merge] Loja: ${STORE_ID} · modo: ${APPLY ? "APPLY (vai gravar)" : "DRY-RUN (somente plano)"}`)

  const all = await prisma.produto.findMany({
    where: { storeId: STORE_ID },
    select: {
      id: true, sku: true, barcode: true, name: true, stock: true,
      price: true, precoCusto: true, category: true, brand: true, active: true, createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  })

  const bySku = new Map()
  for (const p of all) {
    const k = normSku(p.sku)
    if (!k) continue
    if (!bySku.has(k)) bySku.set(k, [])
    bySku.get(k).push(p)
  }

  let gruposAlvo = 0
  let gruposPulados = 0
  let registrosRemovidos = 0
  let registrosInativados = 0
  let registrosEnriquecidos = 0

  for (const [k, members] of bySku.entries()) {
    if (members.length < 2) continue

    // Só mescla se todos os nomes conferem (evita colisão de código curto).
    const nomes = new Set(members.map((m) => normName(m.name)))
    if (nomes.size > 1) {
      gruposPulados += 1
      console.log(`\n⏭  PULADO sku base "${k}" — nomes divergem: ${[...nomes].map((n) => `"${n.slice(0, 30)}"`).join(" vs ")}`)
      continue
    }

    // Keeper = registro com prefixo gc-/imp- (canônico p/ importações futuras).
    // Se nenhum tiver prefixo, mantém o de maior estoque; desempate por mais recente.
    const comPrefixo = members.filter((m) => hasGcPrefix(m.sku))
    let keeper
    if (comPrefixo.length >= 1) {
      keeper = comPrefixo.sort((a, b) => b.stock - a.stock || b.createdAt - a.createdAt)[0]
    } else {
      keeper = [...members].sort((a, b) => b.stock - a.stock || b.createdAt - a.createdAt)[0]
    }
    const losers = members.filter((m) => m.id !== keeper.id)

    gruposAlvo += 1
    console.log(`\n── GRUPO sku base "${k}" — "${String(keeper.name).slice(0, 50)}"`)
    console.log(`   KEEPER  id=${keeper.id} sku="${keeper.sku}" barcode="${keeper.barcode ?? "—"}" stock=${keeper.stock} price=${keeper.price} cat="${keeper.category ?? "—"}"`)

    // Campos a enriquecer no keeper a partir dos losers (sem zerar/somar).
    const patch = {}
    let bestStock = keeper.stock
    let bestBarcode = keeper.barcode
    let bestCategory = keeper.category
    let bestPrice = keeper.price
    let bestCost = keeper.precoCusto

    for (const lo of losers) {
      const v = await vinculosDe(lo.id)
      const acao = v.total > 0 ? "INATIVAR (tem vínculo)" : "EXCLUIR"
      console.log(`   LOSER   id=${lo.id} sku="${lo.sku}" barcode="${lo.barcode ?? "—"}" stock=${lo.stock} → ${acao}${v.total > 0 ? ` [OS=${v.os} link=${v.links} list=${v.listings}]` : ""}`)
      if ((bestStock ?? 0) <= 0 && lo.stock > 0) bestStock = lo.stock
      if (!bestBarcode && lo.barcode) bestBarcode = lo.barcode
      if (!bestCategory && lo.category) bestCategory = lo.category
      if ((bestPrice ?? 0) <= 0 && lo.price > 0) bestPrice = lo.price
      if ((bestCost ?? 0) <= 0 && lo.precoCusto > 0) bestCost = lo.precoCusto
    }

    if (bestStock !== keeper.stock) patch.stock = bestStock
    if (bestBarcode !== keeper.barcode) patch.barcode = bestBarcode
    if (bestCategory !== keeper.category) patch.category = bestCategory
    if (bestPrice !== keeper.price) patch.price = bestPrice
    if (bestCost !== keeper.precoCusto) patch.precoCusto = bestCost

    if (Object.keys(patch).length > 0) {
      console.log(`   PATCH keeper: ${JSON.stringify(patch)}`)
    }

    if (!APPLY) continue

    // ── APPLY ──
    // Pré-calcula vínculos fora da transação para minimizar tempo na tx (Prisma timeout padrão é 5s).
    const losersComVinculo = []
    for (const lo of losers) {
      const v = await vinculosDe(lo.id)
      losersComVinculo.push({ lo, vinculado: v.total > 0 })
    }
    await prisma.$transaction(
      async (tx) => {
        // 1. Remove/inativa losers primeiro (libera unique de barcode/sku).
        for (const { lo, vinculado } of losersComVinculo) {
          if (vinculado) {
            await tx.produto.update({ where: { id: lo.id }, data: { active: false, status: "Inativo" } })
            registrosInativados += 1
          } else {
            await tx.produto.delete({ where: { id: lo.id } })
            registrosRemovidos += 1
          }
        }
        // 2. Enriquece o keeper.
        if (Object.keys(patch).length > 0) {
          await tx.produto.update({ where: { id: keeper.id }, data: patch })
          registrosEnriquecidos += 1
        }
      },
      { timeout: 30_000 },
    )
    console.log(`   ✓ aplicado`)
  }

  console.log("\n" + "─".repeat(70))
  console.log(`[merge] Grupos mesclados:        ${gruposAlvo}`)
  console.log(`[merge] Grupos pulados (colisão): ${gruposPulados}`)
  if (APPLY) {
    console.log(`[merge] Losers excluídos:        ${registrosRemovidos}`)
    console.log(`[merge] Losers inativados:        ${registrosInativados}`)
    console.log(`[merge] Keepers enriquecidos:     ${registrosEnriquecidos}`)
    console.log("[merge] APPLY concluído.")
  } else {
    console.log("[merge] DRY-RUN — nada foi gravado. Rode com --apply para executar.")
  }
  process.exit(0)
} catch (e) {
  console.error("[merge] FALHA:", e)
  process.exit(1)
} finally {
  await prisma.$disconnect()
}
