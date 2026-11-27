import { describe, expect, it } from "vitest"
import {
  CATEGORIAS_PADRAO_DESPESA,
  type FinanceiroPerfilSeletor,
} from "@/lib/gestor-money/contracts"
import {
  GestorMoneyBoundaryError,
  createRealBoundaryGateway,
  createSyntheticGestorMoneyGateway,
} from "@/lib/gestor-money/gateway"
import { gerarCsvRelatorio, projetarRelatorioFinanceiro } from "@/lib/gestor-money/reports"
import { isPublicPath } from "@/lib/auth/proxy-session-gate"

describe("Gestor Money — Fronteira Isolada e Contratos G001–G006", () => {
  it("G001: separa integralmente PESSOAL (sem storeId) e EMPRESA (com storeId real)", async () => {
    const gw = createSyntheticGestorMoneyGateway()
    const perfis = await gw.listarPerfis()
    const pessoal = perfis.find((p) => p.tipo === "PESSOAL")!
    const empresa = perfis.find((p) => p.tipo === "EMPRESA")!

    expect(pessoal).toBeDefined()
    expect("storeId" in pessoal).toBe(false)
    expect(empresa.tipo === "EMPRESA" ? empresa.storeId : null).toBeTruthy()

    const selPessoal: FinanceiroPerfilSeletor = { tipo: "PESSOAL", perfilId: pessoal.perfilId }
    const selEmpresa: FinanceiroPerfilSeletor = {
      tipo: "EMPRESA",
      perfilId: empresa.perfilId,
      storeId: empresa.tipo === "EMPRESA" ? empresa.storeId : "",
    }

    const snapAntesEmpresa = await gw.obterSnapshot(selEmpresa)

    // Registrar despesa no perfil PESSOAL não pode alterar EMPRESA
    await gw.registrarDespesa(selPessoal, {
      descricao: "Mercado Pessoal Isolado",
      valorCentavos: "15000",
      dataGasto: "2026-11-27",
      pagoAgora: true,
      categoriaId: "cat-pessoal-supermercado",
      carteiraId: "conta-p-pix",
      formaPagamento: "pix",
    })

    const snapDepoisPessoal = await gw.obterSnapshot(selPessoal)
    const snapDepoisEmpresa = await gw.obterSnapshot(selEmpresa)

    expect(snapDepoisPessoal?.eventos.some((e) => e.descricao === "Mercado Pessoal Isolado")).toBe(true)
    expect(snapDepoisEmpresa?.eventos.some((e) => e.descricao === "Mercado Pessoal Isolado")).toBe(false)
    expect(snapDepoisEmpresa?.saldoDisponivelCentavos).toBe(snapAntesEmpresa?.saldoDisponivelCentavos)

    // PESSOAL com storeId deve ser rejeitado (sem loja fictícia)
    await expect(
      gw.obterSnapshot({
        tipo: "PESSOAL",
        perfilId: pessoal.perfilId,
        storeId: "loja-ficticia",
      } as unknown as FinanceiroPerfilSeletor)
    ).rejects.toThrow(GestorMoneyBoundaryError)
  })

  it("G002: garante as 10 categorias obrigatórias e cria categoria personalizada com deduplicação NFKC", async () => {
    const gw = createSyntheticGestorMoneyGateway()
    const [pessoal] = await gw.listarPerfis()
    const sel: FinanceiroPerfilSeletor = { tipo: "PESSOAL", perfilId: pessoal.perfilId }

    const snap = await gw.obterSnapshot(sel)
    const nomes = snap!.categorias.map((c) => c.nome)
    for (const obrigatoria of CATEGORIAS_PADRAO_DESPESA) {
      expect(nomes).toContain(obrigatoria.nome)
    }

    await gw.criarCategoria(sel, {
      nome: "Assinaturas Digitais",
      natureza: "DESPESA",
      cor: "#6366f1",
      icone: "Tag",
    })

    // Duplicata variando caixa/espaços deve ser rejeitada
    await expect(
      gw.criarCategoria(sel, {
        nome: "  assinaturas   digitais ",
        natureza: "DESPESA",
        cor: "#6366f1",
        icone: "Tag",
      })
    ).rejects.toThrow(/Já existe uma categoria/)
  })

  it("G004 + G003: fluxo completo de dívida (criação, pagamento parcial, quitação e comprovante)", async () => {
    const gw = createSyntheticGestorMoneyGateway()
    const [pessoal] = await gw.listarPerfis()
    const sel: FinanceiroPerfilSeletor = { tipo: "PESSOAL", perfilId: pessoal.perfilId }

    await gw.registrarDivida(sel, {
      credor: "Fornecedor Teste",
      descricao: "Parcelamento Equipamento",
      valorOriginalCentavos: "100000",
      vencimento: "2026-12-15",
      parcelasTotal: 4,
      categoriaId: "cat-pessoal-fornecedores",
      comprovante: {
        nomeArquivo: "contrato.pdf",
        mime: "application/pdf",
        bytes: 4096,
      },
    })

    let snap = await gw.obterSnapshot(sel)
    const divida = snap!.dividas.find((d) => d.credor === "Fornecedor Teste")!
    expect(divida.saldoRestanteCentavos).toBe("100000")
    expect(snap!.documentos.some((doc) => doc.nomeArquivo === "contrato.pdf")).toBe(true)

    // Pagamento parcial de R$ 250,00
    await gw.pagarDivida(sel, {
      dividaId: divida.id,
      quitar: false,
      valorCentavos: "25000",
      carteiraId: "conta-p-banco",
      formaPagamento: "pix",
      dataPagamento: "2026-11-27",
      observacao: "1ª parcela",
    })

    snap = await gw.obterSnapshot(sel)
    let atualizada = snap!.dividas.find((d) => d.id === divida.id)!
    expect(atualizada.valorPagoCentavos).toBe("25000")
    expect(atualizada.saldoRestanteCentavos).toBe("75000")
    expect(atualizada.status).toBe("parcial")
    expect(atualizada.historico).toHaveLength(2)

    // Quitação integral do saldo restante
    await gw.pagarDivida(sel, {
      dividaId: divida.id,
      quitar: true,
      carteiraId: "conta-p-banco",
      formaPagamento: "pix",
      dataPagamento: "2026-11-27",
    })

    snap = await gw.obterSnapshot(sel)
    atualizada = snap!.dividas.find((d) => d.id === divida.id)!
    expect(atualizada.saldoRestanteCentavos).toBe("0")
    expect(atualizada.status).toBe("quitada")
    expect(atualizada.parcelasPagas).toBe(4)
  })

  it("G004 + G005: transferência interna preserva saldo consolidado e não infla despesas", async () => {
    const gw = createSyntheticGestorMoneyGateway()
    const [pessoal] = await gw.listarPerfis()
    const sel: FinanceiroPerfilSeletor = { tipo: "PESSOAL", perfilId: pessoal.perfilId }

    const antes = await gw.obterSnapshot(sel)
    await gw.transferir(sel, {
      carteiraOrigemId: "conta-p-banco",
      carteiraDestinoId: "conta-p-pix",
      valorCentavos: "50000",
      dataTransferencia: "2026-11-27",
      descricao: "Reforço Pix",
    })
    const depois = await gw.obterSnapshot(sel)

    expect(depois!.saldoDisponivelCentavos).toBe(antes!.saldoDisponivelCentavos)
    expect(depois!.despesasCentavos).toBe(antes!.despesasCentavos)
    expect(depois!.receitasCentavos).toBe(antes!.receitasCentavos)
  })

  it("G004: cartão de crédito — compra parcelada reduz limite e pagamento de fatura restaura limite", async () => {
    const gw = createSyntheticGestorMoneyGateway()
    const [pessoal] = await gw.listarPerfis()
    const sel: FinanceiroPerfilSeletor = { tipo: "PESSOAL", perfilId: pessoal.perfilId }

    const antes = await gw.obterSnapshot(sel)
    const cardAntes = antes!.cartoes[0]

    await gw.registrarCompraCartao(sel, {
      cartaoId: cardAntes.id,
      descricao: "Monitor 4K",
      estabelecimento: "Kabum",
      valorTotalCentavos: "120000",
      parcelasTotal: 6,
      categoriaId: "cat-pessoal-fornecedores",
      dataCompra: "2026-11-27",
    })

    const aposCompra = await gw.obterSnapshot(sel)
    const cardAposCompra = aposCompra!.cartoes.find((c) => c.id === cardAntes.id)!
    expect(cardAntes.disponivelCentavos).not.toBeNull()
    expect(cardAposCompra.disponivelCentavos).not.toBeNull()
    expect(BigInt(cardAposCompra.disponivelCentavos!)).toBe(BigInt(cardAntes.disponivelCentavos!) - BigInt(120000))
    expect(cardAposCompra.comprasParceladas.some((cp) => cp.descricao === "Monitor 4K")).toBe(true)

    const faturaAberta = cardAposCompra.ciclos.find((ci) => ci.status === "aberta")!
    await gw.pagarFatura(sel, {
      cartaoId: cardAposCompra.id,
      cicloId: faturaAberta.id,
      carteiraId: "conta-p-banco",
      formaPagamento: "pix",
      dataPagamento: "2026-11-27",
    })

    const aposFatura = await gw.obterSnapshot(sel)
    const cicloPago = aposFatura!.cartoes
      .find((c) => c.id === cardAntes.id)!
      .ciclos.find((ci) => ci.id === faturaAberta.id)!
    expect(cicloPago.status).toBe("paga")
    expect(cicloPago.restanteCentavos).toBe("0")
  })

  it("G005: relatórios projetam granularidades (diário, semanal, mensal, período) e CSV honesto", async () => {
    const gw = createSyntheticGestorMoneyGateway()
    const [pessoal] = await gw.listarPerfis()
    const snap = (await gw.obterSnapshot({ tipo: "PESSOAL", perfilId: pessoal.perfilId }))!

    for (const granularidade of ["diario", "semanal", "mensal", "periodo"] as const) {
      const rel = projetarRelatorioFinanceiro(snap, {
        granularidade,
        dataInicio: "2026-11-01",
        dataFim: "2026-11-30",
      })
      expect(rel.serieTemporal.length).toBeGreaterThan(0)
      expect(rel.porCategoria.length).toBeGreaterThan(0)
      expect(rel.porConta.length).toBeGreaterThan(0)
    }

    const relMensal = projetarRelatorioFinanceiro(snap, {
      granularidade: "mensal",
      dataInicio: "2026-11-01",
      dataFim: "2026-11-30",
    })
    const csv = gerarCsvRelatorio(snap, relMensal)
    expect(csv).toContain("SINTETICO_ISOLADO")
    expect(csv).toContain("CAIXA_REALIZADO")
  })

  it("Honestidade de fronteira: modo real nunca fabrica dados e bloqueia mutações quando módulo desligado", async () => {
    const mockFetch = async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/api/gestor-money/status")) {
        return new Response(
          JSON.stringify({
            ok: true,
            foundationMerged: true,
            moduleEnabled: false,
            state: "MODULE_DISABLED",
            mensagem: "Gestor Money desligado.",
          }),
          { status: 200 }
        )
      }
      return new Response(
        JSON.stringify({
          ok: false,
          code: "module_disabled",
          error: "Gestor Money desligado (GESTOR_MONEY_ENABLED !== 'true').",
        }),
        { status: 404 }
      )
    }

    const realGw = createRealBoundaryGateway(mockFetch as typeof fetch)
    expect(await realGw.listarPerfis()).toEqual([])
    expect(await realGw.obterSnapshot({ tipo: "PESSOAL", perfilId: "p1" })).toBeNull()

    const assist = await realGw.obterAssistenteConfig({ tipo: "PESSOAL", perfilId: "p1" })
    expect(assist.estadoConexao).toBe("DESCONECTADO_AGUARDANDO_G007")
    expect(assist.podeAlterarConexaoReal).toBe(false)

    await expect(
      realGw.registrarDespesa(
        { tipo: "PESSOAL", perfilId: "p1" },
        {
          descricao: "Teste",
          valorCentavos: "1000",
          dataGasto: "2026-11-27",
          pagoAgora: true,
          categoriaId: "c1",
          carteiraId: "w1",
          formaPagamento: "pix",
        }
      )
    ).rejects.toThrow(/GESTOR_MONEY_ENABLED/)
  })

  it("Segurança: rota de preview isolado permanece fechada por padrão sem opt-in explícito", () => {
    const prev = process.env.GESTOR_MONEY_ISOLATED_PREVIEW
    delete process.env.GESTOR_MONEY_ISOLATED_PREVIEW
    expect(isPublicPath("/gestor-money/preview")).toBe(false)
    if (prev !== undefined) process.env.GESTOR_MONEY_ISOLATED_PREVIEW = prev
  })
})
