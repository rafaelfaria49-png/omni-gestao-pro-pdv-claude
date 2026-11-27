/**
 * Contratos financeiros #405 pela conversa completa (WhatsApp simulado → worker G006 → motor → G004/G005 reais):
 * RECEITA_RECEBIDA, RECEBER_TITULO (parcial + quitação), COMPRA_CREDITO com limite, faturas por ciclo, limites,
 * PAGAR_FATURA via plano canônico e TRANSFERENCIA_INTERNA EMPRESA. Nenhuma sessão de navegador.
 */
// Fixture primeiro: registra os mocks (@/auth nulo, @/lib/prisma descartável) antes de qualquer serviço.
import { bancoG007, cenarioG007, dinheiro, drenar, encerrarG007, habilitadoG007, leitor, owner, parear, receber } from "./assistente-fixtures"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { requireFinanceiroPerfilAccessPorPrincipal } from "@/lib/gastos/access"
import { cadastrarCartaoGasto, cadastrarCicloGasto, consultarCartoesGasto } from "@/lib/gastos/cartoes"
import { gravarTituloFinanceiro } from "@/lib/gastos/financeiro-scope"
import { diaCivil, somarDias } from "@/lib/gestor-money-assistente/datas"

const suite = habilitadoG007 ? describe : describe.skip
const textos = (l: Array<{ texto: string }>) => l.map(x => x.texto).join("\n---\n")

async function ctxDe(userId: string, seletor: { tipo: "PESSOAL"; perfilId: string } | { tipo: "EMPRESA"; perfilId: string; storeId: string }) {
  const r = await requireFinanceiroPerfilAccessPorPrincipal(async () => ({ userId }), seletor, "edit")
  if (!r.ok) throw Error("contexto negado")
  return r.contexto
}

suite("contratos #405 pela conversa (PostgreSQL descartável)", () => {
  beforeAll(async () => { await bancoG007() })
  afterAll(async () => { await encerrarG007() })

  it("RECEITA_RECEBIDA: receita entra na conta, sem despesa nem título", async () => {
    const c = await cenarioG007(), ler = leitor(c)
    await parear(c, c.U1, c.T1); ler(c.T1)
    await receber(c, c.T1, "recebi 1500 reais de um cliente no pix pelo nubank pessoal"); await drenar(c)
    expect(textos(ler(c.T1))).toContain("Receita de R$ 1.500,00")
    expect((await dinheiro([c.P1])).ops).toHaveLength(0) // nada antes do "sim"
    await receber(c, c.T1, "sim"); await drenar(c)
    const m = await dinheiro([c.P1])
    expect(m.ops.map(o => o.tipo)).toEqual(["RECEITA_RECEBIDA"])
    expect(m.gastos).toHaveLength(0)
    expect(m.movimentos.map(x => [x.tipo, x.origem, String(x.valorCentavos)])).toEqual([["entrada", "receita", "150000"]])
    expect(textos(ler(c.T1))).toContain("Registrado ✅ R$ 1.500,00")
  })

  it("RECEBER_TITULO: recebimento parcial e quitação do título a receber", async () => {
    const c = await cenarioG007(), ler = leitor(c)
    const ctx = await ctxDe(c.U1, { tipo: "PESSOAL", perfilId: c.P1 })
    const t = await gravarTituloFinanceiro(ctx, { natureza: "RECEBER", chave: `joao-${randomUUID()}`, descricao: "Empréstimo João",
      valorCentavos: "80000", vencimento: somarDias(diaCivil(new Date()), 10), carteiraId: `${c.P1}-NU` })
    await parear(c, c.U1, c.T1); ler(c.T1)
    await receber(c, c.T1, "recebi 300 que o joão me devia no pix pelo nubank pessoal"); await drenar(c)
    expect(textos(ler(c.T1))).toContain("Recebimento de R$ 300,00")
    await receber(c, c.T1, "sim"); await drenar(c)
    await receber(c, c.T1, "recebi o restante que o joão me devia no pix pelo nubank pessoal"); await drenar(c)
    expect(textos(ler(c.T1))).toContain("R$ 500,00")
    await receber(c, c.T1, "sim"); await drenar(c)
    const titulo = await owner.contaReceberTitulo.findUniqueOrThrow({ where: { id: t.id } })
    expect(titulo.status).toBe("pago")
    expect((await dinheiro([c.P1])).ops.map(o => o.tipo)).toEqual(["RECEBER_TITULO", "RECEBER_TITULO"])
  })

  it("cartão: compra parcelada, limites, faturas por ciclo e pagamento da fatura pelo plano canônico", async () => {
    const c = await cenarioG007(), ler = leitor(c)
    const ctx = await ctxDe(c.U1, { tipo: "PESSOAL", perfilId: c.P1 })
    const cartao = await cadastrarCartaoGasto(ctx, { nome: "Cartão Pessoal", limiteCentavos: "300000" })
    const hoje = diaCivil(new Date()), m1 = somarDias(hoje, 15), m2 = somarDias(hoje, 45)
    await cadastrarCicloGasto(ctx, { cartaoId: cartao.id, identificador: m1.slice(0, 7), competencia: m1.slice(0, 7), vencimento: m1, fechamentoEm: m1 })
    await cadastrarCicloGasto(ctx, { cartaoId: cartao.id, identificador: m2.slice(0, 7), competencia: m2.slice(0, 7), vencimento: m2, fechamentoEm: m2 })
    await parear(c, c.U1, c.T1); ler(c.T1)
    await receber(c, c.T1, "comprei 600 em 2 vezes no cartão pessoal"); await drenar(c)
    expect(textos(ler(c.T1))).toContain("em 2x de R$ 300,00")
    await receber(c, c.T1, "sim"); await drenar(c)
    await receber(c, c.T1, "qual o limite do meu cartão no pessoal?"); await drenar(c)
    expect(textos(ler(c.T1))).toContain("Cartão Pessoal: limite R$ 3.000,00 · utilizado R$ 600,00 · disponível R$ 2.400,00.")
    await receber(c, c.T1, "quais faturas estão em aberto no pessoal?"); await drenar(c)
    const faturas = textos(ler(c.T1))
    expect(faturas).toContain(`Fatura ${m1.slice(0, 7)}`)
    expect(faturas).toContain(`Fatura ${m2.slice(0, 7)}`)
    await receber(c, c.T1, "paguei a fatura do cartão no pix pelo nubank pessoal"); await drenar(c)
    expect(textos(ler(c.T1))).toContain("Qual fatura você pagou?")
    await receber(c, c.T1, "1"); await drenar(c)
    expect(textos(ler(c.T1))).toContain("Em aberto: R$ 300,00")
    await receber(c, c.T1, "a fatura toda"); await drenar(c)
    expect(textos(ler(c.T1))).toContain("(quitação)")
    await receber(c, c.T1, "sim"); await drenar(c)
    const ops = (await dinheiro([c.P1])).ops.map(o => o.tipo)
    expect(ops).toEqual(expect.arrayContaining(["COMPRA_CREDITO", "PAGAR_FATURA"]))
    const [depois] = await consultarCartoesGasto(ctx, { cartaoId: cartao.id })
    expect([depois.limiteUtilizadoCentavos, depois.limiteDisponivelCentavos]).toEqual(["30000", "270000"]) // recomposição exata
    // Compra acima do limite disponível: G004 recusa, nada gravado.
    await receber(c, c.T1, "comprei 2800 no cartão pessoal"); await drenar(c)
    await receber(c, c.T1, "sim"); await drenar(c)
    expect(textos(ler(c.T1))).toContain("não tem limite disponível")
    expect((await dinheiro([c.P1])).ops).toHaveLength(2)
  })

  it("TRANSFERENCIA_INTERNA EMPRESA entre contas da mesma loja; perfil escolhido no chat", async () => {
    const c = await cenarioG007(), ler = leitor(c)
    await owner.carteiraFinanceira.create({ data: { id: `${c.E1}-BR`, perfilId: c.E1, storeId: c.L1, nome: "Bradesco Loja", tipo: "banco",
      saldoInicial: 0, saldoAtual: 0, saldoInicialCentavos: "0", saldoAtualCentavos: "0", precisaoStatus: "CENTAVOS" } })
    await parear(c, c.U1, c.T1); ler(c.T1)
    await receber(c, c.T1, "transferi 500 do itau para o bradesco"); await drenar(c)
    const pergunta = textos(ler(c.T1)).split("\n").filter(l => /^\d\)/.test(l))
    await receber(c, c.T1, String(pergunta.findIndex(l => l.includes("Loja Centro")) + 1)); await drenar(c)
    expect(textos(ler(c.T1))).toContain("De: Itaú PJ → Para: Bradesco Loja")
    await receber(c, c.T1, "sim"); await drenar(c)
    const m = await dinheiro([c.E1])
    expect(m.ops.map(o => [o.tipo, o.storeId])).toEqual([["TRANSFERENCIA_INTERNA", c.L1]])
    expect(m.movimentos).toHaveLength(2)
    expect((await dinheiro([c.P1, c.E2])).ops).toHaveLength(0) // outros perfis intocados
  })
})
