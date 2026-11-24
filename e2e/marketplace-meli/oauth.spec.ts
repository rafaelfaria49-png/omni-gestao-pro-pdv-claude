import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test"
import { Prisma, PrismaClient } from "../../generated/prisma"
import { ASSISTEC_LOJA_HEADER } from "../../lib/assistec-headers"
import { ASSISTEC_ACTIVE_STORE_COOKIE } from "../../lib/store-defaults"

const origin = process.env.MELI_E2E_BASE_URL!
const oauth = "/api/marketplace/mercado-livre"
const listings = oauth + "/anuncios"
const connections = oauth + "/status"
const dashboard = "/dashboard/marketplace"
const storeA = "meli-qa-a"
const storeB = "meli-qa-b"
const headers = (storeId: string) => ({ [ASSISTEC_LOJA_HEADER]: storeId, Origin: origin })
const db = new PrismaClient({ datasourceUrl: process.env.MELI_E2E_DATABASE_URL })

test.describe.configure({ mode: "serial" })
test.afterAll(async () => db.$disconnect())

async function login(page: Page, user: string, storeId: string) {
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json()
  const signed = await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email: `${user}@marketplace-qa.invalid`, password: process.env.MELI_E2E_PASSWORD!, callbackUrl: origin + dashboard },
    headers: { "X-Auth-Return-Redirect": "1" },
  })
  expect(signed.ok()).toBe(true)
  const session = await (await page.request.get("/api/auth/session")).json()
  expect(session.user?.email).toBe(`${user}@marketplace-qa.invalid`)
  await page.context().addCookies([{ name: ASSISTEC_ACTIVE_STORE_COOKIE, value: storeId, url: origin }])
  await page.addInitScript((id) => localStorage.setItem("assistec-pro-loja-ativa-v1", id), storeId)
}

function callback(authorization: URL, kind: string) {
  const url = new URL(authorization.searchParams.get("redirect_uri")!)
  url.searchParams.set("state", authorization.searchParams.get("state")!)
  url.searchParams.set("code", `${kind}:${randomUUID()}:${authorization.searchParams.get("code_challenge")}`)
  return url.href
}

async function begin(request: APIRequestContext, storeId: string) {
  const response = await request.post(oauth, { headers: headers(storeId) })
  expect(response.status()).toBe(200)
  expect(response.headers()["cache-control"]).toContain("no-store")
  return new URL((await response.json()).authorizationUrl)
}

function readAds(request: APIRequestContext, storeId: string, cursor?: string) {
  return request.post(listings, { headers: headers(storeId), data: { cursor } })
}

async function readStatus(request: APIRequestContext, storeId: string) {
  return (await request.post(connections, { headers: headers(storeId) })).json()
}

async function cookieHeader(context: BrowserContext) {
  return (await context.cookies()).map((cookie) => `${cookie.name}=${cookie.value}`).join("; ")
}

async function finish(request: APIRequestContext, url: string, result: string, cookie?: string) {
  const response = await request.get(url, { maxRedirects: 0, headers: cookie ? { Cookie: cookie } : undefined })
  expect(response.status()).toBe(303)
  expect(response.headers()["referrer-policy"]).toBe("no-referrer")
  expect(new URL(response.headers().location).searchParams.get("meli")).toBe(result)
}

async function providerEvents(name: string) {
  const events = await readFile(process.env.MELI_E2E_PROVIDER_EVENTS!, "utf8")
  return events.split("\n").filter((event) => event === name).length
}

async function officialConnection(storeId: string) {
  return db.marketplaceConnection.findFirstOrThrow({ where: { storeId, id: { startsWith: "meli-oauth-v1-" } } })
}

test("autoriza pelo HUB, identifica vendedor e pagina clássico e User Products em desktop e mobile", async ({ page }, info) => {
  await login(page, "manager-a", storeA)
  await page.route("https://*.mlstatic.com/**", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"/>' }))
  await page.route("https://auth.mercadolivre.com.br/authorization?**", async (route) => {
    const authorization = new URL(route.request().url())
    expect(authorization.searchParams.get("code_challenge_method")).toBe("S256")
    expect(authorization.searchParams.get("code_challenge")).toMatch(/^[\w-]{43}$/)
    const cookie = (await page.context().cookies()).find(({ name }) => name === "__Host-omni-meli-oauth")
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax" })
    await route.fulfill({ status: 302, headers: { Location: callback(authorization, "classic") } })
  })

  await page.goto(dashboard)
  const section = page.locator("#conexoes-marketplace")
  await expect(section.getByText("Conta simulada QA")).toBeVisible()
  await expect(section.getByText("Simulada", { exact: true })).toBeVisible()
  await expect(section.getByText("Conectado e validado")).toHaveCount(0)
  await section.getByRole("button", { name: "Conectar Mercado Livre", exact: true }).click()
  await expect(section.getByText("Conectado e validado")).toBeVisible()
  await expect(section.getByText("VENDEDOR-QA-745001 · 745001")).toBeVisible()
  await expect(section.getByText("Leitura e acesso offline")).toBeVisible()
  await expect(page).not.toHaveURL(/code=|state=/)

  const publicPayload = await (await page.request.post(connections, { headers: headers(storeA) })).text()
  expect(publicPayload).not.toMatch(/qa-access-|qa-refresh-|client_secret|never-expose|meli-oauth-v1-/)
  const row = await officialConnection(storeA)
  expect(row.accessToken).toMatch(/^v1\./)
  expect(row.refreshToken).toMatch(/^v1\./)
  expect(row.accessToken).not.toContain("qa-access-")
  expect(row.refreshToken).not.toContain("qa-refresh-")
  expect((await page.request.patch(`/api/marketplace/connections/${row.id}`, {
    headers: headers(storeA), data: { simulateSync: true },
  })).status()).toBe(404)
  expect((await page.request.post("/api/marketplace/produtos/exportar", {
    headers: headers(storeA), data: { connectionId: row.id, productIds: ["meli-qa-item"] },
  })).status()).toBe(400)
  await section.getByRole("button", { name: "Consultar anúncios" }).click()
  const ads = page.getByRole("region", { name: "Anúncios do Mercado Livre" })
  await expect(ads.getByText("Camiseta clássica QA")).toBeVisible()
  await expect(ads.getByText("Disponibilidade no canal: 7")).toBeVisible()
  await ads.getByText("Variações (1)", { exact: true }).click()
  await expect(ads.getByText("SKU: SKU-AZUL-M-QA")).toBeVisible()
  await expect(ads.getByText("Azul · M")).toBeVisible()
  await ads.screenshot({ path: info.outputPath("desktop.png") })

  await page.setViewportSize({ width: 390, height: 844 })
  await ads.getByRole("button", { name: "Próxima página" }).click()
  await expect(ads.getByText("MLB7402 · active")).toBeVisible()
  await expect(ads.getByText("User Product: MLBU701")).toBeVisible()
  await expect.poll(async () => (await ads.boundingBox())?.width ?? 0).toBeLessThan(390)
  await ads.screenshot({ path: info.outputPath("mobile.png") })
  await ads.getByRole("button", { name: "Próxima página" }).click()
  await expect(ads.getByText("Fim da consulta de anúncios.")).toBeVisible()
  expect(await db.marketplaceProductLink.count()).toBe(0)
  expect(await db.marketplaceListing.count()).toBe(0)
  expect(await db.venda.count()).toBe(0)
  expect(await db.produto.findUnique({ where: { id: "meli-qa-item" }, select: { stock: true, price: true } })).toEqual({ stock: 19, price: 10.25 })
})

test("nega outra loja, módulo ausente, mutação de outra origem, replay e mudança de conta", async ({ page, browser }) => {
  expect((await readAds(page.request, storeA)).status()).toBe(401)
  await login(page, "manager-a", storeA)
  expect((await readAds(page.request, storeB)).status()).toBe(403)
  expect((await page.request.post(oauth, { headers: headers("meli-qa-no-module") })).status()).toBe(403)
  const off = await page.request.post(oauth, { headers: headers("meli-qa-off") })
  expect(off.status()).toBe(403)
  expect(await off.json()).toMatchObject({ code: "not_configured" })
  expect((await page.request.post(oauth, { headers: { ...headers(storeA), Origin: "https://other.example.invalid" } })).status()).toBe(400)
  expect((await page.request.post(listings, { headers: headers(storeA), data: { sellerId: "745002" } })).status()).toBe(400)

  const before = await providerEvents("exchange")
  const pending = await begin(page.request, storeA)
  const beforeCallback = await cookieHeader(page.context())
  const url = callback(pending, "different")
  const invalid = new URL(url)
  invalid.searchParams.set("state", "not-the-state")
  await finish(page.request, invalid.href, "invalid_state")

  const other = await browser.newContext({ baseURL: origin, ignoreHTTPSErrors: true })
  try {
    const otherPage = await other.newPage()
    await login(otherPage, "second-a", storeA)
    const transaction = (await page.context().cookies()).find(({ name }) => name === "__Host-omni-meli-oauth")!
    await other.addCookies([transaction])
    await finish(otherPage.request, url, "session_required")
  } finally {
    await other.close()
  }
  expect(await providerEvents("exchange")).toBe(before)
  await finish(page.request, url, "account_mismatch")
  await finish(page.request, url, "invalid_state", beforeCallback)
  expect(await providerEvents("exchange")).toBe(before + 1)
  const description = await readStatus(page.request, storeA)
  expect(description.mercadoLivre.seller.id).toBe("745001")

  const expired = await begin(page.request, storeA)
  const row = await officialConnection(storeA)
  const metadata = row.metadata as Prisma.JsonObject
  await db.marketplaceConnection.update({ where: { id: row.id }, data: { metadata: {
    ...metadata, pending: { ...(metadata.pending as Prisma.JsonObject), expiresAt: Date.now() - 1 },
  } } })
  await finish(page.request, callback(expired, "classic"), "invalid_state")
  expect(await providerEvents("exchange")).toBe(before + 1)
})

test("isola cursor e conta por loja, gira refresh uma vez e distingue limite, rede e revogação", async ({ page, browser }) => {
  await login(page, "manager-b", storeB)
  const duplicate = await begin(page.request, storeB)
  await finish(page.request, callback(duplicate, "classic"), "account_mismatch")
  const short = await begin(page.request, storeB)
  await finish(page.request, callback(short, "expiring"), "authorized")
  const row = await officialConnection(storeB)
  const metadata = row.metadata as Prisma.JsonObject
  await db.marketplaceConnection.update({ where: { id: row.id }, data: { metadata: {
    ...metadata, grant: { ...(metadata.grant as Prisma.JsonObject), expiresAt: Date.now() - 1 },
  } } })
  expect((await readStatus(page.request, storeB)).mercadoLivre.state).toBe("token_expired")

  const beforeRefresh = await providerEvents("refresh")
  const concurrent = await Promise.all(Array.from({ length: 4 }, () => readAds(page.request, storeB)))
  expect(concurrent.every((r) => [200, 409].includes(r.status()))).toBe(true)
  const success = concurrent.find((r) => r.ok())
  expect(success).toBeDefined()
  expect(await providerEvents("refresh")).toBe(beforeRefresh + 1)
  const cursor = (await success!.json()).nextCursor
  expect(cursor).not.toContain("qa-scroll-1")
  expect((await officialConnection(storeB)).refreshToken).not.toBe(row.refreshToken)

  const other = await browser.newContext({ baseURL: origin, ignoreHTTPSErrors: true })
  try {
    const otherPage = await other.newPage()
    await login(otherPage, "manager-a", storeA)
    const searches = await providerEvents("search")
    const wrong = await readAds(otherPage.request, storeA, cursor)
    expect(wrong.status()).toBe(400)
    expect(await wrong.json()).toMatchObject({ code: "invalid_cursor" })
    expect(await providerEvents("search")).toBe(searches)
  } finally {
    await other.close()
  }

  const rate = await readAds(page.request, storeB, cursor)
  expect(rate.status()).toBe(429)
  expect(rate.headers()["retry-after"]).toBe("12")
  const searches = await providerEvents("search")
  expect((await readAds(page.request, storeB)).status()).toBe(429)
  expect(await providerEvents("search")).toBe(searches)
  for (const [kind, status, state] of [
    ["lost", 502, "communication_error"], ["revoked", 409, "reconnect_required"],
  ] as const) {
    await finish(page.request, callback(await begin(page.request, storeB), kind), "authorized")
    expect((await readAds(page.request, storeB)).status()).toBe(status)
    expect((await readStatus(page.request, storeB)).mercadoLivre.state).toBe(state)
    expect((await officialConnection(storeB)).refreshToken).toBe("")
    const sent = await providerEvents("refresh")
    expect((await readAds(page.request, storeB)).status()).toBe(409)
    expect(await providerEvents("refresh")).toBe(sent)
  }
  expect((await page.request.delete(oauth, { headers: headers(storeB) })).status()).toBe(200)
  expect((await readStatus(page.request, storeB)).mercadoLivre.state).toBe("disconnected")
  expect((await officialConnection(storeB)).id).toBe(row.id)
  expect(await db.logsAuditoria.count({ where: { action: "marketplace.mercado_livre.disconnected" } })).toBe(1)
  expect(await db.marketplaceConnection.findUnique({ where: { id: "meli-qa-legacy" } })).toMatchObject({ accessToken: "[encrypted:placeholder]" })
  expect(await providerEvents("unexpected")).toBe(0)
})
