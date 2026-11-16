import { afterEach,describe,it,expect,vi } from "vitest"
import { purgeReportCaches } from "./client-privacy"
afterEach(()=>vi.unstubAllGlobals())
describe("report cache teardown",()=>{
  it("removes only report API/HTML/RSC entries on this origin",async()=>{
    const origin="http://qa.local",paths=["/api/dashboard/relatorios/clientes?format=csv","/dashboard/relatorios/os?_rsc=secret","/dashboard/relatorios","/api/ops/inventory","/logo.png","https://other.invalid/dashboard/relatorios/os"]
    const stored=new Set(paths.map(p=>new URL(p,origin).href)),removed:string[]=[]
    const storage={keys:async()=>["apis","pages"],open:async()=>({keys:async()=>[...stored].map(url=>({url})),delete:async(r:{url:string})=>{removed.push(r.url);return stored.delete(r.url)}})}
    vi.stubGlobal("window",{location:{origin},caches:storage});vi.stubGlobal("caches",storage)
    await purgeReportCaches()
    expect(removed).toHaveLength(3);expect([...stored]).toEqual([origin+"/api/ops/inventory",origin+"/logo.png","https://other.invalid/dashboard/relatorios/os"])
  })
  it("does not introduce an offline fallback when CacheStorage is unavailable",async()=>{vi.stubGlobal("window",{});await expect(purgeReportCaches()).resolves.toBeUndefined()})
})
