/** Handlers/guards/financeiro/estoque reais. Somente sessão e cookie HTTP são fixtures. */
import { modulosSinteticos } from "@/test/gastos/sessao-modulos"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"
import { prisma } from "@/lib/prisma"
import { POST as corrigir } from "@/app/api/vendas/[id]/corrigir/route"
import { POST as corrigirItens } from "@/app/api/vendas/[id]/corrigir-itens/route"
import { POST as corrigirTitulo } from "@/app/api/vendas/[id]/corrigir-titulo/route"
import { POST as cancelar } from "@/app/api/vendas/[id]/cancelar/route"
import { PATCH as pagarLegado } from "@/app/api/financeiro/pagar/route"
import { PATCH as receberLegado } from "@/app/api/financeiro/receber/route"
import { POST as receberPdv } from "@/app/api/pdv/receber-conta/route"
import { executarPagamentoPendente } from "@/lib/financeiro/pagamento-operacao-client"
import { garantirTituloOSTravadoV3 } from "@/lib/operacoes-v3/recebimento-misto-service"
import { createPinAuthorizationToken, ADMIN_AUTHORIZATION_COOKIE } from "@/lib/auth/pin-authorization"
import { hashSupervisorPin } from "@/lib/auth/pin-hash"
import { ESTORNO_STEP_UP_ACTION } from "@/lib/vendas/estorno-step-up-contract"

const config = vi.hoisted(() => {
  const url = new URL(process.env.GASTOS_G002_TEST_DATABASE_URL ?? "postgresql://gastos_g002@127.0.0.1:55494/gastos_g002_test")
  if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" || url.port !== "55494"
    || url.username !== "gastos_g002" || url.pathname !== "/gastos_g002_test" || url.search) {
    throw new Error("G002 recusa banco fora do cluster descartável identificado.")
  }
  return { url: url.toString(), cookies: new Map<string, string>() }
})
const authSession = vi.hoisted(() => vi.fn<() => Promise<Session | null>>())
vi.mock("@/auth", () => ({ auth: authSession }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => {
  const value = config.cookies.get(key)
  return value ? { value } : undefined
} }) }))
vi.mock("@/lib/prisma", async () => {
  const { PrismaClient } = await import("@/generated/prisma")
  const client = new PrismaClient({ datasources: { db: { url: config.url } } })
  return { prisma: client, prismaEnsureConnected: () => client.$connect() }
})

const L = "g002-route-L", OTHER = "g002-route-other", U = "g002-route-U", SUP = "g002-route-supervisor"
const stores = [L, OTHER], pedido = "G002-ROUTE-VENDA", product = "g002-route-produto"
const pin = "927461", secret = "g002-synthetic-only-secret-not-a-client-credential"
const request = (body: unknown, storeId = L) => new Request("http://localhost/api/vendas/fixture", {
  method: "POST", headers: { "content-type": "application/json", "x-assistec-loja-id": storeId }, body: JSON.stringify(body),
})
const params = () => ({ params: Promise.resolve({ id: pedido }) })
const corrected = { motivo: "Fixture G002", supervisorPin: pin }
async function result(res: Response, status = 200) {
  const body = await res.json()
  expect({ status: res.status, body }).toMatchObject({ status, body: status === 200 ? { ok: true } : {} })
  return body
}
async function clearWrites() {
  await prisma.auditoriaFinanceira.deleteMany({ where: { storeId: { in: stores } } })
  await prisma.fechamentoFinanceiro.deleteMany({ where: { storeId: { in: stores } } })
  await prisma.caixaOperacao.deleteMany({ where: { storeId: { in: stores } } })
  await prisma.movimentacaoEstoque.deleteMany({ where: { storeId: { in: stores } } })
  await prisma.venda.deleteMany({ where: { storeId: { in: stores } } })
  await prisma.movimentacaoFinanceira.deleteMany({ where: { storeId: { in: stores } } })
  await prisma.contaPagarTitulo.deleteMany({ where: { storeId: { in: stores } } })
  await prisma.contaReceberTitulo.deleteMany({ where: { storeId: { in: stores } } })
  await prisma.carteiraFinanceira.deleteMany({ where: { storeId: { in: stores } } })
  await prisma.sessaoCaixa.deleteMany({ where: { storeId: { in: stores } } })
  await prisma.produto.deleteMany({ where: { storeId: { in: stores } } })
  await prisma.deposito.deleteMany({ where: { storeId: { in: stores } } })
  await prisma.financeiroPerfil.deleteMany({ where: { storeId: { in: stores } } })
}
async function seed(move = true) {
  await prisma.produto.create({ data: { id: product, storeId: L, name: "Produto fixture", stock: 8, price: 50 } })
  const sale = await prisma.venda.create({ data: { storeId: L, pedidoId: pedido, total: 100,
    clienteNome: "Cliente fixture", payload: { paymentBreakdown: { dinheiro: 100 } },
    itens: { create: [{ inventoryId: product, nome: "Produto fixture", quantidade: 2, precoUnitario: 50, lineTotal: 100 }] },
  } })
  const entrada = move ? await prisma.movimentacaoFinanceira.create({ data: {
    storeId: L, tipo: "entrada", valor: 100, origem: "venda", referenciaId: pedido, descricao: "Legado fixture",
  } }) : null
  return { sale, entrada }
}
async function legacyTitle(extra: { ativo?: boolean; carteiraId?: string } = {}) {
  return prisma.contaReceberTitulo.create({ data: { storeId: L, localKey: `pdv-aprazo-${pedido}`,
    descricao: "Título legado", cliente: "Cliente fixture", valor: 365.01, vencimento: "25/10/2026",
    payload: { marcadorHistorico: "preservar" }, ...extra,
  } })
}

async function prepararM1(kind: "pagar" | "receber" | "pdv") {
  const wallet = await prisma.carteiraFinanceira.create({ data: { storeId: L, nome: "M1 endpoint", tipo: "banco" } })
  const data = { storeId: L, localKey: `M1-${kind}`, descricao: "Fixture M1", valor: 200, vencimento: "2026-10-25", payload: { carteiraId: wallet.id } }
  const title = kind === "pagar" ? await prisma.contaPagarTitulo.create({ data })
    : await prisma.contaReceberTitulo.create({ data: { ...data, cliente: "Fixture" } })
  const sessao = kind === "pdv" ? await prisma.sessaoCaixa.create({ data: { storeId: L, operador: "Fixture M1" } }) : null
  const handler = kind === "pdv" ? receberPdv : kind === "pagar" ? pagarLegado : receberLegado
  const body = { op: "parcial", localKey: data.localKey, valor: 40, formaPagamento: "dinheiro", ...(sessao ? { sessaoId: sessao.id } : {}) }
  const enviar = (idempotencyKey: string, extra: Record<string, unknown> = {}, storeId = L) => handler(new Request(`http://localhost/api/${kind}`, {
    method: kind === "pdv" ? "POST" : "PATCH", headers: { "content-type": "application/json", "x-assistec-loja-id": storeId },
    body: JSON.stringify({ ...body, idempotencyKey, ...extra }),
  }))
  return { wallet, title, sessao, body, enviar }
}

function ambientePendencias() {
  const rows = new Map<string, string>(), filas = new Map<string, Promise<void>>()
  return { rows, storage: { getItem: (k: string) => rows.get(k) ?? null, setItem: (k: string, v: string) => { rows.set(k, v) }, removeItem: (k: string) => { rows.delete(k) } },
    trava: async <T>(nome: string, fn: () => Promise<T>): Promise<T> => {
      const anterior = filas.get(nome) ?? Promise.resolve()
      let liberar!: () => void
      const atual = new Promise<void>(resolve => { liberar = resolve })
      filas.set(nome, anterior.then(() => atual))
      await anterior
      try { return await fn() } finally { liberar() }
    },
  }
}

// Reconciliação main × G002 (OMNI-GESTOR-MONEY-MAIN-RECONCILIATION-001): o caminho M1 de rota
// (idempotencyKey + recibo aplicarPagamentoLegado) NÃO foi ligado a PATCH pagar/receber nem a
// POST /api/pdv/receber-conta — esses handlers mantêm o contrato da #397 (título travado + CAS +
// restanteEsperado/pagoEsperado), coberto por recebimento-atomico.test.ts, pagar/receber-liquidar-saldo
// e pelas suítes F9. Os casos M1 ficam desligados por decisão explícita, não por falha ignorada;
// religar exige o GOAL de ativação que ligue o M1 às rotas.
const M1_ROTAS_LIGADAS = false

describe.skipIf(!process.env.GASTOS_G002_TEST_DATABASE_URL)("G002 writers adicionais PostgreSQL real", () => {
  beforeAll(async () => {
    const [identity] = await prisma.$queryRaw<Array<{ db: string; user: string; port: number; rolsuper: boolean; rolbypassrls: boolean }>>`
      SELECT current_database() AS db, current_user AS user, inet_server_port() AS port, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`
    expect(identity).toMatchObject({ db: "gastos_g002_test", user: "gastos_g002", port: 55494, rolsuper: false, rolbypassrls: false })
    expect(await prisma.store.count({ where: { id: { in: stores } } })).toBe(0)
    vi.stubEnv("AUTH_SECRET", secret)
    vi.stubEnv("PIN_HASH_PEPPER", secret)
    vi.stubEnv("PIN_AUTHORIZATION_SECRET", secret)
    await prisma.store.createMany({ data: stores.map(id => ({ id, name: "Fixture G002 routes" })) })
    await prisma.adminUser.create({ data: { id: U, email: "g002-route@example.invalid", password: "synthetic", lojaId: L, role: "ADMIN" } })
    await prisma.user.create({ data: { id: SUP, name: "Supervisor fixture", pin, pinHash: await hashSupervisorPin(pin), role: "ADMIN" } })
  })
  beforeEach(async () => {
    await clearWrites()
    config.cookies.clear()
    authSession.mockResolvedValue({ expires: "2099-01-01T00:00:00.000Z", user: { id: U, role: "ADMIN", lojaId: L, storeAccess: "restricted", allowedStoreIds: [L], storeModules: modulosSinteticos([L]) } })
  })
  afterAll(async () => {
    await clearWrites()
    await prisma.user.deleteMany({ where: { id: SUP } })
    await prisma.adminUser.deleteMany({ where: { id: U } })
    await prisma.store.deleteMany({ where: { id: { in: stores } } })
    await prisma.$disconnect()
    vi.unstubAllEnvs()
  })

  it("correção de pagamento adota entrada sem trocar ID/origem/referência e preserva estoque", async () => {
    const { sale, entrada } = await seed()
    await result(await corrigir(request({ ...corrected, novaFormaPagamento: { dinheiro: 60, aPrazo: 40 } }), params()))
    const updated = await prisma.movimentacaoFinanceira.findUniqueOrThrow({ where: { id: entrada!.id } })
    const empresa = await prisma.financeiroPerfil.findUniqueOrThrow({ where: { storeId: L } })
    expect(updated).toMatchObject({ tipo: "entrada", origem: "venda", referenciaId: pedido, valor: 60, perfilId: empresa.id })
    expect(updated.valorCentavos?.toString()).toBe("6000")
    expect((await prisma.venda.findUniqueOrThrow({ where: { id: sale.id } })).id).toBe(sale.id)
    const title = await prisma.contaReceberTitulo.findFirstOrThrow({ where: { storeId: L } })
    expect(title).toMatchObject({ localKey: `pdv-aprazo-${pedido}`, valor: 40, perfilId: empresa.id })
    expect((await prisma.produto.findUniqueOrThrow({ where: { id: product } })).stock).toBe(8)
    expect(await prisma.movimentacaoEstoque.count({ where: { storeId: L } })).toBe(0)
    expect(await prisma.perfilMembro.count({ where: { storeId: L } })).toBe(0)
  })

  it.skipIf(!M1_ROTAS_LIGADAS).each(["pagar", "receber"] as const)("M1 %s preserva duas parciais iguais de intenções distintas no handler real", async (kind) => {
    const carteira = await prisma.carteiraFinanceira.create({ data: { storeId: L, nome: "M1", tipo: "banco" } })
    const dados = { storeId: L, localKey: `M1-${kind}`, descricao: "M1 fixture", valor: 200, vencimento: "2026-10-25", payload: { carteiraId: carteira.id } }
    const titulo = kind === "pagar"
      ? await prisma.contaPagarTitulo.create({ data: dados })
      : await prisma.contaReceberTitulo.create({ data: { ...dados, cliente: "Fixture" } })
    const handler = kind === "pagar" ? pagarLegado : receberLegado
    for (const idempotencyKey of ["M1-intencao-primeira", "M1-intencao-segunda"]) {
      await result(await handler(new Request(`http://localhost/api/financeiro/${kind}`, {
        method: "PATCH", headers: { "content-type": "application/json", "x-assistec-loja-id": L },
        body: JSON.stringify({ op: "parcial", localKey: dados.localKey, valor: 40, idempotencyKey }),
      })))
    }
    const salvo = kind === "pagar"
      ? await prisma.contaPagarTitulo.findUniqueOrThrow({ where: { id: titulo.id } })
      : await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: titulo.id } })
    const movimentos = await prisma.movimentacaoFinanceira.findMany({ where: { storeId: L, referenciaId: titulo.id } })
    const historico = salvo.payload && typeof salvo.payload === "object" && !Array.isArray(salvo.payload) ? salvo.payload.historico : null
    const saldo = (await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: carteira.id } })).saldoAtual
    const observado = { pagamentos: Array.isArray(historico) ? historico.length : 0, movimentos: movimentos.length,
      totalMovimentado: movimentos.reduce((s, m) => s + m.valor, 0), saldo }
    console.info("G002_M1_ENDPOINT", JSON.stringify({ kind, ...observado }))
    expect(observado).toEqual({ pagamentos: 2, movimentos: 2, totalMovimentado: 80, saldo: kind === "pagar" ? -80 : 80 })
  })

  it.skipIf(!M1_ROTAS_LIGADAS)("M1 PDV singular conserva duas parciais iguais, dois movimentos e dois caixas", async () => {
    const f = await prepararM1("pdv")
    await result(await f.enviar("M1-pdv-A"))
    await result(await f.enviar("M1-pdv-B"))
    expect(await prisma.movimentacaoFinanceira.count({ where: { referenciaId: f.title.id } })).toBe(2)
    expect(await prisma.caixaOperacao.count({ where: { storeId: L, sessaoId: f.sessao!.id, valor: 40 } })).toBe(2)
    expect((await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: f.wallet.id } })).saldoAtual).toBe(80)
  })

  it.skipIf(!M1_ROTAS_LIGADAS)("M1 PDV: caixa fechado sem commit libera a intenção e nova sessão recebe uma única vez", async () => {
    const f = await prepararM1("pdv"), ambiente = ambientePendencias(), keys: string[] = []
    const input = { principalId: U, storeId: L, canal: "pdv" as const, tipo: "receber" as const,
      referencia: f.body.localKey, op: "parcial" as const, sessaoId: f.sessao!.id, pedido: f.body }
    await prisma.sessaoCaixa.update({ where: { id: f.sessao!.id }, data: { status: "FECHADA" } })
    await expect(executarPagamentoPendente(input, async (key, sessaoId) => {
      keys.push(key)
      const response = await f.enviar(key, { sessaoId })
      expect(await result(response.clone(), 409)).toMatchObject({ code: "caixa_fechado", operacaoId: key, operacaoRejeitada: true })
      return response
    }, ambiente)).rejects.toThrow("caixa está fechado")
    expect(ambiente.rows.size).toBe(0)
    expect(await prisma.movimentacaoFinanceira.count({ where: { storeId: L } })).toBe(0)
    expect(await prisma.caixaOperacao.count({ where: { storeId: L } })).toBe(0)
    expect(await prisma.financeiroPerfil.count({ where: { storeId: L } })).toBe(0)
    expect(await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: f.title.id } })).toMatchObject({ payload: f.title.payload, status: "pendente", perfilId: null })
    expect((await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: f.wallet.id } })).saldoAtual).toBe(0)
    const nova = await prisma.sessaoCaixa.create({ data: { storeId: L, operador: "Nova fixture D1" } })
    await executarPagamentoPendente({ ...input, sessaoId: nova.id, pedido: { ...f.body, sessaoId: nova.id } }, async (key, sessaoId) => {
      keys.push(key)
      expect(sessaoId).toBe(nova.id)
      return f.enviar(key, { sessaoId })
    }, ambiente)
    expect(keys[0]).not.toBe(keys[1])
    expect((await result(await f.enviar(keys[1], { sessaoId: nova.id }))).jaRegistrado).toBe(true)
    expect(await prisma.movimentacaoFinanceira.count({ where: { referenciaId: f.title.id } })).toBe(1)
    expect(await prisma.caixaOperacao.count({ where: { sessaoId: nova.id } })).toBe(1)
    expect(await prisma.caixaOperacao.count({ where: { sessaoId: f.sessao!.id } })).toBe(0)
    expect((await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: f.wallet.id } })).saldoAtual).toBe(40)
  })

  it.skipIf(!M1_ROTAS_LIGADAS).each((["pagar", "receber", "pdv"] as const).flatMap(kind =>
    (["inativa", "estrangeira", "inexistente", "perfil inativo"] as const).map(estado => ({ kind, estado })),
  ))("M1 $kind: conta $estado é rejeição tipada sem efeito; corrigir permite nova intenção", async ({ kind, estado }) => {
    const f = await prepararM1(kind), ambiente = ambientePendencias(), keys: string[] = []
    let carteiraId = f.wallet.id
    if (estado === "inativa") await prisma.carteiraFinanceira.update({ where: { id: f.wallet.id }, data: { ativo: false } })
    if (estado === "estrangeira") carteiraId = (await prisma.carteiraFinanceira.create({ data: { storeId: OTHER, nome: "Outra empresa", tipo: "banco" } })).id
    if (estado === "inexistente") carteiraId = "g002-conta-inexistente"
    if (estado === "perfil inativo") await prisma.financeiroPerfil.create({ data: { tipo: "EMPRESA", storeId: L, ativo: false } })
    const payload = { carteiraId }
    if (kind === "pagar") await prisma.contaPagarTitulo.update({ where: { id: f.title.id }, data: { payload } })
    else await prisma.contaReceberTitulo.update({ where: { id: f.title.id }, data: { payload } })
    const input = { principalId: U, storeId: L, canal: kind === "pdv" ? "pdv" as const : "financeiro" as const,
      tipo: kind === "pagar" ? "pagar" as const : "receber" as const, referencia: f.body.localKey,
      op: "parcial" as const, sessaoId: f.sessao?.id, pedido: f.body }
    await expect(executarPagamentoPendente(input, async key => {
      keys.push(key)
      const response = await f.enviar(key)
      expect(await result(response.clone(), 422)).toMatchObject({ code: "conta_indisponivel", operacaoId: key, operacaoRejeitada: true })
      return response
    }, ambiente)).rejects.toThrow("Conta financeira indisponível")
    expect(ambiente.rows.size).toBe(0)
    expect(await prisma.movimentacaoFinanceira.count({ where: { storeId: { in: stores } } })).toBe(0)
    expect(await prisma.caixaOperacao.count({ where: { storeId: L } })).toBe(0)
    expect(await prisma.financeiroPerfil.count({ where: { storeId: L } })).toBe(estado === "perfil inativo" ? 1 : 0)
    const titulo = kind === "pagar" ? await prisma.contaPagarTitulo.findUniqueOrThrow({ where: { id: f.title.id } })
      : await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: f.title.id } })
    expect(titulo).toMatchObject({ payload, status: "pendente", perfilId: null })
    expect((await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: f.wallet.id } })).saldoAtual).toBe(0)
    await prisma.carteiraFinanceira.update({ where: { id: f.wallet.id }, data: { ativo: true } })
    if (estado === "perfil inativo") await prisma.financeiroPerfil.update({ where: { storeId: L }, data: { ativo: true } })
    const payloadCorrigido = { carteiraId: f.wallet.id }
    if (kind === "pagar") await prisma.contaPagarTitulo.update({ where: { id: f.title.id }, data: { payload: payloadCorrigido } })
    else await prisma.contaReceberTitulo.update({ where: { id: f.title.id }, data: { payload: payloadCorrigido } })
    await executarPagamentoPendente(input, async key => { keys.push(key); return f.enviar(key) }, ambiente)
    expect(keys[0]).not.toBe(keys[1])
    expect((await result(await f.enviar(keys[1]))).jaRegistrado).toBe(true)
    expect(await prisma.movimentacaoFinanceira.count({ where: { referenciaId: f.title.id } })).toBe(1)
    expect((await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: f.wallet.id } })).saldoAtual).toBe(kind === "pagar" ? -40 : 40)
    if (f.sessao) expect(await prisma.caixaOperacao.count({ where: { sessaoId: f.sessao.id } })).toBe(1)
  })

  it.skipIf(!M1_ROTAS_LIGADAS).each(["pagar", "receber", "pdv"] as const)("M1 %s: resposta perdida após commit e reabertura conservam chave e efeito", async kind => {
    const f = await prepararM1(kind), ambiente = ambientePendencias(), keys: string[] = []
    const input = { principalId: U, storeId: L, canal: kind === "pdv" ? "pdv" as const : "financeiro" as const,
      tipo: kind === "pagar" ? "pagar" as const : "receber" as const, referencia: f.body.localKey, op: "parcial" as const,
      sessaoId: f.sessao?.id, pedido: f.body,
    }
    await expect(executarPagamentoPendente(input, async (key, sessaoOriginal) => {
      keys.push(key)
      const response = await f.enviar(key, sessaoOriginal ? { sessaoId: sessaoOriginal } : {})
      expect(response.status).toBe(200) // Handler já retornou após o commit real.
      throw new Error("M1_RESPOSTA_PERDIDA_APOS_COMMIT")
    }, ambiente)).rejects.toThrow("M1_RESPOSTA_PERDIDA_APOS_COMMIT")
    expect(ambiente.rows.size).toBe(1)
    expect(await prisma.movimentacaoFinanceira.count({ where: { referenciaId: f.title.id } })).toBe(1)
    // Há commit: perfil desativado depois dele NÃO autoriza descartar a chave.
    await prisma.financeiroPerfil.update({ where: { storeId: L }, data: { ativo: false } })
    await expect(executarPagamentoPendente(input, async key => {
      keys.push(key)
      const response = await f.enviar(key)
      expect(response.status).toBe(503)
      expect((await response.clone().json()).operacaoRejeitada).not.toBe(true)
      return response
    }, ambiente)).rejects.toThrow()
    expect(ambiente.rows.size).toBe(1)
    await prisma.financeiroPerfil.update({ where: { storeId: L }, data: { ativo: true } })
    let novaSessao: string | undefined
    if (f.sessao) {
      await prisma.sessaoCaixa.update({ where: { id: f.sessao.id }, data: { status: "FECHADA" } })
      novaSessao = (await prisma.sessaoCaixa.create({ data: { storeId: L, operador: "Nova fixture" } })).id
    } else {
      const hoje = new Date(), ano = hoje.getUTCFullYear(), mes = hoje.getUTCMonth() + 1
      await prisma.fechamentoFinanceiro.create({ data: { storeId: L, tipo: "mensal", dataReferencia: `${ano}-${String(mes).padStart(2, "0")}-01`, mes, ano, status: "fechado" } })
      const controle = await result(await f.enviar("M1-chave-nova-periodo-fechado"), 409)
      expect(controle.code).toBe("periodo_fechado")
      expect(controle.operacaoRejeitada).not.toBe(true)
    }
    const replay = await executarPagamentoPendente({ ...input, ...(novaSessao ? { sessaoId: novaSessao, pedido: { ...f.body, sessaoId: novaSessao } } : {}) }, async (key, sessaoOriginal) => {
      keys.push(key)
      return f.enviar(key, sessaoOriginal ? { sessaoId: sessaoOriginal } : {})
    }, ambiente)
    expect(replay).toMatchObject({ ok: true, jaRegistrado: true, operacaoId: keys[0] })
    expect(keys).toEqual([keys[0], keys[0], keys[0]])
    expect(ambiente.rows.size).toBe(0)
    expect(await prisma.movimentacaoFinanceira.count({ where: { referenciaId: f.title.id } })).toBe(1)
    expect((await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: f.wallet.id } })).saldoAtual).toBe(kind === "pagar" ? -40 : 40)
    if (novaSessao) {
      expect(await prisma.caixaOperacao.count({ where: { sessaoId: novaSessao } })).toBe(0)
      expect(await prisma.caixaOperacao.count({ where: { sessaoId: f.sessao!.id } })).toBe(1)
    }
  })

  it.skipIf(!M1_ROTAS_LIGADAS).each(["pagar", "receber", "pdv"] as const)("M1 %s recusa identidade ausente, conteúdo divergente e loja estrangeira", async kind => {
    const f = await prepararM1(kind)
    await result(await f.enviar("", {}), 400)
    await result(await f.enviar("M1-principal"))
    await result(await f.enviar("M1-principal", { valor: 41 }), 409)
    await result(await f.enviar("M1-outra-loja", {}, OTHER), 403)
    authSession.mockResolvedValue(null)
    await result(await f.enviar("M1-sem-sessao"), 401)
    expect(await prisma.movimentacaoFinanceira.count({ where: { referenciaId: f.title.id } })).toBe(1)
    expect(await prisma.financeiroPerfil.count({ where: { storeId: OTHER } })).toBe(0)
  })

  it.skipIf(!M1_ROTAS_LIGADAS).each(["pagar", "receber", "pdv"] as const)("M1 %s: requests concorrentes iguais e distintos disputam locks PostgreSQL", async kind => {
    const f = await prepararM1(kind)
    for (const mesma of [true, false]) {
      let pronto!: () => void, soltar!: () => void
      const prontoP = new Promise<void>(r => { pronto = r }), soltarP = new Promise<void>(r => { soltar = r })
      const gate = prisma.$transaction(async tx => {
        if (kind === "pagar") await tx.$queryRaw`SELECT id FROM contas_pagar_titulos WHERE id=${f.title.id} AND "storeId"=${L} FOR UPDATE`
        else await tx.$queryRaw`SELECT id FROM contas_receber_titulos WHERE id=${f.title.id} AND "storeId"=${L} FOR UPDATE`
        pronto(); await soltarP
      })
      await prontoP
      const key = `M1-http-${mesma ? "mesma" : "distinta"}`
      const requests = Promise.all([f.enviar(key, { valor: 20 }), f.enviar(mesma ? key : `${key}-B`, { valor: 20 })])
      try {
        let waits = 0
        for (let n = 0; n < 150; n++) {
          const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND usename=current_user AND state='active' AND wait_event_type='Lock'`
          waits = Number(rows[0].n)
          if (waits >= 2) break
          await new Promise(r => setTimeout(r, 10))
        }
        expect(waits).toBeGreaterThanOrEqual(2)
      } finally { soltar(); await gate }
      const responses = await requests
      const bodies = await Promise.all(responses.map(r => result(r)))
      expect(bodies.filter(b => b.jaRegistrado)).toHaveLength(mesma ? 1 : 0)
    }
    expect(await prisma.movimentacaoFinanceira.count({ where: { referenciaId: f.title.id } })).toBe(3)
    expect((await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: f.wallet.id } })).saldoAtual).toBe(kind === "pagar" ? -60 : 60)
    if (kind === "pdv") expect(await prisma.caixaOperacao.count({ where: { sessaoId: f.sessao!.id } })).toBe(3)
  })

  it.skipIf(!M1_ROTAS_LIGADAS).each(["pagar", "receber", "pdv"] as const)("M1 %s: falha SQL no saldo nunca vira HTTP sucesso e retry usa mesma identidade", async kind => {
    const f = await prepararM1(kind)
    await prisma.$executeRawUnsafe(`CREATE FUNCTION qa_g002_m1_route_saldo() RETURNS trigger AS $$ BEGIN IF NEW."storeId" = 'g002-route-L' THEN RAISE EXCEPTION 'M1_ROUTE_SALDO_FALHA'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`)
    try {
      await prisma.$executeRawUnsafe('CREATE TRIGGER qa_g002_m1_route_saldo BEFORE UPDATE OF "saldoAtual" ON carteiras_financeiras FOR EACH ROW EXECUTE FUNCTION qa_g002_m1_route_saldo()')
      await result(await f.enviar("M1-falha-recuperavel"), 503)
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS qa_g002_m1_route_saldo ON carteiras_financeiras')
      await prisma.$executeRawUnsafe('DROP FUNCTION qa_g002_m1_route_saldo()')
    }
    expect(await prisma.movimentacaoFinanceira.count({ where: { storeId: L } })).toBe(0)
    expect(await prisma.financeiroPerfil.count({ where: { storeId: L } })).toBe(0)
    expect(await prisma.caixaOperacao.count({ where: { storeId: L } })).toBe(0)
    const row = kind === "pagar" ? await prisma.contaPagarTitulo.findUniqueOrThrow({ where: { id: f.title.id } })
      : await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: f.title.id } })
    expect(row).toMatchObject({ perfilId: null, status: "pendente", payload: f.title.payload })
    expect((await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: f.wallet.id } })).saldoAtual).toBe(0)
    await result(await f.enviar("M1-falha-recuperavel"))
    const replay = await result(await f.enviar("M1-falha-recuperavel"))
    expect(replay.jaRegistrado).toBe(true)
    expect(await prisma.movimentacaoFinanceira.count({ where: { referenciaId: f.title.id } })).toBe(1)
  })

  it.skipIf(!M1_ROTAS_LIGADAS)("M1 PDV falha no caixa reverte também título, movimento, saldo e perfil", async () => {
    const f = await prepararM1("pdv")
    await prisma.$executeRawUnsafe(`CREATE FUNCTION qa_g002_m1_route_caixa() RETURNS trigger AS $$ BEGIN IF NEW."storeId" = 'g002-route-L' THEN RAISE EXCEPTION 'M1_ROUTE_CAIXA_FALHA'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`)
    try {
      await prisma.$executeRawUnsafe('CREATE TRIGGER qa_g002_m1_route_caixa BEFORE INSERT ON caixa_operacoes FOR EACH ROW EXECUTE FUNCTION qa_g002_m1_route_caixa()')
      await result(await f.enviar("M1-caixa-falha"), 503)
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS qa_g002_m1_route_caixa ON caixa_operacoes')
      await prisma.$executeRawUnsafe('DROP FUNCTION qa_g002_m1_route_caixa()')
    }
    expect(await prisma.financeiroPerfil.count({ where: { storeId: L } })).toBe(0)
    expect(await prisma.movimentacaoFinanceira.count({ where: { storeId: L } })).toBe(0)
    expect(await prisma.caixaOperacao.count({ where: { storeId: L } })).toBe(0)
    expect(await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: f.title.id } })).toMatchObject({ perfilId: null, status: "pendente", payload: f.title.payload })
    expect((await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: f.wallet.id } })).saldoAtual).toBe(0)
    await result(await f.enviar("M1-caixa-falha"))
  })

  it.skipIf(!M1_ROTAS_LIGADAS).each([true, false])("M1 PDV conserva recibo legado sem backfill; ledger consistente=%s", async consistente => {
    const f = await prepararM1("pdv"), key = "M1-recibo-legado"
    await prisma.contaReceberTitulo.update({ where: { id: f.title.id }, data: { status: "parcial",
      payload: { carteiraId: f.wallet.id, historico: [{ tipo: "pagamento", valor: 40, at: new Date().toISOString() }] },
    } })
    if (consistente) {
      await prisma.movimentacaoFinanceira.create({ data: { storeId: L, referenciaId: f.title.id, origem: "receber_parcial", tipo: "entrada", valor: 40, carteiraId: f.wallet.id } })
      await prisma.carteiraFinanceira.update({ where: { id: f.wallet.id }, data: { saldoAtual: 40 } })
    }
    await prisma.caixaOperacao.create({ data: { storeId: L, sessaoId: f.sessao!.id, tipo: "recebimento_cr", valor: 40,
      payload: { localId: `pdv-rc:${L}:${f.sessao!.id}:${key}`, tituloId: f.title.id, localKey: f.body.localKey, op: "parcial", formaPagamento: "dinheiro" },
    } })
    const body = await result(await f.enviar(key), consistente ? 200 : 409)
    if (consistente) expect(body).toMatchObject({ jaRegistrado: true, operacaoId: key, valorRecebido: 40 })
    else expect(body.code).toBe("operacao_legada_requer_conferencia")
    expect(await prisma.movimentacaoFinanceira.count({ where: { storeId: L } })).toBe(consistente ? 1 : 0)
    expect(await prisma.caixaOperacao.count({ where: { storeId: L } })).toBe(1)
    expect(await prisma.financeiroPerfil.count({ where: { storeId: L } })).toBe(0)
  })

  it("correção cria entrada ausente e atribui somente EMPRESA mesmo com perfil forjado no JSON", async () => {
    await seed(false)
    await result(await corrigir(request({ ...corrected, novaFormaPagamento: { pix: 100 }, perfilId: "forjado", tipoPerfil: "PESSOAL" }), params()))
    const move = await prisma.movimentacaoFinanceira.findFirstOrThrow({ where: { storeId: L } })
    expect(move).toMatchObject({ origem: "venda", referenciaId: pedido, valor: 100 })
    expect(move.valorCentavos?.toString()).toBe("10000")
    expect((await prisma.financeiroPerfil.findUniqueOrThrow({ where: { id: move.perfilId! } })).tipo).toBe("EMPRESA")
  })

  it("correções de pagamento e itens preservam movimento em carteira histórica hoje inativa", async () => {
    const { entrada } = await seed()
    const wallet = await prisma.carteiraFinanceira.create({ data: { storeId: L, nome: "Histórica", tipo: "banco" } })
    await prisma.movimentacaoFinanceira.update({ where: { id: entrada!.id }, data: { carteiraId: wallet.id } })
    await prisma.carteiraFinanceira.update({ where: { id: wallet.id }, data: { ativo: false } })
    await result(await corrigir(request({ ...corrected, novaFormaPagamento: { dinheiro: 80, pix: 20 } }), params()))
    await result(await corrigirItens(request({ ...corrected, expectedTotal: 100,
      itens: [{ inventoryId: product, nome: "Produto fixture", quantidade: 1, precoUnitario: 50 }] }), params()))
    const move = await prisma.movimentacaoFinanceira.findUniqueOrThrow({ where: { id: entrada!.id } })
    expect(move).toMatchObject({ carteiraId: wallet.id, valor: 50, origem: "venda", referenciaId: pedido })
    expect(move.perfilId).toBeTruthy()
    expect((await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: wallet.id } })).perfilId).toBe(move.perfilId)
    expect((await prisma.produto.findUniqueOrThrow({ where: { id: product } })).stock).toBe(9)
    expect(await prisma.movimentacaoFinanceira.count({ where: { storeId: L } })).toBe(1)
  })

  it("correção de itens conserva ID financeiro, muda quantidade/estoque uma vez e rejeita replay stale", async () => {
    const { sale, entrada } = await seed()
    const body = { ...corrected, expectedTotal: 100, itens: [{ inventoryId: product, nome: "Produto fixture", quantidade: 3, precoUnitario: 50 }] }
    await result(await corrigirItens(request(body), params()))
    const move = await prisma.movimentacaoFinanceira.findUniqueOrThrow({ where: { id: entrada!.id } })
    expect(move).toMatchObject({ valor: 150, origem: "venda", referenciaId: pedido })
    expect(move.perfilId).toBeTruthy(); expect(move.valorCentavos?.toString()).toBe("15000")
    expect((await prisma.itemVenda.findFirstOrThrow({ where: { vendaId: sale.id } })).quantidade).toBe(3)
    expect((await prisma.produto.findUniqueOrThrow({ where: { id: product } })).stock).toBe(7)
    expect(await prisma.movimentacaoEstoque.count({ where: { storeId: L } })).toBe(1)
    await result(await corrigirItens(request(body), params()), 409)
    expect((await prisma.produto.findUniqueOrThrow({ where: { id: product } })).stock).toBe(7)
    expect(await prisma.movimentacaoFinanceira.count({ where: { storeId: L } })).toBe(1)
  })

  it("correção de itens cria a entrada ausente no mesmo perfil da loja", async () => {
    await seed(false)
    await result(await corrigirItens(request({ ...corrected, expectedTotal: 100,
      itens: [{ inventoryId: product, nome: "Produto fixture", quantidade: 1, precoUnitario: 50 }] }), params()))
    const move = await prisma.movimentacaoFinanceira.findFirstOrThrow({ where: { storeId: L } })
    expect(move).toMatchObject({ valor: 50, origem: "venda", referenciaId: pedido })
    expect(move.valorCentavos?.toString()).toBe("5000")
    expect(move.perfilId).toBe((await prisma.financeiroPerfil.findUniqueOrThrow({ where: { storeId: L } })).id)
    expect((await prisma.produto.findUniqueOrThrow({ where: { id: product } })).stock).toBe(9)
  })

  it("correção de metadados adota título/carteira legados sem mudar principal, localKey ou histórico", async () => {
    await seed(false)
    const wallet = await prisma.carteiraFinanceira.create({ data: { storeId: L, nome: "Banco legado", tipo: "banco" } })
    const title = await legacyTitle({ carteiraId: wallet.id })
    await result(await corrigirTitulo(request({ ...corrected, tituloId: title.id, novoVencimento: "30/10/2026", novaObservacao: "Fixture" }), params()))
    const updated = await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: title.id } })
    expect(updated).toMatchObject({ localKey: title.localKey, valor: title.valor, vencimento: "30/10/2026", carteiraId: wallet.id })
    expect(updated.payload).toMatchObject({ marcadorHistorico: "preservar", observacao: "Fixture" })
    expect(updated.perfilId).toBeTruthy()
    expect((await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: wallet.id } })).perfilId).toBe(updated.perfilId)
    expect(await prisma.movimentacaoFinanceira.count({ where: { storeId: L } })).toBe(0)
  })

  it("propagação de cliente atribui perfil ao título e preserva principal e payload", async () => {
    await seed(false)
    const title = await legacyTitle()
    await result(await corrigir(request({ ...corrected, novoClienteId: null, novoClienteNome: "Novo cliente fixture" }), params()))
    const updated = await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: title.id } })
    expect(updated).toMatchObject({ cliente: "Novo cliente fixture", valor: title.valor, localKey: title.localKey, payload: title.payload })
    expect(updated.perfilId).toBeTruthy()
    expect(await prisma.movimentacaoFinanceira.count({ where: { storeId: L } })).toBe(0)
  })

  it("cancelamento real devolve estoque, cria saída com perfil e replay não duplica", async () => {
    const { sale } = await seed()
    config.cookies.set(ADMIN_AUTHORIZATION_COOKIE, await createPinAuthorizationToken({
      userId: U, storeId: L, supervisorId: SUP, action: ESTORNO_STEP_UP_ACTION, resource: pedido,
    }, secret))
    await result(await cancelar(request({ motivo: corrected.motivo }), params()))
    const refund = await prisma.movimentacaoFinanceira.findFirstOrThrow({ where: { storeId: L, origem: "cancelamento_pdv" } })
    expect(refund).toMatchObject({ tipo: "saida", valor: 100, referenciaId: pedido })
    expect(refund.perfilId).toBeTruthy(); expect(refund.valorCentavos?.toString()).toBe("10000")
    expect((await prisma.produto.findUniqueOrThrow({ where: { id: product } })).stock).toBe(10)
    expect((await prisma.venda.findUniqueOrThrow({ where: { id: sale.id } })).status).toBe("cancelada")
    await result(await cancelar(request({ motivo: corrected.motivo }), params()), 409)
    expect(await prisma.movimentacaoFinanceira.count({ where: { origem: "cancelamento_pdv", storeId: L } })).toBe(1)
    expect(await prisma.movimentacaoEstoque.count({ where: { storeId: L } })).toBe(1)
  })

  it("OS V3 provisiona uma empresa/título em concorrência, preserva replay e reverte falha posterior", async () => {
    const input = { storeId: L, osId: "g002-route-OS", codigo: "OS fixture", cliente: "Cliente", total: 85.9, vencimento: "25/10/2026" }
    const titles = await Promise.all(Array.from({ length: 4 }, () => prisma.$transaction(tx => garantirTituloOSTravadoV3(tx, input))))
    expect(new Set(titles.map(t => t!.id)).size).toBe(1)
    expect(titles[0]!.valorCentavos?.toString()).toBe("8590")
    expect(titles[0]!.perfilId).toBe((await prisma.financeiroPerfil.findUniqueOrThrow({ where: { storeId: L } })).id)
    const replay = await prisma.$transaction(tx => garantirTituloOSTravadoV3(tx, { ...input, total: 200 }))
    expect(replay!.valor).toBe(85.9)
    expect(await prisma.perfilMembro.count({ where: { storeId: L } })).toBe(0)
    await expect(prisma.$transaction(async tx => {
      await garantirTituloOSTravadoV3(tx, { ...input, storeId: OTHER })
      throw new Error("G002_LATER_FAILURE")
    })).rejects.toThrow("G002_LATER_FAILURE")
    expect(await prisma.financeiroPerfil.count({ where: { storeId: OTHER } })).toBe(0)
    expect(await prisma.contaReceberTitulo.count({ where: { storeId: OTHER } })).toBe(0)
  })

  it("guards reais recusam loja alheia e título inativo não deixa provisionamento parcial", async () => {
    await seed(false)
    await result(await corrigir(request({ ...corrected, novaFormaPagamento: { pix: 100 } }, OTHER), params()), 403)
    expect(await prisma.financeiroPerfil.count({ where: { storeId: { in: stores } } })).toBe(0)
    const title = await legacyTitle({ ativo: false })
    await result(await corrigirTitulo(request({ ...corrected, tituloId: title.id, novaObservacao: "Negada" }), params()), 503)
    expect((await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: title.id } })).perfilId).toBeNull()
    expect(await prisma.financeiroPerfil.count({ where: { storeId: L } })).toBe(0)
  })
})
