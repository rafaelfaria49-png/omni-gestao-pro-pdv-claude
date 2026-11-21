"use client"

import Link from "next/link"
import { useEffect,useMemo,useRef,useState,type FormEvent } from "react"
import { useSession } from "next-auth/react"
import { ArrowLeft,ArrowDownToLine,ArrowUpRight,RefreshCw,Search,ShieldCheck,TriangleAlert } from "lucide-react"
import { ResponsiveContainer,LineChart,Line,XAxis,YAxis,Tooltip,CartesianGrid } from "recharts"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { useEnterprisePermissions } from "@/lib/auth/use-enterprise-permissions"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EnterpriseAccessDenied } from "@/components/enterprise/EnterpriseAccessDenied"
import { canReadReport,REPORT_TITLES,saoPauloDay,type ReportKind,type ReportResponse } from "@/lib/relatorios/contracts"
import { formatCell } from "@/lib/relatorios/format"
import { purgeReportCaches } from "@/lib/relatorios/client-privacy"

type Initial={from?:string;to?:string;entity?:string;technician?:string;source?:string;wallet?:string;category?:string;origin?:string;record?:string;status?:string}
const fieldClass="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring"
export function EnterpriseReport({kind,initial}:{kind:ReportKind;initial:Initial}) {
  const {data:session,status}=useSession(),{lojaAtivaId}=useLojaAtiva(),permissions=useEnterprisePermissions()
  const identity=session?.user?.id
  useEffect(()=>{void purgeReportCaches();return ()=>{void purgeReportCaches()}},[identity,lojaAtivaId,status])
  if(status==="loading")return <p role="status" className="p-8 text-muted-foreground">Validando acesso…</p>
  if(status!=="authenticated"||!session?.user?.id||!permissions||!canReadReport(permissions,kind))return <EnterpriseAccessDenied title="Sem acesso ao relatório" description="Seu perfil precisa de acesso à central e ao módulo de origem na loja selecionada."/>
  if(!lojaAtivaId)return <p className="p-8">Selecione uma loja autorizada para consultar os relatórios.</p>
  // Unmount immediately on account/store/permission change. Old rows/downloads cannot cross scope.
  const scope=`${session.user.id}:${lojaAtivaId}:${JSON.stringify(permissions)}`
  return <ReportBody key={scope+kind+JSON.stringify(initial)} kind={kind} storeId={lojaAtivaId} initial={initial}/>
}

function ReportBody({kind,storeId,initial}:{kind:ReportKind;storeId:string;initial:Initial}) {
  const [draft,setDraft]=useState(()=>{
    const to=initial.to??saoPauloDay()
    const parsedTo=/^\d{4}-\d{2}-\d{2}$/.test(to)?Date.parse(`${to}T12:00:00-03:00`):NaN
    // Preserve invalid URL filters for API validation, but never format an invalid Date.
    const from=initial.from??saoPauloDay(new Date((Number.isFinite(parsedTo)?parsedTo:Date.now())-29*86400000))
    return {from,to,q:"",category:initial.category??"",brand:"",status:initial.status??"",wallet:initial.wallet??"",origin:initial.origin??"",record:initial.record??"",sort:kind==="produtos"?"quantity":"value",grain:"day",compare:"previous",pageSize:"20",entity:initial.entity??"",technician:initial.technician??"",source:initial.source??""}
  })
  const [filters,setFilters]=useState(draft),[page,setPage]=useState(1),[version,setVersion]=useState(0)
  const [result,setResult]=useState<{key:string;report:ReportResponse}|null>(null),[error,setError]=useState<string|null>(null)
  const [loading,setLoading]=useState(true),[downloading,setDownloading]=useState(false)
  const download=useRef<AbortController|null>(null),requestId=useRef(0)
  const params=useMemo(()=>new URLSearchParams({...filters,page:String(page)}).toString(),[filters,page])
  const key=storeId+":"+params+":"+version
  const report=result?.key===key?result.report:null
  useEffect(()=>{
    const controller=new AbortController(),id=++requestId.current
    setLoading(true);setError(null);setDownloading(false)
    void fetch(`/api/dashboard/relatorios/${kind}?${params}`,{headers:{[ASSISTEC_LOJA_HEADER]:storeId},cache:"no-store",signal:controller.signal})
      .then(async res=>{const body=await res.json();if(!res.ok)throw new Error(body.error??"Falha ao consultar o relatório.");return body as ReportResponse})
      .then(body=>{
        if(controller.signal.aborted||id!==requestId.current)return
        if(body.storeId!==storeId||body.kind!==kind)throw new Error("A resposta não corresponde ao relatório autorizado. Tente novamente.")
        setResult({key,report:body})
      })
      .catch(reason=>{if(!controller.signal.aborted&&id===requestId.current)setError(reason instanceof Error?reason.message:"Falha ao consultar o relatório.")})
      .finally(()=>{if(!controller.signal.aborted&&id===requestId.current)setLoading(false)})
    return ()=>{controller.abort();download.current?.abort()}
  },[kind,storeId,params,key])
  const change=(name:keyof typeof draft,value:string)=>setDraft(d=>({...d,[name]:value}))
  const apply=(event:FormEvent)=>{event.preventDefault();download.current?.abort();setDownloading(false);setPage(1);setFilters({...draft})}
  const exportReport=async(format:"csv"|"pdf")=>{
    download.current?.abort()
    const controller=new AbortController();download.current=controller;setDownloading(true);setError(null)
    try {
      const res=await fetch(`/api/dashboard/relatorios/${kind}?${params}&format=${format}`,{headers:{[ASSISTEC_LOJA_HEADER]:storeId},cache:"no-store",signal:controller.signal})
      if(!res.ok){const body=await res.json();throw new Error(body.error??"Falha na exportação.")}
      const blob=await res.blob()
      if(controller.signal.aborted)return
      const url=URL.createObjectURL(blob),anchor=document.createElement("a")
      anchor.href=url;anchor.download=`relatorio-${kind}-${filters.from}-${filters.to}.${format}`;anchor.click()
      setTimeout(()=>URL.revokeObjectURL(url),1000)
    }catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:"Falha na exportação.")}
    finally{if(!controller.signal.aborted)setDownloading(false)}
  }
  const previous=new Map(report?.previousMetrics.map(m=>[m.key,m])??[])
  const hasOrigins=report?.rows.some(row=>typeof row.href==="string")??false
  const general=kind==="geral"
  return <div className="mx-auto w-full min-w-0 max-w-[1500px] space-y-6 px-4 py-6 lg:px-6">
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 space-y-2">
        <Link href="/dashboard/relatorios" className="inline-flex min-h-10 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4"/>Central de relatórios</Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{report?.title??REPORT_TITLES[kind]}</h1>
        <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0 text-success"/>Loja {storeId} · leitura autorizada · America/Sao_Paulo</p>
      </div>
      <div className="flex min-w-0 flex-wrap gap-2">
        <Button variant="outline" onClick={()=>setVersion(v=>v+1)} disabled={loading||downloading} aria-label="Atualizar relatório"><RefreshCw className="mr-2 h-4 w-4"/>Atualizar</Button>
        {(["csv","pdf"] as const).map(format=><Button key={format} variant="outline" disabled={!report||loading||downloading} onClick={()=>void exportReport(format)}><ArrowDownToLine className="mr-2 h-4 w-4"/>{format.toUpperCase()}</Button>)}
      </div>
    </div>
    <form onSubmit={apply} className="grid min-w-0 gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Filtros do relatório">
      <label className="grid min-w-0 gap-1 text-xs font-medium">Data inicial<Input aria-label="Data inicial" type="date" value={draft.from} onChange={e=>change("from",e.target.value)} required/></label>
      <label className="grid min-w-0 gap-1 text-xs font-medium">Data final<Input aria-label="Data final" type="date" value={draft.to} onChange={e=>change("to",e.target.value)} min={draft.from} required/></label>
      {!draft.source&&general&&<>
      {([["record","Registro",report?.options?.records],["origin","Origem",report?.options?.origins],["category","Classificação",report?.options?.categories],["status","Situação",report?.options?.statuses]] as const).map(([name,text,options])=>
        <label key={name} className="grid min-w-0 gap-1 text-xs font-medium">{text}<select className={fieldClass} value={draft[name]} onChange={e=>change(name,e.target.value)}><option value="">Todos</option>{options?.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>)}
      <label className="grid min-w-0 gap-1 text-xs font-medium">Busca por referência<Input value={draft.q} onChange={e=>change("q",e.target.value)} maxLength={120} placeholder="Pedido, ID do título ou movimento"/></label>
      </>}
      {!draft.source&&!general&&<>
      <label className="grid min-w-0 gap-1 text-xs font-medium">Comparar com<select className={fieldClass} value={draft.compare} onChange={e=>change("compare",e.target.value)}><option value="previous">Período anterior de igual duração</option><option value="year">Mesmo período do ano anterior</option></select></label>
      <label className="grid min-w-0 gap-1 text-xs font-medium">Agrupar tendência<select className={fieldClass} value={draft.grain} onChange={e=>change("grain",e.target.value)}><option value="day">Dia</option><option value="week">Semana</option><option value="month">Mês</option></select></label>
      <label className="grid min-w-0 gap-1 text-xs font-medium">{kind==="produtos"?"Nome, SKU ou código de barras":"Busca no detalhamento"}<Input value={draft.q} onChange={e=>change("q",e.target.value)} maxLength={120} placeholder="Buscar registros"/></label>
      {(kind==="produtos"||kind==="fluxo-caixa")&&<label className="grid min-w-0 gap-1 text-xs font-medium">Categoria<select className={fieldClass} value={draft.category} onChange={e=>change("category",e.target.value)}><option value="">Todas</option>{report?.options?.categories?.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</select></label>}
      {kind==="produtos"&&<label className="grid min-w-0 gap-1 text-xs font-medium">Marca<select className={fieldClass} value={draft.brand} onChange={e=>change("brand",e.target.value)}><option value="">Todas</option>{report?.options?.brands?.map(b=><option key={b}>{b}</option>)}</select></label>}
      {kind==="fluxo-caixa"&&<label className="grid min-w-0 gap-1 text-xs font-medium">Carteira<select className={fieldClass} value={draft.wallet} onChange={e=>change("wallet",e.target.value)}><option value="">Consolidado</option>{report?.options?.wallets?.map(w=><option key={w.value} value={w.value}>{w.label}</option>)}</select></label>}
      {(["clientes","os","whatsapp"] as ReportKind[]).includes(kind)&&<label className="grid min-w-0 gap-1 text-xs font-medium">Status<select className={fieldClass} value={draft.status} onChange={e=>change("status",e.target.value)}><option value="">Todos</option>
        {(kind==="clientes"?["ativo","inativo","recorrente","sem-compras-recentes"]:kind==="os"?["aberta","diagnostico","aguardando_aprovacao","aprovado","em_execucao","aguardando_peca","pronta","recebida","entregue","cancelada"]:["open","closed"]).map(s=><option key={s}>{s}</option>)}</select></label>}
      {(["produtos","clientes"] as ReportKind[]).includes(kind)&&<label className="grid min-w-0 gap-1 text-xs font-medium">Ordenar<select className={fieldClass} value={draft.sort} onChange={e=>change("sort",e.target.value)}><option value="value">Maior valor líquido</option><option value="quantity">Maior quantidade / frequência</option>{kind==="clientes"&&<option value="name">Nome</option>}</select></label>}
      </>}
      <label className="grid min-w-0 gap-1 text-xs font-medium">Registros por página<select className={fieldClass} value={draft.pageSize} onChange={e=>change("pageSize",e.target.value)}>{[10,20,50,100].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
      <div className="flex min-w-0 items-end"><Button type="submit" className="w-full"><Search className="mr-2 h-4 w-4"/>Aplicar filtros</Button></div>
      {(draft.entity||draft.technician||draft.source)&&<div className="min-w-0 text-xs sm:col-span-2">Detalhamento por vínculo ativo. <button type="button" className="underline" onClick={()=>{const next={...draft,entity:"",technician:"",source:""};setDraft(next);setFilters(next);setPage(1)}}>Remover vínculo</button></div>}
    </form>
    <p className="text-xs text-muted-foreground">Consulta sob demanda · máximo 366 dias · exportação completa do recorte com até {general?"5.000":"500"} registros, incluindo {general?"todos os blocos consolidados, ":""}fontes e limitações.{general&&" Filtros de registro, origem, classificação e situação refinam só o detalhamento."}</p>
    {loading&&<div role="status" className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">Consultando dados persistidos da loja…</div>}
    {error&&<div role="alert" className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm"><span className="min-w-0">{error}</span><Button variant="outline" onClick={()=>setVersion(v=>v+1)}>Tentar novamente</Button></div>}
    {report&&<>
      {report.sections?.length?<GeneralSections report={report}/>:<section className="rounded-xl border border-border bg-card" aria-label="Indicadores do relatório">
        <div className="border-b border-border px-4 py-3 text-xs text-muted-foreground">{report.basis}<span className="mt-1 block">{filters.source||general?"Registro individual ou consolidado: sem comparativo temporal.":`Comparativo: ${report.previousPeriod.from} a ${report.previousPeriod.to}. Estado atual de cadastros/OS não é reconstruído historicamente.`}</span></div>
        <dl className="grid min-w-0 divide-border sm:grid-cols-2 xl:grid-cols-4">{report.metrics.map(m=>{
          const prev=previous.get(m.key)
          return <div key={m.key} className="min-w-0 border-b border-border p-4"><dt className="text-xs text-muted-foreground">{m.label}</dt><dd className="mt-2 break-words text-xl font-semibold tabular-nums text-foreground">{formatCell(m.value,m.format)}</dd>
            {m.value===null?<p className="mt-1 text-xs text-muted-foreground">{m.reason}</p>:prev?.value!==null&&prev?.value!==undefined?<p className="mt-1 text-xs tabular-nums text-muted-foreground">Anterior: {formatCell(prev.value,m.format)} · Δ {formatCell(m.value-prev.value,m.format)}</p>:null}</div>
        })}</dl>
      </section>}
      {report.trend.length>0&&<section className="min-w-0 rounded-xl border border-border bg-card p-4" aria-label="Tendência no período">
        <h2 className="text-sm font-semibold">{kind==="produtos"?"Receita bruta da coorte":kind==="clientes"?"Novos cadastros":kind==="fluxo-caixa"?"Entradas e saídas realizadas":kind==="whatsapp"?"Registros inbound e outbound com ID wamid":"Registros criados"}</h2>
        <div className="mt-4 h-64 min-w-0" role="img" aria-label="Gráfico de tendência; valores disponíveis na tabela e nas exportações"><ResponsiveContainer width="100%" height="100%"><LineChart data={report.trend} margin={{left:0,right:12}}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3"/><XAxis dataKey="label" tick={{fontSize:10,fill:"var(--muted-foreground)"}}/><YAxis tick={{fontSize:10,fill:"var(--muted-foreground)"}} width={60}/><Tooltip contentStyle={{background:"var(--card)",borderColor:"var(--border)",color:"var(--foreground)"}}/><Line type="monotone" name={kind==="fluxo-caixa"?"Entradas":kind==="whatsapp"?"Registros inbound":"Valor"} dataKey="value" stroke="var(--primary)" dot={false} isAnimationActive={false}/>{report.trend.some(t=>t.secondary!==undefined)&&<Line type="monotone" name={kind==="fluxo-caixa"?"Saídas":"Registros outbound"} dataKey="secondary" stroke="var(--warning)" strokeDasharray="5 3" dot={false} isAnimationActive={false}/>}</LineChart></ResponsiveContainer></div>
      </section>}
      <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-card" aria-label="Detalhamento dos registros">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-border p-4"><h2 className="text-sm font-semibold">{general&&!filters.source?"Detalhamento dos registros originais":"Detalhamento"}</h2><p className="text-xs text-muted-foreground">{report.total.toLocaleString("pt-BR")} registros · {report.durationMs} ms</p></div>
        {report.rows.length===0?<p className="p-8 text-center text-sm text-muted-foreground">Nenhum registro corresponde ao período e aos filtros. Amplie o recorte para uma nova consulta.</p>:<>
          <div className="hidden min-w-0 overflow-x-auto md:block">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">{report.title} — loja {storeId}, de {report.period.from} a {report.period.to}</caption>
              <thead className="border-b border-border bg-muted/30"><tr>
                {report.columns.map(c=><th scope="col" key={c.key} className="whitespace-nowrap px-4 py-3 font-medium text-muted-foreground">{c.label}</th>)}
                {hasOrigins&&<th scope="col" className="px-4 py-3">Origem</th>}
              </tr></thead>
              <tbody>{report.rows.map((row,index)=><tr key={String(row.id??index)} className="border-b border-border/60 last:border-0 hover:bg-muted/20">
                {report.columns.map(c=><td key={c.key} className="max-w-64 px-4 py-3 tabular-nums">{formatCell(row[c.key],c.format)}</td>)}
                {hasOrigins&&<td className="px-4 py-3">{typeof row.href==="string"&&<Link className="inline-flex min-h-10 items-center gap-1 whitespace-nowrap text-primary hover:underline" href={row.href}>Ver vínculo<ArrowUpRight className="h-3 w-3"/></Link>}</td>}
              </tr>)}</tbody>
            </table>
          </div>
          <div className="divide-y divide-border md:hidden">{report.rows.map((row,index)=><article key={String(row.id??index)} className="min-w-0 space-y-3 p-4"><dl className="grid min-w-0 grid-cols-2 gap-3">{report.columns.map(c=><div key={c.key} className="min-w-0"><dt className="text-[11px] text-muted-foreground">{c.label}</dt><dd className="mt-1 break-words text-sm font-medium tabular-nums">{formatCell(row[c.key],c.format)}</dd></div>)}</dl>{typeof row.href==="string"&&<Link href={row.href} className="inline-flex min-h-11 items-center gap-1 text-sm text-primary">Ver vínculo de origem<ArrowUpRight className="h-4 w-4"/></Link>}</article>)}</div>
        </>}
        <div className="flex min-w-0 items-center justify-between gap-3 border-t border-border p-4"><Button variant="outline" disabled={page===1||loading} onClick={()=>setPage(p=>p-1)}>Anterior</Button><p className="text-xs tabular-nums">Página {page} de {Math.max(1,Math.ceil(report.total/report.pageSize))}</p><Button variant="outline" disabled={page*report.pageSize>=report.total||loading} onClick={()=>setPage(p=>p+1)}>Próxima</Button></div>
      </section>
      <details className="rounded-xl border border-warning/30 bg-warning/5 p-4" open><summary className="cursor-pointer text-sm font-semibold"><TriangleAlert className="mr-2 inline h-4 w-4"/>Fontes, cobertura e limitações</summary><p className="mt-3 text-xs leading-relaxed text-muted-foreground">{report.source}</p><ul className="mt-3 list-disc space-y-2 pl-5 text-xs leading-relaxed text-muted-foreground">{report.limitations.map((l,i)=><li key={i}>{l}</li>)}</ul><p className="mt-3 text-[11px] text-muted-foreground">Gerado em {formatCell(report.generatedAt,"date")}. Nenhum dado deste relatório é persistido no navegador.</p></details>
    </>}
  </div>
}

/** Blocos consolidados do Relatório Geral. Cada bloco é o total da loja no período, sem paginação. */
function GeneralSections({report}:{report:ReportResponse}) {
  return <div className="grid min-w-0 gap-4">{report.sections!.map(section=><section key={section.key} aria-labelledby={`sec-${section.key}`} className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
    <div className="border-b border-border px-4 py-3"><h2 id={`sec-${section.key}`} className="text-sm font-semibold text-foreground">{section.title}</h2>{section.note&&<p className="mt-1 text-xs leading-relaxed text-muted-foreground">{section.note}</p>}</div>
    <dl className="grid min-w-0 sm:grid-cols-2 xl:grid-cols-4">{section.metrics.map(m=><div key={m.key} className="min-w-0 border-b border-border p-4"><dt className="text-xs text-muted-foreground">{m.label}</dt><dd className="mt-2 break-words text-lg font-semibold tabular-nums text-foreground">{formatCell(m.value,m.format)}</dd>{m.value===null&&<p className="mt-1 text-xs text-muted-foreground">{m.reason}</p>}</div>)}</dl>
    {section.columns&&section.rows&&section.rows.length>0&&<div className="min-w-0 overflow-x-auto"><table className="w-full text-left text-xs"><caption className="sr-only">{section.title}</caption>
      <thead className="border-b border-border bg-muted/30"><tr>{section.columns.map(c=><th scope="col" key={c.key} className="whitespace-nowrap px-4 py-2 font-medium text-muted-foreground">{c.label}</th>)}</tr></thead>
      <tbody>{section.rows.map((row,i)=><tr key={String(row.id??i)} className={`border-b border-border/60 last:border-0 ${row.situacao==="Verificar"?"bg-warning/10":""}`}>{section.columns!.map(c=><td key={c.key} className="px-4 py-2 tabular-nums">{formatCell(row[c.key],c.format)}</td>)}</tr>)}</tbody>
    </table></div>}
  </section>)}</div>
}
