import { describe, expect, it } from "vitest"
import { centavosConsulta, saldoTituloConsulta, reaisConsulta, dataCivilConsulta, diaNoFusoConsulta, intervaloConsulta, inicioDiaConsulta } from "./query-calculo"

describe("G005 precisão e saldo restante", () => {
  it.each([[0.01,"1"],[80.20,"8020"],[1234.56,"123456"],[365.01,"36501"],[90000000000,"9000000000000"]])("representa %s exatamente", (v, c) => {
    expect(centavosConsulta(v)).toBe(BigInt(c)); expect(reaisConsulta(c)).toBe(v)
  })
  it.each([NaN,Infinity,1.001,0.0001,90000000000.01])("recusa precisão/limite %s sem arredondar", v => expect(() => centavosConsulta(v)).toThrow())
  it("recusa divergência Float/centavos", () => expect(() => centavosConsulta(20,"2001")).toThrow())
  it("parciais e estorno legados conservam eventos individuais", () => {
    const payload={historico:[{tipo:"pagamento",valor:200},{tipo:"pagamento",valor:40},{tipo:"estorno_pagamento",valor:40,refHistoricoIndex:1}]}
    expect(saldoTituloConsulta({valor:365.01,status:"parcial",payload})).toMatchObject({pago:BigInt(20000),restante:BigInt(16501)})
  })
  it("espelho JSON não duplica pagamentos estruturados", () => {
    const row={valor:365.01,status:"parcial",payload:{historico:[{tipo:"pagamento",valor:200,pagamentoId:"p1"}]},alocacoesPagamento:[{pagamentoId:"p1",valorCentavos:"20000",pagamento:{tipo:"PAGAMENTO"}}]}
    expect(saldoTituloConsulta(row).restante).toBe(BigInt(16501))
    expect(() => saldoTituloConsulta({...row,alocacoesPagamento:[]})).toThrow()
  })
  it("compensação estruturada reduz o pagamento da obrigação original", () => {
    expect(saldoTituloConsulta({valor:100,status:"parcial",alocacoesPagamento:[{pagamentoId:"p1",valorCentavos:"10000",pagamento:{tipo:"PAGAMENTO"}},{pagamentoId:"p2",valorCentavos:"2000",pagamento:{tipo:"ESTORNO"}}]})).toMatchObject({pago:BigInt(8000),restante:BigInt(2000)})
  })
  it.each([-10,200])("não mascara histórico inválido %s", v => expect(()=>saldoTituloConsulta({valor:100,status:"parcial",payload:{historico:[{tipo:"pagamento",valor:v}]}})).toThrow())
  it("posição quitada legada sem histórico não inventa movimento de caixa", () => expect(saldoTituloConsulta({valor:365.01,status:"pago"}).restante).toBe(BigInt(0)))
  it("parcial sem cobertura exige revisão", () => expect(()=>saldoTituloConsulta({valor:365.01,status:"parcial"})).toThrow())
  it("estorno legado sem vínculo individual exige revisão", () => expect(()=>saldoTituloConsulta({valor:100,status:"parcial",payload:{historico:[{tipo:"pagamento",valor:80},{tipo:"estorno_pagamento",valor:20}]}})).toThrow())
  it("cancelamento/inativação não deixam dívida exigível", () => expect(saldoTituloConsulta({valor:100,status:"pendente",ativo:false}).restante).toBe(BigInt(0)))
})
describe("G005 datas civis e IANA", () => {
  it.each(["2026-02-30","2026-13-01","00/10/2026","20/20/2026","ontem",""])("recusa data %s", d => expect(()=>dataCivilConsulta(d)).toThrow())
  it("preserva dia civil e fronteira de mês SP, independente do timezone do host", () => {
    expect(dataCivilConsulta("30/09/2026")).toBe("2026-09-30")
    expect(diaNoFusoConsulta(new Date("2026-10-01T02:59:00Z"))).toBe("2026-09-30")
    expect(diaNoFusoConsulta(new Date("2026-10-01T03:01:00Z"))).toBe("2026-10-01")
    expect(intervaloConsulta("2026-09-01","2026-09-30")).toEqual({gte:new Date("2026-09-01T03:00:00Z"),lt:new Date("2026-10-01T03:00:00Z")})
  })
  it("intervalo é semiaberto e não depende de UTC como data da loja", () => expect(intervaloConsulta("2026-10-01","2026-10-01").lt.toISOString()).toBe("2026-10-02T03:00:00.000Z"))
  it("trata início civil histórico com horário de verão", () => expect(inicioDiaConsulta("2018-11-04").toISOString()).toBe("2018-11-04T03:00:00.000Z"))
  it("recusa período invertido e timezone inválido", () => {
    expect(()=>intervaloConsulta("2026-10-02","2026-10-01")).toThrow()
    expect(()=>inicioDiaConsulta("2026-10-01","invalido")).toThrow()
  })
})
