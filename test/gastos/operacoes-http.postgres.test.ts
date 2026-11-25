import "./g004-fixtures"
import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { POST } from "@/app/api/financeiro/pagar/operacoes/route"
import { PATCH as pagar } from "@/app/api/financeiro/pagar/route"
import { executarPagamentoPendente } from "@/lib/financeiro/pagamento-operacao-client"
import { gravarTituloFinanceiro } from "@/lib/gastos/financeiro-scope"
import { aplicarPagamentoLegado } from "@/lib/financeiro/services/movimentacoes-service"
import { fecharDia, reabrirFechamento } from "@/lib/financeiro/services/fechamento-service"
import { estornarPagamentoHub } from "@/lib/gastos/apply"
import { diaSaoPaulo } from "@/lib/gastos/operacao-schema"
import { dataGasto, fixtureG004, pagoG004, requestG004, estadoG004 } from "./g004-fixtures"

afterAll(async () => { await prisma.$disconnect() })
afterEach(() => { vi.useRealTimers() })

function browserG004() {
  const map = new Map<string, string>()
  return { map, ambiente: { storage: { getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v) }, removeItem: (k: string) => { map.delete(k) } },
    trava: async <T>(_nome: string, fn: () => Promise<T>) => fn() } }
}
describe("G004 HTTP verdadeiro com dinheiro PostgreSQL", () => {
  it("HUB recusa período fechado, libera o recibo e aceita nova intenção após reabertura", async () => {
    const f = await fixtureG004(), t = await gravarTituloFinanceiro(await f.contexto(), {
      natureza: "PAGAR", chave: "HUB-fechado", descricao: "Recusa definitiva", valorCentavos: "10000", vencimento: dataGasto, carteiraId: f.conta() })
    await aplicarPagamentoLegado({ storeId: f.L1, tipo: "pagar", canal: "financeiro", op: "parcial", localKey: t.localKey!, valor: 40, idempotencyKey: "original" })
    const fechamento = await fecharDia(f.L1, diaSaoPaulo(new Date().toISOString())), browser = browserG004(), keys: string[] = []
    const pedido = { op: "estornar", localKey: t.localKey!, motivo: "Primeira intenção" }
    const input = { principalId: f.U1, storeId: f.L1, canal: "financeiro" as const, tipo: "pagar" as const, referencia: t.localKey!, op: "estornar" as const, pedido }
    await expect(executarPagamentoPendente(input, async idempotencyKey => {
      keys.push(idempotencyKey)
      const response = await pagar(requestG004({ ...pedido, idempotencyKey }, f.L1, "/api/financeiro/pagar", "PATCH"))
      expect(response.status).toBe(409)
      expect(await response.clone().json()).toMatchObject({ code: "periodo_fechado", operacaoId: idempotencyKey, operacaoRejeitada: true })
      return response
    }, browser.ambiente)).rejects.toThrow("Período financeiro fechado")
    expect(browser.map.size).toBe(0)
    expect(await prisma.financeiroOperacao.count({ where: { perfilId: f.E1 } })).toBe(0)
    expect(await prisma.movimentacaoFinanceira.count({ where: { perfilId: f.E1 } })).toBe(1)
    await reabrirFechamento(fechamento.id, f.L1, "Nova confirmação autorizada")
    const novo = { ...pedido, motivo: "Nova intenção após reabertura" }
    await executarPagamentoPendente({ ...input, pedido: novo }, async idempotencyKey => {
      keys.push(idempotencyKey)
      return pagar(requestG004({ ...novo, idempotencyKey }, f.L1, "/api/financeiro/pagar", "PATCH"))
    }, browser.ambiente)
    expect(keys[0]).not.toBe(keys[1])
    expect(browser.map.size).toBe(0)
    expect(await prisma.movimentacaoFinanceira.count({ where: { perfilId: f.E1 } })).toBe(2)
    expect(await prisma.pagamentoFinanceiro.count({ where: { perfilId: f.E1, tipo: "ESTORNO" } })).toBe(1)
    expect((await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: f.conta() } })).saldoAtualCentavos?.toString()).toBe("100000")
  })
  it("HUB: 503 conserva a chave; revisão expirada recusa sem efeito e permite nova intenção explícita", async () => {
    const f = await fixtureG004(), ctx = await f.contexto(), t = await gravarTituloFinanceiro(ctx, {
      natureza: "PAGAR", chave: "HUB-expirada", descricao: "Expiração real", valorCentavos: "10000", vencimento: dataGasto, carteiraId: f.conta() })
    await aplicarPagamentoLegado({ storeId: f.L1, tipo: "pagar", canal: "financeiro", op: "parcial", localKey: t.localKey!, valor: 40, idempotencyKey: "original" })
    const start = Date.now() + 1000
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(start))
    const browser = browserG004(), keys: string[] = [], pedido = { op: "estornar", localKey: t.localKey!, motivo: "Intenção expirada" }
    const input = { principalId: f.U1, storeId: f.L1, canal: "financeiro" as const, tipo: "pagar" as const, referencia: t.localKey!, op: "estornar" as const, pedido }
    const enviar = async (idempotencyKey: string) => { keys.push(idempotencyKey); return pagar(requestG004({ ...pedido, idempotencyKey }, f.L1, "/api/financeiro/pagar", "PATCH")) }
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION g004_qa_http_falhar() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."perfilId"=TG_ARGV[0] THEN RAISE EXCEPTION 'G004_HTTP_FAILURE'; END IF; RETURN NEW; END $$`)
    await prisma.$executeRawUnsafe(`CREATE TRIGGER g004_qa_http_falha AFTER INSERT ON gastos_outbox FOR EACH ROW EXECUTE FUNCTION g004_qa_http_falhar('${f.E1}')`)
    try {
      await expect(executarPagamentoPendente(input, async key => { const response = await enviar(key); expect(response.status).toBe(503); return response }, browser.ambiente)).rejects.toThrow()
    } finally { await prisma.$executeRawUnsafe("DROP TRIGGER g004_qa_http_falha ON gastos_outbox") }
    expect(browser.map.size).toBe(1)
    vi.setSystemTime(new Date(start + 31 * 60_000))
    const before = await estadoG004(f)
    await expect(estornarPagamentoHub(ctx, { localKey: t.localKey!, motivo: pedido.motivo, chave: keys[0] })).rejects.toMatchObject({ code: "revisao_expirada" })
    await expect(executarPagamentoPendente(input, async key => {
      const response = await enviar(key)
      expect(response.status).toBe(409)
      expect(await response.clone().json()).toMatchObject({ code: "revisao_expirada", operacaoId: key, operacaoRejeitada: true })
      return response
    }, browser.ambiente)).rejects.toThrow()
    expect(await estadoG004(f)).toBe(before)
    expect(browser.map.size).toBe(0)
    expect(await prisma.financeiroOperacao.count({ where: { perfilId: f.E1 } })).toBe(0)
    await executarPagamentoPendente(input, enviar, browser.ambiente)
    expect(keys[0]).toBe(keys[1])
    expect(keys[2]).not.toBe(keys[0])
    expect(browser.map.size).toBe(0)
    expect(await prisma.pagamentoFinanceiro.count({ where: { perfilId: f.E1, tipo: "ESTORNO" } })).toBe(1)
    expect(await prisma.movimentacaoFinanceira.count({ where: { perfilId: f.E1 } })).toBe(2)
    expect((await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: f.conta() } })).saldoAtualCentavos?.toString()).toBe("100000")
  })
  it("prepara/confirma e recupera resposta perdida com IDs persistidos; cache permanece privado", async () => {
    const f = await fixtureG004(), prep = await POST(requestG004({ acao: "preparar", grupoChave: "HTTP", proposta: pagoG004(f) }, f.L1))
    expect(prep.status).toBe(200)
    const { resultado: r } = await prep.json(), command = { acao: "confirmar", revisaoId: r.id, versaoEsperada: 1, chave: "http-op" }
    const responseLost = await POST(requestG004(command, f.L1))
    expect(responseLost.status).toBe(200) // COMMIT executado; body propositalmente não consumido.
    const before = await estadoG004(f), retry = await POST(requestG004(command, f.L1)), body = await retry.json()
    expect(retry.status).toBe(200)
    expect(retry.headers.get("cache-control")).toContain("no-store")
    expect(body.resultado.operacaoId).toBe((await prisma.financeiroOperacao.findFirstOrThrow({ where: { perfilId: f.E1 } })).id)
    expect(await estadoG004(f)).toBe(before)
  })
  it("body não seleciona pessoal/owner e outra loja/usuário não confirma revisão privada", async () => {
    const f = await fixtureG004()
    const invalid = await POST(requestG004({ acao: "preparar", grupoChave: "forja", perfilId: f.P1, proposta: pagoG004(f) }, f.L1))
    expect(invalid.status).toBe(422)
    const prep = await POST(requestG004({ acao: "preparar", grupoChave: "privado", proposta: pagoG004(f) }, f.L1)), { resultado: r } = await prep.json()
    expect((await POST(requestG004({ acao: "confirmar", revisaoId: r.id, versaoEsperada: 1, chave: "cross" }, f.L2))).status).toBe(404)
    f.login(f.U2, [f.L1])
    expect((await POST(requestG004({ acao: "preparar", grupoChave: "semloja", proposta: pagoG004(f) }, f.L2))).status).toBe(403)
    expect(await prisma.movimentacaoFinanceira.count({ where: { perfilId: { in: f.perfis } } })).toBe(0)
  })
  it("HUB conserva a identidade no browser após COMMIT/resposta perdida e estorna só a parcial original", async () => {
    const f = await fixtureG004(), ctx = await f.contexto(), t = await gravarTituloFinanceiro(ctx, {
      natureza: "PAGAR", chave: "HUB", descricao: "HUB fixture", valorCentavos: "20000", vencimento: dataGasto, carteiraId: f.conta() })
    const m1 = { storeId: f.L1, tipo: "pagar" as const, canal: "financeiro" as const, op: "parcial" as const, localKey: t.localKey!, valor: 40 }
    await aplicarPagamentoLegado({ ...m1, idempotencyKey: "http-m1-a" })
    await aplicarPagamentoLegado({ ...m1, idempotencyKey: "http-m1-b" })
    const map = new Map<string, string>(), keys: string[] = [], storage = { getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => { map.set(k, v) }, removeItem: (k: string) => { map.delete(k) } }
    const pedido = { op: "estornar", localKey: t.localKey!, motivo: "HTTP real" }
    const input = { principalId: f.U1, storeId: f.L1, canal: "financeiro" as const, tipo: "pagar" as const, referencia: t.localKey!, op: "estornar" as const, pedido }
    let perder = true
    const enviar = async (idempotencyKey: string) => {
      keys.push(idempotencyKey)
      const r = await pagar(requestG004({ ...pedido, idempotencyKey }, f.L1, "/api/financeiro/pagar", "PATCH"))
      expect(r.status).toBe(200)
      if (perder) { perder = false; throw new Error("resposta perdida após COMMIT") }
      return r
    }
    const ambiente = { storage, trava: async <T>(_nome: string, fn: () => Promise<T>) => fn() }
    await expect(executarPagamentoPendente(input, enviar, ambiente)).rejects.toThrow("resposta perdida")
    expect(map.size).toBe(1)
    const before = await estadoG004(f)
    await prisma.perfilMembro.updateMany({ where: { perfilId: f.E1, adminUserId: f.U1 }, data: { revogadoEm: new Date() } })
    await expect(executarPagamentoPendente(input, async idempotencyKey => {
      keys.push(idempotencyKey)
      const denied = await pagar(requestG004({ ...pedido, idempotencyKey }, f.L1, "/api/financeiro/pagar", "PATCH"))
      expect(denied.status).toBe(403)
      expect(await denied.clone().json()).toMatchObject({ code: "acesso_negado", operacaoRejeitada: false })
      return denied
    }, ambiente)).rejects.toThrow()
    expect(map.size).toBe(1)
    expect(await estadoG004(f)).toBe(before)
    await prisma.perfilMembro.updateMany({ where: { perfilId: f.E1, adminUserId: f.U1 }, data: { revogadoEm: null } })
    await executarPagamentoPendente(input, enviar, ambiente)
    expect(new Set(keys).size).toBe(1)
    expect(map.size).toBe(0)
    expect(await estadoG004(f)).toBe(before)
    expect(await prisma.pagamentoFinanceiro.count({ where: { perfilId: f.E1 } })).toBe(1)
    expect((await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: f.conta() } })).saldoAtualCentavos?.toString()).toBe("96000")
  })
  it("falha SQL real no handler devolve erro, nunca sucesso, e reverte reserva/dinheiro/outbox", async () => {
    const f = await fixtureG004(), prep = await POST(requestG004({ acao: "preparar", grupoChave: "falha", proposta: pagoG004(f) }, f.L1))
    const { resultado: r } = await prep.json(), before = await estadoG004(f)
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION g004_qa_http_falhar() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."perfilId"=TG_ARGV[0] THEN RAISE EXCEPTION 'G004_HTTP_FAILURE'; END IF; RETURN NEW; END $$`)
    await prisma.$executeRawUnsafe(`CREATE TRIGGER g004_qa_http_falha AFTER INSERT ON gastos_outbox FOR EACH ROW EXECUTE FUNCTION g004_qa_http_falhar('${f.E1}')`)
    try {
      const response = await POST(requestG004({ acao: "confirmar", revisaoId: r.id, versaoEsperada: 1, chave: "falha-http" }, f.L1))
      expect(response.status).toBe(503)
      expect(await response.json()).toMatchObject({ ok: false, code: "db_error" })
      expect(await estadoG004(f)).toBe(before)
    } finally { await prisma.$executeRawUnsafe("DROP TRIGGER g004_qa_http_falha ON gastos_outbox") }
  })
})
