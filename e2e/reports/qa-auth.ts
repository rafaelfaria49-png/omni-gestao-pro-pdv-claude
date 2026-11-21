import { readFile } from "node:fs/promises"
import path from "node:path"
import { expect,type Page } from "@playwright/test"
import { ASSISTEC_ACTIVE_STORE_COOKIE } from "../../lib/store-defaults"
export const QA_ORIGIN="http://127.0.0.1:3107",QA_STORE="reports-qa-a"
export const QA_EVIDENCE=path.resolve("docs/ai-execution/_evidence/OMNI-RELATORIOS-HUB-ENTERPRISE-REAL-001")
export async function readQASession():Promise<{url:string;qaPassword:string;sessionRevocation:string}> {
  const manifest=JSON.parse(await readFile(path.join(QA_EVIDENCE,"local-qa-session.json"),"utf8"))
  const target=new URL(manifest.url)
  if(target.hostname!=="127.0.0.1"||target.pathname!=="/omni_reports_qa"||typeof manifest.qaPassword!=="string"||manifest.qaPassword.length<24||manifest.sessionRevocation!=="on")throw new Error("ISOLATED_SESSION_QA_REQUIRED")
  return manifest
}
export async function loginQA(page:Page,email="qa-manager@example.invalid") {
  const manifest=await readQASession()
  const {csrfToken}=await(await page.request.get(QA_ORIGIN+"/api/auth/csrf")).json()
  const signed=await page.request.post(QA_ORIGIN+"/api/auth/callback/credentials",{form:{csrfToken,email,password:manifest.qaPassword,callbackUrl:QA_ORIGIN+"/dashboard/relatorios",json:"true"},headers:{"X-Auth-Return-Redirect":"1"}})
  expect(signed.ok()).toBe(true)
  const session=await(await page.request.get(QA_ORIGIN+"/api/auth/session")).json()
  expect(session.user?.email).toBe(email)
  await page.context().addCookies([{name:ASSISTEC_ACTIVE_STORE_COOKIE,value:QA_STORE,url:QA_ORIGIN}])
  await page.addInitScript(({store})=>localStorage.setItem("assistec-pro-loja-ativa-v1",store),{store:QA_STORE})
  return session
}
