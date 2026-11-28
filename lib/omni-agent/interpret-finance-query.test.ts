import { describe, expect, it } from "vitest"
import { interpretOmniAgentCommand } from "./interpret"
describe("G005 consultas do Omni Agent",()=>{
  it.each(["Quanto paguei de energia neste mês?","Quanto ainda tenho a pagar?","Qual foi o gasto realizado em alimentação?","Qual o total de pagamentos da loja no período?"])("pergunta nunca vira escrita: %s",text=>{
    expect(interpretOmniAgentCommand(text)).toMatchObject({intent:"FINANCE_SUMMARY",requiresConfirmation:false})
  })
  it("extrai categoria estruturada a resolver e período explícito",()=>expect(interpretOmniAgentCommand("Quanto paguei de energia neste mês?").fields).toMatchObject({categoriaNome:"energia",preset:"estemes"}))
  it("mantém período não informado para esclarecimento pelo executor",()=>expect(interpretOmniAgentCommand("Qual foi o gasto realizado em alimentação?").fields).toMatchObject({preset:"",categoriaNome:"alimentação"}))
  it("preserva referência a pessoal para recusa no executor empresarial",()=>expect(interpretOmniAgentCommand("Quanto gastei no perfil pessoal hoje?").fields.perfil).toBe("PESSOAL"))
  it("não inventa hoje no resumo sem período e preserva mês passado",()=>{
    expect(interpretOmniAgentCommand("Resumo financeiro").fields.preset).toBe("")
    expect(interpretOmniAgentCommand("Qual foi meu faturamento mês passado?").fields.preset).toBe("mespassado")
  })
})
