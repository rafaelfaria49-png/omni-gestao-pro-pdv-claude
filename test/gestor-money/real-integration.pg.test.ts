/**
 * OMNI-GESTOR-MONEY-UI-REAL-INTEGRATION-001
 *
 * Integração real ponta a ponta entre:
 *   createRealBoundaryGateway -> Rotas HTTP /api/gestor-money/* -> lib/gastos/* -> PostgreSQL 17 descartável (com RLS)
 *
 * - Somente identidade NextAuth é fixture; banco, Prisma, RLS, centavos, idempotência e G001–G006 são 100% reais.
 * - Exige `GESTOR_MONEY_REAL_PG_URL` apontando exclusivamente para banco loopback descartável.
 * - Nunca toca Production.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto"
import type { Session } from "next-auth"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { modulosSinteticos } from "@/test/gastos/sessao-modulos"
import { localFixtureDatasource } from "@/lib/db/datasource-policy.mjs"

const pgConfig = vi.hoisted(() => {
  const raw = (process.env.GESTOR_MONEY_REAL_PG_URL ?? "").trim()
  if (!raw) return { enabled: false as const, url: "" }
  const u = new URL(raw)
  if (!["127.0.0.1", "localhost"].includes(u.hostname)) {
    throw new Error("GESTOR_MONEY_REAL_PG_URL deve apontar exclusivamente para loopback descartável.")
  }
  return { enabled: true as const, url: raw }
})

const sessionState = vi.hoisted(() => ({
  current: null as Session | null,
}))

vi.mock("@/auth", () => ({
  auth: async () => sessionState.current,
}))

vi.mock("@/lib/prisma", async () => {
  if (!pgConfig.enabled) {
    return { prisma: null, prismaEnsureConnected: async () => {} }
  }
  const { PrismaClient } = await import("@/generated/prisma")
  const client = new PrismaClient({ datasources: { db: { url: pgConfig.url } }, log: [] })
  return { prisma: client, prismaEnsureConnected: () => client.$connect() }
})

import { prisma } from "@/lib/prisma"
import {
  cancelarPareamentoWhatsApp,
  gerarCodigoVinculoWhatsApp,
  revogarVinculoWhatsApp,
  situacaoVinculoWhatsApp,
} from "@/app/actions/gestor-money-vinculo"
import {
  CONSENTIMENTO_VERSAO_ATUAL,
  confirmarPareamentoPorMensagem,
} from "@/lib/gestor-money-assistente/whatsapp/vinculo"
import { DocumentoStorageFixture } from "@/lib/gastos/documentos-fixture"
import {
  criarStoragePrivadoR2G003,
  type VerificadorPrivacidadeR2G003,
} from "@/lib/gastos/documentos-storage"
import { declararDonoPessoalRls } from "@/lib/gastos/rls-contexto"
import { createRealBoundaryGateway } from "@/lib/gestor-money/gateway"
import { projetarRelatorioFinanceiro } from "@/lib/gestor-money/reports"
import {
  definirStorageComprovantesTeste,
} from "@/lib/gestor-money/server/documents-adapter"
import { GET as statusGet } from "@/app/api/gestor-money/status/route"
import { GET as perfisGet } from "@/app/api/gestor-money/perfis/route"
import { GET as snapshotGet } from "@/app/api/gestor-money/snapshot/route"
import { POST as operacoesPost } from "@/app/api/gestor-money/operacoes/route"
import { PATCH as contasPatch, POST as contasPost } from "@/app/api/gestor-money/contas/route"
import { PATCH as categoriasPatch, POST as categoriasPost } from "@/app/api/gestor-money/categorias/route"
import {
  GET as cartoesGet,
  PATCH as cartoesPatch,
  POST as cartoesPost,
} from "@/app/api/gestor-money/cartoes/route"
import { GET as cartaoLimitesGet } from "@/app/api/gestor-money/cartoes/[cartaoId]/limites/route"
import { GET as documentosGet, POST as documentosPost } from "@/app/api/gestor-money/documentos/route"
import { GET as documentoDownloadGet } from "@/app/api/gestor-money/documentos/[documentoId]/download/route"
import { GET as assistenteGet } from "@/app/api/gestor-money/assistente/route"

function inProcessFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const fullUrl = url.startsWith("http") ? url : `http://localhost${url}`
  const method = (init?.method ?? "GET").toUpperCase()
  const req = new Request(fullUrl, {
    method,
    headers: init?.headers,
    body: init?.body,
  })
  const pathname = new URL(fullUrl).pathname

  if (pathname === "/api/gestor-money/status") return statusGet()
  if (pathname === "/api/gestor-money/perfis") return perfisGet()
  if (pathname === "/api/gestor-money/snapshot") return snapshotGet(req)
  if (pathname === "/api/gestor-money/operacoes") return operacoesPost(req)
  if (pathname === "/api/gestor-money/contas") return method === "PATCH" ? contasPatch(req) : contasPost(req)
  if (pathname === "/api/gestor-money/categorias") return method === "PATCH" ? categoriasPatch(req) : categoriasPost(req)
  if (pathname === "/api/gestor-money/cartoes") {
    if (method === "GET") return cartoesGet(req)
    return method === "PATCH" ? cartoesPatch(req) : cartoesPost(req)
  }
  const cartaoLimitesMatch = /^\/api\/gestor-money\/cartoes\/([^/]+)\/limites$/.exec(pathname)
  if (cartaoLimitesMatch) {
    return cartaoLimitesGet(req, {
      params: Promise.resolve({ cartaoId: decodeURIComponent(cartaoLimitesMatch[1]) }),
    })
  }
  if (pathname === "/api/gestor-money/documentos") return method === "POST" ? documentosPost(req) : documentosGet(req)
  const docDownloadMatch = /^\/api\/gestor-money\/documentos\/([^/]+)\/download$/.exec(pathname)
  if (docDownloadMatch) {
    return documentoDownloadGet(req, {
      params: Promise.resolve({ documentoId: decodeURIComponent(docDownloadMatch[1]) }),
    })
  }
  if (pathname === "/api/gestor-money/assistente") return assistenteGet(req)

  return Promise.resolve(new Response(JSON.stringify({ ok: false, code: "not_found" }), { status: 404 }))
}

function loginAs(userId: string, allowedStoreIds: string[], role = "ADMIN") {
  sessionState.current = {
    expires: "2099-01-01T00:00:00.000Z",
    user: {
      id: userId,
      role,
      name: `User ${userId}`,
      storeAccess: "restricted",
      allowedStoreIds,
      storeModules: modulosSinteticos(allowedStoreIds),
      lojaId: allowedStoreIds[0] ?? null,
    },
  } as Session
}

describe.skipIf(!pgConfig.enabled)(
  "Gestor Money — Integração Real UI -> API -> lib/gastos -> PostgreSQL descartável",
  () => {
    const prevFlag = process.env.GESTOR_MONEY_ENABLED

    beforeAll(async () => {
      localFixtureDatasource(pgConfig.url)
      // Verifica papel de runtime não superusuário e NOBYPASSRLS (prova de RLS real)
      const [role] = await prisma.$queryRaw<
        Array<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>
      >`SELECT current_user AS rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`
      expect(role.rolsuper).toBe(false)
      expect(role.rolbypassrls).toBe(false)
    })

    beforeEach(() => {
      process.env.GESTOR_MONEY_ENABLED = "true"
      sessionState.current = null
      definirStorageComprovantesTeste(null)
    })

    afterAll(async () => {
      definirStorageComprovantesTeste(null)
      if (prevFlag === undefined) delete process.env.GESTOR_MONEY_ENABLED
      else process.env.GESTOR_MONEY_ENABLED = prevFlag
      await prisma.$disconnect()
    })

    async function seedScenario() {
      const tag = `gmint-${randomUUID().slice(0, 8)}`
      const L1 = `${tag}-L1`
      const L2 = `${tag}-L2`
      const U1 = `${tag}-U1`
      const U2 = `${tag}-U2`
      const E1 = `${tag}-E1`
      const P1 = `${tag}-P1`
      const P2 = `${tag}-P2`

      await prisma.store.createMany({
        data: [
          { id: L1, name: "Loja Matriz Real" },
          { id: L2, name: "Loja Filial Real" },
        ],
      })
      await prisma.adminUser.createMany({
        data: [
          { id: U1, email: `${U1}@example.invalid`, password: "synthetic-only", role: "ADMIN", lojaId: L1 },
          { id: U2, email: `${U2}@example.invalid`, password: "synthetic-only", role: "ADMIN", lojaId: L1 },
        ],
      })
      await prisma.adminUserStore.createMany({
        data: [
          { adminUserId: U1, storeId: L1 },
          { adminUserId: U2, storeId: L1 },
        ],
      })
      await prisma.financeiroPerfil.create({
        data: { id: E1, tipo: "EMPRESA", storeId: L1 },
      })
      await prisma.perfilMembro.createMany({
        data: [
          { perfilId: E1, storeId: L1, adminUserId: U1 },
          { perfilId: E1, storeId: L1, adminUserId: U2 },
        ],
      })
      // Perfis PESSOAL precisam de RLS transacional (app.gm_owner_user) no runtime restrito
      await prisma.$transaction(async (tx) => {
        await declararDonoPessoalRls(tx, U1)
        await tx.financeiroPerfil.create({ data: { id: P1, tipo: "PESSOAL", ownerAdminUserId: U1 } })
      })
      await prisma.$transaction(async (tx) => {
        await declararDonoPessoalRls(tx, U2)
        await tx.financeiroPerfil.create({ data: { id: P2, tipo: "PESSOAL", ownerAdminUserId: U2 } })
      })

      return { L1, L2, U1, U2, E1, P1, P2 }
    }

    it("1. Dormência e segurança: flag desligada bloqueia todas as rotas operacionais (404) com headers privados", async () => {
      delete process.env.GESTOR_MONEY_ENABLED
      const s = await seedScenario()
      loginAs(s.U1, [s.L1])

      const stRes = await statusGet()
      expect(stRes.status).toBe(200)
      expect((await stRes.json()).state).toBe("MODULE_DISABLED")

      const pRes = await perfisGet()
      expect(pRes.status).toBe(404)
      expect(pRes.headers.get("Cache-Control")).toBe("private, no-store, max-age=0")

      const snapRes = await snapshotGet(
        new Request(`http://localhost/api/gestor-money/snapshot?tipo=PESSOAL&perfilId=${s.P1}`)
      )
      expect(snapRes.status).toBe(404)
    })

    it("2. G001 Isolamento PESSOAL vs EMPRESA, sem loja fictícia, sem acesso cruzado nem sem sessão", async () => {
      const s = await seedScenario()

      // Sem sessão -> 401
      const unauth = await perfisGet()
      expect(unauth.status).toBe(401)

      // U1 lista seu PESSOAL (sem storeId) e sua EMPRESA L1
      loginAs(s.U1, [s.L1])
      const gw = createRealBoundaryGateway(inProcessFetch)
      const perfisU1 = await gw.listarPerfis()
      expect(perfisU1).toHaveLength(2)
      const pessoalU1 = perfisU1.find((p) => p.tipo === "PESSOAL")!
      const empresaU1 = perfisU1.find((p) => p.tipo === "EMPRESA")!
      expect(pessoalU1.perfilId).toBe(s.P1)
      expect("storeId" in pessoalU1).toBe(false)
      expect(empresaU1.tipo === "EMPRESA" ? empresaU1.storeId : null).toBe(s.L1)

      // Enviar storeId em seletor PESSOAL deve ser recusado com 422 (jamais loja fictícia)
      const badPersonal = await snapshotGet(
        new Request(`http://localhost/api/gestor-money/snapshot?tipo=PESSOAL&perfilId=${s.P1}&storeId=${s.L1}`)
      )
      expect(badPersonal.status).toBe(422)

      // U2 (mesma loja L1, também ADMIN) NÃO pode ver nem acessar o PESSOAL de U1
      loginAs(s.U2, [s.L1])
      const perfisU2 = await gw.listarPerfis()
      expect(perfisU2.map((p) => p.perfilId)).toContain(s.P2)
      expect(perfisU2.map((p) => p.perfilId)).not.toContain(s.P1)

      const crossRead = await snapshotGet(
        new Request(`http://localhost/api/gestor-money/snapshot?tipo=PESSOAL&perfilId=${s.P1}`)
      )
      expect(crossRead.status).toBe(403)

      // Revogação de PerfilMembro bloqueia acesso de U2 à EMPRESA E1 imediatamente
      await prisma.perfilMembro.update({
        where: { perfilId_adminUserId: { perfilId: s.E1, adminUserId: s.U2 } },
        data: { revogadoEm: new Date() },
      })
      const revokedEmpresa = await snapshotGet(
        new Request(`http://localhost/api/gestor-money/snapshot?tipo=EMPRESA&perfilId=${s.E1}&storeId=${s.L1}`)
      )
      expect(revokedEmpresa.status).toBe(403)
    })

    it("3. Fluxo ponta a ponta PESSOAL no PostgreSQL: contas, categorias, despesas idempotentes, receitas, dívidas (parcial+quitação), cartões (limite null honesto + 3x + fatura), relatórios e TRANSFERENCIA_INTERNA PESSOAL canônica (G004)", async () => {
      const s = await seedScenario()
      loginAs(s.U1, [s.L1])
      const gw = createRealBoundaryGateway(inProcessFetch)
      const selPessoal = { tipo: "PESSOAL" as const, perfilId: s.P1 }

      // Contas & Categorias
      const contaBanco = await gw.criarConta(selPessoal, {
        nome: "Inter Pessoal",
        tipo: "banco",
        saldoInicialCentavos: "100000", // R$ 1.000,00
        instituicao: "Banco Inter",
      })
      const contaPix = await gw.criarConta(selPessoal, {
        nome: "Pix Nubank",
        tipo: "pix",
        saldoInicialCentavos: "50000", // R$ 500,00
        instituicao: "Nubank",
      })
      const catMercado = await gw.criarCategoria(selPessoal, {
        nome: "Supermercado",
        natureza: "DESPESA",
        cor: "#10b981",
        icone: "ShoppingCart",
      })
      const catProLabore = await gw.criarCategoria(selPessoal, {
        nome: "Pró-labore",
        natureza: "RECEITA",
        cor: "#3b82f6",
        icone: "Wallet",
      })

      // Despesa paga + idempotência (replay com mesma chave não duplica!)
      const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
      const chaveIdemp = `idemp-${randomUUID()}`
      const despPayload = {
        seletor: selPessoal,
        chave: chaveIdemp,
        operacao: "despesa",
        payload: {
          descricao: "Mercado Mensal Real",
          valorCentavos: "25075", // R$ 250,75
          dataGasto: hoje,
          pagoAgora: true,
          categoriaId: catMercado.operacaoId,
          carteiraId: contaBanco.operacaoId,
          formaPagamento: "pix",
        },
      }
      const r1 = await operacoesPost(
        new Request("http://localhost/api/gestor-money/operacoes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(despPayload),
        })
      )
      expect(r1.status).toBe(200)
      const b1 = await r1.json()
      const r2 = await operacoesPost(
        new Request("http://localhost/api/gestor-money/operacoes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(despPayload),
        })
      )
      expect(r2.status).toBe(200)
      const b2 = await r2.json()
      expect(b2.feedback.operacaoId).toBe(b1.feedback.operacaoId)

      // Receita recebida (R$ 400,00) + Receita prevista (R$ 150,00)
      await gw.registrarReceita(selPessoal, {
        descricao: "Pró-labore Real",
        valorCentavos: "40000",
        dataRecebimento: hoje,
        recebidoAgora: true,
        categoriaId: catProLabore.operacaoId,
        carteiraId: contaBanco.operacaoId,
        formaPagamento: "transferencia",
      })
      await gw.registrarReceita(selPessoal, {
        descricao: "Reembolso Previsto",
        valorCentavos: "15000",
        dataRecebimento: hoje,
        recebidoAgora: false,
        vencimento: hoje,
        categoriaId: catProLabore.operacaoId,
        carteiraId: contaPix.operacaoId,
        formaPagamento: "pix",
      })

      // Dívida (R$ 800,00) -> Pagamento parcial (R$ 200,00) -> Quitação (R$ 600,00)
      await gw.registrarDivida(selPessoal, {
        credor: "Clínica Real",
        descricao: "Tratamento Real",
        valorOriginalCentavos: "80000",
        vencimento: hoje,
        parcelasTotal: 4,
        categoriaId: catMercado.operacaoId,
      })
      let snap = (await gw.obterSnapshot(selPessoal))!
      expect(snap.proveniencia).toBe("REAL")
      const divida = snap.dividas.find((d) => d.descricao === "Tratamento Real")!
      expect(divida.saldoRestanteCentavos).toBe("80000")

      await gw.pagarDivida(selPessoal, {
        dividaId: divida.id,
        quitar: false,
        valorCentavos: "20000",
        carteiraId: contaBanco.operacaoId,
        formaPagamento: "pix",
        dataPagamento: hoje,
      })
      snap = (await gw.obterSnapshot(selPessoal))!
      const divParcial = snap.dividas.find((d) => d.id === divida.id)!
      expect(divParcial.valorPagoCentavos).toBe("20000")
      expect(divParcial.saldoRestanteCentavos).toBe("60000")
      expect(divParcial.status).toBe("parcial")

      await gw.pagarDivida(selPessoal, {
        dividaId: divida.id,
        quitar: true,
        carteiraId: contaBanco.operacaoId,
        formaPagamento: "pix",
        dataPagamento: hoje,
      })
      snap = (await gw.obterSnapshot(selPessoal))!
      const divQuitada = snap.dividas.find((d) => d.id === divida.id)!
      expect(divQuitada.saldoRestanteCentavos).toBe("0")
      expect(divQuitada.status).toBe("quitada")

      // Cartão de crédito (sem limite fictício R$ 0,00 -> null) + Compra parcelada 3x (60001 centavos -> 20001 + 20000 + 20000) + Pagamento da 1ª fatura
      const cardFb = await gw.criarCartao(selPessoal, {
        nome: "Nubank Real",
        bandeira: "Mastercard",
        ultimos4: "4821",
        fechamentoDia: 5,
        vencimentoDia: 12,
      })
      await gw.registrarCompraCartao(selPessoal, {
        cartaoId: cardFb.operacaoId,
        descricao: "Monitor Real",
        estabelecimento: "Loja Tech",
        valorTotalCentavos: "60001",
        parcelasTotal: 3,
        categoriaId: catMercado.operacaoId,
        dataCompra: hoje,
      })
      snap = (await gw.obterSnapshot(selPessoal))!
      const card = snap.cartoes.find((c) => c.id === cardFb.operacaoId)!
      expect(card.limiteCentavos).toBeNull()
      expect(card.disponivelCentavos).toBeNull()
      expect(card.limiteExcedidoCentavos).toBeNull()
      expect(card.limiteComprometidoPercentual).toBeNull()
      expect(card.limitePersistenciaDisponivel).toBe(true)
      expect(card.ciclos.length).toBe(3)
      expect(card.ciclos[0].totalCentavos).toBe("20001")
      expect(card.ciclos[1].totalCentavos).toBe("20000")
      expect(card.ciclos[2].totalCentavos).toBe("20000")

      await gw.pagarFatura(selPessoal, {
        cartaoId: card.id,
        cicloId: card.ciclos[0].id,
        carteiraId: contaPix.operacaoId,
        formaPagamento: "pix",
        dataPagamento: hoje,
      })

      // Transferência interna PESSOAL via contrato canônico G004 (`TRANSFERENCIA_INTERNA` — elimina 501!)
      const transfChave = `transf-p-${randomUUID()}`
      const transfReqBody = {
        seletor: selPessoal,
        chave: transfChave,
        operacao: "transferir",
        payload: {
          carteiraOrigemId: contaBanco.operacaoId,
          carteiraDestinoId: contaPix.operacaoId,
          valorCentavos: "10000", // R$ 100,00
          dataTransferencia: hoje,
          descricao: "Reforço Pix Pessoal",
        },
      }
      const tr1 = await operacoesPost(
        new Request("http://localhost/api/gestor-money/operacoes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(transfReqBody),
        })
      )
      expect(tr1.status).toBe(200)
      const tr1Body = await tr1.json()
      expect(tr1Body.feedback.contratoG004).toBe("TRANSFERENCIA_INTERNA")
      // Replay idempotente com mesma chave não duplica movimentação
      const tr2 = await operacoesPost(
        new Request("http://localhost/api/gestor-money/operacoes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(transfReqBody),
        })
      )
      expect(tr2.status).toBe(200)
      expect((await tr2.json()).feedback.operacaoId).toBe(tr1Body.feedback.operacaoId)

      snap = (await gw.obterSnapshot(selPessoal))!
      // Saldo consolidado inalterado pela transferência: 150000 + 40000 - 25075 - 80000 - 20001 = 64924 centavos
      expect(snap.saldoDisponivelCentavos).toBe("64924")
      expect(snap.receitasCentavos).toBe("40000")
      expect(snap.despesasCentavos).toBe("125076")
      expect(snap.contasReceberCentavos).toBe("15000")
      // Saldos individuais refletem exatamente a transferência de R$ 100,00:
      // Banco: 100000 + 40000 - 25075 - 80000 - 10000 = 24925 | Pix: 50000 - 20001 + 10000 = 39999
      expect(snap.contas.find((c) => c.id === contaBanco.operacaoId)?.saldoCentavos).toBe("24925")
      expect(snap.contas.find((c) => c.id === contaPix.operacaoId)?.saldoCentavos).toBe("39999")

      // Relatórios projetados sobre snapshot REAL
      const rel = projetarRelatorioFinanceiro(snap, {
        granularidade: "mensal",
        dataInicio: snap.periodo.dataInicio,
        dataFim: snap.periodo.dataFim,
      })
      expect(rel.totalReceitasCentavos).toBe("40000")
      expect(rel.totalDespesasCentavos).toBe("125076")

      // Isolamento absoluto: EMPRESA E1 continua 100% intocada (0 saldo, 0 despesas, 0 dívidas)
      const snapEmpresa = (await gw.obterSnapshot({ tipo: "EMPRESA", perfilId: s.E1, storeId: s.L1 }))!
      expect(snapEmpresa.saldoDisponivelCentavos).toBe("0")
      expect(snapEmpresa.despesasCentavos).toBe("0")
      expect(snapEmpresa.dividas).toHaveLength(0)
    })

    it("4. EMPRESA: transferência interna entre carteiras preserva saldo consolidado e não infla despesas/receitas", async () => {
      const s = await seedScenario()
      loginAs(s.U1, [s.L1])
      const gw = createRealBoundaryGateway(inProcessFetch)
      const selEmpresa = { tipo: "EMPRESA" as const, perfilId: s.E1, storeId: s.L1 }
      const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })

      const c1 = await gw.criarConta(selEmpresa, {
        nome: "Bradesco PJ",
        tipo: "banco",
        saldoInicialCentavos: "200000",
      })
      const c2 = await gw.criarConta(selEmpresa, {
        nome: "Caixa Balcão",
        tipo: "dinheiro",
        saldoInicialCentavos: "50000",
      })

      await gw.transferir(selEmpresa, {
        carteiraOrigemId: c1.operacaoId,
        carteiraDestinoId: c2.operacaoId,
        valorCentavos: "30000",
        dataTransferencia: hoje,
        descricao: "Suprimento de caixa",
      })

      const snap = (await gw.obterSnapshot(selEmpresa))!
      expect(snap.saldoDisponivelCentavos).toBe("250000")
      expect(snap.receitasCentavos).toBe("0")
      expect(snap.despesasCentavos).toBe("0")
      expect(snap.contas.find((c) => c.id === c1.operacaoId)?.saldoCentavos).toBe("170000")
      expect(snap.contas.find((c) => c.id === c2.operacaoId)?.saldoCentavos).toBe("80000")
    })

    it("5. Comprovantes privados (G003 upload + URL temporária assinada + bloqueio produtivo honesto + isolamento) e Assistente G007/G008 (PR #417)", async () => {
      const s = await seedScenario()
      loginAs(s.U1, [s.L1])
      const selPessoal = { tipo: "PESSOAL" as const, perfilId: s.P1 }

      // Sem storage injetado e sem flag -> HTTP POST /documentos falha fechado com 503 (flag_desligada)
      const prevStorageFlag = process.env.GESTOR_MONEY_STORAGE_G003_ENABLED
      delete process.env.GESTOR_MONEY_STORAGE_G003_ENABLED
      const uploadBlocked = await documentosPost(
        new Request("http://localhost/api/gestor-money/documentos", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            seletor: selPessoal,
            nomeArquivo: "recibo.txt",
            conteudoBase64: Buffer.from("comprovante sintetico").toString("base64"),
          }),
        })
      )
      expect(uploadBlocked.status).toBe(503)
      expect((await uploadBlocked.json()).code).toBe("flag_desligada")

      // Mesmo com flag=true + R2 config, sem prova de privacidade do bucket -> fail-closed 503 (privacidade_bucket_nao_comprovada)
      const prevR2 = {
        CONTADOR_STORAGE_PROVIDER: process.env.CONTADOR_STORAGE_PROVIDER,
        R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
        R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
        R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
        R2_BUCKET: process.env.R2_BUCKET,
      }
      process.env.GESTOR_MONEY_STORAGE_G003_ENABLED = "true"
      process.env.CONTADOR_STORAGE_PROVIDER = "r2"
      process.env.R2_ACCOUNT_ID = "acc-ci-test"
      process.env.R2_ACCESS_KEY_ID = "key-ci-test"
      process.env.R2_SECRET_ACCESS_KEY = "secret-ci-test"
      process.env.R2_BUCKET = "bucket-ci-privado"
      try {
        const uploadUnproven = await documentosPost(
          new Request("http://localhost/api/gestor-money/documentos", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              seletor: selPessoal,
              nomeArquivo: "recibo.txt",
              conteudoBase64: Buffer.from("comprovante sintetico").toString("base64"),
            }),
          })
        )
        expect(uploadUnproven.status).toBe(503)
        expect((await uploadUnproven.json()).code).toBe("privacidade_bucket_nao_comprovada")
      } finally {
        if (prevStorageFlag === undefined) delete process.env.GESTOR_MONEY_STORAGE_G003_ENABLED
        else process.env.GESTOR_MONEY_STORAGE_G003_ENABLED = prevStorageFlag
        for (const [k, v] of Object.entries(prevR2)) {
          if (v === undefined) delete process.env[k]
          else process.env[k] = v
        }
      }

      // Com adapter G003-STORAGE real (`criarStoragePrivadoR2G003`) conectado a verificador comprovando privacidade R2 (em ambiente de teste)
      const r2BaseFixture = new DocumentoStorageFixture()
      const verificadorPrivado: VerificadorPrivacidadeR2G003 = {
        async verificarPrivacidadeEEscopo(cfg) {
          return {
            bucketExiste: true,
            r2DevPublico: false,
            dominiosPublicosCount: 0,
            probeAnonimoNegado: true,
            escopoCredencial: {
              restritoAoBucket: true,
              escopoGlobalConta: false,
              podeListarTodosBuckets: false,
              bucketAutorizado: cfg.bucket,
            },
          }
        },
      }
      const storage = criarStoragePrivadoR2G003({
        env: {
          GESTOR_MONEY_STORAGE_G003_ENABLED: "true",
          CONTADOR_STORAGE_PROVIDER: "r2",
          R2_ACCOUNT_ID: "acc-ci-test",
          R2_ACCESS_KEY_ID: "key-ci-test",
          R2_SECRET_ACCESS_KEY: "secret-ci-test",
          R2_BUCKET: "bucket-ci-privado",
        },
        storageBase: r2BaseFixture,
        verificadorPrivacidade: verificadorPrivado,
      })
      definirStorageComprovantesTeste(storage)

      const gw = createRealBoundaryGateway(inProcessFetch)
      const contaP = await gw.criarConta(selPessoal, {
        nome: "Conta Comprovante",
        tipo: "banco",
        saldoInicialCentavos: "10000",
      })

      // Arquivo HTML/script deve ser rejeitado pela validação de bytes G003 (422)
      const htmlReject = await documentosPost(
        new Request("http://localhost/api/gestor-money/documentos", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            seletor: selPessoal,
            nomeArquivo: "malicioso.html",
            conteudoBase64: Buffer.from("<script>alert(1)</script>").toString("base64"),
          }),
        })
      )
      expect(htmlReject.status).toBe(422)

      // Upload autenticado válido + vínculo com CONTA via gateway real
      const doc = await gw.enviarComprovante(selPessoal, {
        nomeArquivo: "nota-pessoal.txt",
        conteudoBase64: Buffer.from("comprovante-g003-real").toString("base64"),
        alvo: { tipo: "CONTA", id: contaP.operacaoId },
      })
      expect(doc.estado).toBe("DISPONIVEL")

      // HTTP GET /documentos/[id]/download emite URL temporária (TTL 60s) + Cache-Control privado
      const dlRes = await documentoDownloadGet(
        new Request(`http://localhost/api/gestor-money/documentos/${doc.id}/download?tipo=PESSOAL&perfilId=${s.P1}`),
        { params: Promise.resolve({ documentoId: doc.id }) }
      )
      expect(dlRes.status).toBe(200)
      expect(dlRes.headers.get("Cache-Control")).toBe("private, no-store, max-age=0")
      const dlBody = (await dlRes.json()) as { signedUrl: string; expiresInSec: number }
      expect(dlBody.signedUrl).toContain("fixture-private://download/")
      expect(dlBody.expiresInSec).toBe(60)
      expect((await r2BaseFixture.consumirDownload(dlBody.signedUrl)).toString("utf8")).toBe("comprovante-g003-real")

      // HTTP GET /documentos lista metadados + diagnóstico honesto
      const listRes = await documentosGet(
        new Request(`http://localhost/api/gestor-money/documentos?tipo=PESSOAL&perfilId=${s.P1}`)
      )
      expect(listRes.status).toBe(200)
      const listBody = await listRes.json()
      expect(listBody.documentos.some((d: { id: string }) => d.id === doc.id)).toBe(true)
      expect(listBody.storageDiagnostico.gate).toBe("G003-STORAGE")

      // U2 NÃO consegue listar nem baixar URL temporária do documento privado de U1 (403)
      loginAs(s.U2, [s.L1])
      const crossDocList = await documentosGet(
        new Request(`http://localhost/api/gestor-money/documentos?tipo=PESSOAL&perfilId=${s.P1}`)
      )
      expect(crossDocList.status).toBe(403)
      const crossDownload = await documentoDownloadGet(
        new Request(`http://localhost/api/gestor-money/documentos/${doc.id}/download?tipo=PESSOAL&perfilId=${s.P1}`),
        { params: Promise.resolve({ documentoId: doc.id }) }
      )
      expect(crossDownload.status).toBe(403)

      // Assistente WhatsApp permanece desconectado até G007 e expõe alinhamento G007/G008 (PR #417)
      loginAs(s.U1, [s.L1])
      const assist = await gw.obterAssistenteConfig(selPessoal)
      expect(assist.estadoConexao).toBe("DESCONECTADO_AGUARDANDO_G007")
      expect(assist.podeAlterarConexaoReal).toBe(false)
      expect(assist.alinhamentoG007?.principalAutorizadoAtual).toBe("SESSAO_WEB")
      expect(assist.alinhamentoG007?.verificadorVinculoDisponivel).toBe(false)
      expect(assist.alinhamentoG007?.homologacoes.whatsappOficial).toBe(false)
    })

    it("6. Cartões canônicos (PR #405 6c67cbb): cadastro/edição/remoção de limite, histórico imutável, comprometimento integral 3x, bloqueio limite_cartao_insuficiente (409), recomposição parcial/total, idempotência e isolamento RLS", async () => {
      const s = await seedScenario()
      loginAs(s.U1, [s.L1])
      const gw = createRealBoundaryGateway(inProcessFetch)
      const selPessoal = { tipo: "PESSOAL" as const, perfilId: s.P1 }
      const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })

      const conta = await gw.criarConta(selPessoal, {
        nome: "Conta Fatura",
        tipo: "banco",
        saldoInicialCentavos: "200000", // R$ 2.000,00
      })
      const cat = await gw.criarCategoria(selPessoal, {
        nome: "Eletrônicos",
        natureza: "DESPESA",
        cor: "#3b82f6",
        icone: "Tag",
      })

      // 1. Cadastrar cartão com limite inicial de R$ 1.000,00 (100000 centavos)
      const cardFb = await gw.criarCartao(selPessoal, {
        nome: "Visa Black Canônico",
        bandeira: "Visa",
        ultimos4: "7788",
        limiteCentavos: "100000",
        motivo: "Limite inicial aprovado",
        fechamentoDia: 5,
        vencimentoDia: 12,
      })

      let snap = (await gw.obterSnapshot(selPessoal))!
      // Limite de crédito NUNCA entra no saldo disponível das contas!
      expect(snap.saldoDisponivelCentavos).toBe("200000")

      let card = snap.cartoes.find((c) => c.id === cardFb.operacaoId)!
      expect(card.limiteCentavos).toBe("100000")
      expect(card.usadoCentavos).toBe("0")
      expect(card.disponivelCentavos).toBe("100000")
      expect(card.limiteExcedidoCentavos).toBe("0")
      expect(card.limiteComprometidoPercentual).toBe(0)
      expect(card.politicaComprometimento).toBe("COMPROMETIMENTO_INTEGRAL_COMPRA_RECOMPOSICAO_NO_PAGAMENTO")
      expect(card.historicoLimites).toHaveLength(1)
      expect(card.historicoLimites[0].acao).toBe("CADASTRO")
      expect(card.historicoLimites[0].motivo).toBe("Limite inicial aprovado")

      // 2. Compra parcelada em 3x de R$ 600,00 (60000 centavos) com idempotência explícita
      const chaveCompra = `compra-3x-${randomUUID()}`
      const compraBody = {
        seletor: selPessoal,
        chave: chaveCompra,
        operacao: "compra_cartao",
        payload: {
          cartaoId: card.id,
          descricao: "Cadeira Ergonômica",
          estabelecimento: "Office Store",
          valorTotalCentavos: "60000",
          parcelasTotal: 3,
          categoriaId: cat.operacaoId,
          dataCompra: hoje,
        },
      }
      const c1 = await operacoesPost(
        new Request("http://localhost/api/gestor-money/operacoes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(compraBody),
        })
      )
      expect(c1.status).toBe(200)
      const c1Json = await c1.json()
      // Replay idempotente com a mesma chave devolve a mesma operação sem comprometer o limite 2x
      const c2 = await operacoesPost(
        new Request("http://localhost/api/gestor-money/operacoes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(compraBody),
        })
      )
      expect(c2.status).toBe(200)
      expect((await c2.json()).feedback.operacaoId).toBe(c1Json.feedback.operacaoId)

      snap = (await gw.obterSnapshot(selPessoal))!
      card = snap.cartoes.find((c) => c.id === card.id)!
      // Comprometimento integral das 3 parcelas (60000) imediatamente!
      expect(card.usadoCentavos).toBe("60000")
      expect(card.disponivelCentavos).toBe("40000")
      expect(card.limiteComprometidoPercentual).toBe(60)
      expect(card.ciclos).toHaveLength(3)
      expect(card.ciclos[0].totalCentavos).toBe("20000")
      expect(card.ciclos[1].totalCentavos).toBe("20000")
      expect(card.ciclos[2].totalCentavos).toBe("20000")

      // 3. Compra excedendo o limite disponível (R$ 450,00 > R$ 400,00) -> 409 limite_cartao_insuficiente
      const exceedRes = await operacoesPost(
        new Request("http://localhost/api/gestor-money/operacoes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            seletor: selPessoal,
            chave: `exceed-${randomUUID()}`,
            operacao: "compra_cartao",
            payload: {
              cartaoId: card.id,
              descricao: "Compra Acima Limite",
              estabelecimento: "Loja Y",
              valorTotalCentavos: "45000",
              parcelasTotal: 2,
              categoriaId: cat.operacaoId,
              dataCompra: hoje,
            },
          }),
        })
      )
      expect(exceedRes.status).toBe(409)
      const exceedJson = await exceedRes.json()
      expect(exceedJson.code).toBe("limite_cartao_insuficiente")

      // 4. Pagamento parcial da 1ª fatura (R$ 100,00 de R$ 200,00) -> recompõe R$ 100,00
      await gw.pagarFatura(selPessoal, {
        cartaoId: card.id,
        cicloId: card.ciclos[0].id,
        carteiraId: conta.operacaoId,
        formaPagamento: "pix",
        dataPagamento: hoje,
        valorCentavos: "10000",
      })
      snap = (await gw.obterSnapshot(selPessoal))!
      card = snap.cartoes.find((c) => c.id === card.id)!
      expect(card.usadoCentavos).toBe("50000")
      expect(card.disponivelCentavos).toBe("50000")
      expect(card.ciclos[0].pagoCentavos).toBe("10000")
      expect(card.ciclos[0].restanteCentavos).toBe("10000")

      // 5. Quitação do restante da 1ª fatura (R$ 100,00) -> recompõe mais R$ 100,00
      await gw.pagarFatura(selPessoal, {
        cartaoId: card.id,
        cicloId: card.ciclos[0].id,
        carteiraId: conta.operacaoId,
        formaPagamento: "pix",
        dataPagamento: hoje,
      })
      snap = (await gw.obterSnapshot(selPessoal))!
      card = snap.cartoes.find((c) => c.id === card.id)!
      expect(card.usadoCentavos).toBe("40000")
      expect(card.disponivelCentavos).toBe("60000")
      expect(card.ciclos[0].restanteCentavos).toBe("0")
      expect(card.ciclos[0].status).toBe("paga")

      // 6. Editar limite (ALTERACAO -> 150000) + Remover limite (REMOCAO -> null)
      await gw.editarCartao(selPessoal, {
        cartaoId: card.id,
        limiteCentavos: "150000",
        motivo: "Aumento solicitado",
      })
      snap = (await gw.obterSnapshot(selPessoal))!
      card = snap.cartoes.find((c) => c.id === card.id)!
      expect(card.limiteCentavos).toBe("150000")
      expect(card.disponivelCentavos).toBe("110000")

      await gw.editarCartao(selPessoal, {
        cartaoId: card.id,
        limiteCentavos: null,
        motivo: "Sem limite definido",
      })
      const historicoEndpoint = await gw.obterHistoricoLimiteCartao(selPessoal, card.id)
      expect(historicoEndpoint.map((e) => e.acao)).toEqual(["CADASTRO", "ALTERACAO", "REMOCAO"])

      // 7. Isolamento RLS: U2 não pode ler histórico nem editar cartão pessoal de U1 (403)
      loginAs(s.U2, [s.L1])
      const crossEdit = await cartoesPatch(
        new Request("http://localhost/api/gestor-money/cartoes", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            seletor: selPessoal,
            payload: { cartaoId: card.id, limiteCentavos: "500000" },
          }),
        })
      )
      expect(crossEdit.status).toBe(403)
      const crossHist = await cartaoLimitesGet(
        new Request(`http://localhost/api/gestor-money/cartoes/${card.id}/limites?tipo=PESSOAL&perfilId=${s.P1}`),
        { params: Promise.resolve({ cartaoId: card.id }) }
      )
      expect(crossHist.status).toBe(403)
    })

    it("7. Pareamento WhatsApp G007/G008 ponta a ponta via Server Actions canônicas + PG 17: sem vínculo, pendente, cancelamento, código inválido/bloqueado, expirado, telefone já vinculado, confirmado, novo pareamento, revogação, isolamento e canal indisponível", async () => {
      const s = await seedScenario()
      const selPessoal = { tipo: "PESSOAL" as const, perfilId: s.P1 }
      const prevWaFlag = process.env.GESTOR_MONEY_WHATSAPP_GESTAO
      const prevWaNum = process.env.GESTOR_MONEY_WHATSAPP_NUMERO_EXIBICAO
      const telU1A = `+55119${String(Math.floor(10000000 + Math.random() * 89999999))}`
      const telU1B = `+55119${String(Math.floor(10000000 + Math.random() * 89999999))}`

      try {
        // 1. Canal oficial desligado (GESTOR_MONEY_WHATSAPP_GESTAO ausente) -> todas as actions retornam Indisponível
        delete process.env.GESTOR_MONEY_WHATSAPP_GESTAO
        loginAs(s.U1, [s.L1])
        expect(await situacaoVinculoWhatsApp()).toEqual({ ok: false, erro: "Indisponível." })
        expect(
          await gerarCodigoVinculoWhatsApp({ telefoneE164: telU1A, aceitouConsentimento: true })
        ).toEqual({ ok: false, erro: "Indisponível." })
        expect(await cancelarPareamentoWhatsApp()).toEqual({ ok: false, erro: "Indisponível." })
        expect(await revogarVinculoWhatsApp()).toEqual({ ok: false, erro: "Indisponível." })

        const gw = createRealBoundaryGateway(inProcessFetch)
        const assistOff = await gw.obterAssistenteConfig(selPessoal)
        expect(assistOff.estadoConexao).toBe("DESCONECTADO_AGUARDANDO_G007")
        expect(assistOff.podeAlterarConexaoReal).toBe(false)

        // 2. Flag ligada, mas SEM canal oficial disponível (sem GESTOR_MONEY_WHATSAPP_NUMERO_EXIBICAO e whatsapp_canais isolada por RLS) -> estadoConexao = CANAL_INATIVO (NUNCA ATIVO!)
        process.env.GESTOR_MONEY_WHATSAPP_GESTAO = "ligado"
        delete process.env.GESTOR_MONEY_WHATSAPP_NUMERO_EXIBICAO
        const assistSemCanal = await gw.obterAssistenteConfig(selPessoal)
        expect(assistSemCanal.estadoConexao).toBe("CANAL_INATIVO")
        expect(assistSemCanal.podeAlterarConexaoReal).toBe(false)

        // Prova de isolamento RLS G006: runtime web (NOBYPASSRLS) não consegue criar/alterar whatsapp_canais
        const numSuffix = String(Math.floor(1000000000 + Math.random() * 8999999999))
        await expect(
          prisma.whatsAppCanal.create({
            data: {
              papel: "GESTAO",
              storeId: null,
              phoneNumberId: `700${numSuffix}`,
              wabaId: "700007",
              appId: "710007",
              telefoneE164: `+55119${numSuffix.slice(0, 8)}`,
              credencialRef: "WHATSAPP_CANAL_TOKEN_GM_CI_SYNTHETIC",
              ativo: false,
              versao: 1,
            },
          })
        ).rejects.toThrow()

        // 3. Configura exibição do canal oficial GESTAO para validar fluxo completo no runtime web
        process.env.GESTOR_MONEY_WHATSAPP_NUMERO_EXIBICAO = "+5511999990001"

        // Sem sessão -> actions retornam Indisponível (fail-closed)
        sessionState.current = null
        expect(await situacaoVinculoWhatsApp()).toEqual({ ok: false, erro: "Indisponível." })

        // Login como U1 -> SEM_VINCULO + canal oficial ativo
        loginAs(s.U1, [s.L1])
        const assistPronto = await gw.obterAssistenteConfig(selPessoal)
        expect(assistPronto.estadoConexao).toBe("AGUARDANDO_VINCULO")
        expect(assistPronto.podeAlterarConexaoReal).toBe(true)
        expect(assistPronto.canalAtivo).toBe(true)

        const sit0 = await situacaoVinculoWhatsApp()
        expect(sit0.ok).toBe(true)
        if (!sit0.ok) throw new Error("sit0")
        expect(sit0.dados.estado).toBe("SEM_VINCULO")
        expect(sit0.dados.numeroAssistente).toBe("+5511999990001")

        // Validações de telefone inválido e consentimento ausente
        expect(
          await gerarCodigoVinculoWhatsApp({ telefoneE164: "11999", aceitouConsentimento: true })
        ).toEqual({
          ok: false,
          erro: "Informe o telefone no formato internacional, por exemplo +5511999990000.",
        })
        expect(
          await gerarCodigoVinculoWhatsApp({ telefoneE164: telU1A, aceitouConsentimento: false })
        ).toEqual({
          ok: false,
          erro: "É preciso aceitar os termos de uso do assistente pelo WhatsApp.",
        })

        // Início de pareamento -> PENDENTE (código nunca volta em situacaoVinculoWhatsApp) -> Cancelamento -> SEM_VINCULO
        const d1 = await gerarCodigoVinculoWhatsApp({ telefoneE164: telU1A, aceitouConsentimento: true })
        expect(d1.ok).toBe(true)
        if (!d1.ok) throw new Error("d1")
        expect(d1.dados.codigo).toMatch(/^\d{6}$/)
        const sitPend = await situacaoVinculoWhatsApp()
        expect(sitPend.ok).toBe(true)
        if (!sitPend.ok) throw new Error("sitPend")
        expect(sitPend.dados.estado).toBe("PENDENTE")
        expect(sitPend.dados.pendente?.tentativasRestantes).toBe(5)
        expect(JSON.stringify(sitPend)).not.toContain(d1.dados.codigo)

        const canc = await cancelarPareamentoWhatsApp()
        expect(canc).toEqual({ ok: true, dados: { cancelado: true } })
        const sitAposCanc = await situacaoVinculoWhatsApp()
        expect(sitAposCanc.ok && sitAposCanc.dados.estado).toBe("SEM_VINCULO")
        expect(await confirmarPareamentoPorMensagem(prisma, { remetenteE164: telU1A, texto: d1.dados.codigo })).toEqual({
          tipo: "SEM_DESAFIO",
        })

        // Código expirado -> situacaoVinculoWhatsApp reporta EXPIRADO e confirmação recusa com EXPIRADO
        const expSalt = randomBytes(16).toString("hex")
        const expCriadoEm = new Date(Date.now() - 20 * 60_000)
        const expHash = createHash("sha256").update(`${expSalt}:123123`).digest("hex")
        await prisma.gmAssistDesafio.create({
          data: {
            id: randomUUID(),
            adminUserId: s.U1,
            telefoneE164: telU1A,
            codigoSalt: expSalt,
            codigoHash: expHash,
            pendenteUsuario: s.U1,
            consentimentoVersao: CONSENTIMENTO_VERSAO_ATUAL,
            criadoEm: expCriadoEm,
            expiraEm: new Date(expCriadoEm.getTime() + 10 * 60_000),
          },
        })
        const sitExp = await situacaoVinculoWhatsApp()
        expect(sitExp.ok && sitExp.dados.estado).toBe("EXPIRADO")
        expect(await confirmarPareamentoPorMensagem(prisma, { remetenteE164: telU1A, texto: "123123" })).toEqual({
          tipo: "EXPIRADO",
        })

        // Código inválido (5x) -> BLOQUEADO
        const d2 = await gerarCodigoVinculoWhatsApp({ telefoneE164: telU1A, aceitouConsentimento: true })
        if (!d2.ok) throw new Error("d2")
        const errado = d2.dados.codigo === "000000" ? "111111" : "000000"
        for (let i = 0; i < 4; i++) {
          const r = await confirmarPareamentoPorMensagem(prisma, { remetenteE164: telU1A, texto: errado })
          expect(r.tipo).toBe("CODIGO_INVALIDO")
        }
        expect(await confirmarPareamentoPorMensagem(prisma, { remetenteE164: telU1A, texto: errado })).toEqual({
          tipo: "BLOQUEADO",
        })
        const sitBloq = await situacaoVinculoWhatsApp()
        expect(sitBloq.ok && sitBloq.dados.estado).toBe("BLOQUEADO")

        // Novo pareamento válido -> VINCULADO com telefone mascarado
        const d3 = await gerarCodigoVinculoWhatsApp({ telefoneE164: telU1A, aceitouConsentimento: true })
        if (!d3.ok) throw new Error("d3")
        const conf = await confirmarPareamentoPorMensagem(prisma, { remetenteE164: telU1A, texto: d3.dados.codigo })
        expect(conf.tipo).toBe("VINCULADO")

        const sitVinc = await situacaoVinculoWhatsApp()
        expect(sitVinc.ok).toBe(true)
        if (!sitVinc.ok) throw new Error("sitVinc")
        expect(sitVinc.dados.estado).toBe("VINCULADO")
        expect(sitVinc.dados.vinculado?.telefoneMascarado).toBe(d3.dados.telefoneMascarado)
        expect(JSON.stringify(sitVinc)).not.toContain(telU1A)

        const assistAtivo = await gw.obterAssistenteConfig(selPessoal)
        expect(assistAtivo.estadoConexao).toBe("ATIVO")
        expect(assistAtivo.numeroVinculadoMascarado).toBe(d3.dados.telefoneMascarado)

        // Isolamento entre usuários + Telefone já vinculado a outra conta
        loginAs(s.U2, [s.L1])
        const sitU2 = await situacaoVinculoWhatsApp()
        expect(sitU2.ok && sitU2.dados.estado).toBe("SEM_VINCULO")
        expect(await revogarVinculoWhatsApp()).toEqual({
          ok: false,
          erro: "Não há WhatsApp vinculado à sua conta.",
        })
        const dU2 = await gerarCodigoVinculoWhatsApp({ telefoneE164: telU1A, aceitouConsentimento: true })
        if (!dU2.ok) throw new Error("dU2")
        expect(
          await confirmarPareamentoPorMensagem(prisma, { remetenteE164: telU1A, texto: dU2.dados.codigo })
        ).toEqual({ tipo: "TELEFONE_JA_VINCULADO" })

        // Novo pareamento de U1 para outro telefone substitui o anterior
        loginAs(s.U1, [s.L1])
        const d4 = await gerarCodigoVinculoWhatsApp({ telefoneE164: telU1B, aceitouConsentimento: true })
        if (!d4.ok) throw new Error("d4")
        const sitTroca = await situacaoVinculoWhatsApp()
        expect(sitTroca.ok).toBe(true)
        if (sitTroca.ok) {
          expect(sitTroca.dados.estado).toBe("VINCULADO")
          expect(sitTroca.dados.pendente?.telefoneMascarado).toBe(d4.dados.telefoneMascarado)
        }
        expect(
          (await confirmarPareamentoPorMensagem(prisma, { remetenteE164: telU1B, texto: d4.dados.codigo })).tipo
        ).toBe("VINCULADO")
        const sitNovo = await situacaoVinculoWhatsApp()
        expect(sitNovo.ok && sitNovo.dados.vinculado?.telefoneMascarado).toBe(d4.dados.telefoneMascarado)

        // Indisponibilizar canal oficial com usuário ainda vinculado -> estadoConexao cai imediatamente para CANAL_INATIVO (NUNCA ATIVO!)
        delete process.env.GESTOR_MONEY_WHATSAPP_NUMERO_EXIBICAO
        const assistCanalOff = await gw.obterAssistenteConfig(selPessoal)
        expect(assistCanalOff.estadoConexao).toBe("CANAL_INATIVO")
        expect(assistCanalOff.podeAlterarConexaoReal).toBe(false)

        // Revogação definitiva por U1 -> SEM_VINCULO (2ª revogação falha com SEM_VINCULO)
        process.env.GESTOR_MONEY_WHATSAPP_NUMERO_EXIBICAO = "+5511999990001"
        expect(await revogarVinculoWhatsApp()).toEqual({ ok: true, dados: { revogado: true } })
        const sitRev = await situacaoVinculoWhatsApp()
        expect(sitRev.ok && sitRev.dados.estado).toBe("SEM_VINCULO")
        expect(await revogarVinculoWhatsApp()).toEqual({
          ok: false,
          erro: "Não há WhatsApp vinculado à sua conta.",
        })
      } finally {
        if (prevWaFlag === undefined) delete process.env.GESTOR_MONEY_WHATSAPP_GESTAO
        else process.env.GESTOR_MONEY_WHATSAPP_GESTAO = prevWaFlag
        if (prevWaNum === undefined) delete process.env.GESTOR_MONEY_WHATSAPP_NUMERO_EXIBICAO
        else process.env.GESTOR_MONEY_WHATSAPP_NUMERO_EXIBICAO = prevWaNum
      }
    })
  }
)
