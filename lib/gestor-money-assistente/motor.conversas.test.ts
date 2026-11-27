import { describe, expect, it } from "vitest"
import { normalizarPropostaGasto } from "@/lib/gastos/operacao-schema"
import { valoresDaResposta } from "./consultas"
import { fixtureLoja, fixturePessoal, LOJA_CENTRO, montarCenario, PESSOAL_A, USUARIO_A } from "./cenario-teste"
import { dividirParcelas } from "./mapeamento-g004"

describe("conversas de registro — fluxo completo", () => {
  it("exemplo canônico: despesa no Pix, confirmação e escrita única pelo G004", async () => {
    const c = montarCenario({ perfisA: [PESSOAL_A] })
    c.autorizacao // contexto só é emitido pelo servidor
    const chat = c.chat()
    // Pessoal com Nubank + Carteira: Pix precisa saber a conta
    const r1 = await chat.texto("Gastei 350 no mercado pelo Pix.")
    expect(r1.codigo).toBe("pergunta")
    expect(r1.mensagens.at(-1)).toContain("De qual conta saiu o dinheiro?")
    expect(c.execucao.chamadas).toHaveLength(0)
    const r2 = await chat.texto("Nubank")
    expect(r2.codigo).toBe("aguardando_confirmacao")
    expect(r2.mensagens.slice(0, 2)).toEqual(["Despesa de R$ 350,00 em Supermercado.", "Pagamento via Pix."])
    expect(r2.mensagens).toContain("Confirma?")
    expect(r2.confirmacao?.token).toMatch(/^[a-f0-9]{32}$/)
    expect(c.execucao.chamadas).toHaveLength(0)
    expect(c.autorizacao.emissoes.filter(e => e.acao === "edit")).toHaveLength(0)

    const r3 = await chat.texto("sim")
    expect(r3.codigo).toBe("registrado")
    expect(r3.mensagens[0]).toBe("Registrado ✅ Despesa de R$ 350,00 em Supermercado.")
    expect(r3.escritaFinanceira).toEqual({ operacaoId: "op_sim_1", valorCentavos: "35000" })
    expect(c.execucao.chamadas).toHaveLength(1)
    const p = c.execucao.chamadas[0]
    expect(p.acao).toBe("edit")
    expect(p.perfilId).toBe("pf_pessoal_a")
    expect(normalizarPropostaGasto(p.proposta)).toMatchObject({ tipo: "GASTO_PAGO", valorCentavos: "35000",
      carteiraId: "ct_nubank_a", formaPagamento: "pix", categoriaId: "cat_mercado_a", dataGasto: "2026-11-27" })
    expect(r3.rascunho).toBeUndefined()
  })

  it("“Paguei 180 de energia no Pix” com escolha numérica da conta", async () => {
    const c = montarCenario()
    const chat = c.chat()
    const r1 = await chat.texto("Paguei 180 de energia no Pix.")
    expect(r1.mensagens.at(-1)).toBe("De qual conta saiu o dinheiro?\n1) Nubank\n2) Carteira")
    const r2 = await chat.texto("1")
    expect(r2.mensagens[0]).toBe("Despesa de R$ 180,00 em Energia.")
    await chat.texto("confirmo")
    expect(c.execucao.chamadas[0].proposta).toMatchObject({ tipo: "GASTO_PAGO", carteiraId: "ct_nubank_a", categoriaId: "cat_energia_a" })
  })

  it("dinheiro usa a única conta do tipo dinheiro e mostra no resumo", async () => {
    const c = montarCenario()
    const r = await c.chat().texto("gastei 42,90 de lanche em dinheiro ontem")
    expect(r.mensagens).toEqual(["Despesa de R$ 42,90 em Alimentação.", "Pagamento via dinheiro.",
      "Conta: Carteira · Data: 26/11/2026 · Perfil: Pessoal", "Confirma?"])
  })

  it("“Comprei 600 reais em 3 vezes no cartão” → COMPRA_CREDITO com 3 ciclos G004", async () => {
    const c = montarCenario()
    const chat = c.chat()
    const r1 = await chat.texto("Comprei 600 reais em 3 vezes no cartão.")
    expect(r1.mensagens[0]).toBe("Compra no crédito de R$ 600,00, em 3x de R$ 200,00.")
    expect(r1.mensagens[1]).toContain("Cartão: Nubank Crédito")
    await chat.texto("sim")
    const prop = normalizarPropostaGasto(c.execucao.chamadas[0].proposta)
    expect(prop).toMatchObject({ tipo: "COMPRA_CREDITO", valorCentavos: "60000" })
    expect(prop.tipo === "COMPRA_CREDITO" && prop.parcelas?.map(x => [x.cicloId, x.valorCentavos, x.numero, x.total])).toEqual([
      ["ciclo_2026_12", "20000", 1, 3], ["ciclo_2027_01", "20000", 2, 3], ["ciclo_2027_02", "20000", 3, 3]])
  })

  it("parcelas sem fatura cadastrada suficiente: nada é gravado", async () => {
    const c = montarCenario()
    const r = await c.chat().texto("comprei 1000 em 10x no cartão")
    expect(r.codigo).toBe("ciclos_insuficientes")
    expect(r.rascunho).toBeUndefined()
    expect(c.execucao.chamadas).toHaveLength(0)
  })

  it("divisão de parcelas em centavos exatos", () => {
    expect(dividirParcelas("10000", 3)).toEqual(["3334", "3333", "3333"])
    for (const [t, n] of [["1", 1], ["99999", 7], ["60000", 3]] as const) {
      expect(dividirParcelas(t, n).reduce((s, v) => s + BigInt(v), BigInt(0))).toBe(BigInt(t))
    }
  })

  it("“Estou devendo 800 para o fornecedor” pergunta só o vencimento", async () => {
    const c = montarCenario()
    const chat = c.chat()
    const r1 = await chat.texto("Estou devendo 800 para o fornecedor.")
    expect(r1.rascunho?.pendencias).toEqual(["vencimento"])
    expect(r1.mensagens.at(-1)).toContain("Qual é o vencimento?")
    const r2 = await chat.texto("dia 10")
    expect(r2.mensagens.slice(0, 2)).toEqual(["Conta a pagar de R$ 800,00 em Fornecedores — Fornecedor.", "Vencimento: 10/12/2026."])
    await chat.texto("sim")
    expect(normalizarPropostaGasto(c.execucao.chamadas[0].proposta)).toMatchObject({
      tipo: "CONTA_PAGAR", valorCentavos: "80000", vencimento: "2026-12-10", contraparteTexto: "Fornecedor", dataGasto: "2026-11-27" })
  })

  it("“Recebi 1500 reais de um cliente”: classifica, mas não grava (sem contrato G004)", async () => {
    const c = montarCenario()
    const r = await c.chat().texto("Recebi 1500 reais de um cliente.")
    expect(r.codigo).toBe("sem_contrato_financeiro")
    expect(r.mensagens[0]).toBe("Entendi: Receita de R$ 1.500,00 (Cliente).")
    expect(r.mensagens[1]).toContain("nada foi gravado")
    expect(r.rascunho).toBeUndefined()
    expect(c.execucao.chamadas).toHaveLength(0)
  })

  it("“Recebi 300 que o João me devia” também não grava (recebimento sem contrato G004)", async () => {
    const c = montarCenario()
    expect((await c.chat().texto("Recebi 300 que o João me devia")).codigo).toBe("sem_contrato_financeiro")
    expect(c.execucao.chamadas).toHaveLength(0)
  })

  it("transferência interna PESSOAL: resumo, confirmação e proposta TRANSFERENCIA_INTERNA (#405)", async () => {
    const c = montarCenario()
    const chat = c.chat()
    const r1 = await chat.texto("Transferi 500 do Nubank para a Carteira")
    expect(r1.codigo).toBe("aguardando_confirmacao")
    expect(r1.mensagens.join("\n")).toContain("De: Nubank → Para: Carteira")
    const r2 = await chat.texto("sim")
    expect(r2.codigo).toBe("registrado")
    expect(c.execucao.chamadas.at(-1)?.proposta).toMatchObject({ tipo: "TRANSFERENCIA_INTERNA", valorCentavos: "50000",
      carteiraOrigemId: "ct_nubank_a", carteiraDestinoId: "ct_carteira_a" })
  })

  it("transferência com destino fora do perfil pergunta a conta de destino; só destino vira pergunta da origem", async () => {
    const c = montarCenario()
    const r = await c.chat().texto("Transferi 500 do Nubank para o Itaú")
    expect(r.mensagens.join("\n")).toContain("Não encontrei uma única conta “Itaú”")
    expect(r.rascunho?.pendencias).toEqual(["contaDestino"])
    const r2 = await c.chat(undefined, "conversa-2").texto("passei 300 para a carteira")
    expect(r2.rascunho?.pendencias).toEqual(["conta"])
    expect(c.execucao.chamadas).toHaveLength(0)
  })

  it("“Paguei 200 daquela dívida” encontra o título único e paga parcial", async () => {
    const c = montarCenario()
    const chat = c.chat()
    const r1 = await chat.texto("Paguei 200 daquela dívida.")
    expect(r1.rascunho?.pendencias).toEqual(["formaPagamento", "conta"])
    const r2 = await chat.texto("foi no pix")
    expect(r2.rascunho?.pendencias).toEqual(["conta"])
    const r3 = await chat.texto("nubank")
    expect(r3.mensagens[0]).toBe("Pagamento de R$ 200,00 da conta “Compra de estoque”.")
    await chat.texto("sim")
    expect(normalizarPropostaGasto(c.execucao.chamadas[0].proposta)).toMatchObject({
      tipo: "PAGAR_TITULO", tituloId: "tit_fornecedor_a", valorCentavos: "20000", quitar: false, carteiraId: "ct_nubank_a" })
  })

  it("pagamento acima do saldo do título volta a perguntar o valor", async () => {
    const c = montarCenario()
    const r = await c.chat().texto("paguei 900 daquela dívida no pix pelo nubank")
    expect(r.mensagens[0]).toContain("maior que o saldo em aberto (R$ 800,00)")
    expect(r.rascunho?.pendencias).toEqual(["valor"])
  })

  it("quitação usa o saldo do título vindo do servidor", async () => {
    const c = montarCenario()
    const chat = c.chat()
    const r = await chat.texto("quitei a dívida com o Fornecedor Alfa no pix pelo nubank")
    expect(r.mensagens[0]).toBe("Pagamento de R$ 800,00 da conta “Compra de estoque” (quitação).")
    await chat.texto("sim")
    expect(c.execucao.chamadas[0].proposta).toMatchObject({ tipo: "PAGAR_TITULO", quitar: true })
  })

  it("dívida com vários títulos oferece escolha numerada", async () => {
    const c = montarCenario({ perfisA: [LOJA_CENTRO] })
    const chat = c.chat()
    const r1 = await chat.texto("paguei 500 daquela conta no pix")
    expect(r1.mensagens.at(-1)).toMatch(/^Qual conta você pagou\?\n1\) Aluguel da loja \(Imobiliária\) — R\$ 2\.500,00, vence 28\/11\/2026\n2\) /)
    const r2 = await chat.texto("1")
    expect(r2.mensagens[0]).toBe("Pagamento de R$ 500,00 da conta “Aluguel da loja”.")
    expect(r2.mensagens[1]).toContain("Conta: Itaú PJ")
  })
})

describe("contexto conversacional", () => {
  it("pergunta perfil quando há pessoal e empresa, e mantém o perfil escolhido", async () => {
    const c = montarCenario({ perfisA: [PESSOAL_A, LOJA_CENTRO] })
    const chat = c.chat()
    const r1 = await chat.texto("gastei 250 no mercado no pix")
    expect(r1.mensagens.at(-1)).toBe("Em qual perfil devo registrar?\n1) Pessoal\n2) Loja Centro")
    const r2 = await chat.texto("2")
    expect(r2.mensagens[2]).toBe("Conta: Itaú PJ · Data: hoje (27/11/2026) · Perfil: Loja Centro · Categoria “Supermercado” não cadastrada: ficará sem categoria")
    await chat.texto("sim")
    expect(c.execucao.chamadas[0].perfilId).toBe("pf_loja_centro")
    expect(c.execucao.chamadas[0].proposta).not.toHaveProperty("categoriaId")
    // próxima operação reaproveita o perfil escolhido (visível no resumo)
    const r3 = await chat.texto("gastei 80 de energia no pix")
    expect(r3.mensagens[2]).toContain("Perfil: Loja Centro")
  })

  it("perfil indicado no texto dispensa a pergunta", async () => {
    const c = montarCenario({ perfisA: [PESSOAL_A, LOJA_CENTRO] })
    const r = await c.chat().texto("gastei 250 no mercado no pix pelo nubank, pessoal")
    expect(r.codigo).toBe("aguardando_confirmacao")
    expect(r.mensagens[2]).toContain("Perfil: Pessoal")
  })

  it("troca de perfil antes de confirmar NÃO copia ids do perfil anterior", async () => {
    const c = montarCenario({ perfisA: [PESSOAL_A, LOJA_CENTRO] })
    const chat = c.chat()
    await chat.texto("gastei 120 de energia no pix na loja centro")
    const r = await chat.texto("na verdade é pessoal")
    expect(r.mensagens.at(-1)).toContain("De qual conta") // conta da loja descartada
    await chat.texto("1")
    await chat.texto("sim")
    expect(c.execucao.chamadas[0]).toMatchObject({ perfilId: "pf_pessoal_a",
      proposta: { carteiraId: "ct_nubank_a", categoriaId: "cat_energia_a" } })
  })

  it("edição antes da confirmação gera nova versão; botão antigo é recusado", async () => {
    const c = montarCenario()
    const chat = c.chat()
    const r1 = await chat.texto("gastei 250 no mercado no pix pelo nubank")
    const tokenV1 = r1.confirmacao!.token
    const r2 = await chat.texto("na verdade foi 300")
    expect(r2.codigo).toBe("corrigido")
    expect(r2.mensagens[0]).toBe("Despesa de R$ 300,00 em Supermercado.")
    expect(r2.confirmacao!.versao).toBe(2)
    expect(r2.confirmacao!.token).not.toBe(tokenV1)
    const r3 = await chat.texto("sim", { confirmacaoToken: tokenV1 })
    expect(r3.codigo).toBe("confirmacao_desatualizada")
    expect(c.execucao.chamadas).toHaveLength(0)
    const r4 = await chat.texto("sim", { confirmacaoToken: r2.confirmacao!.token })
    expect(r4.codigo).toBe("registrado")
    expect(c.execucao.chamadas[0].proposta).toMatchObject({ valorCentavos: "30000" })
  })

  it("“sim, mas no débito” corrige em vez de confirmar", async () => {
    const c = montarCenario()
    const chat = c.chat()
    await chat.texto("gastei 250 no mercado no pix pelo nubank")
    const r = await chat.texto("sim, mas foi no débito")
    expect(r.codigo).toBe("corrigido")
    expect(r.mensagens[1]).toBe("Pagamento via débito.")
    expect(c.execucao.chamadas).toHaveLength(0)
  })

  it("resposta a uma mensagem de confirmação antiga (reply) é recusada", async () => {
    const c = montarCenario()
    const chat = c.chat()
    const r1 = await chat.texto("gastei 250 no mercado no pix pelo nubank")
    await chat.texto("na verdade foi no débito")
    const r = await chat.texto("sim", { respondendoA: r1.respostaId })
    expect(r.codigo).toBe("confirmacao_desatualizada")
    expect(c.execucao.chamadas).toHaveLength(0)
  })

  it("“não” pede o que corrigir e mantém o rascunho", async () => {
    const c = montarCenario()
    const chat = c.chat()
    await chat.texto("gastei 250 no mercado no pix pelo nubank")
    const r = await chat.texto("não")
    expect(r.codigo).toBe("aguardando_correcao")
    expect(r.rascunho?.estado).toBe("AGUARDANDO_CONFIRMACAO")
  })

  it("cancelamento descarta o rascunho e nada é gravado", async () => {
    const c = montarCenario()
    const chat = c.chat()
    await chat.texto("gastei 250 no mercado no pix pelo nubank")
    const r = await chat.texto("cancela")
    expect(r).toMatchObject({ codigo: "cancelado", mensagens: ["Operação cancelada. Nada foi registrado."] })
    expect((await chat.texto("sim")).codigo).toBe("nada_pendente")
    expect(c.execucao.chamadas).toHaveLength(0)
  })

  it("rascunho expira com segurança", async () => {
    const c = montarCenario()
    const chat = c.chat()
    await chat.texto("gastei 250 no mercado no pix pelo nubank")
    c.avancar(15 * 60_000 + 1)
    const r = await chat.texto("sim")
    expect(r.mensagens).toEqual(["A operação pendente expirou por segurança e não foi registrada.", "Não há nenhuma operação aguardando confirmação."])
    expect(c.execucao.chamadas).toHaveLength(0)
  })

  it("interação renova o prazo do rascunho", async () => {
    const c = montarCenario()
    const chat = c.chat()
    await chat.texto("gastei 250 no mercado no pix")
    c.avancar(10 * 60_000)
    await chat.texto("nubank")
    c.avancar(10 * 60_000)
    expect((await chat.texto("sim")).codigo).toBe("registrado")
  })

  it("valores ambíguos: pergunta, não escolhe", async () => {
    const c = montarCenario()
    const chat = c.chat()
    const r1 = await chat.texto("Gastei 250 no mercado e 30 na padaria no pix pelo nubank")
    expect(r1.mensagens.at(-1)).toBe("Encontrei mais de um valor na mensagem. Qual é o valor da operação?\n1) R$ 250,00\n2) R$ 30,00")
    const r2 = await chat.texto("1")
    expect(r2.mensagens[0]).toBe("Despesa de R$ 250,00 em Supermercado.")
  })

  it("falta só o valor: resposta complementar com número", async () => {
    const c = montarCenario()
    const chat = c.chat()
    const r1 = await chat.texto("gastei no mercado no pix pelo nubank")
    expect(r1.mensagens.at(-1)).toBe("Qual foi o valor?")
    const r2 = await chat.texto("87,35")
    expect(r2.mensagens[0]).toBe("Despesa de R$ 87,35 em Supermercado.")
  })

  it("nova operação com rascunho aberto não mistura os dados", async () => {
    const c = montarCenario()
    const chat = c.chat()
    await chat.texto("gastei 250 no mercado no pix pelo nubank")
    const r = await chat.texto("gastei 90 de gasolina no débito")
    expect(r.codigo).toBe("rascunho_pendente")
    expect(r.mensagens[0]).toContain("Despesa de R$ 250,00")
  })

  it("número solto respondendo a outra pergunta não altera o valor", async () => {
    const c = montarCenario()
    const chat = c.chat()
    await chat.texto("gastei 250 no mercado")
    const r1 = await chat.texto("1") // pergunta atual: forma de pagamento (sem opções)
    expect(r1.codigo).toBe("nao_entendi_complemento")
    await chat.texto("pix")
    const r3 = await chat.texto("1") // opção 1 da conta
    expect(r3.mensagens[0]).toBe("Despesa de R$ 250,00 em Supermercado.")
  })

  it("“na loja de roupas” não é perfil empresarial", async () => {
    const c = montarCenario({ perfisA: [PESSOAL_A, LOJA_CENTRO] })
    const r = await c.chat().texto("gastei 200 na loja de roupas no pix")
    expect(r.mensagens.at(-1)).toContain("Em qual perfil devo registrar?")
  })

  it("resposta incompreensível repete a pergunta", async () => {
    const c = montarCenario()
    const chat = c.chat()
    await chat.texto("gastei 250 no mercado no pix")
    const r = await chat.texto("hmmm")
    expect(r.codigo).toBe("nao_entendi_complemento")
    expect(r.mensagens.at(-1)).toContain("De qual conta")
  })

  it("aviso de possível duplicidade dentro de 10 minutos", async () => {
    const c = montarCenario()
    const chat = c.chat()
    await chat.texto("gastei 250 no mercado no pix pelo nubank")
    await chat.texto("sim")
    c.avancar(2 * 60_000)
    const r = await chat.texto("gastei 250 no mercado no pix pelo nubank")
    expect(r.mensagens).toContain("Atenção: você registrou uma operação igual há 2 min. Se for outra, confirme; se for repetição, cancele.")
  })

  it("correção sem rascunho não altera lançamento já gravado", async () => {
    const c = montarCenario()
    const r = await c.chat().texto("na verdade foi 300")
    expect(r.codigo).toBe("correcao_sem_rascunho")
  })
})

describe("consultas inteligentes — somente números do G005", () => {
  const permitidos = (() => {
    const set = new Set<string>()
    for (const f of [fixturePessoal({ dataInicio: "2026-11-01" }), fixturePessoal({ dataInicio: "2026-10-01" }), fixtureLoja()]) {
      for (const v of [f.despesaRealizadaCentavos, f.receitaRealizadaCentavos, f.resultadoCentavos, f.saldoCentavos,
        f.pagarAbertoCentavos, f.receberAbertoCentavos, ...f.porCategoria.map(x => x.despesaCentavos),
        ...f.contas.map(x => x.saldoCentavos), ...f.pagar.map(x => x.restanteCentavos)]) set.add(BigInt(v).toString())
    }
    set.add("291290") // soma de 2 linhas que vencem amanhã (250000 + 41290)
    set.add("36550") // diferença entre meses (234550 - 198000)
    return set
  })()

  it.each([
    ["Quanto gastei este mês?", ["Você gastou R$ 2.345,50 neste mês."], "GASTOS"],
    ["Quanto gastei com mercado este mês?", ["Você gastou R$ 987,20 em Supermercado neste mês (6 lançamentos)."], "GASTOS"],
    ["Quanto ainda estou devendo?", ["Você ainda deve R$ 800,00 em 1 conta a pagar.",
      "• Compra de estoque (Fornecedor Alfa): R$ 800,00 — vence 10/12/2026"], "DIVIDAS"],
    ["Qual meu saldo?", ["Saldo atual: R$ 5.123,40", "• Nubank: R$ 4.983,40", "• Carteira: R$ 140,00"], "SALDO"],
    ["Onde mais gastei este mês?", ["Gastos por categoria neste mês:", "• Alimentação: R$ 1.178,30", "• Supermercado: R$ 987,20",
      "• Energia: R$ 180,00", "Total: R$ 2.345,50"], "POR_CATEGORIA"],
    ["Como estão as receitas e despesas do mês?", ["Resumo neste mês:", "• Receitas: R$ 6.500,00", "• Despesas: R$ 2.345,50",
      "• Resultado: R$ 4.154,50"], "RECEITAS_DESPESAS"],
    ["Compara meus gastos com o mês passado", ["Gastos até hoje neste mês: R$ 2.345,50.", "No mesmo período do mês passado: R$ 1.980,00.",
      "Diferença: R$ 365,50 a mais."], "COMPARATIVO"],
    ["Quanto recebi este mês?", ["Você recebeu R$ 6.500,00 neste mês."], "RECEITAS"],
  ])("%s", async (pergunta, esperado, tipo) => {
    const c = montarCenario()
    const r = await c.chat().texto(pergunta)
    expect(r.codigo).toBe("consulta")
    expect(r.mensagens.slice(0, esperado.length)).toEqual(esperado)
    expect(r.mensagens.at(-1)).toBe("(Pessoal · base caixa realizado)")
    expect(r.consulta).toMatchObject({ tipo, fonte: "G005_CONSULTA_CANONICA", versaoCalculo: "g005-caixa-1" })
    for (const v of valoresDaResposta(r.mensagens)) expect(permitidos.has(BigInt(v).toString())).toBe(true)
    expect(c.execucao.chamadas).toHaveLength(0)
  })

  it("“Quais contas vencem amanhã?” filtra linhas do G005 e ignora título quitado", async () => {
    const c = montarCenario({ perfisA: [LOJA_CENTRO] })
    const r = await c.chat().texto("Quais contas vencem amanhã?")
    expect(r.mensagens).toEqual(["Contas que vencem amanhã:", "• Aluguel da loja (Imobiliária): R$ 2.500,00 — 28/11/2026",
      "• Energia da loja: R$ 412,90 — 28/11/2026", "Total: R$ 2.912,90", "(Loja Centro · base caixa realizado)"])
    for (const v of valoresDaResposta(r.mensagens)) expect(permitidos.has(BigInt(v).toString())).toBe(true)
  })

  it("período da semana e do dia vão ao G005 como filtro explícito", async () => {
    const c = montarCenario()
    await c.chat().texto("quanto gastei essa semana?")
    expect(c.consulta.chamadas[0].filtro).toEqual({ base: "CAIXA_REALIZADO", timezone: "America/Sao_Paulo", moeda: "BRL",
      dataInicio: "2026-11-23", dataFim: "2026-11-27" })
  })

  it("faturas por ciclo vêm do G005 (cartoes[]); sem a projeção, indisponível sem estimar", async () => {
    const c = montarCenario()
    const r = await c.chat().texto("qual o valor da fatura do cartão?")
    expect(r.mensagens[0]).toBe("Nubank Crédito:")
    expect(r.mensagens[1]).toContain("Fatura 2026-12")
    const loja = montarCenario({ perfisA: [LOJA_CENTRO] })
    loja.consulta.semCartoes = true
    expect((await loja.chat().texto("qual o valor da fatura do cartão?")).mensagens[0]).toContain("não está disponível agora")
  })

  it("sem dados: responde que não encontrou, sem inventar", async () => {
    const c = montarCenario()
    const r = await c.chat().texto("quanto gastei com aluguel este mês?")
    expect(r.mensagens[0]).toBe("Não encontrei gastos em Aluguel neste mês.")
  })

  it("perfil ambíguo em consulta: pergunta qual", async () => {
    const c = montarCenario({ perfisA: [PESSOAL_A, LOJA_CENTRO] })
    const r = await c.chat().texto("Quanto gastei este mês?")
    expect(r.codigo).toBe("consulta_perfil_ambiguo")
    expect(c.consulta.chamadas).toHaveLength(0)
    const r2 = await c.chat(USUARIO_A, "conversa-2").texto("Quanto gastei este mês na loja centro?")
    expect(r2.mensagens[0]).toBe("Você gastou R$ 18.734,00 neste mês.")
  })

  it("consulta no meio de um rascunho responde e lembra a pendência", async () => {
    const c = montarCenario()
    const chat = c.chat()
    await chat.texto("gastei 250 no mercado no pix pelo nubank")
    const r = await chat.texto("quanto gastei este mês?")
    expect(r.mensagens.at(-1)).toBe("Lembrete: há uma operação aguardando sua confirmação.")
    expect((await chat.texto("sim")).codigo).toBe("registrado")
  })

  it("falha do G005 não vira número", async () => {
    const c = montarCenario()
    c.consulta.consultar = async () => { throw new Error("g005_indisponivel") }
    const r = await c.chat().texto("quanto gastei hoje?")
    expect(r.codigo).toBe("consulta_indisponivel")
    expect(valoresDaResposta(r.mensagens)).toEqual([])
  })
})
