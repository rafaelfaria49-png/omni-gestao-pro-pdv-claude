/**
 * Importa contas_pagar.xlsx via pipeline real do importador-avancado.
 * Uso:
 *   npx tsx scripts/reimport-contas-pagar.ts <caminho-do-xlsx>
 *
 * Limpa apenas títulos com localKey começando em `imp-loja-1-` ou `imp-gc:loja-1:cp:`
 * — não toca em títulos de outras origens (manuais, fornecedor:*, etc.).
 */
import fs from "node:fs"
import path from "node:path"
import { parsearArquivos } from "../lib/importador-avancado/parser"
import { agruparEMerge } from "../lib/importador-avancado/merger"
import { persistirImportacao } from "../lib/importador-avancado/persistidor"
import { prisma } from "../lib/prisma"

const STORE_ID = "loja-1"

async function main() {
  const arg = process.argv[2] ?? "C:/Users/rafae/OneDrive/Documentos/backup/contas_pagar/contas_pagar.xlsx"
  const abs = path.resolve(arg)
  if (!fs.existsSync(abs)) {
    console.error(`Arquivo não encontrado: ${abs}`)
    process.exit(1)
  }

  console.log(`> Lendo ${abs}`)
  const buffer = fs.readFileSync(abs)

  for (const pref of ["imp-loja-1-", "imp-gc:loja-1:cp:"]) {
    const del = await prisma.contaPagarTitulo.deleteMany({
      where: { storeId: STORE_ID, localKey: { startsWith: pref } },
    })
    if (del.count > 0) console.log(`> Limpou ${del.count} ContaPagarTitulo com localKey ${pref}*`)
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

  const resultado = await persistirImportacao(STORE_ID, grupos, `reimport-cp-${Date.now()}`)
  console.log(`> Persistência: ok=${resultado.ok} criados=${resultado.criados} ignorados=${resultado.ignorados} erros=${resultado.erros} (${resultado.duracaoMs}ms)`)
  for (const l of resultado.log.filter((x) => x.acao === "erro").slice(0, 5)) {
    console.error(`  ! ${l.dominio} ${l.chave}: ${l.detalhe}`)
  }

  console.log("\n=== EXEMPLOS REAIS ===")
  const exemplos = ["ALUGUEL", "FUNCIONARIO", "WORD CELL PRIME", "PLANETA", "Fechamento de caixa", "RAFAEL FARIA"]
  for (const filtro of exemplos) {
    const matches = await prisma.contaPagarTitulo.findMany({
      where: {
        storeId: STORE_ID,
        OR: [
          { descricao: { contains: filtro, mode: "insensitive" } },
          { payload: { path: ["fornecedor"], string_contains: filtro } },
        ],
      },
      orderBy: { vencimento: "asc" },
    })
    console.log(`\n→ "${filtro}" (${matches.length})`)
    for (const t of matches) {
      const p = (t.payload ?? {}) as Record<string, unknown>
      const parc = (p.parcela ?? {}) as { numero?: number; total?: number }
      const cat = (p.planoContas as string | null) ?? "-"
      const forma = (p.formaPagamento as string | null) ?? "-"
      const fornec = (p.fornecedor as string | null) ?? "-"
      console.log(
        `  ${(parc.numero ?? "?")}/${(parc.total ?? "?")} | ${t.status.padEnd(9)} | R$ ${t.valor.toFixed(2)} | venc ${t.vencimento || "-"} | cat=${cat} | forma=${forma} | forn=${fornec} | "${t.descricao}"`,
      )
    }
  }

  console.log("\n=== RESUMO GERAL ===")
  const total = await prisma.contaPagarTitulo.count({
    where: { storeId: STORE_ID, localKey: { startsWith: "imp-gc:" } },
  })
  const porStatus = await prisma.contaPagarTitulo.groupBy({
    by: ["status"],
    where: { storeId: STORE_ID, localKey: { startsWith: "imp-gc:" } },
    _count: { _all: true },
    _sum: { valor: true },
  })
  console.log(`Total: ${total}`)
  for (const s of porStatus) {
    console.log(`  ${s.status.padEnd(12)} ${String(s._count._all).padStart(3)} | R$ ${(s._sum.valor ?? 0).toFixed(2)}`)
  }

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
