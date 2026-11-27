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
import { randomUUID } from "node:crypto"
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
import { DocumentoStorageFixture } from "@/lib/gastos/documentos-fixture"
import { requireFinanceiroPerfilAccess } from "@/lib/gastos/access"
import { declararDonoPessoalRls } from "@/lib/gastos/rls-contexto"
import { createRealBoundaryGateway } from "@/lib/gestor-money/gateway"
import { projetarRelatorioFinanceiro } from "@/lib/gestor-money/reports"
import {
  obterDownloadComprovantePrivadoReal,
  registrarComprovantePrivadoReal,
} from "@/lib/gestor-money/server/documents-adapter"
import { GET as statusGet } from "@/app/api/gestor-money/status/route"
import { GET as perfisGet } from "@/app/api/gestor-money/perfis/route"
import { GET as snapshotGet } from "@/app/api/gestor-money/snapshot/route"
import { POST as operacoesPost } from "@/app/api/gestor-money/operacoes/route"
import { PATCH as contasPatch, POST as contasPost } from "@/app/api/gestor-money/contas/route"
import { PATCH as categoriasPatch, POST as categoriasPost } from "@/app/api/gestor-money/categorias/route"
import { POST as cartoesPost } from "@/app/api/gestor-money/cartoes/route"
import { GET as documentosGet, POST as documentosPost } from "@/app/api/gestor-money/documentos/route"
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
  if (pathname === "/api/gestor-money/cartoes") return cartoesPost(req)
  if (pathname === "/api/gestor-money/documentos") return method === "POST" ? documentosPost(req) : documentosGet(req)
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
    })

    afterAll(async () => {
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

    it("3. Fluxo ponta a ponta PESSOAL no PostgreSQL: contas, categorias, despesas idempotentes, receitas, dívidas (parcial+quitação), cartões (3x+fatura), relatórios e lacuna honesta de transferência", async () => {
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

      // Cartão de crédito + Compra parcelada 3x (60001 centavos -> 20001 + 20000 + 20000) + Pagamento da 1ª fatura
      const cardFb = await gw.criarCartao(selPessoal, {
        nome: "Nubank Real",
        bandeira: "Mastercard",
        ultimos4: "4821",
        limiteCentavos: "500000",
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

      snap = (await gw.obterSnapshot(selPessoal))!
      // Saldo esperado: inicial 150000 + receita 40000 - despesa 25075 - divida 80000 - fatura1 20001 = 64924 centavos
      expect(snap.saldoDisponivelCentavos).toBe("64924")
      expect(snap.receitasCentavos).toBe("40000")
      expect(snap.despesasCentavos).toBe("125076")
      expect(snap.contasReceberCentavos).toBe("15000")

      // Relatórios projetados sobre snapshot REAL
      const rel = projetarRelatorioFinanceiro(snap, {
        granularidade: "mensal",
        dataInicio: snap.periodo.dataInicio,
        dataFim: snap.periodo.dataFim,
      })
      expect(rel.totalReceitasCentavos).toBe("40000")
      expect(rel.totalDespesasCentavos).toBe("125076")

      // Transferência PESSOAL falha honestamente com 501 (lacuna G004 documentada)
      await expect(
        gw.transferir(selPessoal, {
          carteiraOrigemId: contaBanco.operacaoId,
          carteiraDestinoId: contaPix.operacaoId,
          valorCentavos: "10000",
          dataTransferencia: hoje,
          descricao: "Tentativa Pessoal",
        })
      ).rejects.toMatchObject({ code: "transferencia_pessoal_pendente_g004" })

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

    it("5. Comprovantes privados (G003) e Assistente WhatsApp (G007): upload HTTP bloqueado fora de fixture, adapter G003 validado com isolamento e WhatsApp desconectado", async () => {
      const s = await seedScenario()
      loginAs(s.U1, [s.L1])
      const selPessoal = { tipo: "PESSOAL" as const, perfilId: s.P1 }

      // HTTP POST /documentos sem storage real -> 503 honesto (sem contratar serviço externo)
      const uploadRes = await documentosPost(
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
      expect(uploadRes.status).toBe(503)
      expect((await uploadRes.json()).code).toBe("documentos_storage_privado_pendente_g003")

      // Adapter G003 com DocumentoStorageFixture descartável: grava, lista e gera download assinado isolado
      const ctxU1 = await requireFinanceiroPerfilAccess(selPessoal, "edit")
      expect(ctxU1.ok).toBe(true)
      const storage = new DocumentoStorageFixture()
      const doc = await registrarComprovantePrivadoReal(
        ctxU1.ok ? ctxU1.contexto : null!,
        { nomeArquivo: "nota-pessoal.txt", conteudo: Buffer.from("comprovante-g003-real") },
        storage
      )
      expect(doc.estado).toBe("DISPONIVEL")

      const dl = await obterDownloadComprovantePrivadoReal(
        ctxU1.ok ? ctxU1.contexto : null!,
        doc.id,
        storage
      )
      expect(dl.signedUrl).toContain("fixture-private://download/")
      expect((await storage.consumirDownload(dl.signedUrl)).toString("utf8")).toBe("comprovante-g003-real")

      // HTTP GET /documentos lista metadados reais do perfil
      const listRes = await documentosGet(
        new Request(`http://localhost/api/gestor-money/documentos?tipo=PESSOAL&perfilId=${s.P1}`)
      )
      expect(listRes.status).toBe(200)
      expect((await listRes.json()).documentos.some((d: { id: string }) => d.id === doc.id)).toBe(true)

      // U2 NÃO consegue baixar nem listar documento privado de U1
      loginAs(s.U2, [s.L1])
      const crossDocList = await documentosGet(
        new Request(`http://localhost/api/gestor-money/documentos?tipo=PESSOAL&perfilId=${s.P1}`)
      )
      expect(crossDocList.status).toBe(403)

      // Assistente WhatsApp permanece desconectado até G007
      loginAs(s.U1, [s.L1])
      const gw = createRealBoundaryGateway(inProcessFetch)
      const assist = await gw.obterAssistenteConfig(selPessoal)
      expect(assist.estadoConexao).toBe("DESCONECTADO_AGUARDANDO_G007")
      expect(assist.podeAlterarConexaoReal).toBe(false)
    })
  }
)
