import "./g004-fixtures"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PrismaClient } from "@/generated/prisma"
import { prisma } from "@/lib/prisma"
import { prepararRevisaoGasto } from "@/lib/gastos/operacoes"
import { aplicarOperacaoGasto } from "@/lib/gastos/apply"
import { gravarTituloFinanceiro } from "@/lib/gastos/financeiro-scope"
import { saldoTituloGasto } from "@/lib/gastos/pagamentos"
import { travarCompetenciaFinanceira } from "@/lib/gastos/periodo"
import { transferirEntreCarteiras } from "@/lib/financeiro/services/carteiras-service"
import { fecharDia } from "@/lib/financeiro/services/fechamento-service"
import { registrarDocumentoGasto, revisarOrfaosDocumentosGasto } from "@/lib/gastos/documentos"
import { DocumentoStorageFixture } from "@/lib/gastos/documentos-fixture"
import { aplicarPagamentoLegado } from "@/lib/financeiro/services/movimentacoes-service"
import { aplicarG004, dataGasto, dataPagamento, fixtureG004, G004_URL, pagoG004 } from "./g004-fixtures"

const a = new PrismaClient({ datasources: { db: { url: G004_URL } }, log: [] })
const b = new PrismaClient({ datasources: { db: { url: G004_URL } }, log: [] })
beforeAll(async () => {
  // Captura os backends efetivos das operações de produção, sem substituir transações.
  await prisma.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS g004_qa_conexoes (operacao_id text PRIMARY KEY, perfil_id text NOT NULL, pid integer NOT NULL)')
  await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION g004_qa_conexao() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO g004_qa_conexoes VALUES(NEW.id,NEW."perfilId",pg_backend_pid()); RETURN NEW; END $$`)
  await prisma.$executeRawUnsafe('CREATE TRIGGER g004_qa_conexao AFTER INSERT ON financeiro_operacoes FOR EACH ROW EXECUTE FUNCTION g004_qa_conexao()')
})
afterAll(async () => {
  await prisma.$executeRawUnsafe('DROP TRIGGER g004_qa_conexao ON financeiro_operacoes')
  await Promise.all([a.$disconnect(), b.$disconnect(), prisma.$disconnect()])
})
async function preparar(f: Awaited<ReturnType<typeof fixtureG004>>, proposta: unknown, chave: string) {
  const ctx = await f.contexto(), r = await prepararRevisaoGasto(ctx, { grupoChave: chave, proposta })
  return () => aplicarOperacaoGasto(ctx, { revisaoId: r.id, versaoEsperada: 1, chave })
}
const fulfilled = (r: PromiseSettledResult<unknown>[]) => r.filter(x => x.status === "fulfilled")

/** Observa duas operações efetivamente esperando o mesmo detentor, antes de liberar. */
async function disputarSobLock(f: Awaited<ReturnType<typeof fixtureG004>>, runs: Array<() => Promise<unknown>>, recurso: "conta" | "periodo") {
  let liberar = () => {}, pronto = (_pid: number) => {}
  const gate = new Promise<void>(resolve => { liberar = resolve }), locked = new Promise<number>(resolve => { pronto = resolve })
  const hold = a.$transaction(async tx => {
    const [row] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() pid`
    if (recurso === "conta") await tx.$queryRaw`SELECT id FROM carteiras_financeiras WHERE id=${f.conta()} FOR UPDATE`
    else await travarCompetenciaFinanceira(tx, f.L1, dataGasto.slice(0, 7))
    pronto(row.pid); await gate
  }, { timeout: 10000 })
  const holdingPid = await locked, results = Promise.allSettled(runs.map(run => run()))
  try {
    const deadline = Date.now() + 3000
    let esperando: number[] = []
    while (Date.now() < deadline) {
      const rows = await b.$queryRaw<Array<{ pid: number; blockers: number[] }>>`
        SELECT pid,pg_blocking_pids(pid) blockers FROM pg_stat_activity
        WHERE usename=current_user AND datname=current_database() AND wait_event_type='Lock'`
      const depende = (pid: number, vistos = new Set<number>()): boolean => {
        if (pid === holdingPid) return true
        if (vistos.has(pid)) return false
        vistos.add(pid)
        return rows.find(r => r.pid === pid)?.blockers.some(p => depende(p, vistos)) ?? false
      }
      esperando = rows.filter(r => r.pid !== holdingPid && depende(r.pid)).map(r => r.pid)
      if (esperando.length === runs.length) break
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    expect(new Set(esperando).size, `Duas conexões devem estar bloqueadas por ${recurso} antes da liberação`).toBe(runs.length)
    expect(esperando).not.toContain(holdingPid)
  } finally { liberar(); await hold; await results }
  return results
}
describe("G004 duas conexões reais e recursos concorrentes", () => {
  it("clientes independentes e confirmações simultâneas da mesma revisão têm um único efeito", async () => {
    const [[pa], [pb]] = await Promise.all([a.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() pid`, b.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() pid`])
    expect(pa.pid).not.toBe(pb.pid)
    const f = await fixtureG004(), run = await preparar(f, pagoG004(f), "simultanea")
    const [x, y] = await Promise.all([run(), run()])
    expect(x).toEqual(y)
    expect(await prisma.movimentacaoFinanceira.count({ where: { perfilId: f.E1 } })).toBe(1)
    expect(await prisma.gastoOutbox.count({ where: { perfilId: f.E1 } })).toBe(1)
  })
  it("duas baixas disputando saldo bancário insuficiente: só uma aplica; prova backends reais distintos", async () => {
    const f = await fixtureG004()
    const p = pagoG004(f, { valorCentavos: "70000" })
    const r1 = await preparar(f, p, "saldo-a"), r2 = await preparar(f, p, "saldo-b")
    const results = await disputarSobLock(f, [r1, r2], "conta")
    expect(fulfilled(results)).toHaveLength(1)
    expect(results.find(x => x.status === "rejected")).toMatchObject({ reason: { code: "saldo_conta_insuficiente" } })
    expect((await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: f.conta() } })).saldoAtualCentavos?.toString()).toBe("30000")
    // Uma segunda disputa válida exige duas transações simultâneas e registra os PIDs.
    const s1 = await preparar(f, pagoG004(f), "pid-a"), s2 = await preparar(f, pagoG004(f), "pid-b")
    await Promise.all([s1(), s2()])
    const pids = await prisma.$queryRaw<Array<{ pid: number }>>`SELECT DISTINCT pid FROM g004_qa_conexoes WHERE perfil_id=${f.E1}`
    expect(pids.length).toBeGreaterThanOrEqual(2)
  })
  it("duas parciais legítimas no mesmo título não perdem histórico nem ultrapassam saldo", async () => {
    const f = await fixtureG004(), ctx = await f.contexto(), t = await gravarTituloFinanceiro(ctx, {
      natureza: "PAGAR", chave: "T", descricao: "Concorrência", valorCentavos: "10000", vencimento: dataGasto })
    const p = { tipo: "PAGAR_TITULO", tituloId: t.id, valorCentavos: "4000", carteiraId: f.conta(), formaPagamento: "pix", dataPagamento }
    const [x, y] = await Promise.all([await preparar(f, p, "parcial-a"), await preparar(f, p, "parcial-b")].map(fn => fn()))
    expect(x.pagamentoId).not.toBe(y.pagamentoId)
    expect((await saldoTituloGasto(prisma, await prisma.contaPagarTitulo.findUniqueOrThrow({ where: { id: t.id } }))).restante).toBe(BigInt(2000))
    const q1 = await preparar(f, { ...p, valorCentavos: "1500" }, "excesso-a"), q2 = await preparar(f, { ...p, valorCentavos: "1500" }, "excesso-b")
    expect(fulfilled(await Promise.allSettled([q1(), q2()]))).toHaveLength(1)
    expect((await saldoTituloGasto(prisma, await prisma.contaPagarTitulo.findUniqueOrThrow({ where: { id: t.id } }))).restante).toBe(BigInt(500))
  })
  it("estornos concorrentes acima do original só admitem um; estorno com outra baixa mantém líquido", async () => {
    const f = await fixtureG004(), ctx = await f.contexto(), t = await gravarTituloFinanceiro(ctx, {
      natureza: "PAGAR", chave: "T", descricao: "Estornos", valorCentavos: "20000", vencimento: dataGasto })
    const pagar = { tipo: "PAGAR_TITULO", tituloId: t.id, valorCentavos: "10000", carteiraId: f.conta(), formaPagamento: "pix", dataPagamento }
    const original = await aplicarG004(f, pagar)
    const estorno = { tipo: "ESTORNAR_PAGAMENTO", pagamentoId: original.resultado.pagamentoId, valorCentavos: "7000", dataPagamento, motivo: "Corrida" }
    const e1 = await preparar(f, estorno, "estorno-a"), e2 = await preparar(f, estorno, "estorno-b")
    const resultados = await disputarSobLock(f, [e1, e2], "conta")
    expect(fulfilled(resultados)).toHaveLength(1)
    expect(resultados.find(x => x.status === "rejected")).toMatchObject({ reason: { code: "estorno_acima_pagamento" } })
    const e3 = await preparar(f, { ...estorno, valorCentavos: "3000" }, "estorno-c"), p2 = await preparar(f, { ...pagar, valorCentavos: "4000" }, "baixa-nova")
    await Promise.all([e3(), p2()])
    expect((await saldoTituloGasto(prisma, await prisma.contaPagarTitulo.findUniqueOrThrow({ where: { id: t.id } }))).pago).toBe(BigInt(4000))
  })
  it("transferência paralela ao gasto usa as mesmas contas e conserva o ledger canônico", async () => {
    const f = await fixtureG004(), destino = await prisma.carteiraFinanceira.create({ data: { storeId: f.L1, perfilId: f.E1, nome: "Destino", tipo: "banco" } })
    const run = await preparar(f, pagoG004(f), "transferencia-paralela")
    const [gasto, transferencia] = await Promise.all([run(), transferirEntreCarteiras({ storeId: f.L1, origemId: f.conta(), destinoId: destino.id, valor: 100 })])
    expect(gasto.estado).toBe("APLICADA")
    expect(transferencia.ok).toBe(true)
    expect((await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: f.conta() } })).saldoAtualCentavos?.toString()).toBe("86000")
    expect((await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: destino.id } })).saldoAtualCentavos?.toString()).toBe("10000")
  })
  it("baixa M1 concorrente com alocação G004 preserva ambos os recibos sem dupla contagem", async () => {
    const f = await fixtureG004(), ctx = await f.contexto(), t = await gravarTituloFinanceiro(ctx, {
      natureza: "PAGAR", chave: "hibrido", descricao: "Híbrido", valorCentavos: "10000", vencimento: dataGasto, carteiraId: f.conta() })
    const run = await preparar(f, { tipo: "PAGAR_TITULO", tituloId: t.id, valorCentavos: "4000", carteiraId: f.conta(), formaPagamento: "pix", dataPagamento }, "hibrido-g004")
    await Promise.all([run(), aplicarPagamentoLegado({ storeId: f.L1, tipo: "pagar", canal: "financeiro", op: "parcial",
      localKey: t.localKey!, idempotencyKey: "hibrido-m1", valor: 40 })])
    expect((await saldoTituloGasto(prisma, await prisma.contaPagarTitulo.findUniqueOrThrow({ where: { id: t.id } }))).pago).toBe(BigInt(8000))
    expect(await prisma.movimentacaoFinanceira.count({ where: { pagarTituloId: t.id } })).toBe(2)
  })
  it("fechamento concorrente serializa: aplica antes do fechamento ou recusa integralmente", async () => {
    const f = await fixtureG004(), run = await preparar(f, pagoG004(f), "fechamento")
    const resultados = await disputarSobLock(f, [run, () => fecharDia(f.L1, dataGasto)], "periodo")
    expect(resultados[1].status).toBe("fulfilled")
    if (resultados[0].status === "rejected") expect(resultados[0].reason).toMatchObject({ code: "periodo_fechado" })
    const count = await prisma.movimentacaoFinanceira.count({ where: { perfilId: f.E1 } })
    expect(count).toBe(resultados[0].status === "fulfilled" ? 1 : 0)
    const fch = await prisma.fechamentoFinanceiro.findFirstOrThrow({ where: { storeId: f.L1 } })
    expect(fch.saldoSistema).toBe(count ? -40 : 0)
  })
  it("perfil inativado durante a operação resulta em recusa ou commit anterior, sem efeito parcial", async () => {
    const f = await fixtureG004(), run = await preparar(f, pagoG004(f), "inativacao")
    const result = await Promise.allSettled([run(), a.financeiroPerfil.update({ where: { id: f.E1 }, data: { ativo: false } })])
    expect(result[1].status).toBe("fulfilled")
    if (result[0].status === "rejected") expect(result[0].reason).toMatchObject({ code: "acesso_negado" })
    const count = await prisma.movimentacaoFinanceira.count({ where: { perfilId: f.E1 } })
    expect(count).toBe(result[0].status === "fulfilled" ? 1 : 0)
    expect(await prisma.gastoOutbox.count({ where: { perfilId: f.E1 } })).toBe(count)
  })
  it("ID estrangeiro é recusado sem aguardar o lock da conta de outra loja ou do título de outro owner", async () => {
    const f = await fixtureG004()
    f.login(f.U2, [f.L1])
    const t = await gravarTituloFinanceiro(await f.contexto(f.P2), {
      natureza: "PAGAR", chave: "privado", descricao: "Título privado", valorCentavos: "10000", vencimento: dataGasto })
    f.login()
    const badWallet = await preparar(f, pagoG004(f, { carteiraId: f.conta(f.E2) }), "conta-estrangeira")
    const privateCtx = await f.contexto(f.P1), r = await prepararRevisaoGasto(privateCtx, { grupoChave: "owner-estrangeiro",
      proposta: { tipo: "PAGAR_TITULO", tituloId: t.id, valorCentavos: "1000", carteiraId: f.conta(f.P1), formaPagamento: "pix", dataPagamento } })
    let release = () => {}, ready = () => {}
    const gate = new Promise<void>(resolve => { release = resolve }), locked = new Promise<void>(resolve => { ready = resolve })
    const hold = a.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM carteiras_financeiras WHERE id=${f.conta(f.E2)} FOR UPDATE`
      await tx.$queryRaw`SELECT id FROM contas_pagar_titulos WHERE id=${t.id} FOR UPDATE`
      ready(); await gate
    })
    await locked
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const results = await Promise.race([
        Promise.allSettled([badWallet(), aplicarOperacaoGasto(privateCtx, { revisaoId: r.id, versaoEsperada: 1, chave: "owner-estrangeiro" })]),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("Recusa aguardou recurso estrangeiro")), 3000) }),
      ])
      expect(results).toEqual([expect.objectContaining({ status: "rejected", reason: expect.objectContaining({ code: "conta_indisponivel" }) }),
        expect.objectContaining({ status: "rejected", reason: expect.objectContaining({ code: "titulo_indisponivel" }) })])
    } finally { if (timer) clearTimeout(timer); release(); await hold }
  })
  it("documento G003 + aplicação G004 + inativação de perfil não formam ciclo de locks", async () => {
    const f = await fixtureG004(), ctx = await f.contexto(), t = await gravarTituloFinanceiro(ctx, {
      natureza: "PAGAR", chave: "doc-lock", descricao: "Documento concorrente", valorCentavos: "10000", vencimento: dataGasto })
    const doc = await registrarDocumentoGasto(ctx, { nomeArquivo: "locks.txt", conteudo: Buffer.from("Documento de locks G004"), proveniencia: "FIXTURE" }, new DocumentoStorageFixture())
    const run = await preparar(f, { tipo: "PAGAR_TITULO", tituloId: t.id, valorCentavos: "4000", carteiraId: f.conta(), formaPagamento: "pix", dataPagamento, documentoId: doc.id }, "doc-locks")
    let release = () => {}, ready = () => {}
    const gate = new Promise<void>(r => { release = r }), locked = new Promise<void>(r => { ready = r })
    const hold = a.$transaction(async tx => { await tx.$queryRaw`SELECT id FROM contas_pagar_titulos WHERE id=${t.id} FOR UPDATE`; ready(); await gate })
    await locked
    const esperarBloqueio = async (tabela: string) => {
      const deadline = Date.now() + 3000
      while (Date.now() < deadline) {
        const [row] = await b.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) n FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND usename=current_user AND wait_event_type='Lock' AND query LIKE ${"%" + tabela + "%"}`
        if (Number(row.n)) return
        await new Promise(r => setTimeout(r, 20))
      }
      throw new Error("Fixture não observou o lock real esperado")
    }
    // Captura a rejeição desde o início para evitar unhandled rejection durante a coordenação.
    const applying = run().then(value => ({ ok: true, value }), error => ({ ok: false, error }))
    try {
      await esperarBloqueio("contas_pagar_titulos")
      const orphan = revisarOrfaosDocumentosGasto(ctx, new Date(Date.now() + 2 * 86_400_000)).then(value => ({ ok: true, value }), error => ({ ok: false, error }))
      await esperarBloqueio("documentos_gastos")
      const inactive = b.financeiroPerfil.update({ where: { id: f.E1 }, data: { ativo: false } }).then(value => ({ ok: true, value }), error => ({ ok: false, error }))
      await new Promise(r => setTimeout(r, 60))
      release()
      const results = await Promise.all([applying, orphan, inactive, hold.then(() => ({ ok: true }))])
      for (const r of results) if ("error" in r) expect(r.error).toMatchObject({ status: 403 })
      // PostgreSQL pode admitir o SHARE compatível antes do UPDATE pendente.
      // Esse commit anterior à inativação é válido; uma recusa deve ser integral.
      const count = "value" in results[0] ? 1 : 0
      expect(await prisma.movimentacaoFinanceira.count({ where: { perfilId: f.E1 } })).toBe(count)
      expect(await prisma.gastoOutbox.count({ where: { perfilId: f.E1 } })).toBe(count)
      expect((await prisma.financeiroPerfil.findUniqueOrThrow({ where: { id: f.E1 } })).ativo).toBe(false)
    } finally { release(); await hold }
  })
})
