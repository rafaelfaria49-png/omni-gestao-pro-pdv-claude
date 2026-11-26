import { describe, expect, it } from "vitest"
import {
  SignoutTokenFence,
  createAuthRouteHandlers,
  extractAuthSessionTokens,
  getSetCookieHeaders,
  isClearingSetCookieHeader,
  isSessionCookieSetHeader,
  stripRestoringSessionCookies,
} from "./signout-race-guard"
import {
  isSessionRevocationEnabled,
  resolveAdminSession,
  type AdminSessionRow,
  type AdminSessionStore,
} from "./admin-session"

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function makeAuthenticatedSessionResponse(cookieName: string, freshToken: string, email: string): Response {
  const headers = new Headers({ "Content-Type": "application/json" })
  headers.append("set-cookie", `${cookieName}=${freshToken}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax`)
  return new Response(JSON.stringify({ user: { email, role: "ADMIN" }, expires: "2099-01-01T00:00:00.000Z" }), {
    status: 200,
    headers,
  })
}

function makeSignoutClearedResponse(cookieName: string): Response {
  const headers = new Headers({ "Content-Type": "application/json" })
  headers.append("set-cookie", `${cookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`)
  return new Response(JSON.stringify({ url: "http://127.0.0.1:3000/login" }), { status: 200, headers })
}

describe("signout-race-guard — extração e cerca de encerramento de sessão", () => {
  it("extrai cookies simples, __Secure- e fragmentados (.0/.1) preservando os nomes exatos dos fragmentos", () => {
    expect(extractAuthSessionTokens("foo=1; authjs.session-token=tok-a; bar=2")).toEqual([
      { cookieName: "authjs.session-token", cookieNames: ["authjs.session-token"], token: "tok-a" },
    ])
    expect(
      extractAuthSessionTokens(
        "__Secure-authjs.session-token.1=partB; __Secure-authjs.session-token.0=partA; other=x",
      ),
    ).toEqual([
      {
        cookieName: "__Secure-authjs.session-token",
        cookieNames: ["__Secure-authjs.session-token.0", "__Secure-authjs.session-token.1"],
        token: "partApartB",
      },
    ])
    expect(extractAuthSessionTokens(null)).toEqual([])
  })

  it("corrida determinística: GET /api/auth/session iniciado ANTES e concluído DEPOIS do POST /api/auth/signout não restaura cookie nem sessão", async () => {
    const fence = new SignoutTokenFence()
    const gate = deferred<void>()
    const oldToken = "jwt-session-token-v1-before-logout"

    const handlers = createAuthRouteHandlers(
      {
        async GET() {
          // Simula consulta lenta ao Prisma em callbacks.jwt() antes de emitir Set-Cookie.
          await gate.promise
          return makeAuthenticatedSessionResponse("authjs.session-token", "jwt-reissued-after-prisma", "admin@pilot.invalid")
        },
        async POST() {
          return makeSignoutClearedResponse("authjs.session-token")
        },
      },
      fence,
    )

    // 1. GET /api/auth/session começa enquanto o cookie ainda é válido.
    const inFlightSession = handlers.GET(
      new Request("http://127.0.0.1:3000/api/auth/session", {
        headers: { cookie: `authjs.session-token=${oldToken}` },
      }),
    )

    // 2. POST /api/auth/signout chega e conclui antes da consulta do GET terminar.
    const signoutRes = await handlers.POST(
      new Request("http://127.0.0.1:3000/api/auth/signout", {
        method: "POST",
        headers: { cookie: `authjs.session-token=${oldToken}` },
      }),
    )
    expect(signoutRes.status).toBe(200)

    // 3. A resposta atrasada do GET /api/auth/session termina agora.
    gate.resolve()
    const lateSessionRes = await inFlightSession

    expect(lateSessionRes.status).toBe(200)
    expect(await lateSessionRes.json()).toBeNull()
    const setCookies = getSetCookieHeaders(lateSessionRes.headers)
    expect(setCookies.length).toBeGreaterThan(0)
    for (const cookie of setCookies) {
      expect(isSessionCookieSetHeader(cookie)).toBe(true)
      expect(isClearingSetCookieHeader(cookie)).toBe(true)
    }

    // 4. Qualquer nova tentativa com o cookie antigo continua bloqueada sem reemitir sessão.
    const replayRes = await handlers.GET(
      new Request("http://127.0.0.1:3000/api/auth/session", {
        headers: { cookie: `authjs.session-token=${oldToken}` },
      }),
    )
    expect(await replayRes.json()).toBeNull()
  })

  it("múltiplas requisições simultâneas a /api/auth/session em 30 rodadas consecutivas nunca restauram sessão encerrada", async () => {
    for (let round = 0; round < 30; round++) {
      const fence = new SignoutTokenFence()
      const gates = Array.from({ length: 6 }, () => deferred<void>())
      let getIndex = 0
      const token = `jwt-round-${round}-active`

      const handlers = createAuthRouteHandlers(
        {
          async GET() {
            const idx = getIndex++
            await gates[idx]?.promise
            return makeAuthenticatedSessionResponse("__Secure-authjs.session-token", `jwt-fresh-${round}-${idx}`, "op@pilot.invalid")
          },
          async POST() {
            return makeSignoutClearedResponse("__Secure-authjs.session-token")
          },
        },
        fence,
      )

      const concurrentGets = gates.map(() =>
        handlers.GET(
          new Request("https://app.pilot.invalid/api/auth/session", {
            headers: { cookie: `__Secure-authjs.session-token=${token}` },
          }),
        ),
      )

      await handlers.POST(
        new Request("https://app.pilot.invalid/api/auth/signout", {
          method: "POST",
          headers: { cookie: `__Secure-authjs.session-token=${token}` },
        }),
      )

      // Libera as respostas concorrentes em ordem embaralhada.
      for (const g of gates.reverse()) g.resolve()
      const responses = await Promise.all(concurrentGets)

      for (const res of responses) {
        expect(await res.json()).toBeNull()
        const cookies = getSetCookieHeaders(res.headers)
        expect(cookies.some((c) => isSessionCookieSetHeader(c) && !isClearingSetCookieHeader(c))).toBe(false)
        expect(cookies.some((c) => c.includes("__Secure-authjs.session-token=;") && c.includes("Secure"))).toBe(true)
      }
    }
  })

  it("logout seguido de novo login legítimo (mesmo usuário ou outro operador no mesmo terminal) funciona imediatamente", async () => {
    const fence = new SignoutTokenFence()
    const tokenOpA = "jwt-operator-a-store-1"
    const tokenOpB = "jwt-operator-b-store-2"

    const handlers = createAuthRouteHandlers(
      {
        async GET(req) {
          const cookie = req.headers.get("cookie") ?? ""
          if (cookie.includes(tokenOpB)) {
            return makeAuthenticatedSessionResponse("authjs.session-token", "jwt-operator-b-refreshed", "caixa-b@pilot.invalid")
          }
          return makeAuthenticatedSessionResponse("authjs.session-token", "jwt-operator-a-refreshed", "admin-a@pilot.invalid")
        },
        async POST() {
          return makeSignoutClearedResponse("authjs.session-token")
        },
      },
      fence,
    )

    // Operador A encerra sessão.
    await handlers.POST(
      new Request("http://127.0.0.1:3000/api/auth/signout", {
        method: "POST",
        headers: { cookie: `authjs.session-token=${tokenOpA}` },
      }),
    )

    // Cookie antigo do Operador A permanece recusado.
    const oldSession = await handlers.GET(
      new Request("http://127.0.0.1:3000/api/auth/session", {
        headers: { cookie: `authjs.session-token=${tokenOpA}` },
      }),
    )
    expect(await oldSession.json()).toBeNull()

    // Novo login legítimo (Operador B no mesmo terminal, novo JWT) é aceito imediatamente.
    const newSession = await handlers.GET(
      new Request("http://127.0.0.1:3000/api/auth/session", {
        headers: { cookie: `authjs.session-token=${tokenOpB}` },
      }),
    )
    expect(await newSession.json()).toMatchObject({ user: { email: "caixa-b@pilot.invalid" } })
  })

  it("rejeição de CSRF do Auth.js v5 (302 MissingCSRF e 200 JSON sem Set-Cookie de limpeza) desfaz a marcação", async () => {
    const validToken = "jwt-victim-active-session"
    const rejectionResponses = [
      new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1:3000/api/auth/error?error=MissingCSRF" },
      }),
      new Response(JSON.stringify({ url: "http://127.0.0.1:3000/api/auth/error?error=MissingCSRF" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ]

    for (const rejection of rejectionResponses) {
      const fence = new SignoutTokenFence()
      const handlers = createAuthRouteHandlers(
        {
          async GET() {
            return makeAuthenticatedSessionResponse("authjs.session-token", validToken, "victim@pilot.invalid")
          },
          async POST() {
            return rejection
          },
        },
        fence,
      )

      await handlers.POST(
        new Request("http://127.0.0.1:3000/api/auth/signout", {
          method: "POST",
          headers: { cookie: `authjs.session-token=${validToken}` },
        }),
      )
      expect(fence.isSignedOut([validToken])).toBe(false)

      const sessionRes = await handlers.GET(
        new Request("http://127.0.0.1:3000/api/auth/session", {
          headers: { cookie: `authjs.session-token=${validToken}` },
        }),
      )
      expect(await sessionRes.json()).toMatchObject({ user: { email: "victim@pilot.invalid" } })
    }
  })

  it("POST /api/auth/session (update) em voo durante signout e cookies fragmentados (.0/.1) são limpos integralmente", async () => {
    const fence = new SignoutTokenFence()
    const gate = deferred<void>()
    const chunkedCookieHeader = "authjs.session-token.0=chunk-a; authjs.session-token.1=chunk-b"

    const handlers = createAuthRouteHandlers(
      {
        async GET() {
          return makeAuthenticatedSessionResponse("authjs.session-token", "unused", "op@pilot.invalid")
        },
        async POST(req) {
          if (new URL(req.url).pathname.endsWith("/session")) {
            await gate.promise
            return makeAuthenticatedSessionResponse("authjs.session-token.0", "reissued-chunk", "op@pilot.invalid")
          }
          return makeSignoutClearedResponse("authjs.session-token.0")
        },
      },
      fence,
    )

    const inFlightUpdate = handlers.POST(
      new Request("http://127.0.0.1:3000/api/auth/session", {
        method: "POST",
        headers: { cookie: chunkedCookieHeader },
      }),
    )

    await handlers.POST(
      new Request("http://127.0.0.1:3000/api/auth/signout", {
        method: "POST",
        headers: { cookie: chunkedCookieHeader },
      }),
    )

    gate.resolve()
    const lateUpdateRes = await inFlightUpdate
    expect(await lateUpdateRes.json()).toBeNull()
    const clearHeaders = getSetCookieHeaders(lateUpdateRes.headers)
    expect(clearHeaders.some((c) => c.startsWith("authjs.session-token.0=;") && c.includes("Max-Age=0"))).toBe(true)
    expect(clearHeaders.some((c) => c.startsWith("authjs.session-token.1=;") && c.includes("Max-Age=0"))).toBe(true)
  })

  it("stripRestoringSessionCookies remove apenas Set-Cookie que restaura sessão e preserva demais cookies/headers", () => {
    const headers = new Headers({ "x-omni-pathname": "/dashboard" })
    headers.append("set-cookie", "assistec-active-store=loja-a; Path=/; SameSite=Lax")
    headers.append("set-cookie", "authjs.session-token=stale-reissued-jwt; Path=/; Max-Age=2592000; HttpOnly")
    headers.append("set-cookie", "authjs.csrf-token=csrf-123; Path=/; HttpOnly")

    const stripped = stripRestoringSessionCookies(new Response("ok", { status: 200, headers }))
    const remaining = getSetCookieHeaders(stripped.headers)

    expect(stripped.headers.get("x-omni-pathname")).toBe("/dashboard")
    expect(remaining).toEqual([
      "assistec-active-store=loja-a; Path=/; SameSite=Lax",
      "authjs.csrf-token=csrf-123; Path=/; HttpOnly",
    ])
  })

  it("compatível com revogação server-side desligada (padrão) e ligada (AUTH_SESSION_REVOCATION=on)", async () => {
    expect(isSessionRevocationEnabled({})).toBe(false)
    expect(isSessionRevocationEnabled({ AUTH_SESSION_REVOCATION: "on" })).toBe(true)

    const rows = new Map<string, AdminSessionRow>()
    const store: AdminSessionStore = {
      async create({ id, userId, expiresAt }) { rows.set(id, { userId, expiresAt, revokedAt: null }) },
      async ensure({ id, userId, expiresAt }) { if (!rows.has(id)) rows.set(id, { userId, expiresAt, revokedAt: null }) },
      async find(id) { return rows.get(id) ?? null },
      async extend(id, expiresAt) { const r = rows.get(id); if (r && !r.revokedAt) rows.set(id, { ...r, expiresAt }) },
      async revoke(id) { const r = rows.get(id); if (r && !r.revokedAt) rows.set(id, { ...r, revokedAt: new Date() }) },
      async purgeExpired() {},
    }

    const created = await resolveAdminSession(store, { sid: undefined, userId: "u1", isSignIn: true })
    if (!created.ok) throw new Error("expected valid session")
    await store.revoke(created.sid, "logout")
    expect(await resolveAdminSession(store, { sid: created.sid, userId: "u1", isSignIn: false })).toEqual({
      ok: false,
      reason: "revoked",
    })
  })

  it("cerca respeita limite máximo de entradas e expiração por TTL sem vazar memória", () => {
    const fence = new SignoutTokenFence({ maxEntries: 2, ttlMs: 1000 })
    fence.markSignedOut(["t1"], 100)
    fence.markSignedOut(["t2"], 200)
    fence.markSignedOut(["t3"], 300)
    expect(fence.size()).toBe(2)
    expect(fence.isSignedOut(["t1"], 350)).toBe(false)
    expect(fence.isSignedOut(["t2"], 350)).toBe(true)
    expect(fence.isSignedOut(["t3"], 350)).toBe(true)
    expect(fence.isSignedOut(["t2"], 1300)).toBe(false)
  })
})
