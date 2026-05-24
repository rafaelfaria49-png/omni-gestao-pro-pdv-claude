/**
 * SANEAMENTO — remove o prefixo legado `gc-` de `Produto.sku`.
 *
 * **DRY-RUN por padrão.** Só grava no banco com `--apply`.
 * Atualiza EXCLUSIVAMENTE `Produto.sku`. Nunca toca em:
 *   id, inventoryId, barcode, relações Prisma, PDV, caixa, financeiro, schema.
 *
 * Uso:
 *   npx tsx scripts/remover-gc-skus.ts                # dry-run (preview, não grava)
 *   npx tsx scripts/remover-gc-skus.ts --apply        # aplica (escreve no banco)
 *   npx tsx scripts/remover-gc-skus.ts --store=loja-1 # limita a uma loja
 *
 * Regras:
 *   - candidato = sku começa com `gc-` (case-insensitive).
 *   - skuNovo  = stripGcSkuPrefix(skuAtual).
 *   - skuNovo vazio                                  → PULAR.
 *   - skuNovo já existe em outro produto da loja      → CONFLITO (não atualiza).
 *   - dois produtos gc- colidem no mesmo skuNovo      → CONFLITO (só o 1º poderia).
 *   - lotes de 100, uma transação por lote.
 *
 * Saída: docs/ai/SKU_GC_MIGRATION_REPORT.md
 */

import { PrismaClient } from "../generated/prisma"
import * as dotenv from "dotenv"
import { resolve } from "path"
import fs from "node:fs"
import { stripGcSkuPrefix } from "../lib/produto-sku"

dotenv.config({ path: resolve(__dirname, "../.env") })

const db = new PrismaClient()

const REPORT_PATH = resolve(__dirname, "../docs/ai/SKU_GC_MIGRATION_REPORT.md")
const BATCH_SIZE = 100

type ProdutoRow = { id: string; storeId: string; sku: string | null; name: string }
type Seguro = { id: string; storeId: string; de: string; para: string; name: string }
type Conflito = Seguro & { motivo: string; conflitaCom: string[] }
type SemSku = { id: string; storeId: string; de: string; name: string }

const arg = (name: string): string | undefined => {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`))
  return p ? p.split("=").slice(1).join("=") : undefined
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`)

const errCode = (e: unknown): string => {
  const code = (e as { code?: string })?.code
  const msg = e instanceof Error ? e.message : String(e)
  return code ? `${code}: ${msg.slice(0, 120)}` : msg.slice(0, 140)
}

function classificar(produtos: ProdutoRow[]) {
  // Índice de SKUs existentes por loja (match exato — como o unique do banco).
  const skusPorLoja = new Map<string, Map<string, string[]>>()
  for (const p of produtos) {
    if (p.sku == null) continue
    let m = skusPorLoja.get(p.storeId)
    if (!m) { m = new Map(); skusPorLoja.set(p.storeId, m) }
    const arr = m.get(p.sku)
    if (arr) arr.push(p.id)
    else m.set(p.sku, [p.id])
  }

  const candidatos = produtos.filter((p) => /^gc-/i.test((p.sku ?? "").trim()))
  const seguros: Seguro[] = []
  const conflitos: Conflito[] = []
  const semSkuFinal: SemSku[] = []
  const claimadoPorLoja = new Map<string, Map<string, string>>()

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
        motivo: "skuNovo já existe em outro produto da loja", conflitaCom: existentes,
      })
      continue
    }

    let claim = claimadoPorLoja.get(p.storeId)
    if (!claim) { claim = new Map(); claimadoPorLoja.set(p.storeId, claim) }
    const dono = claim.get(novo)
    if (dono) {
      conflitos.push({
        id: p.id, storeId: p.storeId, de: atual, para: novo, name: p.name,
        motivo: "dois produtos gc- colidem no mesmo skuNovo", conflitaCom: [dono],
      })
      continue
    }
    claim.set(novo, p.id)
    seguros.push({ id: p.id, storeId: p.storeId, de: atual, para: novo, name: p.name })
  }

  return { candidatos, seguros, conflitos, semSkuFinal }
}

async function aplicar(seguros: Seguro[]) {
  let atualizados = 0
  const falhasRuntime: Conflito[] = []

  for (let i = 0; i < seguros.length; i += BATCH_SIZE) {
    const lote = seguros.slice(i, i + BATCH_SIZE)
    try {
      // Uma transação por lote (forma em array — all-or-nothing, amigável ao pooler).
      await db.$transaction(
        lote.map((s) => db.produto.update({ where: { id: s.id }, data: { sku: s.para } }))
      )
      atualizados += lote.length
      console.log(`  lote ${i / BATCH_SIZE + 1}: ${lote.length} atualizados (total ${atualizados})`)
    } catch (e) {
      // Lote falhou (ex.: colisão de corrida) → isola item a item para não perder o lote inteiro.
      console.warn(`  lote ${i / BATCH_SIZE + 1} falhou em transação (${errCode(e)}); reprocessando item a item`)
      for (const s of lote) {
        try {
          await db.produto.update({ where: { id: s.id }, data: { sku: s.para } })
          atualizados++
        } catch (e2) {
          falhasRuntime.push({ ...s, motivo: `falha no apply — ${errCode(e2)}`, conflitaCom: [] })
        }
      }
    }
  }

  return { atualizados, falhasRuntime }
}

async function main() {
  const storeFilter = arg("store")
  const apply = hasFlag("apply")
  const t0 = Date.now()

  console.log(`\n=== REMOVER SKU gc- — ${apply ? "APPLY (grava no banco)" : "DRY-RUN (preview)"} ${storeFilter ? `loja ${storeFilter}` : "todas as lojas"} ===`)

  const produtos: ProdutoRow[] = await db.produto.findMany({
    where: storeFilter ? { storeId: storeFilter } : undefined,
    select: { id: true, storeId: true, sku: true, name: true },
  })

  const { candidatos, seguros, conflitos, semSkuFinal } = classificar(produtos)

  console.log(`Produtos no escopo : ${produtos.length}`)
  console.log(`Candidatos gc-     : ${candidatos.length}`)
  console.log(`  • seguros        : ${seguros.length}`)
  console.log(`  • conflitos      : ${conflitos.length}`)
  console.log(`  • sem SKU final  : ${semSkuFinal.length}`)

  let atualizados = 0
  let falhasRuntime: Conflito[] = []
  if (apply) {
    if (seguros.length === 0) {
      console.log("\nNada seguro para aplicar.")
    } else {
      console.log(`\nAplicando ${seguros.length} atualizações em lotes de ${BATCH_SIZE}...`)
      const r = await aplicar(seguros)
      atualizados = r.atualizados
      falhasRuntime = r.falhasRuntime
    }
  } else {
    console.log(`\n[dry-run] ${seguros.length} produtos SERIAM atualizados (nenhuma escrita feita).`)
  }

  const duracaoMs = Date.now() - t0
  const conflitosTotais = [...conflitos, ...falhasRuntime]

  // ── Relatório .md ──
  const exemplos = seguros.slice(0, 20)
  const fmtEx = (s: Seguro) => `| \`${s.de}\` | \`${s.para}\` | ${s.storeId} | ${s.name.replace(/\|/g, "/").slice(0, 40)} |`
  const fmtConf = (c: Conflito) =>
    `| \`${c.de}\` | \`${c.para}\` | ${c.storeId} | ${c.motivo} | ${c.conflitaCom.join(", ") || "-"} |`
  const fmtSem = (s: SemSku) => `| ${s.id} | \`${s.de}\` | ${s.storeId} | ${s.name.replace(/\|/g, "/").slice(0, 40)} |`

  const md = `# Migração — remoção do prefixo \`gc-\` de \`Produto.sku\`

> Gerado por \`scripts/remover-gc-skus.ts\` em ${new Date().toISOString()}.
> Modo: **${apply ? "APPLY (gravado no banco)" : "DRY-RUN (preview — nada gravado)"}**.
> Escopo: ${storeFilter ? `loja \`${storeFilter}\`` : "todas as lojas"}.
> Alteração: **somente \`Produto.sku\`** — id, barcode, inventoryId e relações intactos.

## Resumo

| Métrica | Valor |
|---|---|
| Produtos no escopo | ${produtos.length} |
| Candidatos \`gc-\` | ${candidatos.length} |
| ${apply ? "**Alterados**" : "**Seriam alterados (dry-run)**"} | **${apply ? atualizados : seguros.length}** |
| Conflitos (pulados) | ${conflitosTotais.length} |
| Sem SKU final válido (pulados) | ${semSkuFinal.length} |
| Tempo de execução | ${duracaoMs}ms |

## Exemplos before → after

${exemplos.length === 0 ? "_Nenhum._" : `| SKU atual | SKU novo | Loja | Produto |
|---|---|---|---|
${exemplos.map(fmtEx).join("\n")}`}

## Conflitos (NÃO alterados)

${conflitosTotais.length === 0 ? "_Nenhum conflito._" : `| SKU atual | SKU novo | Loja | Motivo | Conflita com (id) |
|---|---|---|---|---|
${conflitosTotais.map(fmtConf).join("\n")}`}

## Sem SKU final válido (pulados)

${semSkuFinal.length === 0 ? "_Nenhum._" : `| Produto id | SKU atual | Loja | Produto |
|---|---|---|---|
${semSkuFinal.map(fmtSem).join("\n")}`}

---

${apply
    ? "Migração aplicada. Validar busca por SKU, PDV, edição de produto e dedupe."
    : "Preview apenas. Para gravar: `npx tsx scripts/remover-gc-skus.ts --apply`."}
`

  fs.writeFileSync(REPORT_PATH, md, "utf8")
  console.log(`\nRelatório gravado: ${REPORT_PATH}`)
  console.log(`Duração: ${duracaoMs}ms`)
  if (apply) console.log(`Alterados: ${atualizados} | Conflitos: ${conflitosTotais.length} | Sem SKU: ${semSkuFinal.length}`)

  await db.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await db.$disconnect()
  process.exit(1)
})
