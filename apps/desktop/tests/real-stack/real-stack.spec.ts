/**
 * OmniGestão Desktop × stack REAL local (NextAuth real, next start com SW, PostgreSQL descartável).
 * Disparado só por tests/real-stack/run.mjs. Senhas chegam pelo ambiente, nunca são impressas.
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const ORIGIN = process.env.DESKTOP_QA_ORIGIN!
const PASS_A = process.env.QA_PASSWORD_ADMIN_A!
const PASS_B = process.env.QA_PASSWORD_OPERADOR_B!
if (!ORIGIN?.startsWith("http://localhost:") || !PASS_A || !PASS_B) throw new Error("DESKTOP_QA_RUNNER_REQUIRED")

const root = path.resolve(__dirname, "..", "..")
const out = path.join(root, "test-results", "real-stack")
mkdirSync(out, { recursive: true })
const PARTITION = "persist:omnigestao-development"
// Qualquer um destes textos visível/armazenado para B = vazamento de A.
const MARK_A = ["QA-A-7731", "privado-a@desktop-qa.invalid", "11988887731", "QA_ADMIN_A", "qa_admin_a@desktop-qa.invalid", "Produto QA-A"]
const evidence: Record<string, unknown> = {}
const note = (k: string, v: unknown) => {
  evidence[k] = v
  writeFileSync(path.join(out, "evidence.json"), JSON.stringify(evidence, null, 2))
}

let userData: string
let app: ElectronApplication

async function launch() {
  const a = await electron.launch({ args: ["."], cwd: root, env: { ...process.env, OMNI_DESKTOP_TEST_USER_DATA: userData } })
  return a
}
async function appPage(a: ElectronApplication): Promise<Page> {
  for (let i = 0; i < 200; i++) {
    const p = a.windows().find((w) => w.url().startsWith(ORIGIN))
    if (p) return p
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error("página do app não abriu")
}
async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(out, `${name}.png`) }).catch(() => {})
}
async function sessionCookies(a: ElectronApplication) {
  return a.evaluate(async ({ session }, [partition, origin]) => {
    const all = await session.fromPartition(partition).cookies.get({ url: origin })
    return all.map((c) => ({ name: c.name, value: c.value }))
  }, [PARTITION, ORIGIN] as const)
}
async function serverSession(page: Page) {
  return page.evaluate(async () => {
    const r = await fetch(`/api/auth/session?nocache=${Date.now()}`, { cache: "no-store", credentials: "include" })
    const j = (await r.json().catch(() => null)) as { user?: { email?: string } } | null
    return j?.user?.email ?? null
  })
}
/** Tudo que fica no computador e a página consegue ler: Cache Storage, localStorage, IndexedDB, SW. */
async function localFootprint(page: Page, marks: string[]) {
  return page.evaluate(async (needles) => {
    const hits: string[] = []
    const entries: string[] = []
    const staticNonAsset: string[] = [] // informativo: só é vazamento se contiver dado de A (ver hits)
    const scan = (where: string, text: string) => {
      for (const n of needles) if (text.includes(n)) hits.push(`${where} contém ${n}`)
    }
    const cacheNames = "caches" in self ? await caches.keys() : []
    for (const name of cacheNames) {
      const c = await caches.open(name)
      for (const req of await c.keys()) {
        const res = await c.match(req)
        const body = res ? await res.clone().text().catch(() => "") : ""
        scan(`cache:${name}:${new URL(req.url).pathname}`, body)
        entries.push(`${name}:${new URL(req.url).pathname}`)
        const ct = res?.headers.get("content-type") ?? ""
        if (/^static-|^next-static|^next-image|^google-fonts/.test(name) && /html|json|x-component/i.test(ct)) staticNonAsset.push(`cache estático com ${ct.split(";")[0]} em ${name}:${new URL(req.url).pathname}`)
      }
    }
    const lsKeys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!
      lsKeys.push(k)
      scan(`localStorage:${k}`, localStorage.getItem(k) ?? "")
    }
    const idbNames = (await (indexedDB as unknown as { databases?: () => Promise<{ name?: string }[]> }).databases?.()) ?? []
    for (const { name } of idbNames) {
      if (!name) continue
      await new Promise<void>((resolve) => {
        const open = indexedDB.open(name)
        open.onerror = () => resolve()
        open.onsuccess = () => {
          const dbx = open.result
          const stores = Array.from(dbx.objectStoreNames)
          if (stores.length === 0) return resolve()
          const tx = dbx.transaction(stores, "readonly")
          let left = stores.length
          for (const s of stores) {
            const req = tx.objectStore(s).getAll()
            req.onsuccess = () => {
              scan(`indexedDB:${name}/${s}`, JSON.stringify(req.result ?? []))
              if (--left === 0) resolve()
            }
            req.onerror = () => {
              if (--left === 0) resolve()
            }
          }
        }
      })
    }
    const sw = "serviceWorker" in navigator ? (await navigator.serviceWorker.getRegistrations()).map((r) => r.active?.scriptURL ?? "") : []
    const pendingKeys = lsKeys.filter((k) => /ops|pend|venda|sale/i.test(k))
    return { cacheNames, lsKeys, idbNames: idbNames.map((d) => d.name), sw, hits, pendingKeys, staticNonAsset, dataEntries: entries.filter((e) => !/^(workbox-precache|static-)/.test(e)) }
  }, marks)
}

async function loginUI(page: Page, email: string, password: string) {
  await page.waitForURL(/\/login/, { timeout: 60_000 })
  await page.locator("#email").fill(email)
  await page.locator("#password").fill(password)
  await page.getByRole("button", { name: "Entrar" }).click()
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 })
}

async function dismissWelcome(page: Page) {
  await page.addLocatorHandler(page.getByRole("dialog", { name: /Boas-vindas/i }), async (d) => {
    await d.getByRole("button", { name: /Voltar depois/i }).click()
  })
}

/** Logout real da interface (mesmo caminho do E2E oficial do piloto). */
async function logoutUI(page: Page) {
  await gotoAndSettle(page, "/dashboard/configuracoes?sec=seguranca")
  await page.getByRole("button", { name: "Encerrar sessão", exact: true }).click()
  await page.waitForURL(/\/login/, { timeout: 60_000 })
  await page.waitForTimeout(1500)
}
async function pageText(page: Page) {
  return page.evaluate(() => document.body.innerText)
}
async function gotoAndSettle(page: Page, p: string) {
  await page.goto(ORIGIN + p, { timeout: 120_000 })
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {})
  await page.waitForTimeout(800)
}
async function activeStoreCookie(a: ElectronApplication) {
  return (await sessionCookies(a)).find((c) => c.name === "assistec-active-store")?.value ?? null
}
/** Abre o PDV da loja ativa e garante caixa aberto pela tela (roteiro do E2E oficial). */
async function pdvComCaixaAberto(page: Page) {
  await gotoAndSettle(page, "/dashboard/vendas")
  const usar = page.getByRole("button", { name: "Usar" }).first()
  const semTerminal = page.getByText("Continuar sem terminal")
  const abrir = page.getByRole("button", { name: "Abrir Caixa" }).first()
  const resumo = page.getByRole("button", { name: "Resumo do Caixa" })
  await usar.or(semTerminal).or(abrir).or(resumo).first().waitFor({ timeout: 45_000 })
  if (await usar.isVisible()) await usar.click()
  else if (await semTerminal.isVisible()) await semTerminal.click()
  await abrir.or(resumo).first().waitFor({ timeout: 45_000 })
  if (await abrir.isVisible()) {
    await abrir.click()
    const abertura = page.getByRole("dialog", { name: "Abertura de Caixa" })
    await abertura.getByRole("button", { name: "R$ 50" }).click()
    await abertura.getByRole("button", { name: "Abrir Caixa" }).click()
    await expect(abertura).toBeHidden()
  }
  await expect(resumo).toBeVisible()
}
/** Teclado pelo caminho real do Electron (passa por before-input-event, como o teclado físico). */
async function sendKeys(a: ElectronApplication, keys: Array<[string, string[]]>) {
  await a.evaluate(({ BrowserWindow }, list) => {
    const wc = BrowserWindow.getAllWindows().find((w) => !w.getParentWindow())!.webContents
    for (const [keyCode, modifiers] of list) {
      const mods = modifiers as Array<"control" | "shift" | "alt">
      wc.sendInputEvent({ type: "keyDown", keyCode, modifiers: mods })
      if (keyCode.length === 1 && mods.length === 0) wc.sendInputEvent({ type: "char", keyCode, modifiers: mods })
      wc.sendInputEvent({ type: "keyUp", keyCode, modifiers: mods })
    }
  }, keys)
}
async function step<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await test.step(name, fn)
  } catch (e) {
    note(`ERRO ${name}`, String(e).split("\n")[0].slice(0, 300))
    return undefined
  }
}

test.beforeAll(() => {
  userData = mkdtempSync(path.join(os.tmpdir(), "omni-desktop-realqa-"))
})
test.afterAll(async () => {
  await app?.close().catch(() => {})
  try {
    const log = readFileSync(path.join(userData, "logs", "desktop.log"), "utf8")
    note("desktop.log", log.split(/\r?\n/).filter((l: string) => /privacy|logout-guard|status|first-load|ipc|blocked/.test(l)))
  } catch {
    /* sem log */
  }
  rmSync(userData, { recursive: true, force: true })
})

test("QA real: A (multiloja) → logout → B no mesmo computador, sem vazamento", async () => {
  app = await launch()
  let page = await appPage(app)
  await dismissWelcome(page)
  const t0 = Date.now()

  // Etapas obrigatórias (falham o teste): login, logout, isolamento A→B.
  await test.step("login real QA_ADMIN_A", async () => {
    await loginUI(page, "qa_admin_a@desktop-qa.invalid", PASS_A)
    note("A.loginMs", Date.now() - t0)
    expect(await serverSession(page)).toBe("qa_admin_a@desktop-qa.invalid")
    await shot(page, "A-01-painel")
  })

  await test.step("cadastros, relatórios e histórico da loja A", async () => {
    await gotoAndSettle(page, "/dashboard/cadastros-v2")
    await page.getByRole("button", { name: "Clientes", exact: true }).or(page.getByRole("tab", { name: "Clientes", exact: true })).first().click().catch(() => {})
    await page.waitForTimeout(2000)
    const viuA = (await pageText(page)).includes("QA-A-7731")
    note("A.cadastrosMostraClienteA", viuA)
    expect(viuA).toBe(true) // controle positivo: A precisa ter visto o próprio dado privado
    await shot(page, "A-02-cadastros")
    await gotoAndSettle(page, "/dashboard/relatorios")
    await shot(page, "A-03-relatorios")
    await gotoAndSettle(page, "/dashboard/caixa/historico")
    await shot(page, "A-04-historico-caixa")
  })

  await step("PDV Clássico na loja A: caixa, atalhos e leitor", async () => {
    await pdvComCaixaAberto(page)
    await shot(page, "A-05-pdv-classico")
    const marker = await page.evaluate(() => ((window as unknown as { __qaMarker: number }).__qaMarker = Math.random()))
    await sendKeys(app, [["F1", []], ["Escape", []], ["F2", []], ["Escape", []], ["F3", []], ["Escape", []], ["F5", []], ["Escape", []], ["F6", []], ["Escape", []], ["F8", []], ["Escape", []], ["F12", []], ["Escape", []], ["L", ["control"]], ["Escape", []]])
    await page.waitForTimeout(1000)
    note("A.pdvSobreviveuAtalhos", (await page.evaluate(() => (window as unknown as { __qaMarker?: number }).__qaMarker)) === marker)
    note("A.pdvUrlAposAtalhos", page.url().replace(ORIGIN, ""))
    await shot(page, "A-06-pdv-apos-atalhos")
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLInputElement | null
      return el ? `${el.tagName}:${el.getAttribute("placeholder") ?? el.getAttribute("aria-label") ?? ""}` : null
    })
    note("A.pdvFocoInicial", focused)
    await gotoAndSettle(page, "/dashboard/vendas")
    await page.getByPlaceholder("Bipe ou digite o código do produto").click({ timeout: 60_000 })
    await sendKeys(app, [..."7890000000017".split("").map((d) => [d, []] as [string, string[]]), ["Enter", []]])
    await page.waitForTimeout(2000)
    note("A.leitorAdicionouProduto", /Película/i.test(await pageText(page)))
    await shot(page, "A-07-pdv-leitor")
    // F1 abre o pagamento (sem finalizar: o cupom abriria o diálogo nativo de impressão).
    await sendKeys(app, [["F1", []]])
    await page.waitForTimeout(1500)
    note("A.f1AbriuPagamento", (await page.getByRole("dialog").count()) > 0)
    await shot(page, "A-07b-pdv-pagamento-f1")
    await sendKeys(app, [["Escape", []]])
  })

  await step("Unidades: STORE não tem seletor na interface (lacuna web, igual ao navegador)", async () => {
    await gotoAndSettle(page, "/dashboard/unidades")
    note("A.unidadesNaoAutorizado", (await pageText(page)).includes("Acesso não autorizado"))
    await shot(page, "A-08-unidades")
  })

  await step("troca de loja A → B → A pela preferência persistida (mesmo mecanismo do E2E oficial)", async () => {
    const trocar = async (id: string) => {
      await page.evaluate((v) => localStorage.setItem("assistec-pro-loja-ativa-v1", v), id)
      await app.evaluate(async ({ session }, [partition, origin, v]) => {
        await session.fromPartition(partition).cookies.set({ url: origin, name: "assistec-active-store", value: v, path: "/" })
      }, [PARTITION, ORIGIN, id] as const)
      await gotoAndSettle(page, "/dashboard")
    }
    await trocar("qa-loja-b")
    note("A.painelMostraLojaB", (await pageText(page)).includes("QA_LOJA_B"))
    await shot(page, "A-09-painel-loja-b")
    await gotoAndSettle(page, "/dashboard/cadastros-v2")
    await page.getByRole("button", { name: "Clientes", exact: true }).or(page.getByRole("tab", { name: "Clientes", exact: true })).first().click().catch(() => {})
    await page.waitForTimeout(2000)
    const txt = await pageText(page)
    note("A.naLojaB.mostraClienteB", txt.includes("QA-B-4410"))
    note("A.naLojaB.mostraClienteA", txt.includes("QA-A-7731"))
    await shot(page, "A-10-cadastros-loja-b")
    await trocar("qa-loja-a")
    note("A.painelVoltouLojaA", (await pageText(page)).includes("QA_LOJA_A"))
  })

  const tokenA = (await sessionCookies(app)).find((c) => c.name === "authjs.session-token")?.value ?? ""
  const fpAntes = await localFootprint(page, MARK_A)
  note("A.footprintAntesLogout", fpAntes)
  // Controle positivo: sem dado de A guardado antes do logout, o "zero depois" não provaria nada.
  expect(fpAntes.hits.length).toBeGreaterThan(0)

  await test.step("logout real pela tela (Configurações → Segurança)", async () => {
    await logoutUI(page)
    const names = (await sessionCookies(app)).map((c) => c.name)
    note("logout.cookies", names)
    expect(names).not.toContain("authjs.session-token")
    expect(await serverSession(page)).toBeNull()
    const fpLogout = await localFootprint(page, MARK_A)
    note("logout.footprint", fpLogout)
    expect(fpLogout.hits).toEqual([])
    // O JWT de A, reapresentado de fora do app, ainda vale no servidor? (revogação é do servidor)
    const replay = await fetch(ORIGIN + "/api/auth/session", { headers: { cookie: "authjs.session-token=" + tokenA } })
    const replayUser = ((await replay.json().catch(() => null)) as { user?: { email?: string } } | null)?.user?.email ?? null
    note("logout.tokenAntigoAindaValidoNoServidor", replayUser === "qa_admin_a@desktop-qa.invalid")
    await shot(page, "B-00-login-apos-logout")
  })

  // Registra toda requisição feita enquanto B estiver logado que carregue a loja A.
  await app.evaluate(({ session }, partition) => {
    const g = globalThis as unknown as { __reqLojaA: string[] }
    g.__reqLojaA = []
    session.fromPartition(partition).webRequest.onSendHeaders((d) => {
      const h = Object.entries(d.requestHeaders).map(([k, v]) => k + ":" + v).join("\n")
      if (d.url.includes("qa-loja-a") || /x-assistec-loja-id:\s*qa-loja-a/i.test(h)) {
        g.__reqLojaA.push(d.method + " " + d.url.replace(/^https?:\/\/[^/]+/, ""))
      }
    })
  }, PARTITION)

  await test.step("login real QA_OPERADOR_B no mesmo computador", async () => {
    await loginUI(page, "qa_operador_b@desktop-qa.invalid", PASS_B)
    expect(await serverSession(page)).toBe("qa_operador_b@desktop-qa.invalid")
    await page.waitForTimeout(3000)
    note("B.lojaAtiva", await activeStoreCookie(app))
    await shot(page, "B-01-painel")
    await gotoAndSettle(page, "/dashboard/cadastros-v2")
    await page.getByRole("button", { name: "Clientes", exact: true }).or(page.getByRole("tab", { name: "Clientes", exact: true })).first().click().catch(() => {})
    await page.waitForTimeout(2000)
    const bViuA = (await pageText(page)).includes("QA-A-7731")
    note("B.cadastrosMostraClienteA", bViuA)
    expect(bViuA).toBe(false)
    await shot(page, "B-02-cadastros")
    const forced = await page.evaluate(async () => {
      const r = await fetch("/api/clientes", { headers: { "x-assistec-loja-id": "qa-loja-a" }, cache: "no-store" })
      return { status: r.status, temA: (await r.text()).includes("QA-A-7731") }
    })
    note("B.apiClientesForcandoLojaA", forced)
    await app.evaluate(() => ((globalThis as unknown as { __reqLojaA: string[] }).__reqLojaA.length = 0)) // a chamada acima foi do teste
    expect(forced.temA).toBe(false)
  })

  await step("Venda Completa na loja B", async () => {
    await pdvComCaixaAberto(page)
    await page.waitForTimeout(2000)
    await shot(page, "B-03-venda-completa")
    note("B.vendaCompletaTexto", (await pageText(page)).replace(/s+/g, " ").slice(0, 400))
    const bViuProdA = (await pageText(page)).includes("Produto QA-A")
    note("B.vendaCompletaMostraProdutoA", bViuProdA)
    expect(bViuProdA).toBe(false)
  })

  await test.step("pegada local depois de B usar o sistema", async () => {
    await gotoAndSettle(page, "/dashboard")
    const fp = await localFootprint(page, MARK_A)
    note("B.footprint", fp)
    const reqs = await app.evaluate(() => (globalThis as unknown as { __reqLojaA: string[] }).__reqLojaA)
    note("B.requisicoesComLojaA", reqs)
    expect(reqs).toEqual([])
    expect(fp.hits).toEqual([])
  })

  await test.step("fechar e reabrir mantém B logado", async () => {
    await app.close()
    app = await launch()
    page = await appPage(app)
    await dismissWelcome(page)
    await page.waitForURL(/\/dashboard|\/login/, { timeout: 60_000 })
    await page.waitForTimeout(2000)
    note("reabrir.url", page.url().replace(ORIGIN, ""))
    await page.waitForTimeout(4000) // passa da janela de 3 s da limpeza de abertura
    const sess = await serverSession(page)
    note("reabrir.sessao", sess)
    expect(sess).toBe("qa_operador_b@desktop-qa.invalid")
    expect((await sessionCookies(app)).map((c) => c.name)).toContain("authjs.session-token")
  })

  await step("sessão expirada leva ao login e limpa a pegada", async () => {
    await gotoAndSettle(page, "/dashboard/relatorios")
    await app.evaluate(async ({ session }, [partition, origin]) => {
      const ses = session.fromPartition(partition)
      for (const c of await ses.cookies.get({ url: origin })) if (c.name.includes("session-token")) await ses.cookies.remove(origin, c.name)
    }, [PARTITION, ORIGIN] as const)
    await gotoAndSettle(page, "/dashboard/caixa/historico")
    note("expirada.url", page.url().replace(ORIGIN, ""))
    note("expirada.footprint", await localFootprint(page, MARK_A))
  })

  await step("abrir o app sem sessão (JWT expirou com o app fechado) limpa os caches de dados", async () => {
    await app.close()
    app = await launch()
    page = await appPage(app)
    await page.waitForURL(/\/login/, { timeout: 60_000 })
    await page.waitForTimeout(5000)
    note("abertura.footprint", await localFootprint(page, MARK_A))
  })
})
