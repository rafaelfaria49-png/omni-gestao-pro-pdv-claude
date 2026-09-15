/**
 * GOAL 007A — contrato estrutural do endurecimento de `POST /api/vendas/[id]/cancelar`.
 *
 * Prova por leitura o que um teste de unidade não alcança sem subir Next + Prisma:
 * a ORDEM dos guards (nenhum efeito destrutivo antes das verificações) e o fato de o
 * step-up ser servidor, não confiança em flag do cliente.
 *
 * Comportamento fica em `lib/vendas/guard-estorno-venda.test.ts` e
 * `lib/vendas/estorno-recebivel-guard.test.ts`.
 */
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const aqui = dirname(fileURLToPath(import.meta.url))
const ler = (p: string) => readFileSync(resolve(aqui, p), "utf8")

const rota = ler("./route.ts")
const guardStepUp = ler("../../../../../lib/vendas/guard-estorno-venda.ts")
const guardReceb = ler("../../../../../lib/vendas/estorno-recebivel-guard.ts")
const politica = ler("../../../../../lib/caixa/conferencia-acoes.ts")
const sessaoRota = ler("../../../ops/caixa/sessao-detalhe/route.ts")

const at = (h: string, n: string) => {
  const i = h.indexOf(n)
  expect(i, `não encontrado: ${n}`).toBeGreaterThan(-1)
  return i
}

describe("A. step-up é exigido NO SERVIDOR (BLOCKER-1)", () => {
  it("a rota chama o guard de step-up", () => {
    expect(rota).toContain("requireEstornoStepUp(sessionUserId, storeId)")
  })

  it("NÃO confia em flag/campo enviado pelo cliente", () => {
    const corpo = rota.slice(at(rota, "const { motivo, canceladaPor, forcar }"), at(rota, "try {"))
    expect(corpo).not.toMatch(/autorizado|supervisor|stepUp|pin/i)
    // o corpo aceito continua sendo só estes três campos
    expect(rota).toContain("const { motivo, canceladaPor, forcar } = body as {")
  })

  it("o guard verifica assinatura, expiração e vínculo usuário+loja", () => {
    expect(guardStepUp).toContain("verifyPinAuthorizationToken(")
    expect(guardStepUp).toContain("{ userId, storeId }")
    expect(guardStepUp).toContain("ADMIN_AUTHORIZATION_COOKIE")
  })

  it("reusa a infraestrutura existente — não inventa segundo mecanismo", () => {
    expect(guardStepUp).toContain('from "@/lib/auth/pin-authorization"')
    expect(guardStepUp).not.toMatch(/createHmac|jsonwebtoken|jwt\.sign/)
    // nem compara PIN: o PIN só existe em /api/auth/admin
    expect(guardStepUp).not.toMatch(/\bpin\s*[=:)]/i)
  })

  it("STEP-UP COMPLEMENTA a permissão — a permissão normal continua antes", () => {
    expect(at(rota, "p.pdv.cancelarVenda")).toBeLessThan(
      at(rota, "requireEstornoStepUp(sessionUserId, storeId)"),
    )
    expect(rota).toContain("CAMADA 1")
    expect(rota).toContain("CAMADA 2")
  })

  it("o autorizador da resposta vem do TOKEN, não do texto do cliente (§5)", () => {
    expect(rota).toContain("autorizadoPor: { supervisorId: stepUp.supervisorId, nome: stepUp.supervisorNome }")
    expect(guardStepUp).toContain("verification.payload.supervisorId")
  })
})

describe("B. guarda de recebível quitado (BLOCKER-2)", () => {
  it("a rota avalia os títulos antes de decidir", () => {
    expect(rota).toContain("avaliarRecebiveisParaEstorno(")
    expect(rota).toContain('code: veredito.code')
  })

  it("servidor e UI usam o MESMO predicado e o MESMO texto", () => {
    expect(politica).toContain("ESTORNO_BLOQUEIO_RECEBIVEL_QUITADO")
    expect(politica).toContain('from "@/lib/vendas/estorno-recebivel-guard"')
    expect(guardReceb).toContain("export const ESTORNO_BLOQUEIO_RECEBIVEL_QUITADO")
  })

  it("`{ ok:false }` de cancelContaReceber é verificado, não silenciado (§8)", () => {
    expect(rota).toContain("if (res.ok) {")
    expect(rota).toContain("titulosRecusados.push(")
    // a contagem só sobe dentro do ramo de sucesso
    const bloco = rota.slice(at(rota, "const res = await cancelContaReceber"), at(rota, "} catch (e) {\n          titulosRecusados"))
    expect(bloco.indexOf("titulosCancelados += 1")).toBeGreaterThan(bloco.indexOf("if (res.ok) {"))
  })

  it("as recusas são reportadas na resposta", () => {
    expect(rota).toContain("titulosAprazoRecusados: titulosRecusados")
  })

  it("a UI recebe o flag agregado, sem N+1 (§17)", () => {
    expect(sessaoRota).toContain("recebivelQuitado")
    // UMA consulta para a lista inteira, e só quando há venda à prazo
    expect(sessaoRota).toContain("if (pedidosComTitulo.length > 0) {")
    expect((sessaoRota.match(/contaReceberTitulo\.findMany/g) ?? []).length).toBe(1)
  })
})

describe("C. ordem dos guards — nada destrutivo antes (§14/§15)", () => {
  const iPermissao = at(rota, "p.pdv.cancelarVenda")
  const iStepUp = at(rota, "requireEstornoStepUp(sessionUserId, storeId)")
  const iFiscal = at(rota, "assertVendaFiscalCancelavel(venda)")
  const iReceb = at(rota, "avaliarRecebiveisParaEstorno(")
  const iPeriodo = at(rota, "verificarPeriodoFechado(storeId")
  const iTx = at(rota, "prisma.$transaction")

  it("permissão → step-up → fiscal → recebíveis → período → transação", () => {
    expect([iPermissao, iStepUp, iFiscal, iReceb, iPeriodo, iTx]).toEqual(
      [iPermissao, iStepUp, iFiscal, iReceb, iPeriodo, iTx].slice().sort((a, b) => a - b),
    )
  })

  it("nenhuma mutação acontece antes dos guards", () => {
    for (const mutacao of [
      "tx.venda.update",
      "tx.produto.update",
      "tx.movimentacaoEstoque.create",
      "tx.movimentacaoFinanceira.create",
      "tx.clienteCredito.updateMany",
    ]) {
      expect(at(rota, mutacao), mutacao).toBeGreaterThan(iTx)
    }
    // e a própria transação vem depois de tudo
    expect(iTx).toBeGreaterThan(iReceb)
  })

  it("o step-up corre antes até de LER a venda — não vira oráculo de existência", () => {
    expect(iStepUp).toBeLessThan(at(rota, "prisma.venda.findFirst"))
  })
})

describe("D. o que NÃO mudou neste corretivo", () => {
  it("efeitos de domínio do estorno seguem intactos", () => {
    for (const efeito of [
      "movimentacaoEstoque.create",
      "movimentacaoFinanceira.create",
      "estornarMovimentacaoPorReferencia",
      "usoCreditoCliente.findMany",
      "assertVendaFiscalCancelavel",
    ]) {
      expect(rota, efeito).toContain(efeito)
    }
  })

  it("idempotência preservada", () => {
    expect(rota).toContain('if (venda.status === "cancelada")')
    expect(rota).toContain("if (jaExiste) continue")
    expect(rota).toContain("if (!jaEstornado) {")
  })

  it("a venda original continua nunca sendo apagada", () => {
    expect(rota).not.toMatch(/venda\.delete|itemVenda\.deleteMany/)
  })

  it("Troca e Devolução seguem bloqueadas na política (§21)", () => {
    expect(politica).toContain("troca: BLOQUEADA")
    expect(politica).toContain("devolucao: BLOQUEADA")
  })

  it("sessão fechada NÃO foi endurecida neste corretivo (§20 — follow-up)", () => {
    expect(rota).not.toContain("sessaoCaixa.findFirst")
  })
})
