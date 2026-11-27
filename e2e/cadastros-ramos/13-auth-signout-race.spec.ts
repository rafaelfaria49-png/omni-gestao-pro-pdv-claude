import { expect, test, type Page } from "@playwright/test"
import { STORES, USERS, login, logoutViaSeguranca } from "./support"

test.use({ trace: "off", video: "off", screenshot: "off", serviceWorkers: "block" })

const sessionCookieName = /^(?:__Secure-)?authjs\.session-token(?:\.\d+)?$/

async function session(page: Page) {
  const response = await page.request.get("/api/auth/session")
  expect(response.ok()).toBe(true)
  return (await response.json())?.user ?? null
}

function holdSessionRead(page: Page, id: string) {
  const ready = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const path = `/api/auth/session?qaHeldRead=${id}`
  const pattern = new RegExp(`/api/auth/session\\?qaHeldRead=${id}$`)
  return {
    async start() {
      await page.route(pattern, async (route) => {
        try {
          const response = await route.fetch()
          ready.resolve()
          await release.promise
          await route.fulfill({ response })
        } catch (error) {
          ready.reject(error)
          await route.abort().catch(() => {})
        }
      }, { times: 1 })
      return {
        ready: ready.promise,
        done: page.evaluate(async (url) => {
          const response = await fetch(url, { cache: "no-store" })
          return (await response.json())?.user?.email ?? null
        }, path),
      }
    },
    release: () => release.resolve(),
  }
}

test("respostas reais retidas em outra aba não restauram a sessão nem alteram o próximo login", async ({ page, context }) => {
  await login(page, USERS.admin)
  const observer = await context.newPage()
  // Uma aba da mesma origem com o cookie compartilhado, sem navegação automática da UI.
  await observer.goto("/api/version")
  expect((await session(observer)).email).toBe(USERS.admin.email)

  await observer.evaluate(async () => {
    localStorage.setItem("assistec-pro-caixa-v1-qa-signout", "synthetic-pending-sale")
    const cache = await caches.open("qa-authenticated-session")
    await cache.put("/api/auth/session", new Response("synthetic-private-cache"))
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("qa-signout-operational", 1)
      request.onupgradeneeded = () => request.result.createObjectStore("pending")
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction("pending", "readwrite")
        tx.objectStore("pending").put("synthetic-pending-sale", "sale")
        tx.onerror = () => reject(tx.error)
        tx.oncomplete = () => { db.close(); resolve() }
      }
    })
  })

  const first = holdSessionRead(observer, "before-next-login")
  const second = holdSessionRead(observer, "after-next-login")
  const reads = await Promise.all([first.start(), second.start()])
  try {
    await Promise.all(reads.map((read) => read.ready))
    await logoutViaSeguranca(page)

    first.release()
    // A resposta foi realmente calculada com o cookie do primeiro operador.
    expect(await reads[0].done).toBe(USERS.admin.email)
    expect((await context.cookies()).map((cookie) => cookie.name).filter((name) => sessionCookieName.test(name))).toEqual([])
    expect(await session(observer)).toBeNull()
    expect((await observer.request.get("/api/stores")).status()).toBe(401)
    await expect.poll(() => observer.evaluate(() => caches.has("qa-authenticated-session"))).toBe(false)
    const operational = await observer.evaluate(async () => ({
      local: localStorage.getItem("assistec-pro-caixa-v1-qa-signout"),
      indexed: await new Promise<unknown>((resolve, reject) => {
        const request = indexedDB.open("qa-signout-operational", 1)
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction("pending", "readonly")
          const read = tx.objectStore("pending").get("sale")
          read.onsuccess = () => { db.close(); resolve(read.result) }
          read.onerror = () => reject(read.error)
        }
      }),
    }))
    expect(operational).toEqual({ local: "synthetic-pending-sale", indexed: "synthetic-pending-sale" })

    await login(page, USERS.caixa)
    second.release()
    expect(await reads[1].done).toBe(USERS.admin.email)
    expect(await session(page)).toMatchObject({ email: USERS.caixa.email, role: "CAIXA", storeAccess: "restricted" })
    expect((await session(observer)).allowedStoreIds).not.toContain(STORES.acessorios)
  } finally {
    first.release()
    second.release()
    await Promise.allSettled(reads.map((read) => read.done))
    await observer.close()
  }
})

test("rede fora durante signout mantém a sessão e informa a falha", async ({ page }) => {
  await login(page, USERS.admin)
  await page.goto("/dashboard/configuracoes?sec=seguranca")
  await page.route("**/api/auth/signout", (route) => route.abort("failed"), { times: 1 })
  await page.getByRole("button", { name: "Encerrar sessão" }).click()
  await expect(page.getByRole("alert").filter({ hasText: "Não foi possível encerrar a sessão agora" })).toBeVisible()
  expect((await session(page)).email).toBe(USERS.admin.email)
})
