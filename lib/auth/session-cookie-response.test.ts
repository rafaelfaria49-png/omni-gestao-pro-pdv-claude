import { Auth, type AuthConfig } from "@auth/core"
import { encode } from "@auth/core/jwt"
import { describe, expect, it } from "vitest"
import { guardSessionEndpoint, withoutSessionCookieMutation } from "./session-cookie-response"

const secret = "synthetic-only-auth-transport-regression"
const firstOperator = { id: "operator-a", name: "Operador A" }
const nextOperator = { id: "operator-b", name: "Operador B" }

function deferred() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}

/** Emula a aplicação por nome dos Set-Cookie no mesmo domínio, sem expor valores. */
function cookieJar() {
  const cookies = new Map<string, string>()
  return {
    set: (name: string, value: string) => cookies.set(name, value),
    names: () => [...cookies.keys()],
    header: () => [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
    apply(response: Response) {
      for (const cookie of response.headers.getSetCookie()) {
        const [binding] = cookie.split(";")
        const index = binding.indexOf("=")
        const name = binding.slice(0, index)
        const value = binding.slice(index + 1)
        if (!value || /;\s*Max-Age=0(?:;|$)/i.test(cookie)) cookies.delete(name)
        else cookies.set(name, value)
      }
    },
  }
}

describe.each([
  ["http://localhost:3000", "authjs.session-token"],
  ["https://qa.example.invalid", "__Secure-authjs.session-token"],
])("transporte de sessão com Auth.js real em %s", (origin, name) => {
  function fixture(revocation: boolean) {
    const jar = cookieJar()
    const revoked = new Set<string>()
    const request = (action: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers)
      headers.set("cookie", jar.header())
      return new Request(`${origin}/api/auth/${action}`, { ...init, headers })
    }
    function createAuth() {
      const config: AuthConfig = {
        basePath: "/api/auth",
        secret,
        trustHost: true,
        providers: [],
        session: { strategy: "jwt" },
        logger: { error() {} },
        callbacks: {
          jwt({ token }) { return revocation && revoked.has(String(token.sub)) ? null : token },
          session({ session, token }) {
            return { ...session, user: { ...session.user, id: String(token.sub) } }
          },
        },
        events: { signOut(data) { if (revocation && "token" in data) revoked.add(String(data.token?.sub)) } },
      }
      return (request: Request) => Auth(request, config)
    }
    // Instâncias distintas exercitam as duas fronteiras de resposta.
    const logoutAuth = createAuth()
    const readingAuth = createAuth()
    const login = async (operator: typeof firstOperator) => {
      jar.set(name, await encode({ salt: name, secret, token: { sub: operator.id, name: operator.name } }))
    }
    const read = async () => {
      const req = request("session")
      return guardSessionEndpoint(req, await readingAuth(req))
    }
    const post = async (token: string, action = "signout") => {
      const req = request(action, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ csrfToken: token, callbackUrl: `${origin}/login` }),
      })
      return guardSessionEndpoint(req, await logoutAuth(req))
    }
    const csrf = async (): Promise<string> => {
      const response = await logoutAuth(request("csrf"))
      jar.apply(response)
      return (await response.json()).csrfToken
    }
    return { jar, request, readingAuth, read, post, csrf, login, revoked }
  }

  it("reproduz a restauração ao entregar a resposta original do SDK depois do logout", async () => {
    const f = fixture(false)
    await f.login(firstOperator)
    const responseHeld = await f.readingAuth(f.request("session"))
    f.jar.apply(await f.post(await f.csrf()))
    expect((await (await f.read()).json())?.user).toBeUndefined()

    // Controle negativo: transporte antigo deixa o navegador aplicar o Set-Cookie.
    f.jar.apply(responseHeld)
    expect((await (await f.read()).json()).user.id).toBe(firstOperator.id)
  })

  it.each([false, true])("nega reemissão tardia em leituras simultâneas, revogação=%s", async (revocation) => {
    const f = fixture(revocation)
    await f.login(firstOperator)
    const first = f.request("session")
    const second = f.request("session")
    const proxyRead = f.request("session")
    const release = deferred()
    const rawResponses = await Promise.all([
      f.readingAuth(first),
      f.readingAuth(second),
      f.readingAuth(proxyRead),
    ])
    expect(rawResponses.every((r) => r instanceof Response && r.headers.getSetCookie().some((cookie) => cookie.startsWith(name + "=")))).toBe(true)
    const delivery = release.promise.then(() => {
      const [one, two, proxy] = rawResponses
      if (!(proxy instanceof Response)) throw new Error("PROXY_RESPONSE_REQUIRED")
      for (const response of [guardSessionEndpoint(first, one), guardSessionEndpoint(second, two), withoutSessionCookieMutation(proxy)]) {
        f.jar.apply(response)
      }
    })

    const csrfToken = await f.csrf()
    f.jar.apply(await f.post(csrfToken))
    expect(f.jar.names()).not.toContain(name)
    expect((await (await f.read()).json())?.user).toBeUndefined()

    // Uma resposta de limpeza tardia também não pode apagar o próximo login.
    const lateCleanup = new Response(null, { headers: { "set-cookie": `${name}=; Path=/; Max-Age=0` } })
    await f.login(nextOperator)
    f.jar.apply(guardSessionEndpoint(first, lateCleanup))
    release.release()
    await delivery

    const session = await (await f.read()).json()
    expect(session.user.id).toBe(nextOperator.id)
    expect(f.revoked.has(firstOperator.id)).toBe(revocation)
  })

  it("preserva CSRF e deixa uma tentativa rejeitada sem efeito no cookie", async () => {
    const f = fixture(true)
    await f.login(firstOperator)
    await f.csrf()
    f.jar.apply(await f.post("invalid-csrf"))
    expect(f.revoked.size).toBe(0)
    expect((await (await f.read()).json()).user.id).toBe(firstOperator.id)
  })
})

it("filtra a renovação e a limpeza de cookies fragmentados e preserva outros cabeçalhos", async () => {
  const response = new Response("payload", { status: 202, headers: { "x-middleware-next": "1" } })
  response.headers.append("set-cookie", "__Secure-authjs.session-token.0=synthetic; Path=/; Secure; HttpOnly")
  response.headers.append("set-cookie", "__Secure-authjs.session-token.1=; Path=/; Max-Age=0; Secure")
  response.headers.append("set-cookie", "assistec-active-store=qa; Path=/; SameSite=Lax")
  const guarded = guardSessionEndpoint(new Request("https://qa.example.invalid/api/auth/session", { method: "POST" }), response)
  expect(guarded.status).toBe(202)
  expect(guarded.headers.get("x-middleware-next")).toBe("1")
  expect(guarded.headers.get("cache-control")).toBe("private, no-store")
  expect(guarded.headers.getSetCookie().map((cookie) => cookie.split("=")[0])).toEqual(["assistec-active-store"])
  expect(await guarded.text()).toBe("payload")
})
