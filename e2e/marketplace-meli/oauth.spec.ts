import { randomBytes, randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { setTimeout as delay } from "node:timers/promises"
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test"
import { decode, encode } from "next-auth/jwt"
import { Prisma, PrismaClient } from "../../generated/prisma"
import { ASSISTEC_LOJA_HEADER } from "../../lib/assistec-headers"
import { ASSISTEC_ACTIVE_STORE_COOKIE } from "../../lib/store-defaults"
import { localFixtureDatasource } from "../../lib/db/datasource-policy.mjs"

const origin = process.env.MELI_E2E_BASE_URL!
const oauth = "/api/marketplace/mercado-livre"
const listings = oauth + "/anuncios"
const connections = oauth + "/status"
const dashboard = "/dashboard/marketplace"
const storeA = "meli-qa-a"
const storeB = "meli-qa-b"
const storeNew = "meli-qa-new"
const headers = (storeId: string) => ({ [ASSISTEC_LOJA_HEADER]: storeId, Origin: origin })
const db = new PrismaClient({ datasourceUrl: localFixtureDatasource(process.env.MELI_E2E_BOOTSTRAP_DATABASE_URL) })

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

function requestAuthorization(request: APIRequestContext, storeId: string, sellerId?: string) {
  return request.post(oauth, { headers: headers(storeId), data: sellerId ? { sellerId } : undefined })
}

async function begin(request: APIRequestContext, storeId: string, sellerId?: string) {
  const response = await requestAuthorization(request, storeId, sellerId)
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

async function finish(request: APIRequestContext, url: string, result: string, requestHeaders?: Record<string, string>) {
  const response = await request.get(url, { maxRedirects: 0, headers: requestHeaders })
  expect(response.status()).toBe(303)
  expect(response.headers()["cache-control"]).toContain("no-store")
  expect(response.headers()["referrer-policy"]).toBe("no-referrer")
  expect(JSON.stringify(response.headers())).not.toContain("qa-ingress-")
  const destination = new URL(response.headers().location)
  expect(destination.origin + destination.pathname).toBe(origin + dashboard)
  expect(Array.from(destination.searchParams.entries())).toEqual([["meli", result]])
}

async function providerEvents(name: string) {
  const events = await readFile(process.env.MELI_E2E_PROVIDER_EVENTS!, "utf8")
  return events.split("\n").filter((event) => event === name).length
}

async function officialConnection(storeId: string) {
  return db.marketplaceConnection.findFirstOrThrow({ where: { storeId, id: { startsWith: "meli-oauth-v1-" } } })
}

async function expireGrant(storeId: string) {
  const row = await officialConnection(storeId)
  const metadata = row.metadata as Prisma.JsonObject
  await db.marketplaceConnection.update({ where: { id: row.id }, data: { metadata: {
    ...metadata, grant: { ...(metadata.grant as Prisma.JsonObject), expiresAt: Date.now() - 1 },
  } } })
}

async function setPendingExpiry(storeId: string, expiresAt: number) {
  const row = await officialConnection(storeId)
  const metadata = row.metadata as Prisma.JsonObject
  expect(metadata.pending).toMatchObject({ digest: expect.any(String) })
  await db.marketplaceConnection.update({ where: { id: row.id }, data: { metadata: {
    ...metadata, pending: { ...(metadata.pending as Prisma.JsonObject), expiresAt },
  } } })
}

test("sessão HTTPS rejeita segredos de outros ambientes e replay do cookie após logout", async ({ page, browser }) => {
  await login(page, "manager-a", storeA)
  const sessionCookies = (await page.context().cookies(origin))
    .filter(({ name }) => /(?:^|-)authjs\.session-token(?:\.\d+)?$/.test(name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  expect(sessionCookies.length).toBeGreaterThan(0)
  for (const cookie of sessionCookies) {
    expect(cookie).toMatchObject({ secure: true, httpOnly: true, path: "/", domain: "127.0.0.1", sameSite: "Lax" })
  }
  const salt = sessionCookies[0].name.replace(/\.\d+$/, "")
  const token = await decode({
    secret: process.env.MELI_E2E_AUTH_SECRET!,
    token: sessionCookies.map(({ value }) => value).join(""),
    salt,
  })
  if (!token || typeof token.sid !== "string") throw new Error("Sessão sintética sem registro revogável.")
  expect((await db.adminSession.findUniqueOrThrow({ where: { id: token.sid } })).revokedAt).toBeNull()

  const isolated = await browser.newContext({ baseURL: origin, ignoreHTTPSErrors: true })
  try {
    // Mesmas claims válidas, com chaves distintas, representam Production e outro QA.
    // Nenhum cookie nem chave de outro ambiente real é coletado.
    for (const scope of ["Production simulada", "outro QA simulado"]) {
      await test.step(scope, async () => {
        const foreign = await encode({ token, salt, secret: randomBytes(32).toString("base64url") })
        const response = await isolated.request.get("/api/auth/session", { headers: { Cookie: salt + "=" + foreign } })
        expect(await response.json()).toBeNull()
      })
    }

    const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json()
    const copied = sessionCookies.map(({ name, value }) => `${name}=${value}`).join("; ")
    const signedOut = await page.request.post("/api/auth/signout", {
      form: { csrfToken, callbackUrl: origin + "/login" }, headers: { "X-Auth-Return-Redirect": "1" },
    })
    expect(signedOut.ok()).toBe(true)
    expect(await (await page.request.get("/api/auth/session")).json()).toBeNull()
    const revoked = await db.adminSession.findUniqueOrThrow({ where: { id: token.sid } })
    expect(revoked.revokedAt).toBeInstanceOf(Date)
    expect(revoked.revokedReason).toBe("logout")
    const replay = await isolated.request.get("/api/auth/session", { headers: { Cookie: copied } })
    expect(await replay.json()).toBeNull()
    expect((await readAds(page.request, storeA)).status()).toBe(401)
  } finally {
    await isolated.close()
  }
})

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
  const desktop = page.viewportSize()!
  await page.setViewportSize({ width: 390, height: 844 })
  const sellerInput = section.getByLabel("ID do vendedor (opcional)")
  await sellerInput.fill("745001")
  await expect.poll(async () => (await sellerInput.boundingBox())?.width ?? 0).toBeLessThan(390)
  await page.setViewportSize(desktop)
  const returningToHub = page.waitForRequest((req) => {
    const url = new URL(req.url())
    return req.isNavigationRequest() && url.pathname === dashboard && url.searchParams.has("meli")
  })
  await section.getByRole("button", { name: "Conectar Mercado Livre", exact: true }).click()
  const referrer = await (await returningToHub).headerValue("referer")
  expect(referrer ?? "").not.toMatch(/\/callback|[?&](code|state)=/)
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
  const invalidSeller = await requestAuthorization(page.request, storeA, "001")
  expect(invalidSeller.status()).toBe(400)
  expect(await invalidSeller.json()).toMatchObject({ code: "invalid_seller_id" })
  const changedSeller = await requestAuthorization(page.request, storeA, "745002")
  expect(changedSeller.status()).toBe(409)
  expect(await changedSeller.json()).toMatchObject({ code: "account_mismatch" })

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
  await finish(page.request, url, "invalid_state", { Cookie: beforeCallback })
  expect(await providerEvents("exchange")).toBe(before + 1)
  const description = await readStatus(page.request, storeA)
  expect(description.mercadoLivre.seller.id).toBe("745001")

  const expired = await begin(page.request, storeA)
  await setPendingExpiry(storeA, Date.now() - 1)
  await finish(page.request, callback(expired, "classic"), "invalid_state")
  expect(await providerEvents("exchange")).toBe(before + 1)
})

test("recusa vendedor conhecido antes do consentimento e limita intenções concorrentes", async ({ page, browser }) => {
  await login(page, "manager-b", storeB)
  const original = await officialConnection(storeA)
  const exchanges = await providerEvents("exchange")
  const duplicate = await requestAuthorization(page.request, storeB, "745001")
  expect(duplicate.status()).toBe(409)
  expect(duplicate.headers()["set-cookie"] ?? "").not.toContain("__Host-omni-meli-oauth=")
  expect(await duplicate.json()).toMatchObject({ code: "account_mismatch" })

  const second = await browser.newContext({ baseURL: origin, ignoreHTTPSErrors: true })
  try {
    const secondPage = await second.newPage()
    await login(secondPage, "manager-a", storeNew)
    const flows = [{ request: page.request, store: storeB }, { request: secondPage.request, store: storeNew }]
    const starts = await Promise.all(flows.map((flow) => requestAuthorization(flow.request, flow.store, "745002")))
    expect(starts.map((reply) => reply.status()).sort()).toEqual([200, 409])
    const index = starts.findIndex((reply) => reply.ok())
    const winner = flows[index]
    const loser = flows[1 - index]
    expect(await starts[1 - index].json()).toMatchObject({ code: "operation_in_progress" })
    expect(await providerEvents("exchange")).toBe(exchanges)

    const authorization = new URL((await starts[index].json()).authorizationUrl)
    const denial = new URL(authorization.searchParams.get("redirect_uri")!)
    denial.searchParams.set("state", authorization.searchParams.get("state")!)
    denial.searchParams.set("error", "access_denied")
    denial.searchParams.set("error_description", "qa-ingress-error-description")
    denial.searchParams.set("query", "qa-ingress-query")
    await finish(winner.request, denial.href, "denied")
    expect(await providerEvents("exchange")).toBe(exchanges)
    const retry = await begin(loser.request, loser.store, "745002")
    const cookies = await cookieHeader(loser.store === storeB ? page.context() : second)
    await Promise.all([
      finish(loser.request, callback(retry, "fault"), "communication_error", {
        Authorization: "Bearer qa-ingress-authorization",
        Cookie: cookies + "; meli-canary=qa-ingress-cookie",
        Referer: origin + oauth + "/callback?code=qa-ingress-referer",
        "x-omni-search": "?code=qa-ingress-copy",
      }),
      (async () => {
        await expect.poll(() => providerEvents("exchange")).toBe(exchanges + 1)
        const pending = ((await officialConnection(loser.store)).metadata as Prisma.JsonObject).pending as Prisma.JsonObject
        expect(pending).toMatchObject({ sellerId: "745002", used: true })
        expect(pending.expiresAt).toBeGreaterThan(Date.now())
        expect(pending.expiresAt).toBeLessThanOrEqual(Date.now() + 30_000)
        const concurrent = await requestAuthorization(winner.request, winner.store, "745002")
        expect(concurrent.status()).toBe(409)
        expect(await concurrent.json()).toMatchObject({ code: "operation_in_progress" })
      })(),
    ])
    expect(await providerEvents("exchange")).toBe(exchanges + 1)
    expect((await officialConnection(loser.store)).refreshToken).toBe("")
    expect(await officialConnection(storeA)).toEqual(original)
  } finally {
    await second.close()
  }
})

test("fecha o callback expirado antes da troca e descarta grant após o prazo do processamento", async ({ page }) => {
  await login(page, "manager-b", storeB)
  const expectedSeller = "745002"
  const exchanges = await providerEvents("exchange")
  const first = await begin(page.request, storeB, expectedSeller)
  const { response } = await db.$transaction(async (tx) => {
    const lockKey = `marketplace:mercado-livre:seller:${expectedSeller}`
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS lock`
    const expiresAt = Date.now() + 2_000
    await setPendingExpiry(storeB, expiresAt)
    const response = page.request.get(callback(first, "different"), { maxRedirects: 0 })
    await expect.poll(async () => {
      const [result] = await tx.$queryRaw<{ waiting: boolean }[]>`
        SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND NOT granted) AS waiting
      `
      return result.waiting
    }, { timeout: 1_800 }).toBe(true)
    await delay(Math.max(0, expiresAt - Date.now() + 25))
    return { response }
  }, { timeout: 8_000 })
  const stale = await response
  expect(stale.status()).toBe(303)
  expect(new URL(stale.headers().location).searchParams.get("meli")).toBe("invalid_state")
  expect(await providerEvents("exchange")).toBe(exchanges)

  const second = await begin(page.request, storeB, expectedSeller)
  await Promise.all([
    finish(page.request, callback(second, "slow"), "invalid_state"),
    (async () => {
      await expect.poll(() => providerEvents("exchange")).toBe(exchanges + 1)
      await setPendingExpiry(storeB, Date.now() - 1)
    })(),
  ])
  expect((await officialConnection(storeB)).refreshToken).toBe("")
  expect(await db.logsAuditoria.count({
    where: { action: "marketplace.mercado_livre.seller_bound", metadata: { contains: '"sellerId":"745002"' } },
  })).toBe(0)
})

test("recusa grant duplicado sem tocar o vínculo original e recupera refresh com nova autorização", async ({ page, browser }) => {
  await login(page, "manager-b", storeB)
  const other = await browser.newContext({ baseURL: origin, ignoreHTTPSErrors: true })
  try {
    const source = await other.newPage()
    await login(source, "manager-a", storeA)
    const original = await officialConnection(storeA)
    const exchanges = await providerEvents("exchange")
    await finish(page.request, callback(await begin(page.request, storeB), "classic"), "account_mismatch")
    expect(await providerEvents("exchange")).toBe(exchanges + 1)
    expect(await officialConnection(storeA)).toEqual(original)
    expect((await officialConnection(storeB)).refreshToken).toBe("")
    expect((await readStatus(source.request, storeA)).mercadoLivre.seller.id).toBe("745001")

    await expireGrant(storeA)
    const refreshes = await providerEvents("refresh")
    const expired = await readAds(source.request, storeA)
    expect(expired.status()).toBe(409)
    expect(await expired.json()).toMatchObject({ code: "reconnect_required" })
    const status = await readStatus(source.request, storeA)
    expect(status.mercadoLivre).toMatchObject({ state: "reconnect_required", seller: { id: "745001" } })
    expect((await officialConnection(storeA)).refreshToken).toBe("")
    expect((await readAds(source.request, storeA)).status()).toBe(409)
    expect(await providerEvents("refresh")).toBe(refreshes + 1)

    await finish(source.request, callback(await begin(source.request, storeA), "classic"), "authorized")
    expect((await readAds(source.request, storeA)).status()).toBe(200)
    expect((await officialConnection(storeA)).id).toBe(original.id)
  } finally {
    await other.close()
  }
})

test("revalida a reserva antes da troca, isola páginas e distingue rotação, limite e revogação", async ({ page, browser }) => {
  await login(page, "manager-b", storeB)
  const claimant = await browser.newContext({ baseURL: origin, ignoreHTTPSErrors: true })
  try {
    const claimantPage = await claimant.newPage()
    await login(claimantPage, "manager-a", storeNew)
    const pending = await begin(claimantPage.request, storeNew, "745003")
    await finish(page.request, callback(await begin(page.request, storeB), "expiring"), "authorized")
    const exchanges = await providerEvents("exchange")
    await finish(claimantPage.request, callback(pending, "expiring"), "account_mismatch")
    expect(await providerEvents("exchange")).toBe(exchanges)
    expect((await officialConnection(storeNew)).refreshToken).toBe("")
    expect((await readStatus(claimantPage.request, storeNew)).mercadoLivre.state).not.toBe("awaiting_authorization")
  } finally {
    await claimant.close()
  }
  const row = await officialConnection(storeB)
  await expireGrant(storeB)
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

test("Preview recusa identidade comercial e conserva reserva após exclusão ou recriação da loja sintética", async ({ page }) => {
  await login(page, "manager-a", storeNew)
  await finish(page.request, callback(await begin(page.request, storeNew), "commercial"), "test_seller_required")
  expect((await readStatus(page.request, storeNew)).mercadoLivre).toMatchObject({
    state: "insufficient_permissions", seller: null, canRead: false,
  })
  expect((await officialConnection(storeNew)).accessToken).toBe("")

  const previous = await officialConnection(storeB)
  const owner = await db.logsAuditoria.findFirstOrThrow({
    where: { action: "marketplace.mercado_livre.seller_bound", metadata: { contains: '"sellerId":"745003"' } },
  })
  expect(JSON.parse(owner.metadata!)).toMatchObject({ storeId: storeB, sellerId: "745003" })
  // Apenas a loja criada pelo fixture é removida do PostgreSQL isolado do teste.
  await db.store.delete({ where: { id: storeB } })
  expect(await db.marketplaceConnection.findUnique({ where: { id: previous.id } })).toBeNull()
  const before = await providerEvents("exchange")
  const afterDelete = await requestAuthorization(page.request, storeNew, "745003")
  expect(afterDelete.status()).toBe(409)
  expect(await afterDelete.json()).toMatchObject({ code: "account_mismatch" })
  expect(await providerEvents("exchange")).toBe(before)
  await finish(page.request, callback(await begin(page.request, storeNew), "expiring"), "account_mismatch")
  expect((await officialConnection(storeNew)).accessToken).toBe("")

  const recreated = await db.store.create({ data: {
    id: storeB, name: "Loja QA recriada", cnpj: "00.000.000/0002-72", moduleAccess: Prisma.DbNull,
    createdAt: new Date(Date.now() + 1_000),
  } })
  const manager = await db.adminUser.findUniqueOrThrow({ where: { email: "manager-b@marketplace-qa.invalid" } })
  await db.adminUserStore.create({ data: { storeId: recreated.id, adminUserId: manager.id } })
  await login(page, "manager-b", recreated.id)
  const beforeRecreate = await providerEvents("exchange")
  const afterRecreate = await requestAuthorization(page.request, recreated.id, "745003")
  expect(afterRecreate.status()).toBe(409)
  expect(await afterRecreate.json()).toMatchObject({ code: "account_mismatch" })
  expect(await providerEvents("exchange")).toBe(beforeRecreate)
  await finish(page.request, callback(await begin(page.request, recreated.id), "expiring"), "account_mismatch")
  expect((await officialConnection(recreated.id)).accessToken).toBe("")

  expect(await db.logsAuditoria.findUnique({ where: { id: owner.id } })).toEqual(owner)
  expect(await providerEvents("unexpected")).toBe(0)
})
