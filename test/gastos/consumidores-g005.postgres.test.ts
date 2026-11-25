import "./g005-fixtures"
import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { NextRequest } from "next/server"
import { GET as pagar } from "@/app/api/financeiro/pagar/route"
import { GET as receber } from "@/app/api/financeiro/receber/route"
import { GET as analytics } from "@/app/api/financeiro/analytics/route"
import { GET as carteiras } from "@/app/api/financeiro/carteiras/route"
import { GET as exportar } from "@/app/api/financeiro/relatorios/exportar/route"
import { GET as resumo } from "@/app/api/financeiro/relatorios/resumo/route"
import { GET as rankings } from "@/app/api/financeiro/relatorios/rankings/route"
import { GET as indicadores } from "@/app/api/financeiro/relatorios/indicadores/route"
import { GET as categorias } from "@/app/api/financeiro/relatorios/categorias/route"
import { GET as fluxo } from "@/app/api/financeiro/relatorios/fluxo/route"
import { consultarFinanceiroEmpresa, auditarQualidadeFinanceiraEmpresa } from "@/lib/gastos/query"
import { getOmniAgentReportsSnapshot } from "@/app/actions/omni-agent"
import { getFluxoCaixaResumo } from "@/lib/financeiro/services/fluxo-caixa-service"
import { getDREMensal } from "@/lib/financeiro/services/dre-service"
import { executeOmniAgentIntent } from "@/lib/omni-agent/executor"
import { interpretOmniAgentCommand } from "@/lib/omni-agent/interpret"
import { requireContadorScope } from "@/lib/contador/scope"
import { construirDadosContador } from "@/lib/contador/readers"
import { carregarFontesPacote } from "@/lib/contador/pacote/carregar-fontes"
import { cadastrarCartaoGasto, cadastrarCicloGasto } from "@/lib/gastos/cartoes"
import { createElement } from "react"
import { createRequire } from "node:module"
import { render, cleanup, waitFor, fireEvent } from "@testing-library/react"
import { FinanceiroRealProvider, useFinanceiroReal } from "@/components/financeiro/lovable/context/FinanceiroRealContext"
import * as XLSX from "xlsx"
import { fixtureG005, aplicarG005, pagoG005, dataGasto, dataPagamento, estadoG005, provaG005 } from "./g005-fixtures"

const browser = vi.hoisted(() => ({ user: "", store: "" }))
const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (html: string, options: { url: string }) => { window: Window & typeof globalThis }
}
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: browser.user } }, status: "authenticated" }) }))
vi.mock("@/lib/loja-ativa", () => ({ useLojaAtiva: () => ({ lojaAtivaId: browser.store }) }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
afterAll(async () => { await prisma.$disconnect() })
const periodo = { dataInicio: "2026-10-01", dataFim: "2026-10-31" }, qs = "dataInicio=2026-10-01&dataFim=2026-10-31"
const request = (store: string, path: string) => new NextRequest(`http://localhost/api/financeiro/${path}`, { headers: { "x-assistec-loja-id": store } })
async function linhasExport(store: string, tipo: string, formato: "csv" | "xlsx") {
  const res = await exportar(request(store, `relatorios/exportar?tipo=${tipo}&formato=${formato}&${qs}`))
  expect(res.status).toBe(200); expect(res.headers.get("cache-control")).toContain("no-store")
  if (formato === "xlsx") {
    const wb = XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" })
    return XLSX.utils.sheet_to_json<Record<string, string | number>>(wb.Sheets[wb.SheetNames[0]])
  }
  const csv = await res.text(), wb = XLSX.read(csv, { type: "string", FS: ";", raw: true })
  return XLSX.utils.sheet_to_json<Record<string, string | number>>(wb.Sheets[wb.SheetNames[0]])
}

describe("G005 correções da R1 com PostgreSQL real", () => {
  it("movimento PDV sem carteira mantém saldo das contas e sinaliza resíduo sem perder receita", async () => {
    const f=await fixtureG005()
    await prisma.movimentacaoFinanceira.create({data:{id:`${f.id}-pdv-sem-conta`,perfilId:f.E1,storeId:f.L1,tipo:"entrada",origem:"venda_pdv",descricao:"PDV sintético sem atribuição",valor:10,valorCentavos:"1000",ocorridoEm:new Date(dataPagamento)}})
    const q=await consultarFinanceiroEmpresa(f.L1,periodo)
    expect(q.saldoCentavos).toBe("100000");expect(q.receitaRealizadaCentavos).toBe("1000")
    expect(q.semCarteira).toEqual({quantidade:1,entradasCentavos:"1000",saidasCentavos:"0"})
    expect(q.criterios.saldoContas).toBe("SOMENTE_MOVIMENTOS_COM_CARTEIRA")
    const c=await (await carteiras(request(f.L1,"carteiras"))).json(),r=await (await resumo(request(f.L1,`relatorios/resumo?${qs}`))).json(),fl=await getFluxoCaixaResumo(f.L1)
    expect(c.apuracao.semCarteira).toEqual(q.semCarteira);expect(r.indicadores.apuracao.semCarteira).toEqual(q.semCarteira);expect(fl.apuracao!.semCarteira).toEqual(q.semCarteira)
    const a=await (await analytics(request(f.L1,`analytics?${qs}`))).json();expect(a.resultadoLoja[0].loja).toBe("Loja sintética G005")
    provaG005("saldo-sem-carteira",{saldo:q.saldoCentavos,receita:q.receitaRealizadaCentavos,residuo:q.semCarteira,criterios:q.criterios})
  })
  it("rótulo legado do título é só apresentação e não autoriza categoria inferida", async () => {
    const f=await fixtureG005()
    await prisma.contaPagarTitulo.create({data:{perfilId:f.E1,storeId:f.L1,descricao:"Título legado",valor:10,payload:{planoContas:"Rótulo do legado"},vencimento:"2026-10-31"}})
    const q=await consultarFinanceiroEmpresa(f.L1,periodo)
    expect(q.pagar[0].apresentacao.categoria).toBe("Rótulo do legado");expect(q.pagar[0].categoriaId).toBeNull()
    await expect(consultarFinanceiroEmpresa(f.L1,{...periodo,categoriaNome:"Rótulo do legado"})).rejects.toMatchObject({code:"categoria_exige_esclarecimento"})
  })
  it("diagnóstico estável sem PII; título anômalo não bloqueia eventos/DRE e auditoria é somente leitura", async () => {
    const f=await fixtureG005(),antesAuditoria=await estadoG005(f),limpa=await auditarQualidadeFinanceiraEmpresa(f.L1)
    expect(limpa.porCodigo).toEqual([]);expect(await estadoG005(f)).toBe(antesAuditoria)
    const t=await prisma.contaPagarTitulo.create({data:{perfilId:f.E1,storeId:f.L1,descricao:"NAO_LOGAR_PII",valor:1.001,precisaoStatus:"ANOMALIA_LEGADO",valorOriginalLegado:1.001,vencimento:"2026-10-31"}})
    const log=vi.spyOn(console,"error"),antes=await estadoG005(f),audit=await auditarQualidadeFinanceiraEmpresa(f.L1)
    expect(audit.porCodigo).toEqual([{code:"precisao_legada_exige_revisao",quantidade:"1"}]);expect(await estadoG005(f)).toBe(antes)
    const res=await pagar(request(f.L1,"pagar"));expect(res.status).toBe(409)
    const erro=await res.json();expect(erro.code).toBe("precisao_legada_exige_revisao");expect(JSON.stringify(erro)).not.toContain(t.id)
    const tecnico=log.mock.calls.map(c=>String(c[0])).find(s=>s.includes('"registroId":"'+t.id+'"'))!
    expect(JSON.parse(tecnico)).toEqual({evento:"consulta_financeira_inconsistente",code:"precisao_legada_exige_revisao",tabela:"contas_pagar_titulos",registroId:t.id});expect(tecnico).not.toContain("NAO_LOGAR_PII")
    await expect(getDREMensal(f.L1,10,2026)).resolves.toMatchObject({baseApuracao:"CAIXA_COM_CLASSIFICACAO_DRE"})
    const overview=await getOmniAgentReportsSnapshot(f.L1);expect(overview.financeiroSemPermissao).toBe(false);expect(overview.financeiroErro?.code).toBe("precisao_legada_exige_revisao")
    provaG005("auditoria-qualidade-qa",{banco:"gastos_g005_test",producaoAuditada:false,antes:limpa,depois:audit,diagnostico:JSON.parse(tecnico),dreDisponivel:true,estadoInalterado:await estadoG005(f)===antes})
  },60000)
  it("indicadores e rankings usam uma transação por resposta; séries e indicador têm o mesmo asOf", async () => {
    const f=await fixtureG005();await aplicarG005(f,pagoG005(f,{valorCentavos:"101"}))
    const tx=vi.spyOn(prisma,"$transaction")
    const a=await (await indicadores(request(f.L1,`relatorios/indicadores?${qs}`))).json()
    expect(tx).toHaveBeenCalledTimes(1);expect(a.indicadores.apuracao.asOf).toBe(a.apuracao.asOf)
    expect(a.comparativoMensal.every((r:{asOf:string})=>r.asOf===a.apuracao.asOf)).toBe(true);expect(a.comparativoAnual.every((r:{asOf:string})=>r.asOf===a.apuracao.asOf)).toBe(true)
    tx.mockClear();const b=await (await rankings(request(f.L1,`relatorios/rankings?${qs}`))).json();expect(tx).toHaveBeenCalledTimes(1)
    expect(b.topDespesas[0].valor).toBe(1.01);expect(b.carteiras[0].saldoAtual).toBe(998.99);expect(b.apuracao.asOf).toBeTruthy()
    provaG005("snapshots-relatorios",{indicadoresAsOf:a.apuracao.asOf,seriesCoerentes:true,rankingsAsOf:b.apuracao.asOf,transacoesPorResposta:1})
  })
  it("presets inválidos retornam422 nas seis rotas; tipo de exportação desconhecido retorna400", async () => {
    const f=await fixtureG005(),antes=await estadoG005(f)
    for(const [name,handler] of [["resumo",resumo],["rankings",rankings],["indicadores",indicadores],["categorias",categorias],["fluxo",fluxo],["exportar",exportar]] as const){
      const r=await handler(request(f.L1,`relatorios/${name}?preset=xyz`));expect(r.status).toBe(422);expect((await r.json()).code).toBe("periodo_exige_esclarecimento")
    }
    const r=await exportar(request(f.L1,"relatorios/exportar?tipo=fluxo_caixa"));expect(r.status).toBe(400);expect((await r.json()).code).toBe("tipo_exportacao_invalido");expect(await estadoG005(f)).toBe(antes)
  })
})

describe("G005 serviço/API/relatório/export/Agent/Contador", () => {
  it("Contador e pacote usam o evento econômico, sem deslocar pagamento para o mês da sincronização", async () => {
    const f = await fixtureG005()
    await aplicarG005(f, pagoG005(f, { dataGasto: "2026-09-30", dataPagamento: "2026-10-01T02:59:00Z", valorCentavos: "1000" }))
    const scope = await requireContadorScope()
    if (!scope.ok) throw new Error("Contador negado")
    const dados = await construirDadosContador(scope, { ano: 2026, mes: 9 })
    const pacote = await carregarFontesPacote({ scope, competencia: { ano: 2026, mes: 9 } })
    expect(dados.financeiro.saidasRealizadas.valor).toBe(10)
    expect(pacote.movimentacoes.linhas.map(m => m.valor)).toEqual([10])
    expect(pacote.movimentacoes.linhas[0].data).toBe("2026-10-01T02:59:00.000Z")
    expect((await construirDadosContador(scope, { ano: 2026, mes: 10 })).financeiro.saidasRealizadas.valor).toBe(0)
  })
  it("parcial 365,01 − 200 = 165,01 e quitação = zero em todos os leitores reais", async () => {
    const f = await fixtureG005(), t = await aplicarG005(f, { tipo: "CONTA_PAGAR", descricao: "T1 consumidores", valorCentavos: "36501", dataGasto, vencimento: "2026-10-31", carteiraId: f.conta() })
    const p = { tipo: "PAGAR_TITULO", tituloId: t.resultado.tituloIds[0], carteiraId: f.conta(), formaPagamento: "pix", dataPagamento }
    await aplicarG005(f, { ...p, valorCentavos: "20000" })
    const evidencias: unknown[] = []
    const conferir = async (restante: number, despesa: number) => {
      const antes = await estadoG005(f), q = await consultarFinanceiroEmpresa(f.L1, periodo)
      const api = await (await pagar(request(f.L1, "pagar"))).json(), a = await (await analytics(request(f.L1, `analytics?${qs}`))).json()
      const rel = await (await resumo(request(f.L1, `relatorios/resumo?${qs}`))).json(), fluxo = await getFluxoCaixaResumo(f.L1)
      expect(api.summary.totalAberto).toBe(restante); expect(api.rows[0].restante).toBe(restante)
      expect(api.rows[0].pago).toBe(despesa); expect(a.resultadoLoja[0].totalPagar).toBe(restante)
      expect(a.resultadoLoja[0].totalPago).toBe(despesa); expect(a.consulta.despesaRealizadaCentavos).toBe(q.despesaRealizadaCentavos)
      expect(rel.indicadores.pagarPendente).toBe(restante); expect(rel.indicadores.despesaTotal).toBe(despesa)
      expect(fluxo.totalPagarAberto).toBe(restante); expect(fluxo.saldoAtual).toBe(1000 - despesa)
      const agent = await executeOmniAgentIntent(f.L1, interpretOmniAgentCommand("Quanto ainda tenho a pagar?"))
      expect(agent.ok).toBe(true)
      if (!agent.ok) throw new Error("Agent negado")
      expect(agent.payload.valores).toMatchObject({ pagarAbertoCentavos: String(Math.round(restante * 100)), despesaRealizadaCentavos: String(Math.round(despesa * 100)) })
      for (const formato of ["csv", "xlsx"] as const) {
        const rows = await linhasExport(f.L1, "pagar", formato)
        expect(Number(rows[0].valorRestante)).toBe(restante); expect(Number(rows[0].valorPago)).toBe(despesa)
        expect(rows[0].base_apuracao).toBe("CAIXA_REALIZADO"); expect(rows[0].posicao_titulos).toBe("ATUAL_NO_SNAPSHOT")
      }
      const scope = await requireContadorScope()
      if (!scope.ok) throw new Error("Contador negado")
      const contador = await construirDadosContador(scope, { ano: 2026, mes: 10 }), pacote = await carregarFontesPacote({ scope, competencia: { ano: 2026, mes: 10 } })
      expect(contador.financeiro.titulosPagarAberto.valor).toBe(restante)
      expect(pacote.contasPagar.linhas.reduce((s, r) => s + r.valorAberto, 0)).toBe(restante)
      expect(await estadoG005(f)).toBe(antes)
      evidencias.push({ restante, despesa, query: { aberto: q.pagarAbertoCentavos, despesa: q.despesaRealizadaCentavos }, api: api.summary, analytics: a.resultadoLoja, relatorio: rel.indicadores, agent: agent.payload.valores, contador: contador.financeiro.titulosPagarAberto })
    }
    await conferir(165.01, 200); await aplicarG005(f, { ...p, quitar: true }); await conferir(0, 365.01)
    provaG005("consumidores-parcial-quitacao", { fixture: f.id, evidencias })
  }, 60000)
  it("o Provider real do HUB apresenta a parcial oficial e muda para zero após quitação", async () => {
    const f = await fixtureG005(), t = await aplicarG005(f, { tipo: "CONTA_PAGAR", descricao: "HUB parcial", valorCentavos: "36501", dataGasto, vencimento: "2026-10-31" })
    await aplicarG005(f, { tipo: "PAGAR_TITULO", tituloId: t.resultado.tituloIds[0], valorCentavos: "20000", carteiraId: f.conta(), formaPagamento: "pix", dataPagamento })
    const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" })
    for (const key of ["window", "document", "navigator", "HTMLElement"] as const) vi.stubGlobal(key, dom.window[key])
    browser.user = f.U1; browser.store = f.L1; document.cookie = `assistec-active-store=${f.L1}; path=/`
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async url => {
      const path = String(url).replace("/api/financeiro/", "")
      if (path === "pagar") return pagar(request(f.L1, path))
      if (path === "receber") return receber(request(f.L1, path))
      if (path === "analytics") return analytics(request(f.L1, path))
      return Response.json({ ok: true, rows: [] })
    }))
    function View() {
      const state = useFinanceiroReal()
      return createElement("div", null, createElement("pre", { "data-testid": "valor" }, JSON.stringify({ aberto: state.summaryP?.totalAberto, pago: state.pagar[0]?.pago })), createElement("button", { onClick: () => { void state.reload() } }, "reler"))
    }
    const view = render(createElement(FinanceiroRealProvider, null, createElement(View)))
    await waitFor(() => expect(JSON.parse(view.getByTestId("valor").textContent!)).toEqual({ aberto: 165.01, pago: 200 }), { timeout: 10000 })
    await aplicarG005(f, { tipo: "PAGAR_TITULO", tituloId: t.resultado.tituloIds[0], quitar: true, carteiraId: f.conta(), formaPagamento: "pix", dataPagamento })
    fireEvent.click(view.getByText("reler"))
    await waitFor(() => expect(JSON.parse(view.getByTestId("valor").textContent!)).toEqual({ aberto: 0, pago: 365.01 }), { timeout: 10000 })
    cleanup(); dom.window.close()
  }, 30000)
  it("fatura com categorias diferentes e estorno alocado não duplicam caixa nem atribuem tudo a uma categoria", async () => {
    const f = await fixtureG005(), ctx = await f.contexto(), categorias = ["Energia", "Alimentação"]
    const cats = await Promise.all(categorias.map((nome, i) => prisma.categoriaGasto.create({ data: { id: `${f.E1}-cat-${i}`, perfilId: f.E1, storeId: f.L1, nome, nomeNormalizado: nome.toLowerCase(), natureza: "DESPESA" } })))
    const card = await cadastrarCartaoGasto(ctx, { nome: "Fatura categorias" }), ciclo = await cadastrarCicloGasto(ctx, { cartaoId: card.id, identificador: "2026-10", competencia: "2026-10", vencimento: "2026-10-31" })
    const compras = await Promise.all(cats.map((c, i) => aplicarG005(f, { tipo: "COMPRA_CREDITO", descricao: "Consumo", valorCentavos: i ? "7000" : "3000", categoriaId: c.id, dataGasto, cicloId: ciclo.id })))
    expect((await consultarFinanceiroEmpresa(f.L1, periodo)).despesaRealizadaCentavos).toBe("0")
    const pg = await aplicarG005(f, { tipo: "PAGAR_FATURA", cicloId: ciclo.id, carteiraId: f.conta(), formaPagamento: "pix", dataPagamento, alocacoes: compras.map((c, i) => ({ tituloId: c.resultado.tituloIds[0], valorCentavos: i ? "7000" : "3000" })) })
    const alocacao = await prisma.alocacaoPagamento.findFirstOrThrow({ where: { pagamentoId: pg.resultado.pagamentoId!, pagarTituloId: compras[0].resultado.tituloIds[0] } })
    await aplicarG005(f, { tipo: "ESTORNAR_PAGAMENTO", pagamentoId: pg.resultado.pagamentoId, valorCentavos: "1000", dataPagamento, motivo: "Devolução energia", alocacoes: [{ alocacaoId: alocacao.id, valorCentavos: "1000" }] })
    expect((await consultarFinanceiroEmpresa(f.L1, { ...periodo, categoriaId: cats[0].id })).despesaRealizadaCentavos).toBe("2000")
    expect((await consultarFinanceiroEmpresa(f.L1, { ...periodo, categoriaId: cats[1].id })).despesaRealizadaCentavos).toBe("7000")
    const q = await consultarFinanceiroEmpresa(f.L1, periodo); expect(q.despesaRealizadaCentavos).toBe("9000"); expect(q.pagarAbertoCentavos).toBe("1000")
    const dre = await getDREMensal(f.L1, 10, 2026); expect(dre.custos + dre.totalDespesas).toBe(90)
    for (const formato of ["csv", "xlsx"] as const) expect((await linhasExport(f.L1, "movimentacoes", formato)).reduce((s, r) => s + Number(r.despesaRealizada), 0)).toBe(90)
  }, 60000)
  it("Agent ignora total sugerido pelo modelo, exige período/categoria inequívocos e não consulta pessoal", async () => {
    const f = await fixtureG005(), cat = await prisma.categoriaGasto.create({ data: { perfilId: f.E1, storeId: f.L1, nome: "Energia", nomeNormalizado: "energia", natureza: "DESPESA" } })
    await aplicarG005(f, pagoG005(f, { valorCentavos: "8020", categoriaId: cat.id }))
    const interp = interpretOmniAgentCommand("Quanto paguei de energia neste mês?"); interp.fields.total = "99999999"
    const result = await executeOmniAgentIntent(f.L1, interp)
    expect(result.ok).toBe(true); if (result.ok) expect(result.payload.valores).toMatchObject({ despesaRealizadaCentavos: "8020" })
    const semPeriodo = await executeOmniAgentIntent(f.L1, interpretOmniAgentCommand("Qual foi o gasto realizado em alimentação?"))
    expect(semPeriodo).toMatchObject({ ok: false, error: "Informe o período da consulta financeira." })
    const semCategoria = await executeOmniAgentIntent(f.L1, { ...interp, fields: { preset: "estemes", categoriaNome: "Inexistente" } })
    expect(semCategoria).toMatchObject({ ok: false, error: "Esclareça a categoria financeira antes de consultar o total." })
    expect(await executeOmniAgentIntent(f.L1, { ...interp, fields: { preset: "estemes", perfil: "PESSOAL" } })).toMatchObject({ ok: false })
  })
  it("forjar seletores e IDs não revela valores/descrições pessoais em API ou CSV/XLSX", async () => {
    const f = await fixtureG005()
    await aplicarG005(f, pagoG005(f, { carteiraId: f.conta(f.P1), descricao: "SEGREDO_PESSOAL_G005", valorCentavos: "78999" }), "privado", f.P1)
    for (const handler of [pagar, receber, analytics, carteiras]) {
      const denied = await handler(request(f.L1, `pagar?perfilId=${f.P1}`)); expect(denied.status).toBe(403)
      expect(await denied.text()).not.toContain("SEGREDO_PESSOAL_G005")
    }
    for (const formato of ["csv", "xlsx"] as const) expect(JSON.stringify(await linhasExport(f.L1, "movimentacoes", formato))).not.toContain("SEGREDO_PESSOAL_G005")
    f.login(f.U2, [f.L1]); expect((await analytics(request(f.L2, "analytics"))).status).toBe(403)
  })
})
