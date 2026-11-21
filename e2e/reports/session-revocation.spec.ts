import { test,expect } from "@playwright/test"
import { PrismaClient } from "../../generated/prisma"
import { loginQA,readQASession,QA_ORIGIN,QA_STORE } from "./qa-auth"

test("PR350 logout rejects replay A while device B and another account remain active",async({browser,page})=>{
  const manifest=await readQASession(),db=new PrismaClient({datasourceUrl:manifest.url})
  const deviceB=await browser.newContext(),other=await browser.newContext()
  try{
    const sessionA=await loginQA(page),pageB=await deviceB.newPage(),pageC=await other.newPage()
    await loginQA(pageB);await loginQA(pageC,"qa-restricted@example.invalid")
    const owner=await db.adminUser.findUniqueOrThrow({where:{id:sessionA.user.id}})
    // Fails if the runtime did not enable PR350 against the isolated schema.
    expect(await db.adminSession.count({where:{userId:owner.id,revokedAt:null}})).toBeGreaterThanOrEqual(2)
    const revokedBefore=await db.adminSession.count({where:{userId:owner.id,revokedAt:{not:null}}})
    const cookies=(await page.context().cookies()).filter(cookie=>/^(?:__Secure-)?authjs\.session-token(?:\.\d+)?$/.test(cookie.name))
    expect(cookies.length).toBeGreaterThan(0)
    const {csrfToken}=await(await page.request.get(QA_ORIGIN+"/api/auth/csrf")).json()
    const signout=await page.request.post(QA_ORIGIN+"/api/auth/signout",{form:{csrfToken,callbackUrl:QA_ORIGIN+"/login",json:"true"},headers:{"X-Auth-Return-Redirect":"1"}})
    expect(signout.ok()).toBe(true)
    await page.context().addCookies(cookies)
    const reportUrl=QA_ORIGIN+"/api/dashboard/relatorios/produtos?from=2026-11-01&to=2026-11-10"
    const options={headers:{"x-assistec-loja-id":QA_STORE},maxRedirects:0}
    expect((await page.request.get(reportUrl,options)).status()).toBe(401)
    expect((await pageB.request.get(reportUrl,options)).status()).toBe(200)
    expect((await(await pageB.request.get(QA_ORIGIN+"/api/auth/session")).json()).user.id).toBe(owner.id)
    expect((await(await pageC.request.get(QA_ORIGIN+"/api/auth/session")).json()).user.email).toBe("qa-restricted@example.invalid")
    expect((await db.adminUser.findUniqueOrThrow({where:{id:owner.id}})).sessionVersion).toBe(owner.sessionVersion)
    expect(await db.adminSession.count({where:{userId:owner.id,revokedAt:{not:null}}})).toBe(revokedBefore+1)
  }finally{await db.$disconnect();await deviceB.close();await other.close()}
})
