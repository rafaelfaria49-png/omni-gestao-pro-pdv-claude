/**
 * Auditoria read-only: identifica produtos com nome incompatível (termos jurídicos,
 * documentos, garantia, frases inteiras) que provavelmente entraram em alguma importação.
 * Nenhuma mutação. Apenas relata.
 *
 * Uso: node --env-file=.env scripts/audit-produtos-suspeitos.mjs
 */
import { PrismaClient } from "../generated/prisma/index.js"

const prisma = new PrismaClient()

const NAME_LENGTH_THRESHOLD = 180

const JURIDICO_KEYWORDS = [
  "termo de garantia",
  "garantia legal",
  "código de defesa do consumidor",
  "codigo de defesa do consumidor",
  "cliente declara",
  "condição de produto usado",
  "condicao de produto usado",
  "lei nº",
  "lei n°",
  "lei n.",
  "art.",
  "artigo 26",
  "inciso ii",
  "assistência técnica especializada",
  "assistencia tecnica especializada",
]

const SOCIAL_KEYWORDS = ["whatsapp", "instagram"]

function normalize(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

function flagsFor(p) {
  const flags = []
  const n = String(p.name ?? "")
  const nn = normalize(n)
  if (n.length > NAME_LENGTH_THRESHOLD) flags.push(`name_too_long(${n.length})`)
  if (/[\r\n]/.test(n)) flags.push("has_linebreak")
  if ((n.match(/[.!?]/g) ?? []).length >= 4) flags.push("many_sentences")
  for (const kw of JURIDICO_KEYWORDS) {
    if (nn.includes(normalize(kw))) {
      flags.push(`juridical:${kw}`)
      break
    }
  }
  for (const kw of SOCIAL_KEYWORDS) {
    if (nn.includes(kw)) {
      flags.push(`social:${kw}`)
      break
    }
  }
  return flags
}

try {
  await prisma.$connect()
  const total = await prisma.produto.count()
  console.log(`[audit] Total de produtos no banco: ${total}`)

  // Puxa metadados leves; carrega `name` inteiro porque ele é o que classificamos.
  const all = await prisma.produto.findMany({
    select: {
      id: true,
      storeId: true,
      sku: true,
      barcode: true,
      name: true,
      brand: true,
      supplierName: true,
      stock: true,
      price: true,
      precoCusto: true,
      category: true,
      status: true,
      active: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  const suspeitos = []
  for (const p of all) {
    const flags = flagsFor(p)
    if (flags.length > 0) suspeitos.push({ ...p, flags })
  }

  console.log(`[audit] Produtos sinalizados: ${suspeitos.length}`)
  console.log("")

  // Quebra por loja
  const porLoja = new Map()
  for (const s of suspeitos) {
    porLoja.set(s.storeId, (porLoja.get(s.storeId) ?? 0) + 1)
  }
  console.log("[audit] Distribuição por loja:")
  for (const [storeId, qtd] of porLoja.entries()) {
    console.log(`  ${storeId}: ${qtd}`)
  }
  console.log("")

  // Detalhe completo dos suspeitos
  for (const s of suspeitos) {
    console.log("─".repeat(80))
    console.log(`ID:           ${s.id}`)
    console.log(`storeId:      ${s.storeId}`)
    console.log(`SKU:          ${s.sku ?? "—"}`)
    console.log(`barcode:      ${s.barcode ?? "—"}`)
    console.log(`flags:        ${s.flags.join(", ")}`)
    console.log(`name (len=${String(s.name ?? "").length}):`)
    const lines = String(s.name ?? "").split(/\r?\n/)
    for (const line of lines.slice(0, 6)) console.log(`  | ${line.slice(0, 120)}`)
    if (lines.length > 6) console.log(`  | ... (+${lines.length - 6} linha(s))`)
    console.log(`brand:        ${s.brand || "—"}`)
    console.log(`supplierName: ${s.supplierName || "—"}`)
    console.log(`category:     ${s.category ?? "—"}`)
    console.log(`status:       ${s.status} · active=${s.active}`)
    console.log(`stock:        ${s.stock}`)
    console.log(`price:        ${s.price} · custo: ${s.precoCusto}`)
    console.log(`createdAt:    ${s.createdAt?.toISOString?.() ?? s.createdAt}`)
    console.log(`updatedAt:    ${s.updatedAt?.toISOString?.() ?? s.updatedAt}`)

    // Vínculos. Atenção: MarketplaceListing usa `productId`, MarketplaceProductLink usa `produtoId` (schema inconsistente).
    const [osCount, listingsCount, linksCount] = await Promise.all([
      prisma.ordemServicoItem.count({ where: { produtoId: s.id } }).catch(() => "?"),
      prisma.marketplaceListing.count({ where: { productId: s.id } }).catch(() => "?"),
      prisma.marketplaceProductLink.count({ where: { produtoId: s.id } }).catch(() => "?"),
    ])
    console.log(`vínculos:     OS itens=${osCount} · listings=${listingsCount} · marketplace links=${linksCount}`)
  }

  // Resumo de criação para descobrir batch de importação
  if (suspeitos.length > 0) {
    console.log("")
    console.log("─".repeat(80))
    console.log("[audit] Datas de criação dos suspeitos (para correlacionar com importações):")
    const byDay = new Map()
    for (const s of suspeitos) {
      const d = (s.createdAt?.toISOString?.() ?? "").slice(0, 10)
      byDay.set(d, (byDay.get(d) ?? 0) + 1)
    }
    for (const [d, qtd] of [...byDay.entries()].sort()) {
      console.log(`  ${d}: ${qtd}`)
    }
  }

  process.exit(0)
} catch (e) {
  console.error("[audit] FALHA:", e)
  process.exit(1)
} finally {
  await prisma.$disconnect()
}
