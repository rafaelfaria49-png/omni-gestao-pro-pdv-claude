import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { canAccessStore, canUseModule, getPermissionsFromSession } from "@/lib/auth/enterprise-permissions"
import type { AccessModule } from "@/lib/auth/access-policy"
import { storeIdFromAssistecRequestForRead,activeStoreIdFromCookieHeader } from "@/lib/store-id-from-request"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { canReadReport,isReportKind,parseReportQuery,type ReportKind } from "@/lib/relatorios/contracts"
import { buildReport } from "@/lib/relatorios/service"
import { csvReport,pdfReport } from "@/lib/relatorios/export"

export const runtime="nodejs"
export const dynamic="force-dynamic"
export const revalidate=0
const PRIVATE={"Cache-Control":"private, no-store, max-age=0","Vary":`Cookie, ${ASSISTEC_LOJA_HEADER}`,"X-Content-Type-Options":"nosniff"}
const modules:Record<ReportKind,AccessModule[]>={produtos:["sales"],"fluxo-caixa":["finance"],dre:["finance"],clientes:["catalog","sales"],os:["service"],tecnicos:["service"],whatsapp:["whatsapp"]}
const fail=(error:string,status:number)=>NextResponse.json({ok:false,error},{status,headers:PRIVATE})

export async function GET(req:Request,context:{params:Promise<{kind:string}>}) {
  const {kind}=await context.params
  if(!isReportKind(kind))return fail("Relatório não encontrado.",404)
  const session=await auth()
  if(!session?.user?.id)return fail("Não autenticado.",401)
  if(session.user.mustChangePassword)return fail("Altere sua senha antes de continuar.",403)
  const storeId=storeIdFromAssistecRequestForRead(req)
  if(!storeId)return fail("Selecione uma loja.",400)
  const url=new URL(req.url)
  const selections=[req.headers.get(ASSISTEC_LOJA_HEADER),url.searchParams.get("storeId"),url.searchParams.get("lojaId"),activeStoreIdFromCookieHeader(req.headers.get("cookie"))].filter((s):s is string=>!!s)
  if(selections.some(s=>!canAccessStore(session,s))||!canAccessStore(session,storeId))return fail("Sem permissão para esta loja.",403)
  const permissions=getPermissionsFromSession(session,storeId)
  if(!canReadReport(permissions,kind)||!["reports",...modules[kind]].every(m=>canUseModule(session,m as AccessModule,storeId)))return fail("Sem permissão para este relatório.",403)
  let query
  try {query=parseReportQuery(url.searchParams)}catch(error){return fail(error instanceof Error?error.message:"Filtros inválidos.",400)}
  const format=url.searchParams.get("format")
  if(format&&!['csv','pdf'].includes(format))return fail("Formato de exportação inválido.",400)
  try {
    const report=await buildReport(prisma,kind,storeId,format?{...query,page:1,pageSize:500}:query,{compare:!format,financial:permissions.financeiro.view&&canUseModule(session,"finance",storeId)})
    if(format){
      if(report.total>500)return fail("O recorte tem mais de 500 registros. Refine o período ou os filtros para exportar o recorte completo.",422)
      const filename=`relatorio-${kind}-${query.from}-${query.to}.${format}`
      const headers={...PRIVATE,"Content-Type":format==="csv"?"text/csv; charset=utf-8":"application/pdf","Content-Disposition":`attachment; filename="${filename}"`}
      return format==="csv"?new Response(csvReport(report),{headers}):new Response(pdfReport(report) as BodyInit,{headers})
    }
    return NextResponse.json({ok:true,...report},{headers:PRIVATE})
  }catch{
    // No exception object, SQL, URL, customer data or credentials in logs/responses.
    console.error("[relatorios] read_failed")
    return fail("Não foi possível gerar o relatório. Tente novamente ou reduza o período.",503)
  }
}
