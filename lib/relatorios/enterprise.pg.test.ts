import { beforeAll,afterAll,describe,it,expect } from "vitest"
import { PrismaClient,Prisma } from "@/generated/prisma"
import bcrypt from "bcryptjs"
import { writeFile } from "node:fs/promises"
import { formatCell } from "./format"
import { buildReport } from "./service"
import { parseReportQuery } from "./contracts"

const url=process.env.REPORTS_QA_DATABASE_URL??""
const qaPassword=process.env.REPORTS_QA_PASSWORD??""
if(url){const u=new URL(url);if(u.hostname!=="127.0.0.1"||u.pathname!=="/omni_reports_qa"||process.env.REPORTS_QA_DISPOSABLE!=="1")throw new Error("REPORTS_QA_REQUIRES_FRESH_DISPOSABLE_LOOPBACK")}
if(url&&!qaPassword)throw new Error("REPORTS_QA_REQUIRES_EPHEMERAL_PASSWORD")
describe.skipIf(!url)("enterprise reports — real disposable PostgreSQL",()=>{
  const db=new PrismaClient({datasourceUrl:url||"postgresql://omni_qa@127.0.0.1:1/omni_reports_qa"})
  const A="reports-qa-a",B="reports-qa-b",at=new Date("2026-11-02T12:00:00Z"),createdAt=new Date("2026-10-01T12:00:00Z")
  const query=(extra="")=>parseReportQuery(new URLSearchParams(`from=2026-11-01&to=2026-11-10&${extra}`))
  const report=(kind:Parameters<typeof buildReport>[1],extra="",store=A)=>buildReport(db,kind,store,query(extra),{compare:false,financial:true})
  const metric=(r:Awaited<ReturnType<typeof report>>,key:string)=>r.metrics.find(m=>m.key===key)?.value
  beforeAll(async()=>{
    if(await db.store.count())throw new Error("QA_DATABASE_NOT_EMPTY")
    const all={version:1,modules:["home","pdv","sales","cash","catalog","stock","reports","settings","service","whatsapp","finance"]}
    await db.store.createMany({data:[{id:A,name:"QA Loja A",moduleAccess:all},{id:B,name:"QA Loja B",moduleAccess:all}]})
    await db.cliente.createMany({data:[{id:"qa-c1",storeId:A,name:"QA Cliente Identificado",documentKey:"11144477735",createdAt},{id:"qa-c2",storeId:A,name:"QA Sem Compras",active:false,createdAt},{id:"qa-cb",storeId:B,name:"QA Cliente Outra Loja",createdAt}]})
    await db.produto.createMany({data:[{id:"qa-pa",storeId:A,name:"QA Produto A",sku:"NEW-SKU",category:"Categoria QA",brand:"Marca QA",precoCusto:999},{id:"qa-pb",storeId:B,name:"QA Produto B Segredo",sku:"B-SKU"}]})
    const sales=[{id:"qa-v1",storeId:A,pedidoId:"QA-V1",total:200,clienteId:"qa-c1",status:"parcialmente_devolvida"},
      {id:"qa-v2",storeId:A,pedidoId:"QA-V2",total:60,clienteId:"qa-c1",status:"devolvida"},
      {id:"qa-v3",storeId:A,pedidoId:"QA-CANCEL",total:100,clienteId:"qa-c1",status:"cancelada"},
      {id:"qa-v4",storeId:A,pedidoId:"QA-ANON",total:50,status:"concluida"},
      {id:"qa-v5",storeId:A,pedidoId:"QA-BAD-FK",total:30,clienteId:"qa-cb",status:"concluida"},
      {id:"qa-vb",storeId:B,pedidoId:"QA-B",total:999,clienteId:"qa-cb",status:"concluida"}]
    await db.venda.createMany({data:sales.map(s=>({...s,at}))})
    await db.itemVenda.createMany({data:[{vendaId:"qa-v1",inventoryId:"qa-pa",nome:"QA Produto A",quantidade:2,precoUnitario:100,lineTotal:200},
      {vendaId:"qa-v2",inventoryId:"deleted-product",nome:"QA Produto Excluído",quantidade:2,precoUnitario:30,lineTotal:60},
      {vendaId:"qa-v3",inventoryId:"qa-pa",nome:"QA Produto A",quantidade:1,precoUnitario:100,lineTotal:100},
      {vendaId:"qa-v4",inventoryId:"OLD-SKU",nome:"QA SKU antigo sem vínculo",quantidade:1,precoUnitario:50,lineTotal:50},
      {vendaId:"qa-v5",inventoryId:"NEW-SKU",nome:"QA Produto A",quantidade:1,precoUnitario:30,lineTotal:30},
      {vendaId:"qa-vb",inventoryId:"qa-pb",nome:"QA Produto B Segredo",quantidade:1,precoUnitario:999,lineTotal:999}]})
    for(const [id,sale,inventoryId,quantity,value] of [["qa-d1","QA-V1","qa-pa",1,100],["qa-d2","QA-V2","deleted-product",3,90]] as const){
      await db.devolucaoVenda.create({data:{id,storeId:A,localId:id,vendaLocalId:sale,tipo:"vale_credito",valorTotal:value,at:new Date("2026-11-12T12:00:00Z"),itens:{create:{inventoryId,nome:"QA Devolução",quantidade:quantity,valorTotal:value}}}})
    }
    await db.carteiraFinanceira.createMany({data:[{id:"qa-wallet-a",storeId:A,nome:"QA Caixa",saldoInicial:1000,createdAt},{id:"qa-wallet-a2",storeId:A,nome:"QA Banco",createdAt},{id:"qa-wallet-b",storeId:B,nome:"QA Segredo",saldoInicial:9000,createdAt}]})
    await db.contaReceberTitulo.createMany({data:[{id:"qa-cr",storeId:A,valor:100,vencimento:"2026-11-05",status:"parcial",payload:{historico:[{tipo:"pagamento",valor:40}]}},
      {id:"qa-overdue",storeId:A,valor:70,vencimento:"2026-10-20",status:"vencido"},
      {id:"qa-unknown",storeId:A,valor:90,vencimento:"2026-11-07",status:"parcial"},
      {id:"qa-os-title",storeId:A,valor:80,status:"pago",payload:{ordemServicoId:"qa-os-done",origem:"os"}}]})
    await db.contaPagarTitulo.create({data:{id:"qa-cp",storeId:A,valor:200,vencimento:"2026-11-08",status:"parcial",payload:{categoria:"estoque",historico:[{tipo:"pagamento",valor:50},{tipo:"estorno_pagamento",valor:10}]}}})
    await db.movimentacaoFinanceira.createMany({data:[{storeId:A,tipo:"entrada",origem:"receber_parcial",referenciaId:"qa-cr",valor:40,carteiraId:"qa-wallet-a",createdAt:at},
      {storeId:A,tipo:"saida",origem:"pagar_parcial",referenciaId:"qa-cp",valor:50,carteiraId:"qa-wallet-a",createdAt:at},
      {storeId:A,tipo:"entrada",origem:"estorno_pagar",referenciaId:"qa-cp",valor:10,carteiraId:"qa-wallet-a",createdAt:at},
      {storeId:A,tipo:"saida",origem:"transferencia",valor:20,carteiraId:"qa-wallet-a",createdAt:at},
      {storeId:A,tipo:"entrada",origem:"transferencia",valor:20,carteiraId:"qa-wallet-a2",createdAt:at},
      {storeId:A,tipo:"saida",origem:"sangria_pdv",valor:5,carteiraId:"qa-wallet-a",createdAt:at},
      {storeId:A,tipo:"entrada",origem:"suprimento_pdv",valor:15,carteiraId:"qa-wallet-a",createdAt:at},
      {storeId:A,tipo:"entrada",origem:"receber",referenciaId:"qa-os-title",valor:80,carteiraId:"qa-wallet-a",createdAt:at},
      {storeId:B,tipo:"entrada",origem:"pdv",valor:999,carteiraId:"qa-wallet-b",createdAt:at}]})
    await db.tecnico.create({data:{id:"qa-tech",storeId:A,name:"QA Técnico"}})
    for(const [id,state,status]of[["qa-os-open","aberta","Aberto"],["qa-os-done","entregue","Entregue"],["qa-os-cancel","cancelada","Aberto"]]as const){
      await db.ordemServico.create({data:{id,storeId:A,numero:id,status,createdAt:at,valorTotal:500,payload:{id,storeId:A,codigo:id,status:state,tecnico:{id:"qa-tech",nome:"QA Técnico"},aberturaV3:{recepcao:{dataEntrada:"2026-11-02T09:00:00-03:00",previsaoEntrega:"2026-11-03T18:00:00-03:00"}},...(state==="entregue"?{entregaV3:{entregueEm:"2026-11-03T10:00:00-03:00"},timeline:[{tipo:"garantia_acionada"}]}:{})}}})
    }
    await db.garantiaOrdemServico.create({data:{id:"qa-warranty",storeId:A,ordemServicoId:"qa-os-done",prazoDias:90,dataInicio:at,dataFim:new Date("2027-02-01T12:00:00Z")}})
    await db.whatsAppContact.create({data:{id:"qa-contact",storeId:A,phoneDigits:"5500000000000"}})
    await db.whatsAppConversation.createMany({data:[{id:"qa-conv",storeId:A,contactId:"qa-contact"},{id:"qa-demo",storeId:A,contactId:"qa-contact"}]})
    await db.whatsAppMessage.createMany({data:[{storeId:A,conversationId:"qa-conv",direction:"inbound",body:"Synthetic QA",externalMessageId:"wamid.qa-in",createdAt:at},
      {storeId:A,conversationId:"qa-conv",direction:"inbound",body:"Duplicate QA",externalMessageId:"wamid.qa-in",createdAt:at},
      {storeId:A,conversationId:"qa-conv",direction:"outbound",body:"Synthetic QA reply",externalMessageId:"wamid.qa-out",createdAt:new Date(at.getTime()+3600000)},
      {storeId:A,conversationId:"qa-demo",direction:"inbound",body:"Demo never external",createdAt:at}]})
    await db.whatsAppAutomationLog.create({data:{storeId:A,action:"automation_simulation",createdAt:at}})
    const password=await bcrypt.hash(qaPassword,4)
    for(const [id,role,stores]of[["qa-manager","GERENTE",[A,B]],["qa-restricted","TECNICO",[A]]]as const){await db.adminUser.create({data:{id,name:"QA Reports",email:`${id}@example.invalid`,password,role,lojaId:A,accessScope:"STORE",adminUserStores:{create:stores.map(storeId=>({storeId}))}}})}
    await db.store.create({data:{id:"reports-qa-boundary",name:"Synthetic UTC boundary",moduleAccess:all}})
    for(const [id,time,value]of[["qa-edge-1","2026-11-02T01:00:00Z",10],["qa-edge-2","2026-11-01T22:00:00Z",20],["qa-edge-out","2026-11-01T02:59:59Z",40]]as const){
      await db.venda.create({data:{id,storeId:"reports-qa-boundary",pedidoId:id,at:new Date(time),total:value,itens:{create:{inventoryId:"edge-product",nome:"Synthetic UTC boundary",quantidade:1,lineTotal:value}}}})
      await db.movimentacaoFinanceira.create({data:{storeId:"reports-qa-boundary",tipo:"entrada",origem:"pdv",createdAt:new Date(time),valor:value}})
    }
    for(const [id,payload]of[["qa-old-v3",{operacaoStatusV3:"recebida",operacaoStatus:"aberta",status:"pronta",tecnico:{id:"missing-1"}}],
      ["qa-old-unknown",{status:"aberta",tecnico:{id:"missing-2"}}],
      ["qa-old-day",{operacaoStatusV3:"entregue",operacaoStatus:"aberta",status:"entregue",tecnico:{id:"qa-tech"},aberturaV3:{recepcao:{dataEntrada:"2026-10-15T15:00:00Z",dataEntradaMeta:{precisao:"dia",dia:"2026-10-15"}}},entregaV3:{entregueEm:"2026-10-16T15:00:00Z",entregueEmMeta:{precisao:"dia",dia:"2026-10-16"}}}],
      ["qa-old-preos",{status:"entregue",comercialV4:{tipo:"orcamento_pre_os"},aberturaV3:{recepcao:{dataEntrada:"2026-10-15T12:00:00Z"}},entregueEm:"2026-10-16T12:00:00Z"}]]as const){
      await db.ordemServico.create({data:{id,storeId:A,numero:id,createdAt:new Date("2026-10-15T12:00:00Z"),payload:{id,codigo:id,storeId:A,...payload}}})
    }
    for(const [id,meta]of[["qa-preos-null",null],["qa-preos-empty",{}]]as const){await db.ordemServico.create({data:{id,storeId:A,createdAt:new Date("2026-10-15T12:00:00Z"),payload:{id,codigo:id,storeId:A,status:"entregue",tecnico:{id:"qa-tech"},comercialV4:{tipo:"orcamento_pre_os"},aberturaV3:{recepcao:{dataEntrada:"2026-10-15T12:00:00Z",dataEntradaMeta:meta}},entregueEm:"2026-10-16T12:00:00Z"}}})}
  },60000)
  afterAll(()=>db.$disconnect())
  it("products agree with independent SQL, cancel/returns clamp and remain in their sale cohort",async()=>{
    const r=await report("produtos")
    expect(metric(r,"gross")).toBe(340);expect(metric(r,"returns")).toBe(160);expect(metric(r,"net")).toBe(180);expect(metric(r,"cancelled")).toBe(100);expect(metric(r,"margin")).toBeNull()
    const [sql]=await db.$queryRaw<{gross:number}[]>(Prisma.sql`SELECT sum(i."lineTotal")::float8 AS gross FROM venda_itens i JOIN vendas v ON v.id=i."vendaId" WHERE v."storeId"=${A} AND v.status<>'cancelada'`)
    expect(metric(r,"gross")).toBe(sql.gross)
  })
  it("catalog deletion and changed SKU do not invent an identity",async()=>{const r=await report("produtos");expect(r.rows.some(x=>x.name==="QA Produto Excluído")).toBe(true);expect(r.rows.some(x=>x.name==="QA SKU antigo sem vínculo"&&x.sku===null)).toBe(true)})
  it("search/category/brand and ABC use persisted cohort",async()=>{const r=await report("produtos","brand=Marca+QA&q=NEW-SKU");expect(r.total).toBe(1);expect(r.rows[0].gross).toBe(230);expect(r.rows[0].abc).toBe("A")})
  it("pagination retains full totals and returns distinct rows",async()=>{const q={...query(),pageSize:1};const a=await buildReport(db,"produtos",A,q,{compare:false});const b=await buildReport(db,"produtos",A,{...q,page:2},{compare:false});expect(a.rows).toHaveLength(1);expect(a.rows[0].id).not.toBe(b.rows[0].id);expect(metric(a,"net")).toBe(metric(b,"net"))})
  it("two stores have distinct products and financial data",async()=>{const r=await report("produtos","",B);expect(metric(r,"net")).toBe(999);expect(JSON.stringify(await report("produtos"))).not.toContain("QA Produto B Segredo")})
  it("cash uses only ledger; transfer neutral, treasury included, initial/final reconcile",async()=>{
    const r=await report("fluxo-caixa");expect(metric(r,"initial")).toBe(1000);expect(metric(r,"incoming")).toBe(145);expect(metric(r,"outgoing")).toBe(55);expect(metric(r,"final")).toBe(1090)
    const [sql]=await db.$queryRaw<{net:number}[]>(Prisma.sql`SELECT sum(CASE tipo WHEN 'entrada' THEN valor ELSE -valor END)::float8 AS net FROM movimentacoes_financeiras WHERE "storeId"=${A}`)
    expect(metric(r,"final")).toBe(1000+sql.net)
  })
  it("partial titles subtract payments/reversals and unknown partial is excluded",async()=>{const r=await report("fluxo-caixa");expect(metric(r,"forecastIncoming")).toBe(60);expect(metric(r,"forecastOutgoing")).toBe(160);expect(metric(r,"overdueIncoming")).toBe(70);expect(metric(r,"projection")).toBeNull()})
  it("wallet includes only its transfer leg",async()=>{const r=await report("fluxo-caixa","wallet=qa-wallet-a");expect(metric(r,"final")).toBe(1070)})
  it("DRE never calls inventory purchases CMV or invents net profit",async()=>{const r=await report("dre");expect(metric(r,"receipts")).toBe(120);expect(metric(r,"payments")).toBe(40);expect(r.metrics.filter(m=>m.label.includes("Resultado")).every(m=>m.value===null)).toBe(true);expect(r.rows.some(x=>x.name==="Pagamentos: estoque")).toBe(true)})
  it("customers use strong FK; duplicates and another-store FK stay unassigned",async()=>{const r=await report("clientes");expect(metric(r,"spent")).toBe(100);expect(metric(r,"recurring")).toBe(1);expect(r.limitations.join(" ")).toContain("Vendas sem cliente identificado/vínculo válido: 2");expect(r.rows.every(x=>x.rfm===null)).toBe(true)})
  it("customer history is authorized, persisted and net of returns",async()=>{const r=await report("clientes","entity=qa-c1");expect(r.total).toBe(2);expect(r.rows.reduce((sum,x)=>sum+Number(x.net),0)).toBe(100);expect((await report("clientes","entity=qa-cb")).rows).toEqual([])})
  it("OS V3/V4 count once; cancellation from payload and measured elapsed time",async()=>{const r=await report("os");expect(metric(r,"orders")).toBe(3);expect(metric(r,"cancelled")).toBe(1);expect(metric(r,"hours")).toBe(25);expect(metric(r,"cash")).toBe(80);expect(metric(r,"revenue")).toBeNull()})
  it("technicians carry sample size and suppress unfair SLA with fewer than 5",async()=>{const r=await report("tecnicos");expect(r.total).toBe(1);expect(r.rows[0]).toMatchObject({assigned:3,completed:1,sample:1,sla:null,returns:1,warranties:1,cash:80})})
  it("operations without financial permission strips values from both table and summary",async()=>{const r=await buildReport(db,"os",A,query(),{compare:false,financial:false});expect(r.metrics.some(x=>x.key==="cash")).toBe(false);expect(r.rows.every(x=>!("cash"in x))).toBe(true)})
  it("WhatsApp excludes demo, deduplicates external IDs and does not count simulated automations",async()=>{const r=await report("whatsapp");expect(metric(r,"incoming")).toBe(1);expect(metric(r,"outgoing")).toBe(1);expect(metric(r,"started")).toBe(1);expect(metric(r,"hours")).toBe(1);expect(metric(r,"automations")).toBeNull();expect(JSON.stringify(r)).not.toContain("Synthetic QA reply")})
  it("empty period returns honest zeroes, no synthetic sample rows",async()=>{const r=await buildReport(db,"produtos",A,parseReportQuery(new URLSearchParams("from=2025-01-01&to=2025-01-05")),{compare:false});expect(r.rows).toEqual([]);expect(metric(r,"net")).toBe(0)})
  it("transaction enforces read only at the database boundary",async()=>{await expect(db.$transaction(async tx=>{await tx.$executeRaw`SET TRANSACTION READ ONLY`;await tx.$executeRaw`UPDATE stores SET name='forbidden' WHERE id='reports-qa-a'`})).rejects.toThrow()})
  it("UTC timestamp boundaries filter/group by the correct Sao Paulo civil day",async()=>{
    const q=parseReportQuery(new URLSearchParams("from=2026-11-01&to=2026-11-01"))
    for(const kind of["produtos","fluxo-caixa"]as const){
      const r=await buildReport(db,kind,"reports-qa-boundary",q,{compare:false})
      expect(r.trend).toEqual(kind==="produtos"?[{label:"2026-11-01",value:30}]:[{label:"2026-11-01",value:30,secondary:0}])
      if(kind==="produtos")expect(metric(r,"gross")).toBe(30)
    }
  })
  it("raw timestamp cells include Z and render Sao Paulo times independently of browser timezone",async()=>{
    const r=await report("fluxo-caixa");expect(r.rows.every(x=>String(x.date).endsWith("Z"))).toBe(true)
    expect(formatCell(r.rows[0].date,"date")).toContain("09:00")
  })
  it("V3 received is authoritative and invalid technician identities collapse into unassigned",async()=>{
    const q=parseReportQuery(new URLSearchParams("from=2026-10-14&to=2026-10-17&status=recebida"))
    const r=await buildReport(db,"os",A,q,{compare:false});expect(r.total).toBe(1);expect(r.rows[0].status).toBe("recebida")
    const technicians=await buildReport(db,"tecnicos",A,{...q,status:""},{compare:false})
    expect(technicians.rows.find(x=>x.id==="__unassigned__")?.assigned).toBe(3)
  })
  it("day-only dates never invent time and pre-OS automatic entry is discarded",async()=>{
    const q=parseReportQuery(new URLSearchParams("from=2026-10-14&to=2026-10-17"))
    const r=await buildReport(db,"os",A,q,{compare:false}),day=r.rows.find(x=>x.id==="qa-old-day"),pre=r.rows.find(x=>x.id==="qa-old-preos")
    expect(day?.entered).toBe("2026-10-15");expect(day?.hours).toBeNull();expect(formatCell(day?.entered,"date")).toBe("15/10/2026")
    expect(pre?.entered).toBeNull();expect(pre?.hours).toBeNull()
    for(const id of["qa-preos-null","qa-preos-empty"]){const row=r.rows.find(x=>x.id===id);expect(row?.entered).toBeNull();expect(row?.hours).toBeNull()}
  })
  it("SQL search is parameterized even with quotes/wildcards in user input",async()=>{expect((await report("clientes",`q=${encodeURIComponent("%' OR 1=1 --")}`)).rows).toEqual([])})
  it("large cohort stays aggregated on server and bounded over the response",async()=>{
    await db.$executeRaw(Prisma.sql`INSERT INTO vendas(id,"storeId","pedidoId",total,at,status) SELECT 'qa-volume-'||g,${B},'QA-VOLUME-'||g,10,'2026-11-05T12:00:00Z','concluida' FROM generate_series(1,50000) g`)
    await db.$executeRaw(Prisma.sql`INSERT INTO venda_itens(id,"vendaId","inventoryId",nome,quantidade,"precoUnitario","lineTotal") SELECT 'qa-item-'||g,'qa-volume-'||g,'qa-pb','QA Produto B Segredo',1,10,10 FROM generate_series(1,50000) g`)
    const cpu=process.cpuUsage(),r=await report("produtos","",B),used=process.cpuUsage(cpu),bytes=Buffer.byteLength(JSON.stringify(r))
    expect(metric(r,"net")).toBe(500999);expect(r.rows.length).toBe(1);expect(bytes).toBeLessThan(12000);expect(r.durationMs).toBeLessThan(12000)
    await writeFile("docs/ai-execution/_evidence/OMNI-RELATORIOS-HUB-ENTERPRISE-REAL-001/performance.json",JSON.stringify({syntheticSales:50001,reportDurationMs:r.durationMs,responseBytes:bytes,nodeCpuUserMs:used.user/1000,nodeCpuSystemMs:used.system/1000,environment:"fresh local PostgreSQL 17; not Neon/Vercel production metrics"},null,2))
  },30000)
})
