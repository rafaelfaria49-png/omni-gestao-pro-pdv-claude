import { notFound } from "next/navigation"
import { isReportKind } from "@/lib/relatorios/contracts"
import { EnterpriseReport } from "@/components/dashboard/relatorios/enterprise-report"

export default async function ReportPage({params,searchParams}:{params:Promise<{kind:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const {kind}=await params
  if(!isReportKind(kind))notFound()
  const search=await searchParams
  const text=(key:string)=>typeof search[key]==="string"?search[key] as string:undefined
  return <EnterpriseReport kind={kind} initial={{from:text("from"),to:text("to"),entity:text("entity"),technician:text("technician"),source:text("source"),wallet:text("wallet"),category:text("category"),origin:text("origin"),record:text("record"),status:text("status")}}/>
}
