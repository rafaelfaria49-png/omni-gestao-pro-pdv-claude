import { test,expect,_electron } from "@playwright/test"
import { readFile,mkdir,mkdtemp,writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { PrismaClient } from "../../generated/prisma"
import { loginQA as login,readQASession } from "./qa-auth"
const evidence=path.resolve("docs/ai-execution/_evidence/OMNI-RELATORIOS-HUB-ENTERPRISE-REAL-001")
const origin="http://127.0.0.1:3107"
const A="reports-qa-a",B="reports-qa-b",period="from=2026-11-01&to=2026-11-10"
test.beforeEach(async({page})=>{
  page.on("pageerror",error=>console.log("QA_BROWSER_ERROR",error.message))
  page.on("requestfailed",request=>{const path=new URL(request.url()).pathname;if(path.startsWith("/api/dashboard/relatorios/"))console.log("QA_REQUEST_FAILED",path,request.failure()?.errorText)})
})
test.beforeAll(async()=>{
  const session=await readQASession()
  const target=new URL(session.url)
  if(target.hostname!=="127.0.0.1"||target.pathname!=="/omni_reports_qa")throw new Error("NOT_ISOLATED_QA")
  const db=new PrismaClient({datasourceUrl:session.url})
  await db.store.updateMany({where:{id:{in:[A,B]}},data:{cnpj:"00000000000000"}})
  await db.$disconnect();await mkdir(evidence,{recursive:true})
})
test("all seven pages render real API data, scoped by authenticated store",async({page})=>{
  await login(page)
  const operationalLoads:string[]=[]
  page.on("request",request=>{const p=new URL(request.url()).pathname;if(["/api/ops/inventory","/api/ops/ordens","/api/ops/sync-ledger"].includes(p))operationalLoads.push(p)})
  for(const kind of["produtos","fluxo-caixa","dre","clientes","os","tecnicos","whatsapp"]){
    await page.goto(`/dashboard/relatorios/${kind}?${period}`)
    await expect(page.getByRole("region",{name:"Indicadores do relatório"})).toBeVisible()
    await expect(page.getByRole("region",{name:"Detalhamento dos registros"})).toBeVisible()
    await expect(page.getByText(/^Loja reports-qa-a · leitura autorizada/)).toBeVisible()
    await expect(page.getByText("QA Produto B Segredo",{exact:true})).toHaveCount(0)
  }
  expect(operationalLoads).toEqual([])
})
test("real exports include limitations and parseable PDF; desktop/light and mobile/dark",async({page})=>{
  await login(page);await page.goto(`/dashboard/relatorios/produtos?${period}`)
  await expect(page.getByRole("region",{name:"Indicadores do relatório"})).toBeVisible()
  for(const format of["CSV","PDF"]){
    const download=page.waitForEvent("download");await page.getByRole("button",{name:format,exact:true}).click();const file=await download
    await file.saveAs(path.join(evidence,`qa-products.${format.toLowerCase()}`))
  }
  await page.setViewportSize({width:1440,height:1000})
  await page.getByRole("button",{name:/^Tema atual:/}).click()
  await page.getByRole("option",{name:"Light",exact:true}).click();await page.keyboard.press("Escape")
  await expect(page.locator("html")).toHaveAttribute("data-studio-theme","light")
  expect(await page.evaluate(()=>{const host=document.querySelector("main>div");return !!host&&host.scrollWidth<=host.clientWidth})).toBe(true)
  await page.locator("main>div").evaluate(el=>el.scrollTo({top:0,left:0}))
  await page.screenshot({path:path.join(evidence,"desktop-light.png")})
  await page.getByRole("region",{name:"Detalhamento dos registros"}).scrollIntoViewIfNeeded()
  await page.screenshot({path:path.join(evidence,"desktop-table-light.png")})
  await page.setViewportSize({width:390,height:844})
  await page.getByRole("button",{name:/^Tema atual:/}).click()
  await page.getByRole("option",{name:"Midnight",exact:true}).click();await page.keyboard.press("Escape")
  await expect(page.locator("html")).toHaveAttribute("data-studio-theme","midnight")
  await expect(page.getByRole("article").first()).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
  await page.locator("main>div").evaluate(el=>el.scrollTo({top:0,left:0}))
  await page.screenshot({path:path.join(evidence,"mobile-dark.png")})
  await page.getByRole("article").first().scrollIntoViewIfNeeded()
  await page.screenshot({path:path.join(evidence,"mobile-records-dark.png")})
  const pdf=await readFile(path.join(evidence,"qa-products.pdf"));expect(pdf.subarray(0,8).toString()).toBe("%PDF-1.4")
  const csv=await readFile(path.join(evidence,"qa-products.csv"),"utf8");expect(csv).toContain("Margem indisponível");expect(csv).not.toContain("QA Produto B Segredo")
})
test("restricted account cannot access/export financial or customer reports",async({page})=>{
  await login(page,"qa-restricted@example.invalid")
  for(const kind of["dre","fluxo-caixa","clientes"]){
    const res=await page.request.get(`/api/dashboard/relatorios/${kind}?${period}&format=csv`,{headers:{"x-assistec-loja-id":A}})
    expect(res.status()).toBe(403)
  }
  const cross=await page.request.get(`/api/dashboard/relatorios/os?${period}`,{headers:{"x-assistec-loja-id":B}});expect(cross.status()).toBe(403)
  await page.goto(`/dashboard/relatorios/dre?${period}`);await expect(page).not.toHaveURL(/\/dashboard\/relatorios\/dre/)
})
test("store switch during delayed real query cannot repopulate old-store rows",async({page})=>{
  await login(page)
  let release!:()=>void,seen=false
  const hold=new Promise<void>(r=>release=r)
  await page.context().route("**/api/dashboard/relatorios/produtos?**",async route=>{
    if(route.request().headers()["x-assistec-loja-id"]!==A)return route.continue()
    const response=await route.fetch({timeout:15000});seen=true;await Promise.race([hold,new Promise<void>(resolve=>setTimeout(resolve,15000))])
    await route.fulfill({response}).catch(()=>{})
  })
  await page.goto(`/dashboard/relatorios/produtos?${period}`);await expect.poll(()=>seen,{timeout:15000}).toBe(true)
  await page.evaluate(({store})=>{localStorage.setItem("assistec-pro-loja-ativa-v1",store);window.dispatchEvent(new StorageEvent("storage",{key:"assistec-stores-sync-v1",newValue:String(Date.now())}))},{store:B})
  await expect(page.getByText(/^Loja reports-qa-b · leitura autorizada/)).toBeVisible();release()
  await expect(page.getByRole("region",{name:"Indicadores do relatório"})).toBeVisible()
  await expect(page.getByText("QA Produto B Segredo",{exact:true}).first()).toBeVisible()
  await expect(page.getByText("QA Produto A",{exact:true})).toHaveCount(0)
})
test("logout with pending query never renders the late private response",async({page})=>{
  await login(page)
  let release!:()=>void,seen=false
  const hold=new Promise<void>(r=>release=r)
  await page.context().route("**/api/dashboard/relatorios/produtos?**",async route=>{const response=await route.fetch({timeout:15000});seen=true;await Promise.race([hold,new Promise<void>(resolve=>setTimeout(resolve,15000))]);await route.fulfill({response}).catch(()=>{})})
  await page.goto(`/dashboard/relatorios/produtos?${period}`);await expect.poll(()=>seen,{timeout:15000}).toBe(true)
  const {csrfToken}=await(await page.request.get("/api/auth/csrf")).json()
  await page.request.post("/api/auth/signout",{form:{csrfToken,callbackUrl:"http://127.0.0.1:3107/login",json:"true"},headers:{"X-Auth-Return-Redirect":"1"}})
  await page.goto("/login");release()
  await expect(page.getByText("QA Produto A",{exact:true})).toHaveCount(0)
  const afterLogout=await page.request.get(`/api/dashboard/relatorios/produtos?${period}`,{headers:{"x-assistec-loja-id":A},maxRedirects:0})
  expect(afterLogout.status()).toBe(401)
  expect(await afterLogout.json()).toEqual({ok:false,error:"Não autenticado."})
})

test("store switch aborts a pending export and only downloads the new store",async({page})=>{
  await login(page);await page.goto(`/dashboard/relatorios/produtos?${period}`)
  await expect(page.getByRole("region",{name:"Indicadores do relatório"})).toBeVisible()
  let release!:()=>void,seen=false
  const downloads:string[]=[],hold=new Promise<void>(resolve=>release=resolve)
  page.on("download",file=>downloads.push(file.suggestedFilename()))
  await page.context().route("**/api/dashboard/relatorios/produtos?**format=csv",async route=>{
    if(route.request().headers()["x-assistec-loja-id"]!==A)return route.continue()
    const response=await route.fetch({timeout:15000});seen=true
    await Promise.race([hold,new Promise<void>(resolve=>setTimeout(resolve,15000))])
    await route.fulfill({response}).catch(()=>{})
  })
  await page.getByRole("button",{name:"CSV",exact:true}).click()
  await expect.poll(()=>seen,{timeout:15000}).toBe(true)
  const aborted=page.waitForEvent("requestfailed",{predicate:r=>r.url().includes("format=csv"),timeout:15000})
  await page.evaluate(({store})=>{localStorage.setItem("assistec-pro-loja-ativa-v1",store);window.dispatchEvent(new StorageEvent("storage",{key:"assistec-stores-sync-v1",newValue:String(Date.now())}))},{store:B})
  await aborted;release()
  await expect(page.getByText(/^Loja reports-qa-b · leitura autorizada/)).toBeVisible()
  await expect(page.getByRole("region",{name:"Indicadores do relatório"})).toBeVisible()
  const next=page.waitForEvent("download")
  await page.getByRole("button",{name:"CSV",exact:true}).click()
  const file=await next,downloadPath=await file.path()
  expect(downloadPath).toBeTruthy()
  const csv=await readFile(downloadPath!,"utf8")
  expect(csv).toContain("QA Produto B Segredo");expect(csv).not.toContain("QA Produto A")
  expect(downloads).toHaveLength(1)
})

test("a real pre-logout rolling cookie cannot restore access after signout",async({page})=>{
  await login(page)
  const oldCookies=(await page.context().cookies()).filter(cookie=>/^(?:__Secure-)?authjs\.session-token(?:\.\d+)?$/.test(cookie.name))
  expect(oldCookies.length).toBeGreaterThan(0)
  const {csrfToken}=await(await page.request.get(origin+"/api/auth/csrf")).json()
  await page.request.post(origin+"/api/auth/signout",{form:{csrfToken,callbackUrl:origin+"/login",json:"true"},headers:{"X-Auth-Return-Redirect":"1"}})
  // Model a valid old cookie reaching the browser after signout. The server must
  // reject its version even when transport cancellation cannot prevent delivery.
  await page.context().addCookies(oldCookies)
  const report=await page.request.get(origin+`/api/dashboard/relatorios/produtos?${period}`,{headers:{"x-assistec-loja-id":A},maxRedirects:0})
  expect(report.status()).toBe(401)
  expect(await(await page.request.get(origin+"/api/auth/session")).json()).toBeNull()
})
test("recovering failed query retries real API without fabricated rows",async({page})=>{
  await login(page);let fail=true
  await page.context().route("**/api/dashboard/relatorios/produtos?**",route=>{if(fail){fail=false;return route.abort("failed")}return route.continue()})
  await page.goto(`/dashboard/relatorios/produtos?${period}`)
  await expect(page.getByRole("alert").filter({hasText:/fetch|consultar|Fetch|Failed/})).toBeVisible()
  await page.getByRole("button",{name:"Tentar novamente",exact:true}).click()
  await expect(page.getByRole("region",{name:"Indicadores do relatório"})).toBeVisible()
})

test("wrong-scope response is rejected with recovery, without private rows",async({page})=>{
  await login(page)
  let wrong=true
  await page.context().route("**/api/dashboard/relatorios/produtos?**",async route=>{
    const response=await route.fetch()
    if(!wrong)return route.fulfill({response})
    wrong=false
    const body=await response.json()
    await route.fulfill({response,json:{...body,storeId:B,rows:[{name:"PRIVATE-POISON-OTHER-STORE"}]}})
  })
  await page.goto(`/dashboard/relatorios/produtos?${period}`)
  await expect(page.getByRole("alert").filter({hasText:"não corresponde ao relatório autorizado"})).toBeVisible()
  await expect(page.getByText("PRIVATE-POISON-OTHER-STORE",{exact:false})).toHaveCount(0)
  await page.getByRole("button",{name:"Tentar novamente",exact:true}).click()
  await expect(page.getByRole("region",{name:"Indicadores do relatório"})).toBeVisible()
})

test("invalid URL date is recoverable and an empty period is explicit",async({page})=>{
  await login(page);await page.goto("/dashboard/relatorios/produtos?to=invalid")
  await expect(page.getByRole("alert")).toBeVisible()
  await page.getByRole("textbox",{name:"Data inicial",exact:true}).fill("2026-09-01")
  await page.getByRole("textbox",{name:"Data final",exact:true}).fill("2026-09-02")
  await page.getByRole("button",{name:"Aplicar filtros",exact:true}).click()
  await expect(page.getByRole("region",{name:"Indicadores do relatório"})).toBeVisible()
  await expect(page.getByText("Nenhum registro corresponde ao período e aos filtros.",{exact:false})).toBeVisible()
})

test("origin links open persisted lines, ledger entries, OS records and message metadata",async({page})=>{
  await login(page)
  for(const [kind,title] of [["produtos","Linhas de vendas do produto"],["dre","Movimentos:"],["fluxo-caixa","Movimento identificado do ledger"],
    ["clientes","Histórico de compras do cadastro"],["os","Registros de origem da OS"],["whatsapp","Registros da conversa sem conteúdo pessoal"],["tecnicos","Ordens de serviço"]]){
    await page.goto(`/dashboard/relatorios/${kind}?${period}`)
    const detail=page.getByRole("region",{name:"Detalhamento dos registros"})
    await expect(detail).toBeVisible()
    await detail.getByRole("link",{name:"Ver vínculo",exact:true}).first().click()
    await expect(page.getByRole("heading",{level:1})).toContainText(title)
    await expect(page.getByRole("region",{name:"Detalhamento dos registros"})).toBeVisible()
    if(kind==="produtos"||kind==="clientes"){
      await page.getByRole("region",{name:"Detalhamento dos registros"}).getByRole("link",{name:"Ver vínculo",exact:true}).first().click()
      await expect(page.getByRole("heading",{level:1})).toContainText("Itens da venda")
      await expect(page.getByRole("columnheader",{name:"Preço unitário gravado",exact:true})).toBeVisible()
    }
    if(kind==="whatsapp"){
      await expect(page.getByText("Synthetic QA reply",{exact:false})).toHaveCount(0)
      await expect(page.getByText("wamid.qa-in",{exact:false})).toHaveCount(0)
    }
  }
})
test.describe("PWA runtime",()=>{
test.use({serviceWorkers:"allow"})
test("real generated service worker refuses cached report from another session offline",async({page,context})=>{
  await login(page);let target=""
  page.on("response",response=>{if(response.url().includes("/api/dashboard/relatorios/produtos?"))target=response.url()})
  await page.goto(`/dashboard/relatorios/produtos?${period}`)
  await expect(page.getByRole("region",{name:"Indicadores do relatório"})).toBeVisible()
  await page.evaluate(()=>navigator.serviceWorker.ready)
  await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller)
  await expect(page.getByRole("region",{name:"Indicadores do relatório"})).toBeVisible();expect(target).not.toBe("")
  await page.evaluate(async url=>{const cache=await caches.open("apis");await cache.put(url,new Response(JSON.stringify({ok:true,storeId:"other-store",rows:[{name:"PRIVATE-POISON-OTHER-STORE"}]}),{headers:{"Content-Type":"application/json"}}))},target)
  // Inspect and fail the SW-owned network too; keep the real SW and poisoned cache.
  let offlineAttempts=0
  await context.route("**/api/dashboard/relatorios/produtos?**",route=>{offlineAttempts++;return route.abort("internetdisconnected")})
  await context.setOffline(true);await page.getByRole("button",{name:"Atualizar relatório"}).click()
  await expect(page.getByRole("alert").filter({hasText:/fetch|Fetch|Failed|consultar/})).toBeVisible()
  expect(offlineAttempts).toBeGreaterThan(0)
  await expect(page.getByText("PRIVATE-POISON-OTHER-STORE",{exact:false})).toHaveCount(0)
  await context.unroute("**/api/dashboard/relatorios/produtos?**")
  await context.setOffline(false);await page.getByRole("button",{name:"Tentar novamente",exact:true}).click()
  await expect(page.getByRole("region",{name:"Indicadores do relatório"})).toBeVisible()
})
})
test("actual Electron runtime loads the authorized QA report",async()=>{
  const executablePath=process.env.REPORTS_QA_ELECTRON_BINARY??path.resolve("apps/desktop/node_modules/electron/dist/electron.exe")
  const profile=await mkdtemp(path.join(tmpdir(),"reports-electron-qa-"))
  const app=await _electron.launch({executablePath,args:[path.resolve("e2e/reports/electron-main.cjs")],env:{...process.env,REPORTS_QA_ELECTRON_PROFILE:profile},timeout:60000})
  try{
    const page=await app.firstWindow();await login(page)
    await page.goto(`${origin}/dashboard/relatorios/produtos?${period}`)
    await expect(page.getByRole("region",{name:"Indicadores do relatório"})).toBeVisible()
    const version=await app.evaluate(()=>process.versions.electron)
    expect(version).toBeTruthy()
    await page.getByRole("button",{name:/^Tema atual:/}).click()
    await page.getByRole("option",{name:"Midnight",exact:true}).click();await page.keyboard.press("Escape")
    await expect(page.locator("html")).toHaveAttribute("data-studio-theme","midnight")
    await page.screenshot({path:path.join(evidence,"electron-qa.png")})
    await writeFile(path.join(evidence,"electron-runtime.json"),JSON.stringify({electron:version,target:"loopback synthetic QA",nativeDesktopSourceChanged:false},null,2))
  }finally{await app.close()}
})
