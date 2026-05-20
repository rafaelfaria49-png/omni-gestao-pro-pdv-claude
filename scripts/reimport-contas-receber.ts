/**
 * Importa contas_receber.xlsx via pipeline real do importador-avancado.
 * Uso:
 *   npx tsx scripts/reimport-contas-receber.ts <caminho-do-xlsx>
 *
 * Limpa apenas os títulos com localKey começando em `imp-gc:` (idempotente
 * com o fix do persistidor). Não toca em títulos OS/PDV de outras origens.
 */
import fs from "node:fs"
import path from "node:path"
import { parsearArquivos } from "../lib/importador-avancado/parser"
import { agruparEMerge } from "../lib/importador-avancado/merger"
import { persistirImportacao } from "../lib/importador-avancado/persistidor"
import { prisma } from "../lib/prisma"

const STORE_ID = "loja-1"

async function main() {
  const arg = process.argv[2] ?? "C:/Users/rafae/Downloads/contas_receber.xlsx"
  const abs = path.resolve(arg)
  if (!fs.existsSync(abs)) {
    console.error(`Arquivo não encontrado: ${abs}`)
    process.exit(1)
  }

  console.log(`> Lendo ${abs}`)
  const buffer = fs.readFileSync(abs)

  // Limpa importações anteriores deste pipeline (idempotente, mas sem deixar
  // resíduos de testes/imports anteriores com chave antiga `imp-loja-1-…`).
  const prefixosLegado = ["imp-loja-1-", "imp-gc:loja-1:cr:", "imp-gc:loja-1:cp:"]
  for (const pref of prefixosLegado) {
    const del = await prisma.contaReceberTitulo.deleteMany({
      where: { storeId: STORE_ID, localKey: { startsWith: pref } },
    })
    if (del.count > 0) console.log(`> Limpou ${del.count} ContaReceberTitulo com localKey ${pref}*`)
  }

  const planilhas = await parsearArquivos([{ buffer, nome: path.basename(abs) }])
  console.log(`> Parseadas ${planilhas.length} planilhas`)
  for (const p of planilhas) {
    console.log(`  - ${p.nomeArquivo} → ${p.dominio} (conf ${p.confianca.toFixed(2)}, ${p.totalLinhas} linhas)`)
  }

  const grupos = agruparEMerge(planilhas)
  for (const [dom, regs] of grupos) {
    console.log(`> Grupo ${dom}: ${regs.length} registros`)
  }

  const batchId = `reimport-cr-${Date.now()}`
  const resultado = await persistirImportacao(STORE_ID, grupos, batchId)
  console.log(`> Persistência: ok=${resultado.ok} criados=${resultado.criados} atualizados=${resultado.atualizados} ignorados=${resultado.ignorados} erros=${resultado.erros} (${resultado.duracaoMs}ms)`)
  if (resultado.erros > 0) {
    for (const l of resultado.log.filter((x) => x.acao === "erro").slice(0, 5)) {
      console.error(`  ! ${l.dominio} ${l.chave}: ${l.detalhe}`)
    }
  }

  // ── Validação 1 — Venda 131 / CLEITON ──
  console.log("\n=== VALIDAÇÃO: Venda 131 / CLEITON ===")
  const cleiton = await prisma.contaReceberTitulo.findMany({
    where: {
      storeId: STORE_ID,
      OR: [
        { cliente: { contains: "CLEITON", mode: "insensitive" } },
        { descricao: { contains: "Venda de nº 131", mode: "insensitive" } },
      ],
    },
    orderBy: { vencimento: "asc" },
  })
  console.log(`Encontrados ${cleiton.length} títulos`)
  for (const t of cleiton) {
    const p = (t.payload ?? {}) as Record<string, unknown>
    const parc = (p.parcela ?? {}) as { numero?: number; total?: number }
    console.log(
      `  ${parc.numero ?? "?"}/${parc.total ?? "?"} | R$ ${t.valor.toFixed(2)} | venc ${t.vencimento || "-"} | ${t.status.padEnd(9)} | pago=${(p.valorPago as number | undefined) ?? 0} | "${t.descricao}"`
    )
  }

  // ── Validação 2 — outras vendas parceladas (amostra) ──
  console.log("\n=== VALIDAÇÃO: outras vendas parceladas (amostra de 3) ===")
  const todos = await prisma.contaReceberTitulo.findMany({
    where: { storeId: STORE_ID, localKey: { startsWith: "imp-gc:" } },
    orderBy: [{ descricao: "asc" }, { vencimento: "asc" }],
  })
  const porDescCli = new Map<string, typeof todos>()
  for (const t of todos) {
    const k = `${t.descricao.replace(/\s*\(\d+\/\d+\)$/, "")}|${t.cliente}`
    const lista = porDescCli.get(k)
    if (lista) lista.push(t)
    else porDescCli.set(k, [t])
  }
  const parceladas = Array.from(porDescCli.entries()).filter(
    ([k, v]) => v.length >= 2 && !k.startsWith("Venda de nº 131")
  )
  console.log(`Total de vendas com ≥2 parcelas: ${parceladas.length}`)
  const amostra = parceladas.slice(0, 3)
  for (const [k, parcs] of amostra) {
    console.log(`\n  → ${k} (${parcs.length} parcelas)`)
    for (const t of parcs) {
      const p = (t.payload ?? {}) as Record<string, unknown>
      const pa = (p.parcela ?? {}) as { numero?: number; total?: number }
      console.log(
        `    ${pa.numero ?? "?"}/${pa.total ?? "?"} | R$ ${t.valor.toFixed(2)} | venc ${t.vencimento || "-"} | ${t.status}`
      )
    }
  }

  // ── Resumo geral ──
  console.log("\n=== RESUMO GERAL ===")
  const total = await prisma.contaReceberTitulo.count({
    where: { storeId: STORE_ID, localKey: { startsWith: "imp-gc:" } },
  })
  const porStatus = await prisma.contaReceberTitulo.groupBy({
    by: ["status"],
    where: { storeId: STORE_ID, localKey: { startsWith: "imp-gc:" } },
    _count: { _all: true },
    _sum: { valor: true },
  })
  console.log(`Total títulos importados: ${total}`)
  for (const s of porStatus) {
    console.log(`  ${s.status.padEnd(12)} ${String(s._count._all).padStart(4)} títulos | R$ ${(s._sum.valor ?? 0).toFixed(2)}`)
  }

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
