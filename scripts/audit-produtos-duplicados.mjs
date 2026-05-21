/**
 * Auditoria DRY-RUN de produtos duplicados. READ-ONLY por padrão — nunca altera o banco.
 *
 * Detecta duplicados por:
 *   1. SKU normalizado (remove prefixo `gc-` / `imp-`, lowercase)
 *   2. barcode/EAN
 *   3. nome normalizado + preço
 *
 * Uso:
 *   node --env-file=.env scripts/audit-produtos-duplicados.mjs
 *   node --env-file=.env scripts/audit-produtos-duplicados.mjs --store loja-1
 *
 * Não há modo --apply aqui de propósito: limpeza/merge é decisão manual.
 */
import { PrismaClient } from "../generated/prisma/index.js"

const prisma = new PrismaClient()

const args = process.argv.slice(2)
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

/** Remove prefixos de importador (gc-, imp-) e normaliza para comparar SKUs equivalentes. */
function normSku(sku) {
  if (!sku) return ""
  let s = String(sku).trim().toLowerCase()
  s = s.replace(/^gc-/, "").replace(/^imp-/, "")
  return s
}

function moneyDivergente(vals) {
  const set = new Set(vals.map((v) => Number(v ?? 0).toFixed(2)))
  return set.size > 1
}

function printGroup(label, members) {
  console.log("─".repeat(80))
  console.log(`GRUPO [${label}] — ${members.length} registros`)
  const stocks = members.map((m) => m.stock)
  const prices = members.map((m) => m.price)
  if (moneyDivergente(prices)) console.log(`  ⚠ preços divergentes: ${prices.join(" / ")}`)
  const stockSet = new Set(stocks)
  if (stockSet.size > 1) console.log(`  ⚠ estoque divergente: ${stocks.join(" / ")}`)
  for (const m of members) {
    const flags = []
    if (/^gc-/i.test(m.sku ?? "")) flags.push("PREFIXO gc-")
    if (/^imp-/i.test(m.sku ?? "")) flags.push("PREFIXO imp-")
    const vinc = `OS=${m._os} mLink=${m._links} mList=${m._listings}`
    console.log(
      `   • id=${m.id} sku="${m.sku ?? "—"}" barcode="${m.barcode ?? "—"}" stock=${m.stock} price=${m.price} cat="${m.category ?? "—"}" status=${m.status}/${m.active ? "ativo" : "inativo"} [${vinc}]${flags.length ? "  <" + flags.join(",") + ">" : ""}`
    )
    console.log(`     name: ${String(m.name ?? "").slice(0, 80)}`)
    console.log(`     createdAt: ${m.createdAt?.toISOString?.() ?? m.createdAt}`)
  }
}

try {
  await prisma.$connect()
  const all = await prisma.produto.findMany({
    where: { storeId: STORE_ID },
    select: {
      id: true,
      sku: true,
      barcode: true,
      name: true,
      stock: true,
      price: true,
      precoCusto: true,
      category: true,
      status: true,
      active: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  })
  console.log(`[dup-audit] Loja: ${STORE_ID}`)
  console.log(`[dup-audit] Total de produtos: ${all.length}`)

  // Enriquecer com contagem de vínculos (uma vez por produto)
  for (const p of all) {
    const [os, links, listings] = await Promise.all([
      prisma.ordemServicoItem.count({ where: { produtoId: p.id } }).catch(() => 0),
      prisma.marketplaceProductLink.count({ where: { produtoId: p.id } }).catch(() => 0),
      prisma.marketplaceListing.count({ where: { productId: p.id } }).catch(() => 0),
    ])
    p._os = os
    p._links = links
    p._listings = listings
  }

  // ── Agrupamento 1: SKU normalizado ──
  const bySku = new Map()
  for (const p of all) {
    const k = normSku(p.sku)
    if (!k) continue
    if (!bySku.has(k)) bySku.set(k, [])
    bySku.get(k).push(p)
  }
  const dupSku = [...bySku.entries()].filter(([, v]) => v.length > 1)

  // ── Agrupamento 2: barcode ──
  const byBarcode = new Map()
  for (const p of all) {
    const k = String(p.barcode ?? "").trim()
    if (!k) continue
    if (!byBarcode.has(k)) byBarcode.set(k, [])
    byBarcode.get(k).push(p)
  }
  const dupBarcode = [...byBarcode.entries()].filter(([, v]) => v.length > 1)

  // ── Agrupamento 3: nome + preço (fallback) ──
  const byNamePrice = new Map()
  for (const p of all) {
    const k = `${normName(p.name)}|${Number(p.price ?? 0).toFixed(2)}`
    if (!normName(p.name)) continue
    if (!byNamePrice.has(k)) byNamePrice.set(k, [])
    byNamePrice.get(k).push(p)
  }
  const dupNamePrice = [...byNamePrice.entries()].filter(([, v]) => v.length > 1)

  // IDs únicos envolvidos em qualquer grupo de duplicidade
  const idsDuplicados = new Set()
  for (const [, members] of [...dupSku, ...dupBarcode, ...dupNamePrice]) {
    for (const m of members) idsDuplicados.add(m.id)
  }

  // Classifica grupos por SKU: nome confere em todos (merge seguro) vs diverge (colisão de código curto — NÃO é duplicata)
  const nameMatches = (members) => {
    const names = new Set(members.map((m) => normName(m.name)))
    return names.size === 1
  }
  const dupSkuNomeConfere = dupSku.filter(([, m]) => nameMatches(m))
  const dupSkuNomeDiverge = dupSku.filter(([, m]) => !nameMatches(m))

  console.log("")
  console.log(`[dup-audit] Grupos por SKU normalizado:   ${dupSku.length}`)
  console.log(`[dup-audit]   ├─ nome CONFERE (duplicata real, merge seguro): ${dupSkuNomeConfere.length}`)
  console.log(`[dup-audit]   └─ nome DIVERGE (colisão de código curto, NÃO mexer): ${dupSkuNomeDiverge.length}`)
  console.log(`[dup-audit] Grupos por barcode:           ${dupBarcode.length}`)
  console.log(`[dup-audit] Grupos por nome+preço:        ${dupNamePrice.length}`)
  console.log(`[dup-audit] Produtos distintos envolvidos em alguma duplicidade: ${idsDuplicados.size}`)
  const comPrefixoGc = all.filter((p) => /^gc-/i.test(p.sku ?? "")).length
  console.log(`[dup-audit] Produtos com SKU prefixo gc-: ${comPrefixoGc}`)

  if (dupSkuNomeDiverge.length > 0) {
    console.log("")
    console.log("⚠ COLISÕES DE CÓDIGO CURTO (nome diverge — revisar, NÃO mesclar):")
    for (const [k, members] of dupSkuNomeDiverge) {
      console.log(`   sku base "${k}": ${members.map((m) => `"${String(m.name).slice(0, 30)}"`).join(" vs ")}`)
    }
  }

  console.log("")
  console.log("═".repeat(80))
  console.log("DUPLICADOS POR SKU NORMALIZADO (mais confiável):")
  for (const [k, members] of dupSku) printGroup(`sku:${k}`, members)

  console.log("")
  console.log("═".repeat(80))
  console.log("DUPLICADOS POR BARCODE (não cobertos por SKU acima):")
  for (const [k, members] of dupBarcode) {
    const ids = new Set(members.map((m) => m.id))
    const jaNoSku = dupSku.some(([, sm]) => sm.some((m) => ids.has(m.id)))
    if (jaNoSku) continue
    printGroup(`barcode:${k}`, members)
  }

  console.log("")
  console.log("═".repeat(80))
  console.log("DUPLICADOS POR NOME+PREÇO (fallback — revisar manualmente, pode haver falso positivo):")
  for (const [k, members] of dupNamePrice) {
    const ids = new Set(members.map((m) => m.id))
    const jaCoberto =
      dupSku.some(([, sm]) => sm.some((m) => ids.has(m.id))) ||
      dupBarcode.some(([, bm]) => bm.some((m) => ids.has(m.id)))
    if (jaCoberto) continue
    printGroup(`nome+preço:${k.slice(0, 50)}`, members)
  }

  console.log("")
  console.log("─".repeat(80))
  console.log("[dup-audit] FIM. Nenhuma alteração feita no banco (dry-run).")
  process.exit(0)
} catch (e) {
  console.error("[dup-audit] FALHA:", e)
  process.exit(1)
} finally {
  await prisma.$disconnect()
}
