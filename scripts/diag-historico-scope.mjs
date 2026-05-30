/**
 * READ-ONLY — por que o Histórico não mostra as sessões de 29/05.
 * node --env-file=.env scripts/diag-historico-scope.mjs
 */
import { PrismaClient } from "../generated/prisma/index.js"
const prisma = new PrismaClient()
const d10 = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "—")
const dt = (d) => (d ? new Date(d).toISOString().slice(0, 16).replace("T", " ") : "—")

try {
  await prisma.$connect()

  const all = await prisma.sessaoCaixa.findMany({
    select: { id: true, storeId: true, status: true, abertaEm: true, fechadaEm: true },
    orderBy: [{ storeId: "asc" }, { abertaEm: "desc" }],
  })

  // 1) Por loja: contagem + datas distintas de abertaEm (o que o Histórico exibe/ordena)
  console.log("===== POR LOJA — datas de ABERTURA (Histórico ordena/exibe por abertaEm) =====")
  const byStore = new Map()
  for (const s of all) {
    if (!byStore.has(s.storeId)) byStore.set(s.storeId, [])
    byStore.get(s.storeId).push(s)
  }
  for (const [store, arr] of byStore) {
    const datasAbertura = [...new Set(arr.map((s) => d10(s.abertaEm)))].sort().reverse()
    console.log(`\n  ${store}  (${arr.length} sessões)`)
    console.log(`    abertaEm (distintas, desc): ${datasAbertura.join(", ")}`)
    const top = arr.slice(0, 8)
    for (const s of top) {
      console.log(`      ${s.status.padEnd(7)} aberta=${dt(s.abertaEm)}  fechada=${dt(s.fechadaEm)}  id=${s.id}`)
    }
    if (arr.length > 8) console.log(`      … (+${arr.length - 8})`)
  }

  // 2) Sessões cujo FECHAMENTO foi em 29/05 — onde estão e qual a data de ABERTURA
  console.log("\n\n===== SESSÕES FECHADAS EM 29/05 — abertaEm (= como aparecem no Histórico) =====")
  const fechadas29 = all.filter((s) => d10(s.fechadaEm) === "2026-05-29")
  for (const s of fechadas29) {
    console.log(`  ${s.storeId.padEnd(18)} abertaEm=${dt(s.abertaEm)} → aparece como ${d10(s.abertaEm)}  (fechada ${dt(s.fechadaEm)})  id=${s.id}`)
  }
  console.log(`\n  Total fechadas em 29/05: ${fechadas29.length}`)
  console.log("  Datas de abertaEm desses registros:", [...new Set(fechadas29.map((s) => d10(s.abertaEm)))].sort())

  // 3) Qual loja tem abertaEm em 16/20/21/23/25/28 maio (= a que a UI está exibindo)
  console.log("\n\n===== QUEM tem abertaEm nas datas exibidas pela UI (28,25,23,21,20,16/05) =====")
  const alvo = new Set(["2026-05-28", "2026-05-25", "2026-05-23", "2026-05-21", "2026-05-20", "2026-05-16"])
  const hits = new Map()
  for (const s of all) {
    if (alvo.has(d10(s.abertaEm))) {
      if (!hits.has(s.storeId)) hits.set(s.storeId, new Set())
      hits.get(s.storeId).add(d10(s.abertaEm))
    }
  }
  for (const [store, datas] of hits) {
    console.log(`  ${store}: ${[...datas].sort().reverse().join(", ")}`)
  }

  process.exit(0)
} catch (e) {
  console.error("FALHA:", e)
  process.exit(1)
} finally {
  await prisma.$disconnect()
}
