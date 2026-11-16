import "server-only"
import { Prisma, type PrismaClient } from "@/generated/prisma"
import { previousQuery, type ReportKind, type ReportQuery, type ReportResponse } from "./contracts"
import { productReport } from "./products"
import { cashFlowReport, dreReport } from "./finance"
import { customerReport } from "./customers"
import { operationsReport } from "./operations"
import { whatsappReport } from "./whatsapp"
import type { ReportDb } from "./sql"

const builders={produtos:productReport,"fluxo-caixa":cashFlowReport,dre:dreReport,clientes:customerReport,os:operationsReport,
  tecnicos:(db:ReportDb,storeId:string,q:ReportQuery)=>operationsReport(db,storeId,q,true),whatsapp:whatsappReport}

export async function buildReport(db:PrismaClient,kind:ReportKind,storeId:string,q:ReportQuery,options:{compare?:boolean;financial?:boolean}={}):Promise<ReportResponse> {
  const started=performance.now(),previous=previousQuery(q)
  const result=await db.$transaction(async tx=>{
    // An accidentally introduced mutation fails at PostgreSQL, even when the role can write.
    await tx.$executeRaw`SET TRANSACTION READ ONLY`
    await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`
    await tx.$executeRaw`SET LOCAL statement_timeout = '12000ms'`
    const current=await builders[kind](tx,storeId,q)
    const before=options.compare===false?null:await builders[kind](tx,storeId,previous)
    return {...current,previousMetrics:before?.metrics.filter(m=>!m.key.startsWith("forecast")&&!m.key.startsWith("overdue")&&m.key!=="projection")??[]}
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:30000,maxWait:5000})
  if ((kind==="os"||kind==="tecnicos")&&!options.financial) {
    result.metrics=result.metrics.filter(m=>m.key!=="cash")
    result.previousMetrics=result.previousMetrics.filter(m=>m.key!=="cash")
    result.columns=result.columns.filter(c=>c.key!=="cash")
    result.rows=result.rows.map(({cash:_,...row})=>row)
  }
  return {...result,storeId,generatedAt:new Date().toISOString(),period:{from:q.from,to:q.to},previousPeriod:{from:previous.from,to:previous.to},page:q.page,pageSize:q.pageSize,durationMs:Math.round(performance.now()-started)}
}
