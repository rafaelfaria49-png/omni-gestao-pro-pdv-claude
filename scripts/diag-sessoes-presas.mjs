/**
 * READ-ONLY — diagnóstico de sessões de caixa presas como ABERTA.
 * NÃO escreve nada. Só SELECT/aggregate.
 * Uso: node --env-file=.env scripts/diag-sessoes-presas.mjs
 */
import { PrismaClient } from "../generated/prisma/index.js"

const prisma = new PrismaClient()
const brl = (n) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0)
const iso = (d) => (d ? new Date(d).toISOString().slice(0, 16).replace("T", " ") : "—")
const PAY_KEYS = ["dinheiro", "pix", "cartaoDebito", "cartaoCredito", "carne", "aPrazo", "creditoVale"]
const CANCELADAS = ["cancelada", "devolvida"]

try {
  await prisma.$connect()

  const abertas = await prisma.sessaoCaixa.findMany({
    where: { status: "ABERTA" },
    orderBy: [{ storeId: "asc" }, { abertaEm: "asc" }],
  })
  const todas = await prisma.sessaoCaixa.findMany({
    select: { id: true, storeId: true, terminalId: true, status: true, abertaEm: true, fechadaEm: true },
    orderBy: [{ storeId: "asc" }, { abertaEm: "asc" }],
  })

  const keyOf = (s) => `${s.storeId}::${s.terminalId ?? "SEM"}`
  const byKey = new Map()
  for (const s of todas) {
    const k = keyOf(s)
    if (!byKey.has(k)) byKey.set(k, [])
    byKey.get(k).push(s)
  }
  for (const arr of byKey.values()) arr.sort((a, b) => +new Date(a.abertaEm) - +new Date(b.abertaEm))

  const now = new Date()
  console.log("\n========== DIAGNÓSTICO SESSÕES ABERTAS (READ-ONLY) ==========")
  console.log(`Total ABERTA: ${abertas.length} | Total geral de sessões: ${todas.length}`)
  console.log(`Agora (UTC): ${now.toISOString()}\n`)

  const resumo = []

  for (const s of abertas) {
    const arr = byKey.get(keyOf(s))
    const idx = arr.findIndex((x) => x.id === s.id)
    const next = arr[idx + 1] ?? null // próxima sessão (qualquer status) no mesmo store+terminal
    const windowEnd = next ? new Date(next.abertaEm) : now

    // Vínculo FORTE: vendas com payload.sessaoId == s.id
    const strong = await prisma.venda.findMany({
      where: { storeId: s.storeId, payload: { path: ["sessaoId"], equals: s.id } },
      select: { id: true, pedidoId: true, total: true, status: true, at: true, terminalId: true, payload: true },
      orderBy: { at: "asc" },
    })

    // Vínculo FRACO (janela): mesmo store (+terminal se houver), no período, sem canceladas
    const weak = await prisma.venda.findMany({
      where: {
        storeId: s.storeId,
        ...(s.terminalId ? { terminalId: s.terminalId } : {}),
        at: { gte: s.abertaEm, lt: windowEnd },
        status: { notIn: CANCELADAS },
      },
      select: { id: true, pedidoId: true, total: true, status: true, at: true, terminalId: true, payload: true },
      orderBy: { at: "asc" },
    })

    const useStrong = strong.length > 0
    const base = (useStrong ? strong : weak).filter((v) => !CANCELADAS.includes(v.status))
    const totalVendas = base.reduce((a, v) => a + (v.total || 0), 0)

    const pay = Object.fromEntries(PAY_KEYS.map((k) => [k, 0]))
    for (const v of base) {
      const pb = v.payload?.paymentBreakdown
      if (pb && typeof pb === "object") for (const k of PAY_KEYS) pay[k] += Number(pb[k] || 0)
    }

    const ops = await prisma.caixaOperacao.findMany({ where: { sessaoId: s.id } })
    const sangrias = ops.filter((o) => o.tipo === "sangria").reduce((a, o) => a + o.valor, 0)
    const suprimentos = ops.filter((o) => o.tipo === "suprimento").reduce((a, o) => a + o.valor, 0)

    const movFin = await prisma.movimentacaoFinanceira.aggregate({
      where: { storeId: s.storeId, origem: "venda", tipo: "entrada", createdAt: { gte: s.abertaEm, lt: windowEnd } },
      _sum: { valor: true },
      _count: true,
    })

    const fechadaSobreposta = arr.find(
      (x) =>
        x.status === "FECHADA" &&
        x.id !== s.id &&
        new Date(x.abertaEm) <= windowEnd &&
        (x.fechadaEm ? new Date(x.fechadaEm) >= new Date(s.abertaEm) : true),
    )

    const temSucessora = !!next
    const ehMaisRecenteDoTerminal = idx === arr.length - 1
    const ehHoje = new Date(s.abertaEm).toISOString().slice(0, 10) === now.toISOString().slice(0, 10)
    const vazia = base.length === 0 && ops.length === 0

    // Classificação
    let classe, motivo
    if (temSucessora) {
      classe = "SEGURO"
      motivo = "Há sessão POSTERIOR no mesmo store+terminal → esta ficou presa (não é o caixa atual)."
    } else if (fechadaSobreposta) {
      classe = "AMBÍGUO"
      motivo = `Sessão FECHADA sobreposta (${fechadaSobreposta.id}) → risco de dupla contagem.`
    } else if (vazia && !ehHoje) {
      classe = "SEGURO"
      motivo = "Sem vendas/operações e não é de hoje → sessão de teste abandonada; fechar com saldoFinal=saldoInicial."
    } else if (ehMaisRecenteDoTerminal && ehHoje) {
      classe = "NÃO REPARAR"
      motivo = "É a sessão MAIS RECENTE do terminal e é de HOJE → pode ser o caixa atual em uso. Confirmar manualmente."
    } else {
      classe = "AMBÍGUO"
      motivo = "Mais recente do terminal, mas não é de hoje → provavelmente presa; revisar antes."
    }
    if (!useStrong && weak.length > 0) motivo += " [vendas por JANELA, sem payload.sessaoId]"

    // saldoFinal proposto (espelha saldoEsperado do route: saldoInicial + entradas - saidas)
    const saldoFinalProposto = (s.saldoInicial || 0) + totalVendas + suprimentos - sangrias

    console.log(`──── Sessão ${s.id}`)
    console.log(`   store=${s.storeId}  terminal=${s.terminalId ?? "(sem)"}  operador=${s.operador || "—"}`)
    console.log(`   abertaEm=${iso(s.abertaEm)}  saldoInicial=${brl(s.saldoInicial)}  obs="${s.observacao || ""}"`)
    console.log(`   janela=[${iso(s.abertaEm)} → ${iso(windowEnd)}] ${next ? "(próx. sessão)" : "(agora)"}`)
    console.log(`   vendas[${useStrong ? "payload.sessaoId" : "janela"}]=${base.length}  total=${brl(totalVendas)}`)
    console.log(
      `     pagamentos: din=${brl(pay.dinheiro)} pix=${brl(pay.pix)} déb=${brl(pay.cartaoDebito)} créd=${brl(pay.cartaoCredito)} carnê=${brl(pay.carne)} aPrazo=${brl(pay.aPrazo)} vale=${brl(pay.creditoVale)}`,
    )
    console.log(`   sangrias=${brl(sangrias)}  suprimentos=${brl(suprimentos)}  (ops=${ops.length})`)
    console.log(`   movFin venda/entrada na janela=${brl(movFin._sum.valor || 0)} (${movFin._count} lançamentos)`)
    console.log(`   FECHADA sobreposta? ${fechadaSobreposta ? "SIM " + fechadaSobreposta.id : "não"}  | sucessora? ${temSucessora ? "SIM" : "não"}`)
    console.log(`   >> CLASSE: ${classe} — ${motivo}`)
    console.log(`   >> saldoFinal proposto (best-effort) = ${brl(saldoFinalProposto)}\n`)

    resumo.push({ id: s.id, store: s.storeId, terminal: s.terminalId ?? "sem", abertaEm: iso(s.abertaEm), classe, vendas: base.length, totalVendas, saldoFinalProposto })
  }

  console.log("========== RESUMO ==========")
  for (const r of resumo) {
    console.log(
      `  [${r.classe.padEnd(12)}] ${r.store}/${r.terminal}  ${r.abertaEm}  vendas=${String(r.vendas).padStart(3)}  total=${brl(r.totalVendas).padStart(14)}  saldoFinal=${brl(r.saldoFinalProposto).padStart(14)}  id=${r.id}`,
    )
  }
  const porClasse = resumo.reduce((m, r) => ((m[r.classe] = (m[r.classe] || 0) + 1), m), {})
  console.log("\n  Contagem por classe:", JSON.stringify(porClasse))
  process.exit(0)
} catch (e) {
  console.error("[diag] FALHA:", e)
  process.exit(1)
} finally {
  await prisma.$disconnect()
}
