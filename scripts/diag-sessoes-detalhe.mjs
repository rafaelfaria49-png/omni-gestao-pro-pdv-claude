/**
 * READ-ONLY — detalhe para fechar o relatório de sessões presas.
 * node --env-file=.env scripts/diag-sessoes-detalhe.mjs
 */
import { PrismaClient } from "../generated/prisma/index.js"
const prisma = new PrismaClient()
const iso = (d) => (d ? new Date(d).toISOString().slice(0, 19).replace("T", " ") : "—")
const brl = (n) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0)

try {
  await prisma.$connect()

  // 1) loja-5: as 5 vendas vinculadas + max(at) p/ fechadaEm
  console.log("== loja-5 (cmppo1tul0001jy04mfp7hwti) — vendas vinculadas por payload.sessaoId ==")
  const v5 = await prisma.venda.findMany({
    where: { storeId: "loja-5", payload: { path: ["sessaoId"], equals: "cmppo1tul0001jy04mfp7hwti" } },
    select: { pedidoId: true, total: true, status: true, at: true, terminalId: true },
    orderBy: { at: "asc" },
  })
  for (const v of v5) console.log(`   ${v.pedidoId}  ${brl(v.total)}  ${v.status}  ${iso(v.at)}  term=${v.terminalId ?? "-"}`)
  console.log(`   max(at) p/ fechadaEm = ${iso(v5.reduce((m, v) => (v.at > m ? v.at : m), v5[0]?.at))}`)

  // 2) loja-10 hoje: para onde apontam as vendas da janela (sessaoId no payload)?
  console.log("\n== loja-10 — todas as vendas de 29/05 e seus payload.sessaoId ==")
  const v10 = await prisma.$queryRaw`
    SELECT "pedidoId", total, status, "at", "terminalId", payload->>'sessaoId' AS sessao
    FROM vendas WHERE "storeId"='loja-10' AND "at" >= '2026-05-29' ORDER BY "at" ASC`
  for (const v of v10) console.log(`   ${v.pedidoId}  ${brl(v.total)}  ${v.status}  ${iso(v.at)}  term=${v.terminalId ?? "-"}  sessao=${v.sessao ?? "(nula)"}`)

  // 3) loja-1: confirmar a sucessora FECHADA
  console.log("\n== loja-1 — sessões em 13/05 (a presa + sucessora) ==")
  const s1 = await prisma.sessaoCaixa.findMany({
    where: { storeId: "loja-1", abertaEm: { gte: new Date("2026-05-13"), lt: new Date("2026-05-14") } },
    select: { id: true, status: true, abertaEm: true, fechadaEm: true, saldoInicial: true, saldoFinal: true },
    orderBy: { abertaEm: "asc" },
  })
  for (const s of s1) console.log(`   ${s.id}  ${s.status}  aberta=${iso(s.abertaEm)}  fechada=${iso(s.fechadaEm)}  ini=${brl(s.saldoInicial)} fim=${s.saldoFinal == null ? "NULL" : brl(s.saldoFinal)}`)

  // 4) loja-teste-caixa: o movFin de R$239,99 — é de outro terminal/sessão?
  console.log("\n== loja-teste-caixa — vendas (qualquer terminal) desde 28/05 ==")
  const vt = await prisma.$queryRaw`
    SELECT "pedidoId", total, status, "at", "terminalId", payload->>'sessaoId' AS sessao
    FROM vendas WHERE "storeId"='loja-teste-caixa' AND "at" >= '2026-05-28' ORDER BY "at" ASC`
  for (const v of vt) console.log(`   ${v.pedidoId}  ${brl(v.total)}  ${v.status}  ${iso(v.at)}  term=${v.terminalId ?? "-"}  sessao=${v.sessao ?? "(nula)"}`)

  process.exit(0)
} catch (e) {
  console.error("FALHA:", e)
  process.exit(1)
} finally {
  await prisma.$disconnect()
}
