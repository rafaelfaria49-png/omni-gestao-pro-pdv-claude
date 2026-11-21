/**
 * Servidor-fixture que imita o comportamento do OmniGestão que importa para o desktop
 * (login, dashboard, popup de impressão, download, SW cache). Nenhum dado real.
 */
import http from "node:http"

export const FIXTURE_PORT = 47613
export const FIXTURE_ORIGIN = `http://127.0.0.1:${FIXTURE_PORT}`

const page = (title: string, body: string) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title></head>
<body><h1 id="page">${title}</h1>${body}</body></html>`

const DASHBOARD = page(
  "dashboard",
  `<script>
  window.__keys = []
  window.__marker = Math.random()
  document.addEventListener("keydown", (e) => {
    if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return
    window.__keys.push((e.ctrlKey ? "Ctrl+" : "") + e.key)
    // Igual ao PDV: atalhos de função e Ctrl+L são da página.
    if (/^F\\d+$/.test(e.key) || (e.ctrlKey && e.key.toLowerCase() === "l")) e.preventDefault()
  })
  window.__printPopup = () => {
    const w = window.open("", "_blank")
    if (!w) return "blocked"
    w.document.write("<!doctype html><title>Cupom</title><pre id='cupom'>CUPOM TESTE 80mm</pre>")
    w.document.close()
    return "opened"
  }
  window.__fillCache = async () => {
    const c = await caches.open("apis")
    await c.put("/api/clientes", new Response('{"usuario":"A"}'))
    await (await caches.open("pages-rsc")).put("/dashboard", new Response("rsc do usuario A"))
    await (await caches.open("workbox-precache-v2-http://127.0.0.1/")).put("/_next/static/app.js", new Response("js"))
    // Cache "estático" com um .js de verdade e um .js inexistente respondido com HTML da tela logada.
    const st = await caches.open("static-js-assets")
    await st.put("/_next/static/chunks/real.js", new Response("console.log(1)", { headers: { "content-type": "application/javascript" } }))
    await st.put("/_vercel/insights/script.js", new Response("<html>Usuario A logado</html>", { headers: { "content-type": "text/html; charset=utf-8" } }))
    return (await caches.keys()).length
  }
</script>
<a id="to-login" href="/login">sair</a>
<a id="download" href="/download">baixar</a>`,
)

export function startFixtureServer(): Promise<http.Server> {
  const server = http.createServer((req, res): void => {
    const url = new URL(req.url ?? "/", FIXTURE_ORIGIN)
    if (url.pathname === "/login" && req.method !== "POST") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
      res.end(page("login", `<a id="enter" href="/dashboard" onclick="event.preventDefault(); fetch('/login', { method: 'POST', headers: { 'next-action': 'login' } }).then(() => { location.href = '/dashboard' })">entrar</a>`))
      return
    }
    if (url.pathname === "/dashboard") {
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "set-cookie": ["authjs.session-token=fake-jwt; Path=/; HttpOnly; SameSite=Lax", "pref=keep; Path=/"],
      })
      res.end(DASHBOARD)
      return
    }
    if (url.pathname === "/download") {
      res.writeHead(200, {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="relatorio.csv"',
      })
      res.end("a;b\n1;2\n")
      return
    }
    if (url.pathname === "/api/late") {
      // Resposta "atrasada" do usuário anterior que regrava o cookie (corrida #342).
      res.writeHead(200, { "content-type": "application/json", "set-cookie": "authjs.session-token=stale-A; Path=/; HttpOnly" })
      res.end("{}")
      return
    }
    if (url.pathname === "/_vercel/insights/view" && req.method === "POST") {
      // Vercel Analytics faz POST em toda página, inclusive no /login: não pode desarmar a guarda.
      res.writeHead(200, { "content-type": "application/json" })
      res.end("{}")
      return
    }
    if (url.pathname === "/login" && req.method === "POST") {
      res.writeHead(200, { "content-type": "application/json", "set-cookie": "authjs.session-token=user-B; Path=/; HttpOnly" })
      res.end("{}")
      return
    }
    if (url.pathname === "/boom") {
      res.writeHead(503, { "content-type": "text/html" })
      res.end("indisponível")
      return
    }
    res.writeHead(302, { location: "/login" })
    res.end()
  })
  return new Promise((resolve) => server.listen(FIXTURE_PORT, "127.0.0.1", () => resolve(server)))
}
