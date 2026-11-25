/** Fluxo físico, posição atual dos títulos e saldo pelo ledger canônico G005. */
import { type ConsultaFinanceiraDTO, consultarFinanceiroEmpresa, reaisConsulta } from "@/lib/gastos/query"
import { centavosConsulta, dataCivilConsulta, diaNoFusoConsulta, deslocarDiaConsulta } from "@/lib/gastos/query-calculo"
import { safeMoney } from "@/lib/financeiro/contracts/valores"
export type FluxoDia = {
  data: string      // yyyy-mm-dd
  label: string     // dd/mm
  entrada: number
  saida: number
  saldo: number     // entrada - saida do dia
}

export type FluxoCaixaProximo = {
  id: string
  descricao: string   // cliente/fornecedor
  valor: number
  vencimento: string  // original pt-BR
  diasRestantes: number
}

export type AlertaFinanceiro = {
  tipo: "vencido_receber" | "vencido_pagar" | "caixa_negativo" | "alto_pagar_mes" | "proximo_vencimento" | "carteira_negativa" | "saldo_critico"
  mensagem: string
  valor?: number
  urgente: boolean
}

export type FluxoCaixaResumo = {
  apuracao: { base: "FLUXO_FISICO"; resultado: "CAIXA_REALIZADO"; asOf: string; versaoCalculo: string; semCarteira: { quantidade:number; entradasCentavos:string; saidasCentavos:string }; criterios: ConsultaFinanceiraDTO["criterios"] }
  saldoAtual: number
  entradasHoje: number
  saidasHoje: number
  entradasMes: number
  saidasMes: number
  saldoMes: number
  totalReceberAberto: number
  totalPagarAberto: number
  totalVencidosReceber: number
  totalVencidosPagar: number
  qtdVencidosReceber: number
  qtdVencidosPagar: number
  proximosRecebimentos7Dias: { total: number; count: number; items: FluxoCaixaProximo[] }
  proximosPagamentos7Dias: { total: number; count: number; items: FluxoCaixaProximo[] }
  fluxoDiarioUltimos30Dias: FluxoDia[]
  alertas: AlertaFinanceiro[]
}


export async function getFluxoCaixaResumo(storeId: string): Promise<FluxoCaixaResumo> {
  const hoje = diaNoFusoConsulta(new Date()), mes = hoje.slice(0,7), from = deslocarDiaConsulta(hoje,-29)
  const q = await consultarFinanceiroEmpresa(storeId,{dataInicio:from < mes+"-01" ? from : mes+"-01",dataFim:hoje})
  const saldoAtual = reaisConsulta(q.saldoCentavos)
  const somar = (rows: typeof q.eventos, tipo: string) => reaisConsulta(rows.filter(e=>!e.transferencia&&e.tipo===tipo).reduce((s,e)=>s+BigInt(e.valorCentavos),BigInt(0)))
  const doDia=q.eventos.filter(e=>e.dia===hoje), doMes=q.eventos.filter(e=>e.dia.startsWith(mes))
  const entradasHoje=somar(doDia,"entrada"),saidasHoje=somar(doDia,"saida"),entradasMes=somar(doMes,"entrada"),saidasMes=somar(doMes,"saida")
  const fluxoDiarioUltimos30Dias: FluxoDia[]=Array.from({length:30},(_,i)=>{
    const data=deslocarDiaConsulta(from,i),rows=q.eventos.filter(e=>e.dia===data),entrada=somar(rows,"entrada"),saida=somar(rows,"saida")
    return {data,label:data.slice(8,10)+"/"+data.slice(5,7),entrada,saida,saldo:safeMoney(entrada-saida)}
  })
  const totalReceberAberto=reaisConsulta(q.receberAbertoCentavos),totalPagarAberto=reaisConsulta(q.pagarAbertoCentavos)
  const dias=(v:string)=>{try{return Math.round((Date.parse(dataCivilConsulta(v))-Date.parse(hoje))/86400000)}catch{return null}}
  const vencidos=(rows:typeof q.pagar)=>rows.filter(t=>BigInt(t.restanteCentavos)>BigInt(0)&&dias(t.vencimento)!==null&&dias(t.vencimento)!<0)
  const vr=vencidos(q.receber),vp=vencidos(q.pagar),qtdVencidosReceber=vr.length,qtdVencidosPagar=vp.length
  const totalVencidosReceber=reaisConsulta(vr.reduce((s,t)=>s+BigInt(t.restanteCentavos),BigInt(0))),totalVencidosPagar=reaisConsulta(vp.reduce((s,t)=>s+BigInt(t.restanteCentavos),BigInt(0)))
  const proximos=(rows:typeof q.pagar):FluxoCaixaProximo[]=>rows.filter(t=>BigInt(t.restanteCentavos)>BigInt(0)&&dias(t.vencimento)!==null&&dias(t.vencimento)!>=0&&dias(t.vencimento)!<=7).map(t=>({id:t.id,descricao:t.contraparte||t.descricao,valor:reaisConsulta(t.restanteCentavos),vencimento:t.vencimento,diasRestantes:dias(t.vencimento)!})).sort((a,b)=>a.diasRestantes-b.diasRestantes)
  const proximosReceberItems=proximos(q.receber),proximosPagarItems=proximos(q.pagar)
  const totalProximos = (items: FluxoCaixaProximo[]) => reaisConsulta(items.reduce((s, item) => s + centavosConsulta(item.valor), BigInt(0)))
  const todasCarteiras=q.contas.filter(c=>c.ativo&&c.tipo!=="credito").map(c=>({...c,saldoAtual:reaisConsulta(c.saldoCentavos)}))
  // ── Alertas financeiros ────────────────────────────────────────────────────
  const alertas: AlertaFinanceiro[] = []

  if (qtdVencidosReceber > 0) {
    alertas.push({
      tipo: "vencido_receber",
      mensagem: `${qtdVencidosReceber} conta${qtdVencidosReceber > 1 ? "s" : ""} a receber vencida${qtdVencidosReceber > 1 ? "s" : ""} — total ${totalVencidosReceber.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
      valor: totalVencidosReceber,
      urgente: qtdVencidosReceber >= 3 || totalVencidosReceber >= 1000,
    })
  }

  if (qtdVencidosPagar > 0) {
    alertas.push({
      tipo: "vencido_pagar",
      mensagem: `${qtdVencidosPagar} conta${qtdVencidosPagar > 1 ? "s" : ""} a pagar vencida${qtdVencidosPagar > 1 ? "s" : ""} — total ${totalVencidosPagar.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
      valor: totalVencidosPagar,
      urgente: true,
    })
  }

  if (saldoAtual < 0) {
    alertas.push({
      tipo: "caixa_negativo",
      mensagem: `Saldo de caixa negativo: ${saldoAtual.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
      valor: saldoAtual,
      urgente: true,
    })
  }

  if (saidasMes > 0 && entradasMes > 0 && saidasMes / entradasMes > 0.85) {
    alertas.push({
      tipo: "alto_pagar_mes",
      mensagem: `Despesas do mês (${saidasMes.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) representam ${Math.round((saidasMes / entradasMes) * 100)}% das receitas`,
      valor: saidasMes,
      urgente: saidasMes >= entradasMes,
    })
  }

  // Alertas de carteiras: negativas e saldo crítico (<= 100)
  for (const c of todasCarteiras) {
    const saldo = safeMoney(c.saldoAtual)
    if (c.tipo === "caixa" && saldo < 0) {
      alertas.push({
        tipo: "caixa_negativo",
        mensagem: `Caixa "${c.nome}" está negativo: ${saldo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
        valor: saldo,
        urgente: true,
      })
    } else if (saldo < 0) {
      alertas.push({
        tipo: "carteira_negativa",
        mensagem: `Carteira "${c.nome}" (${c.tipo}) está negativa: ${saldo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
        valor: saldo,
        urgente: true,
      })
    } else if (saldo > 0 && saldo <= 100) {
      alertas.push({
        tipo: "saldo_critico",
        mensagem: `Saldo crítico em "${c.nome}": ${saldo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} restantes`,
        valor: saldo,
        urgente: saldo <= 20,
      })
    }
  }

  const venceHojeReceber = proximosReceberItems.filter((x) => x.diasRestantes === 0)
  if (venceHojeReceber.length > 0) {
    const total = totalProximos(venceHojeReceber)
    alertas.push({
      tipo: "proximo_vencimento",
      mensagem: `${venceHojeReceber.length} recebimento${venceHojeReceber.length > 1 ? "s" : ""} vence${venceHojeReceber.length > 1 ? "m" : ""} hoje — ${total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
      valor: total,
      urgente: false,
    })
  }

  const venceHojePagar = proximosPagarItems.filter((x) => x.diasRestantes === 0)
  if (venceHojePagar.length > 0) {
    const total = totalProximos(venceHojePagar)
    alertas.push({
      tipo: "proximo_vencimento",
      mensagem: `${venceHojePagar.length} pagamento${venceHojePagar.length > 1 ? "s" : ""} vence${venceHojePagar.length > 1 ? "m" : ""} hoje — ${total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
      valor: total,
      urgente: true,
    })
  }

  // Ordenar alertas: urgentes primeiro
  alertas.sort((a, b) => Number(b.urgente) - Number(a.urgente))

  return {
    apuracao: { base: "FLUXO_FISICO", resultado: "CAIXA_REALIZADO", asOf: q.asOf, versaoCalculo: q.versaoCalculo, semCarteira:q.semCarteira, criterios:q.criterios },
    saldoAtual,
    entradasHoje,
    saidasHoje,
    entradasMes,
    saidasMes,
    saldoMes: safeMoney(entradasMes - saidasMes),
    totalReceberAberto,
    totalPagarAberto,
    totalVencidosReceber,
    totalVencidosPagar,
    qtdVencidosReceber,
    qtdVencidosPagar,
    proximosRecebimentos7Dias: {
      total: totalProximos(proximosReceberItems),
      count: proximosReceberItems.length,
      items: proximosReceberItems.slice(0, 5),
    },
    proximosPagamentos7Dias: {
      total: totalProximos(proximosPagarItems),
      count: proximosPagarItems.length,
      items: proximosPagarItems.slice(0, 5),
    },
    fluxoDiarioUltimos30Dias,
    alertas,
  }
}
