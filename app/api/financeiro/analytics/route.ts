import { gestorMoneyAtivo } from "@/lib/gastos/ativacao"
import { GET as getLegadoMain } from "@/lib/financeiro/legado-main/rotas/analytics"
import { requireModuleApi } from "@/lib/auth/module-access"
import { erroConsultaFinanceira } from "@/lib/gastos/query"
import { apiGuardLeituraFinanceira, respostaFinanceiraPrivada } from "@/lib/gastos/read-scope"
import { consultarFinanceiroEmpresa, reaisConsulta } from "@/lib/gastos/query"
import { diaNoFusoConsulta } from "@/lib/gastos/query-calculo"
import { projetarFluxoConsulta } from "@/lib/financeiro/services/relatorios-financeiros-service"
import { NextResponse } from "next/server"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
export const runtime="nodejs"
export const dynamic="force-dynamic"
export const revalidate=0
export async function GET(req:Request){
  // Ativação controlada: desligado, a rota é a da main (consulta limitada ao período, tolerante ao legado).
  if (!gestorMoneyAtivo()) return respostaFinanceiraPrivada(await getLegadoMain(req as never))
  // Reconciliação main: módulo finance por loja antes de qualquer leitura.
  const moduleDenied=await requireModuleApi(req,"finance")
  if(moduleDenied)return respostaFinanceiraPrivada(moduleDenied)
  const storeId=opsLojaIdFromRequest(req)
  if(!storeId)return respostaFinanceiraPrivada(NextResponse.json({ok:false,error:"storeId obrigatório"},{status:400}))
  const denied=await apiGuardLeituraFinanceira(storeId,undefined,req)
  if(denied)return respostaFinanceiraPrivada(denied)
  try{
    const url=new URL(req.url),hoje=diaNoFusoConsulta(new Date()),inicio=new Date(hoje+"T12:00:00Z");inicio.setUTCDate(1);inicio.setUTCMonth(inicio.getUTCMonth()-5)
    const q=await consultarFinanceiroEmpresa(storeId,{dataInicio:url.searchParams.get("dataInicio")??inicio.toISOString().slice(0,10),dataFim:url.searchParams.get("dataFim")??hoje,
      ...(url.searchParams.get("carteiraId")?{carteiraId:url.searchParams.get("carteiraId")!}:{}),...(url.searchParams.get("categoriaId")?{categoriaId:url.searchParams.get("categoriaId")!}:{})})
    const fluxoMensal=projetarFluxoConsulta(q,"mes").map(p=>({mes:p.periodo,entrada:p.entrada,saida:p.saida}))
    const porMovimento=new Map<string,{id:string;desc:string;tipo:string;valorCentavos:bigint;data:string}>()
    for(const e of q.eventos){if(e.transferencia)continue;const p=porMovimento.get(e.movimentoId);porMovimento.set(e.movimentoId,{id:e.movimentoId,desc:e.descricao,tipo:e.tipo,valorCentavos:(p?.valorCentavos??BigInt(0))+BigInt(e.valorCentavos),data:e.dia})}
    const movimentacoes=[...porMovimento.values()].reverse().slice(0,20).map(({valorCentavos,...row})=>({...row,valor:reaisConsulta(valorCentavos)}))
    const receitasOrigem=q.porCategoria.filter(c=>BigInt(c.receitaCentavos)!==BigInt(0)).map(c=>({name:c.categoria,value:reaisConsulta(c.receitaCentavos)}))
    const despesasCategoria=q.porCategoria.filter(c=>BigInt(c.despesaCentavos)!==BigInt(0)).map(c=>({name:c.categoria,value:reaisConsulta(c.despesaCentavos)}))
    const totalRecebido=reaisConsulta(q.receitaRealizadaCentavos),totalPago=reaisConsulta(q.despesaRealizadaCentavos)
    const resultadoLoja=[{loja:q.lojaNome??storeId,receita:totalRecebido,despesa:totalPago,totalReceber:reaisConsulta(q.receberAbertoCentavos),totalRecebido,totalPagar:reaisConsulta(q.pagarAbertoCentavos),totalPago,saldo:reaisConsulta(q.resultadoCentavos)}]
    return respostaFinanceiraPrivada(NextResponse.json({ok:true,fluxoMensal,movimentacoes,receitasOrigem,despesasCategoria,resultadoLoja}))
  }catch(e){const erro=erroConsultaFinanceira(e);return respostaFinanceiraPrivada(NextResponse.json(erro.body,{status:erro.status}))}
}
