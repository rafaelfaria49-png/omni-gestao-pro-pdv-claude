/**
 * AUDITORIA (dry-run) — SKUs legados com prefixo `gc-` em `Produto.sku`.
 *
 * Somente LEITURA. NÃO altera o banco. Mapeia o saneamento retroativo seguro
 * que será executado por `scripts/remover-gc-skus.ts`.
 *
 * Uso:
 *   npx tsx scripts/auditar-gc-skus.ts [--store=<storeId>] [--no-report]
 *
 *   --store      limita a auditoria a uma loja (padrão: todas).
 *   --no-report  não grava o .md (apenas imprime no console).
 *
 * Saída: docs/ai/SKU_GC_AUDITORIA_REPORT.md
 *
 * Regras refletidas aqui (idênticas ao remover):
 *   - candidato = sku começa com `gc-` (case-insensitive).
 *   - skuNovo  = stripGcSkuPrefix(skuAtual) — só remove prefixo; não toca barcode/id.
 *   - skuNovo vazio        → produto sem SKU final válido (pular).
 *   - skuNovo já existe (outro produto, mesma loja) → conflito (não atualizar).
 *   - dois gc- → mesmo skuNovo (mesma loja)         → conflito (só o 1º poderia).
 */

import { PrismaClient } from "../generated/prisma"
import * as dotenv from "dotenv"
import { resolve } from "path"
import fs from "node:fs"
import { stripGcSkuPrefix } from "../lib/produto-sku"

dotenv.config({ path: resolve(__dirname, "../.env") })

const db = new PrismaClient()

const REPORT_PATH = resolve(__dirname, "../docs/ai/SKU_GC_AUDITORIA_REPORT.md")

type ProdutoRow = { id: string; storeId: string; sku: string | null; name: string }

const arg = (name: string): string | undefined => {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`))
  return p ? p.split("=").slice(1).join("=") : undefined
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`)

/** Conta distintos produtoId referenciados, em lotes para não estourar o `IN`. */
async function distinctReferenciados(
  ids: string[],
  query: (chunk: string[]) => Promise<{ produtoId: string | null }[]>
): Promise<{ linhas: number; produtosDistintos: Set<string> }> {
  const distintos = new Set<string>()
  let linhas = 0
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500)
    const rows = await query(chunk)
    linhas += rows.length
    for (const r of rows) if (r.produtoId) distintos.add(r.produtoId)
  }
  return { linhas, produtosDistintos: distintos }
}

async function main() {
  const storeFilter = arg("store")
  const writeReport = !hasFlag("no-report")
  const t0 = Date.now()

  console.log(`\n=== AUDITORIA SKU gc- ${storeFilter ? `(loja ${storeFilter})` : "(todas as lojas)"} ===`)

  // 1) Carrega todos os produtos (apenas campos necessários).
  const produtos: ProdutoRow[] = await db.produto.findMany({
    where: storeFilter ? { storeId: storeFilter } : undefined,
    select: { id: true, storeId: true, sku: true, name: true },
  })
  console.log(`Produtos no escopo: ${produtos.length}`)

  // 2) Índice de SKUs existentes por loja (match exato — como o unique do banco).
  const skusPorLoja = new Map<string, Map<string, string[]>>() // store -> sku -> [ids]
  for (const p of produtos) {
    if (p.sku == null) continue
    let m = skusPorLoja.get(p.storeId)
    if (!m) { m = new Map(); skusPorLoja.set(p.storeId, m) }
    const arr = m.get(p.sku)
    if (arr) arr.push(p.id)
    else m.set(p.sku, [p.id])
  }

  // 3) Candidatos gc-
  const candidatos = produtos.filter((p) => /^gc-/i.test((p.sku ?? "").trim()))

  type Seguro = { id: string; storeId: string; de: string; para: string; name: string }
  type Conflito = Seguro & { motivo: string; conflitaCom: string[] }
  type SemSku = { id: string; storeId: string; de: string; name: string }

  const seguros: Seguro[] = []
  const conflitos: Conflito[] = []
  const semSkuFinal: SemSku[] = []
  const claimadoPorLoja = new Map<string, Map<string, string>>() // store -> skuNovo -> id que reivindicou

  for (const p of candidatos) {
    const atual = (p.sku ?? "").trim()
    const novo = stripGcSkuPrefix(atual)

    if (!novo) {
      semSkuFinal.push({ id: p.id, storeId: p.storeId, de: atual, name: p.name })
      continue
    }

    const existentes = (skusPorLoja.get(p.storeId)?.get(novo) ?? []).filter((id) => id !== p.id)
    if (existentes.length > 0) {
      conflitos.push({
        id: p.id, storeId: p.storeId, de: atual, para: novo, name: p.name,
        motivo: "skuNovo já existe em outro produto da loja",
        conflitaCom: existentes,
      })
      continue
    }

    let claim = claimadoPorLoja.get(p.storeId)
    if (!claim) { claim = new Map(); claimadoPorLoja.set(p.storeId, claim) }
    const dono = claim.get(novo)
    if (dono) {
      conflitos.push({
        id: p.id, storeId: p.storeId, de: atual, para: novo, name: p.name,
        motivo: "dois produtos gc- colidem no mesmo skuNovo",
        conflitaCom: [dono],
      })
      continue
    }
    claim.set(novo, p.id)
    seguros.push({ id: p.id, storeId: p.storeId, de: atual, para: novo, name: p.name })
  }

  // 4) Vínculos dos candidatos gc- (informativo — confirma que nada quebra).
  const idsGc = candidatos.map((c) => c.id)
  const [osItens, movs, listings, links, vendaItens] = await Promise.all([
    distinctReferenciados(idsGc, (chunk) =>
      db.ordemServicoItem.findMany({ where: { produtoId: { in: chunk } }, select: { produtoId: true } })),
    distinctReferenciados(idsGc, (chunk) =>
      db.movimentacaoEstoque.findMany({ where: { produtoId: { in: chunk } }, select: { produtoId: true } })),
    distinctReferenciados(idsGc, (chunk) =>
      db.marketplaceListing.findMany({ where: { productId: { in: chunk } }, select: { productId: true } })
        .then((r) => r.map((x) => ({ produtoId: x.productId })))),
    distinctReferenciados(idsGc, (chunk) =>
      db.marketplaceProductLink.findMany({ where: { produtoId: { in: chunk } }, select: { produtoId: true } })),
    distinctReferenciados(idsGc, (chunk) =>
      db.itemVenda.findMany({ where: { inventoryId: { in: chunk } }, select: { inventoryId: true } })
        .then((r) => r.map((x) => ({ produtoId: x.inventoryId })))),
  ])

  const duracaoMs = Date.now() - t0

  // ── Console ──
  console.log(`\nCandidatos gc-          : ${candidatos.length}`)
  console.log(`  • seguros (atualizáveis): ${seguros.length}`)
  console.log(`  • conflitos             : ${conflitos.length}`)
  console.log(`  • sem SKU final válido  : ${semSkuFinal.length}`)
  console.log(`\nVínculos dos produtos gc- (referenciam por id — não quebram com troca de sku):`)
  console.log(`  • itens de venda (ItemVenda.inventoryId): ${vendaItens.linhas} linhas / ${vendaItens.produtosDistintos.size} produtos`)
  console.log(`  • itens de OS    (OrdemServicoItem)     : ${osItens.linhas} linhas / ${osItens.produtosDistintos.size} produtos`)
  console.log(`  • movimentações de estoque             : ${movs.linhas} linhas / ${movs.produtosDistintos.size} produtos`)
  console.log(`  • marketplace listings                 : ${listings.linhas} linhas / ${listings.produtosDistintos.size} produtos`)
  console.log(`  • marketplace product links            : ${links.linhas} linhas / ${links.produtosDistintos.size} produtos`)
  if (conflitos.length > 0) {
    console.log(`\nConflitos (primeiros 20):`)
    for (const c of conflitos.slice(0, 20)) {
      console.log(`  [${c.storeId}] "${c.de}" → "${c.para}" — ${c.motivo} (com ${c.conflitaCom.join(", ")})`)
    }
  }
  console.log(`\nDuração: ${duracaoMs}ms`)

  // ── Relatório .md ──
  if (writeReport) {
    const exemplos = seguros.slice(0, 20)
    const fmtLinha = (s: Seguro) => `| \`${s.de}\` | \`${s.para}\` | ${s.storeId} | ${s.name.replace(/\|/g, "/").slice(0, 40)} |`
    const fmtConflito = (c: Conflito) =>
      `| \`${c.de}\` | \`${c.para}\` | ${c.storeId} | ${c.motivo} | ${c.conflitaCom.join(", ")} |`
    const fmtSemSku = (s: SemSku) => `| ${s.id} | \`${s.de}\` | ${s.storeId} | ${s.name.replace(/\|/g, "/").slice(0, 40)} |`

    const md = `# Auditoria — SKUs legados \`gc-\` (dry-run)

> Gerado por \`scripts/auditar-gc-skus.ts\` em ${new Date().toISOString()}.
> **Somente leitura — nenhuma alteração foi feita no banco.**
> Escopo: ${storeFilter ? `loja \`${storeFilter}\`` : "todas as lojas"}.

## Resumo

| Métrica | Valor |
|---|---|
| Produtos no escopo | ${produtos.length} |
| Candidatos \`gc-\` (sku começa com \`gc-\`) | ${candidatos.length} |
| **Seguros (atualizáveis)** | **${seguros.length}** |
| Conflitos (não serão atualizados) | ${conflitos.length} |
| Sem SKU final válido (pular) | ${semSkuFinal.length} |
| Duração da auditoria | ${duracaoMs}ms |

## Vínculos dos produtos \`gc-\`

Todos os vínculos abaixo referenciam o produto por **id (cuid)**, não pelo \`sku\`.
A troca de \`Produto.sku\` **não quebra** nenhum destes vínculos.
(\`MovimentacaoEstoque.produtoSku\` é snapshot de auditoria e **não é alterado**.)

| Vínculo | Linhas | Produtos distintos |
|---|---|---|
| Itens de venda (\`ItemVenda.inventoryId\`) | ${vendaItens.linhas} | ${vendaItens.produtosDistintos.size} |
| Itens de OS (\`OrdemServicoItem.produtoId\`) | ${osItens.linhas} | ${osItens.produtosDistintos.size} |
| Movimentações de estoque (\`produtoId\`) | ${movs.linhas} | ${movs.produtosDistintos.size} |
| Marketplace listings (\`productId\`) | ${listings.linhas} | ${listings.produtosDistintos.size} |
| Marketplace product links (\`produtoId\`) | ${links.linhas} | ${links.produtosDistintos.size} |

## Exemplos de conversão segura (before → after)

${exemplos.length === 0 ? "_Nenhum._" : `| SKU atual | SKU novo | Loja | Produto |
|---|---|---|---|
${exemplos.map(fmtLinha).join("\n")}`}

## Conflitos (NÃO serão atualizados)

${conflitos.length === 0 ? "_Nenhum conflito encontrado._" : `| SKU atual | SKU novo | Loja | Motivo | Conflita com (id) |
|---|---|---|---|---|
${conflitos.map(fmtConflito).join("\n")}`}

## Sem SKU final válido (skuNovo vazio — serão pulados)

${semSkuFinal.length === 0 ? "_Nenhum._" : `| Produto id | SKU atual | Loja | Produto |
|---|---|---|---|
${semSkuFinal.map(fmtSemSku).join("\n")}`}

---

**Próximo passo:** revisar este relatório e, se aprovado, executar
\`npx tsx scripts/remover-gc-skus.ts\` (dry-run) e depois com \`--apply\`.
`

    fs.writeFileSync(REPORT_PATH, md, "utf8")
    console.log(`\nRelatório gravado: ${REPORT_PATH}`)
  }

  await db.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await db.$disconnect()
  process.exit(1)
})
