import { beforeEach,describe,it,expect,vi } from "vitest"
const h=vi.hoisted(()=>({auth:vi.fn(),build:vi.fn()}))
vi.mock("@/auth",()=>({auth:h.auth}))
vi.mock("@/lib/prisma",()=>({prisma:{}}))
vi.mock("@/lib/relatorios/service",()=>({buildReport:h.build}))
import { GET } from "./route"
import { ASSISTEC_ACTIVE_STORE_COOKIE } from "@/lib/store-defaults"
const context=(kind="produtos")=>({params:Promise.resolve({kind})})
const request=(store="a",extra="")=>new Request(`http://local/api/dashboard/relatorios/produtos?from=2026-11-01&to=2026-11-10&${extra}`,{headers:{"x-assistec-loja-id":store}})
const session=(modules=["reports","sales","catalog","finance","service","whatsapp"],role="GERENTE")=>({user:{id:"qa",role,allowedStoreIds:["a"],storeModules:{a:modules},mustChangePassword:false}})
beforeEach(()=>{vi.clearAllMocks();h.auth.mockResolvedValue(null);h.build.mockResolvedValue({storeId:"a",total:0,columns:[],rows:[],metrics:[],limitations:[],period:{from:"2026-11-01",to:"2026-11-10"}})})
describe("report route with real enterprise guards",()=>{
  it("rejects unauthenticated before query",async()=>{const r=await GET(request(),context());expect(r.status).toBe(401);expect(r.headers.get("cache-control")).toContain("no-store");expect(h.build).not.toHaveBeenCalled()})
  it("rejects cross-store header, query, cookie and exports",async()=>{
    h.auth.mockResolvedValue(session())
    for(const req of[request("b"),request("a","storeId=b"),request("b","format=csv"),new Request(request(),{headers:{"x-assistec-loja-id":"a",cookie:`${ASSISTEC_ACTIVE_STORE_COOKIE}=b`}})]){
      expect((await GET(req,context())).status).toBe(403)
    }
    expect(h.build).not.toHaveBeenCalled()
  })
  it.each([{modules:["sales"]},{modules:["reports"]}])("requires both reports and source module %j",async ({modules})=>{h.auth.mockResolvedValue(session(modules));expect((await GET(request(),context())).status).toBe(403);expect(h.build).not.toHaveBeenCalled()})
  it("technician cannot export customer purchase ranking",async()=>{h.auth.mockResolvedValue(session(undefined,"TECNICO"));expect((await GET(request("a","format=csv"),context("clientes"))).status).toBe(403);expect(h.build).not.toHaveBeenCalled()})
  it("invalid period/pagination does not touch DB",async()=>{h.auth.mockResolvedValue(session());expect((await GET(request("a","pageSize=999"),context())).status).toBe(400);expect(h.build).not.toHaveBeenCalled()})
  it("authorized calls pass only scoped store, safe limits and private headers",async()=>{h.auth.mockResolvedValue(session());const r=await GET(request(),context());expect(r.status).toBe(200);expect(r.headers.get("vary")).toContain("x-assistec-loja-id");expect(h.build).toHaveBeenCalledWith(expect.anything(),"produtos","a",expect.objectContaining({pageSize:20}),expect.anything())})
  it("database failures produce generic error without secrets",async()=>{h.auth.mockResolvedValue(session());h.build.mockRejectedValueOnce(new Error("password=secret DATABASE_URL private"));const r=await GET(request(),context());expect(r.status).toBe(503);expect(await r.text()).not.toContain("secret")})
  it("oversized exports fail instead of silently truncating",async()=>{h.auth.mockResolvedValue(session());h.build.mockResolvedValueOnce({total:501});expect((await GET(request("a","format=csv"),context())).status).toBe(422)})
  it("general report requires reports, sales and finance modules and a finance viewer",async()=>{
    for(const modules of[["reports","sales"],["reports","finance"]]){h.auth.mockResolvedValue(session(modules));expect((await GET(request(),context("geral"))).status).toBe(403)}
    h.auth.mockResolvedValue(session(undefined,"TECNICO"));expect((await GET(request(),context("geral"))).status).toBe(403)
    expect(h.build).not.toHaveBeenCalled()
  })
  it("general export is complete up to its cap and refuses larger cuts",async()=>{
    h.auth.mockResolvedValue(session())
    h.build.mockResolvedValueOnce({total:5001});expect((await GET(request("a","format=pdf"),context("geral"))).status).toBe(422)
    expect(h.build).toHaveBeenLastCalledWith(expect.anything(),"geral","a",expect.objectContaining({pageSize:5000,page:1}),expect.objectContaining({compare:false}))
    h.build.mockResolvedValueOnce({total:2001,rows:Array.from({length:2000},()=>({})),columns:[],metrics:[],limitations:[],period:{from:"2026-11-01",to:"2026-11-10"}});expect((await GET(request("a","format=csv&source=venda:X"),context("geral"))).status).toBe(422)
  })
})
