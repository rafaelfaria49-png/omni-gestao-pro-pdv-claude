import { describe, expect, it } from "vitest"
import {
  SignoutTokenFence,
  createAuthRouteHandlers,
  extractAuthSessionTokens,
  getSetCookieHeaders,
  isClearingSetCookieHeader,
  isSessionCookieSetHeader,
  stripSessionCookies,
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

function makeUnauthenticatedCleaningResponse(cookieName: string): Response {
  const headers = new Headers({ "Content-Type": "application/json" })
  headers.append("set-cookie", `${cookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`)
  return new Response("null", { status: 200, headers })
}

function makeSignoutClearedResponse(cookieName: string): Response {
  const headers = new Headers({ "Content-Type": "application/json" })
  headers.append("set-cookie", `${cookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`)
  return new Response(JSON.stringify({ url: "http://127.0.0.1:3000/login" }), { status: 200, headers })
}

function makeCookieJar(initial: Record<string, string> = {}) {
  const cookies = new Map<string, string>(Object.entries(initial))
  return {
    header(): string {
      return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ")
    },
    apply(res: Response): void {
      for (const sc of getSetCookieHeaders(res.headers)) {
        const pair = (sc.split(";")[0] ?? "").trim()
        const eq = pair.indexOf("=")
        if (eq <= 0) continue
        const name = pair.slice(0, eq).trim()
        const value = pair.slice(eq + 1).trim()
        if (isClearingSetCookieHeader(sc)) {
          cookies.delete(name)
        } else {
          cookies.set(name, value)
        }
      }
    },
    get(name: string): string | undefined {
      return cookies.get(name)
    },
    sessionCookieNames(): string[] {
      return [...cookies.keys()].filter((k) => /^(?:__Secure-)?authjs\.session-token(?:\.\d+)?$/i.test(k))
    },
  }
}

describe("signout-race-guard — extração e proteção stateless + cerca pós-CSRF (Cenários A–J)", () => {
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
    expect(extractAuthSessionTokens("__Host-authjs.session-token=host-tok")).toEqual([
      { cookieName: "__Host-authjs.session-token", cookieNames: ["__Host-authjs.session-token"], token: "host-tok" },
    ])
    expect(extractAuthSessionTokens(null)).toEqual([])
  })

  it("CENÁRIO A + C (cross-instance / cold start): GET /api/auth/session na instância A + POST /api/auth/signout na instância B nunca restaura o cookie", async () => {
    const instanceAFence = new SignoutTokenFence()
    const instanceBFence = new SignoutTokenFence()
    const gateA = deferred<void>()
    const jar = makeCookieJar({ "authjs.session-token": "jwt-v1-before-logout" })

    const instanceA = createAuthRouteHandlers(
      {
        async GET() {
          await gateA.promise
          return makeAuthenticatedSessionResponse("authjs.session-token", "jwt-v2-renewed-on-A", "admin@pilot.invalid")
        },
        async POST() {
          return makeSignoutClearedResponse("authjs.session-token")
        },
      },
      instanceAFence,
    )

    const instanceB = createAuthRouteHandlers(
      {
        async GET() {
          return makeUnauthenticatedCleaningResponse("authjs.session-token")
        },
        async POST() {
          return makeSignoutClearedResponse("authjs.session-token")
        },
      },
      instanceBFence,
    )

    // 1. Sessão iniciada na instância A antes do logout.
    const inFlightOnA = instanceA.GET(
      new Request("http://127.0.0.1:3000/api/auth/session", { headers: { cookie: jar.header() } }),
    )

    // 2. Logout concluído na instância B (cerca isolada, zero memória compartilhada com A).
    const signoutOnB = await instanceB.POST(
      new Request("http://127.0.0.1:3000/api/auth/signout", { method: "POST", headers: { cookie: jar.header() } }),
    )
    jar.apply(signoutOnB)
    expect(jar.sessionCookieNames()).toEqual([])

    // 3. Resposta atrasada da instância A chega ao navegador após o logout.
    gateA.resolve()
    const lateOnA = await inFlightOnA
    jar.apply(lateOnA)

    // Nenhum Set-Cookie de sessão foi emitido pela instância A → cookie permanece limpo e sem cache!
    expect(getSetCookieHeaders(lateOnA.headers).some(isSessionCookieSetHeader)).toBe(false)
    expect(lateOnA.headers.get("cache-control")).toBe("private, no-store")
    expect(jar.sessionCookieNames()).toEqual([])
  })

  it("CENÁRIO B + E (proxy isolado / JWT renovado chegando depois): stripSessionCookies impede restauração preservando demais cookies", () => {
    const jar = makeCookieJar({ "authjs.session-token": "jwt-v1" })
    const signoutRes = makeSignoutClearedResponse("authjs.session-token")
    jar.apply(signoutRes)
    expect(jar.sessionCookieNames()).toEqual([])

    // Simula resposta atrasada do proxy (função isolada) que havia renovado o JWT antes do logout.
    const rawProxyHeaders = new Headers({ "x-omni-pathname": "/dashboard" })
    rawProxyHeaders.append("set-cookie", "assistec-active-store=loja-a; Path=/; SameSite=Lax")
    rawProxyHeaders.append("set-cookie", "authjs.session-token=jwt-renewed-in-proxy; Path=/; Max-Age=2592000; HttpOnly")
    rawProxyHeaders.append("set-cookie", "__Secure-authjs.session-token.0=chunk0; Path=/; Max-Age=2592000; HttpOnly; Secure")
    rawProxyHeaders.append("set-cookie", "authjs.csrf-token=csrf-123; Path=/; HttpOnly")

    const proxyRes = stripSessionCookies(new Response("ok", { status: 200, headers: rawProxyHeaders }))
    jar.apply(proxyRes)

    expect(proxyRes.headers.get("x-omni-pathname")).toBe("/dashboard")
    expect(jar.sessionCookieNames()).toEqual([])
    expect(jar.get("assistec-active-store")).toBe("loja-a")
    expect(jar.get("authjs.csrf-token")).toBe("csrf-123")
  })

  it("CENÁRIO F + J (logout → novo login legítimo com resposta antiga em voo): resposta atrasada NÃO apaga nem sobrescreve o cookie do novo login", async () => {
    const fence = new SignoutTokenFence()
    const gateOld = deferred<void>()
    const tokenOpA = "jwt-operator-a-old"
    const tokenOpB = "jwt-operator-b-new-login"
    const jar = makeCookieJar({ "authjs.session-token": tokenOpA })

    const handlers = createAuthRouteHandlers(
      {
        async GET(req) {
          const cookie = req.headers.get("cookie") ?? ""
          if (cookie.includes(tokenOpA)) {
            await gateOld.promise
            // Mesmo que Auth.js retornasse limpeza (Max-Age=0) para o token antigo revogado/encerrado:
            return makeUnauthenticatedCleaningResponse("authjs.session-token")
          }
          return makeAuthenticatedSessionResponse("authjs.session-token", "jwt-op-b-renewed", "caixa-b@pilot.invalid")
        },
        async POST() {
          return makeSignoutClearedResponse("authjs.session-token")
        },
      },
      fence,
    )

    // 1. Consulta antiga do Operador A começa antes do logout.
    const oldReqHeader = jar.header()
    const oldInFlight = handlers.GET(
      new Request("http://127.0.0.1:3000/api/auth/session", { headers: { cookie: oldReqHeader } }),
    )

    // 2. Operador A faz logout → cookie limpo.
    const signoutRes = await handlers.POST(
      new Request("http://127.0.0.1:3000/api/auth/signout", { method: "POST", headers: { cookie: jar.header() } }),
    )
    jar.apply(signoutRes)
    expect(jar.sessionCookieNames()).toEqual([])

    // 3. Operador B faz novo login legítimo imediatamente no mesmo navegador.
    const loginRes = makeAuthenticatedSessionResponse("authjs.session-token", tokenOpB, "caixa-b@pilot.invalid")
    jar.apply(loginRes)
    expect(jar.get("authjs.session-token")).toBe(tokenOpB)

    // 4. Resposta atrasada do Operador A chega AGORA ao navegador.
    gateOld.resolve()
    const lateOldRes = await oldInFlight
    expect(await lateOldRes.json()).toBeNull()
    expect(getSetCookieHeaders(lateOldRes.headers).some(isSessionCookieSetHeader)).toBe(false)
    jar.apply(lateOldRes)

    // Cookie do novo login do Operador B permanece 100% intacto!
    expect(jar.get("authjs.session-token")).toBe(tokenOpB)

    // Consulta subsequente do Operador B autentica normalmente.
    const sessionB = await handlers.GET(
      new Request("http://127.0.0.1:3000/api/auth/session", { headers: { cookie: jar.header() } }),
    )
    expect(await sessionB.json()).toMatchObject({ user: { email: "caixa-b@pilot.invalid" } })
  })

  it("CENÁRIO G (CSRF forjado concorrente): POST /api/auth/signout rejeitado por CSRF NÃO derruba GET /api/auth/session legítimo em voo", async () => {
    const validToken = "jwt-victim-active-session"
    const rejectionShapes = [
      new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1:3000/api/auth/error?error=MissingCSRF" },
      }),
      new Response(JSON.stringify({ url: "http://127.0.0.1:3000/api/auth/error?error=MissingCSRF" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ]

    for (const rejection of rejectionShapes) {
      const fence = new SignoutTokenFence()
      const csrfGate = deferred<void>()
      const handlers = createAuthRouteHandlers(
        {
          async GET() {
            return makeAuthenticatedSessionResponse("authjs.session-token", validToken, "victim@pilot.invalid")
          },
          async POST() {
            await csrfGate.promise
            return rejection
          },
        },
        fence,
      )

      // 1. POST forjado sem CSRF entra em execução (pendente).
      const forgedSignout = handlers.POST(
        new Request("http://127.0.0.1:3000/api/auth/signout", {
          method: "POST",
          headers: { cookie: `authjs.session-token=${validToken}` },
        }),
      )

      // 2. Enquanto o POST forjado ainda está rodando, a vítima consulta sua sessão legítima.
      const victimSessionDuring = await handlers.GET(
        new Request("http://127.0.0.1:3000/api/auth/session", {
          headers: { cookie: `authjs.session-token=${validToken}` },
        }),
      )
      expect(await victimSessionDuring.json()).toMatchObject({ user: { email: "victim@pilot.invalid" } })
      expect(getSetCookieHeaders(victimSessionDuring.headers).some(isSessionCookieSetHeader)).toBe(false)

      // 3. POST forjado conclui rejeitado por CSRF → cerca nunca foi marcada.
      csrfGate.resolve()
      await forgedSignout
      expect(fence.isSignedOut([validToken])).toBe(false)

      const victimSessionAfter = await handlers.GET(
        new Request("http://127.0.0.1:3000/api/auth/session", {
          headers: { cookie: `authjs.session-token=${validToken}` },
        }),
      )
      expect(await victimSessionAfter.json()).toMatchObject({ user: { email: "victim@pilot.invalid" } })
    }
  })

  it("CENÁRIO H (dois POSTs de signout concorrentes: 1 válido + 1 rejeitado por CSRF): tentativa rejeitada NÃO desfaz proteção do logout válido", async () => {
    const fence = new SignoutTokenFence()
    const token = "jwt-concurrent-signout-token"
    const invalidGate = deferred<void>()
    let call = 0

    const handlers = createAuthRouteHandlers(
      {
        async GET() {
          return makeAuthenticatedSessionResponse("authjs.session-token", "jwt-reissued", "op@pilot.invalid")
        },
        async POST() {
          call++
          if (call === 1) {
            // 1º POST: legítimo, conclui e limpa cookie.
            return makeSignoutClearedResponse("authjs.session-token")
          }
          // 2º POST: inválido (CSRF rejeitado) termina depois do 1º.
          await invalidGate.promise
          return new Response(JSON.stringify({ url: "http://127.0.0.1:3000/api/auth/error?error=MissingCSRF" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        },
      },
      fence,
    )

    const validPost = await handlers.POST(
      new Request("http://127.0.0.1:3000/api/auth/signout", {
        method: "POST",
        headers: { cookie: `authjs.session-token=${token}` },
      }),
    )
    expect(validPost.status).toBe(200)
    expect(fence.isSignedOut([token])).toBe(true)

    const invalidPostPromise = handlers.POST(
      new Request("http://127.0.0.1:3000/api/auth/signout", {
        method: "POST",
        headers: { cookie: `authjs.session-token=${token}` },
      }),
    )
    invalidGate.resolve()
    await invalidPostPromise

    // A tentativa rejeitada NÃO desfez a cerca do logout válido!
    expect(fence.isSignedOut([token])).toBe(true)
    const afterSession = await handlers.GET(
      new Request("http://127.0.0.1:3000/api/auth/session", {
        headers: { cookie: `authjs.session-token=${token}` },
      }),
    )
    expect(await afterSession.json()).toBeNull()
  })

  it("múltiplas requisições simultâneas GET e POST /api/auth/session em 30 rodadas consecutivas nunca restauram sessão encerrada", async () => {
    for (let round = 0; round < 30; round++) {
      const fence = new SignoutTokenFence()
      const gates = Array.from({ length: 6 }, () => deferred<void>())
      let reqIndex = 0
      const token = `jwt-round-${round}-active`
      const jar = makeCookieJar({ "__Secure-authjs.session-token": token })

      const handlers = createAuthRouteHandlers(
        {
          async GET() {
            const idx = reqIndex++
            await gates[idx]?.promise
            return makeAuthenticatedSessionResponse("__Secure-authjs.session-token", `jwt-fresh-${round}-${idx}`, "op@pilot.invalid")
          },
          async POST(req) {
            if (new URL(req.url).pathname.endsWith("/session")) {
              const idx = reqIndex++
              await gates[idx]?.promise
              return makeAuthenticatedSessionResponse("__Secure-authjs.session-token", `jwt-upd-${round}-${idx}`, "op@pilot.invalid")
            }
            return makeSignoutClearedResponse("__Secure-authjs.session-token")
          },
        },
        fence,
      )

      const reqCookie = jar.header()
      const concurrent = gates.map((_, i) =>
        i % 2 === 0
          ? handlers.GET(new Request("https://app.pilot.invalid/api/auth/session", { headers: { cookie: reqCookie } }))
          : handlers.POST(new Request("https://app.pilot.invalid/api/auth/session", { method: "POST", headers: { cookie: reqCookie } })),
      )

      const signoutRes = await handlers.POST(
        new Request("https://app.pilot.invalid/api/auth/signout", { method: "POST", headers: { cookie: reqCookie } }),
      )
      jar.apply(signoutRes)
      expect(jar.sessionCookieNames()).toEqual([])

      for (const g of gates.reverse()) g.resolve()
      const responses = await Promise.all(concurrent)

      for (const res of responses) {
        expect(await res.json()).toBeNull()
        expect(getSetCookieHeaders(res.headers).some(isSessionCookieSetHeader)).toBe(false)
        jar.apply(res)
      }
      expect(jar.sessionCookieNames()).toEqual([])
    }
  })

  it("CENÁRIO D + I: compatível com AUTH_SESSION_REVOCATION=off/on e cerca respeita limite/TTL enquanto não-restauração do cookie é stateless", async () => {
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

    // Mesmo após evicção ou expiração de TTL na cerca local, GET /api/auth/session continua sem Set-Cookie.
    const fence = new SignoutTokenFence({ maxEntries: 2, ttlMs: 1000 })
    fence.markSignedOut(["t1"], 100)
    fence.markSignedOut(["t2"], 200)
    fence.markSignedOut(["t3"], 300)
    expect(fence.size()).toBe(2)
    expect(fence.isSignedOut(["t1"], 350)).toBe(false)
    expect(fence.isSignedOut(["t2"], 350)).toBe(true)
    expect(fence.isSignedOut(["t2"], 1300)).toBe(false)

    const handlers = createAuthRouteHandlers(
      {
        async GET() {
          return makeAuthenticatedSessionResponse("authjs.session-token", "reissued-after-ttl", "u1@pilot.invalid")
        },
        async POST() {
          return makeSignoutClearedResponse("authjs.session-token")
        },
      },
      fence,
    )
    const afterEviction = await handlers.GET(
      new Request("http://127.0.0.1:3000/api/auth/session", { headers: { cookie: "authjs.session-token=t1" } }),
    )
    expect(getSetCookieHeaders(afterEviction.headers).some(isSessionCookieSetHeader)).toBe(false)
  })
})
