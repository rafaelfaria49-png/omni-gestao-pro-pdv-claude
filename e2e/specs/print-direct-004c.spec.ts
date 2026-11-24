/**
 * OMNI-PRINT-004C — PDV Clássico (componente real) → API real de impressão direta → ledger em PostgreSQL descartável
 * → agente real (loop HTTP) → spooler/impressora SIMULADOS. Nada aqui é impressão física.
 */
import { test, expect, type Page, type Route } from "@playwright/test"
import { mkdtempSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import * as direct from "../../lib/printing/direct/http"
import { commercialDigest, confirmedSale, depsFor, IDS, LabServer, labPrisma, labRuntime, prismaDatabase, seed, sessionOf, withPolicy, type EnabledRuntime } from "../../tools/print-004c-e2e/lab-env"
import { ORIGIN, STORE, TERMINAL, seedStorage } from "../fixtures/print-direct"
import { fork, type ChildProcess } from "node:child_process"

type Json = Record<string, any>
declare global { interface Window { __legacy: { auto: number; dialog: number }; __printCfg: Json; __browser: { open: number; print: number; childPrint: number; html: string }
  __cupom: Json; __reprintStore: string | undefined; __legacyPrint: { thermal: number; html: number } } }

const URL_ = process.env.PRINT_PG_URL
test.skip(!URL_, "PRINT_PG_URL (print_lab_*) required")
const prisma = labPrisma(URL_ ?? "postgresql://x@127.0.0.1/print_lab_unused")
const db = prismaDatabase(prisma as never)
const baseRuntime: EnabledRuntime = labRuntime()
let runtime: EnabledRuntime = baseRuntime
let server: LabServer, token = "", host: ChildProcess
let salePosts: Json[] = [], printCalls: string[] = [], errors: string[] = [], seq = 0
let legacyRawCalls: Json[] = []
let allowLegacyRaw = false
const journal = path.join(mkdtempSync(path.join(os.tmpdir(), "p004c-pw-")), "journal.jsonl")

// The REAL agent runs in its own OS process (plain Node, no test transpiler) with a SIMULATED spooler, driven over IPC.
const pending = new Map<number, (m: Json) => void>()
let msgId = 0
const ctl = (cmd: string, extra: Json = {}) => new Promise<Json>(resolve => { const id = ++msgId; pending.set(id, resolve); host.send({ id, cmd, ...extra }) })
const startAgent = () => ctl("start", { token })
const stopAgent = () => (host?.connected ? ctl("stop") : Promise.resolve({}))
const spooled = async () => ((await ctl("state")).spooled as Json[]).map(j => ({ ...j, text: Buffer.from(j.bytes, "base64").toString("latin1") }))
const setPrinter = (patch: Json) => ctl("printer", { name: "POS-80 (simulada)", patch })
const pushFault = (fault: string) => ctl("fault", { fault })

test.beforeAll(async () => {
  await seed(prisma)
  server = await new LabServer(() => depsFor(db, runtime, null)).start()
  const adminDeps = depsFor(db, runtime, sessionOf(IDS.adminA))
  const call = async (body: Json) => (await (await direct.adminAction(new Request(ORIGIN + "/api/print/direct/admin", { method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", "x-assistec-loja-id": STORE }, body: JSON.stringify(body) }), adminDeps)).json()) as Json
  const created = await call({ action: "createInstallation", label: "Caixa 1 (simulado)" })
  const paired = await (await fetch(server.url + "/api/print/agent/pair", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: created.pairingCode, agentVersion: "pw" }) })).json() as Json
  token = paired.token
  host = fork(path.resolve(__dirname, "../../tools/print-004c-e2e/agent-host.mjs"), [server.url, journal], { execPath: process.execPath, execArgv: [], env: { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "" } as unknown as NodeJS.ProcessEnv })
  await new Promise<void>(resolve => host.on("message", (m: Json) => { if (m.ready) resolve(); else pending.get(m.id)?.(m) }))
  await startAgent()
  await expect.poll(async () => (await prisma.$queryRawUnsafe<Json[]>(`SELECT jsonb_array_length(inventory) n FROM public.print_agent_links WHERE installation_id=$1::uuid`, paired.installationId))[0].n, { timeout: 15000 }).toBe(1)
  await stopAgent()
  expect((await call({ action: "bindTerminal", terminalId: TERMINAL.id, installationId: paired.installationId, printerName: "POS-80 (simulada)", profileId: "THERMAL_80" })).ok).toBe(true)
})
test.afterAll(async () => { await stopAgent(); host?.kill(); await server?.stop(); await prisma.$disconnect() })

test.beforeEach(async ({ context, page }) => {
  salePosts = []; printCalls = []; errors = []; registryDown = null; legacyRawCalls = []; allowLegacyRaw = false
  runtime = baseRuntime
  await setPrinter({ online: true })
  page.on("pageerror", e => errors.push(e.message))
  page.on("dialog", d => { errors.push("native dialog: " + d.message()); void d.dismiss() })
  page.on("popup", () => errors.push("popup opened"))
  await context.route("**/*", route => handle(route))
  await startAgent()
})
test.afterEach(async () => { await stopAgent(); expect(errors).toEqual([]) })

async function handle(route: Route) {
  const req = route.request(), url = new URL(req.url())
  if (url.origin !== ORIGIN) { errors.push("external " + req.url()); await route.abort(); return }
  if (req.method() === "GET" && ["/", "/fixture.js", "/favicon.ico", "/reprint", "/reprint.js"].includes(url.pathname)) { await route.continue(); return }
  const ok = (body: unknown) => route.fulfill({ status: 200, json: body })
  const key = `${req.method()} ${url.pathname}`
  if (key === "POST /api/print/raw" && allowLegacyRaw) {
    legacyRawCalls.push(JSON.parse(req.postData() ?? "{}"))
    await ok({ ok: true }); return
  }
  if (url.pathname.startsWith("/api/print/direct/")) {
    printCalls.push(key)
    if (registryDown && url.pathname.endsWith(registryDown)) { await route.fulfill({ status: 503, json: { ok: false, error: "LEDGER_BUSY" } }); return }
    const request = new Request(req.url(), { method: req.method(), headers: await req.allHeaders(), body: req.method() === "GET" ? undefined : req.postData() ?? "" })
    const d = depsFor(db, runtime, sessionOf(IDS.caixaA))
    const p = url.pathname
    const res = p === "/api/print/direct/jobs" ? (req.method() === "POST" ? await direct.createJob(request, d) : await direct.latestJob(request, d))
      : p === "/api/print/direct/terminal-status" ? await direct.terminalStatus(request, d)
      : p === "/api/print/direct/reprint-quote" ? await direct.quoteReprint(request, d)
      : p === "/api/print/direct/browser-fallback" ? await direct.browserFallback(request, d)
      : /\/retry$/.test(p) ? await direct.retryJob(request, d, p.split("/")[5])
      : await direct.getJob(request, d, p.split("/")[5])
    await route.fulfill({ status: res.status, body: Buffer.from(await res.arrayBuffer()), headers: Object.fromEntries(res.headers.entries()) })
    return
  }
  if (key === "POST /api/ops/venda-persist/v2") {
    const wire = JSON.parse(req.postData() ?? "null") as Json
    salePosts.push(wire)
    if (failWrites) { await route.abort("failed"); return }
    // Synthetic server writer: the CONFIRMED sale exists in the disposable DB with its server id.
    const serverId = "srv-" + wire.clientSaleId, pedidoId = `VDA-PW-${++seq}-${Date.now().toString(36)}`
    const lines = wire.sale.lines as Json[]
    // A weighed (KG) sale as the server writer records it: outside the direct-print contract.
    const kg = lines.some(l => String(l.name).includes("[KG]"))
    await prisma.$executeRawUnsafe(`INSERT INTO public.vendas(id,"storeId","pedidoId",total,at,status,payload,"terminalId",operador) VALUES ($1,$2,$3,$4,(now() AT TIME ZONE 'UTC'),'concluida',$5::jsonb,$6,'Operadora Sintética') ON CONFLICT (id) DO NOTHING`,
      serverId, STORE, pedidoId, wire.sale.total, JSON.stringify({ paymentBreakdown: wire.sale.paymentBreakdown, sessaoId: "p004c-caixa", ...(kg ? { manualKg: true } : {}) }), TERMINAL.id)
    let i = 0
    for (const l of lines) await prisma.$executeRawUnsafe(`INSERT INTO public.venda_itens(id,"vendaId",nome,quantidade,"precoUnitario","lineTotal") VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
      `${serverId}-${++i}`, serverId, l.name, l.quantity, l.unitPrice, Math.round(l.quantity * l.unitPrice * 100) / 100)
    await ok({ venda: { ...wire.sale, pedidoId, id: serverId, storeId: STORE, syncPending: false } }); return
  }
  if (key === "GET /api/ops/inventory") return ok({ items: [] })
  if (key === "GET /api/ops/ordens") return ok({ ordens: [] })
  if (key === "GET /api/ops/servicos") return ok({ items: [] })
  if (key === "GET /api/ops/vendas-list") return ok({ sales: [] })
  if (key === "GET /api/ops/caixa/sessoes") return ok({ sessoes: [{ id: "p004c-caixa", storeId: STORE, terminalId: null, saldoInicial: 100, abertaEm: new Date().toISOString() }] })
  if (key === "GET /api/ops/credito-cliente") return ok({ creditos: {} })
  if (key === "GET /api/ops/venda-persist/v2") return ok({ writer: "v2" })
  if (key === "POST /api/audit/log" || key === "POST /api/ops/sync-ledger" || key === "POST /__fixture/enrich") return ok({ ok: true })
  if (key === "GET /api/auth/admin") return ok({ authenticated: false })
  if (key === `GET /api/stores/${STORE}`) return ok({ store: { id: STORE, name: "Loja Sintética A" } })
  if (key === `GET /api/stores/${STORE}/settings`) return ok({ settings: {} })
  if (key === "GET /api/clientes" || key === "POST /api/clientes/search") return ok({ clientes: [], items: [] })
  errors.push("unplanned " + key); await route.abort("failed")
}
let failWrites = false
let registryDown: string | null = null

async function mount(page: Page, cfg: Json = {}) {
  const storage: Record<string, string> = {}
  seedStorage({ setItem: (k, v) => { storage[k] = v } })
  await page.addInitScript(([entries, printCfg]) => {
    for (const [k, v] of Object.entries(entries as Record<string, string>)) localStorage.setItem(k, v)
    window.__printCfg = printCfg as Json
    // window.print / window.open are observed: the direct path must never use them on its own.
    window.__browser = { open: 0, print: 0, childPrint: 0, html: "" }
    window.print = () => { window.__browser.print++ }
    window.open = (() => { window.__browser.open++; return { document: { open() {}, write(h: string) { window.__browser.html += h }, close() {} }, focus() {}, print() { window.__browser.childPrint++ }, close() {} } }) as unknown as typeof window.open
  }, [storage, { imprimirAutomatico: true, impressaoDireta: true, ...cfg }])
  await page.goto("/")
  await expect.poll(() => page.evaluate(() => (window as unknown as Json).__ops?.caixa?.isOpen)).toBe(true)
  if (cfg.impressaoDireta !== false) await expect.poll(() => printCalls.filter(c => c.includes("terminal-status")).length).toBeGreaterThan(0)
}
async function sell(page: Page, name = "Café coado — açúcar", price = "1250") {
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur())
  await page.keyboard.press("Insert")
  const avulso = page.getByRole("dialog", { name: /Item Avulso/i })
  await avulso.getByPlaceholder("Ex.: Suporte de TV universal").fill(name)
  await avulso.getByPlaceholder("0,00").first().fill(price)
  await avulso.getByRole("button", { name: /Adicionar ao carrinho/i }).click()
  await expect(avulso).toHaveCount(0)
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur())
  await page.keyboard.press("F12")
  const modal = page.getByRole("dialog", { name: "Finalizar Pagamento" })
  await modal.getByRole("button", { name: /^PIX$/i }).click()
  await modal.getByRole("button", { name: "Confirmar Pagamento", exact: true }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Sim, finalizar" }).click()
  await expect.poll(() => salePosts.length).toBeGreaterThan(0)
}
const feedback = (page: Page) => page.getByTestId("pdv-direct-print-feedback")
const browserCounts = (page: Page) => page.evaluate(() => window.__browser)
const legacy = (page: Page) => page.evaluate(() => ({ auto: window.__legacy.auto, dialog: window.__legacy.dialog }))

test("PW1 impressão automática: venda CONFIRMADA → fila da impressora do terminal, sem janela/diálogo/preview", async ({ page }) => {
  await mount(page)
  const before = (await spooled()).length
  const digest = await commercialDigest(prisma)
  await sell(page)
  await expect(feedback(page)).toContainText("Comprovante enviado à fila da impressora", { timeout: 15000 })
  await expect(feedback(page)).toContainText("Confira o papel")
  expect((await spooled()).length - before).toBe(1)
  const bytes = (await spooled()).at(-1)!.text
  expect(bytes).toContain("Café coado - açúcar")
  expect(bytes).toContain("NÃO É DOCUMENTO FISCAL")
  expect(await browserCounts(page)).toMatchObject({ open: 0, print: 0, childPrint: 0 })
  expect(await legacy(page)).toEqual({ auto: 0, dialog: 0 })
  expect(printCalls.filter(c => c === "POST /api/print/direct/jobs")).toHaveLength(1)
  expect(salePosts).toHaveLength(1)
  // The only commercial change is the sale itself (written by the synthetic writer), never by printing.
  const after = await commercialDigest(prisma)
  expect(after.split("|").filter(p => !p.startsWith("vendas:") && !p.startsWith("venda_itens:"))).toEqual(digest.split("|").filter(p => !p.startsWith("vendas:") && !p.startsWith("venda_itens:")))
})

test("PW2 venda PENDENTE (falha de rede no writer) nunca chama a impressão direta", async ({ page }) => {
  failWrites = true
  try {
    await mount(page)
    const before = (await spooled()).length
    await sell(page)
    await page.waitForTimeout(2500)
    expect(printCalls.filter(c => c.startsWith("POST /api/print/direct"))).toEqual([])
    await expect(feedback(page)).toHaveCount(0)
    expect((await spooled()).length).toBe(before)
    expect(await legacy(page)).toEqual({ auto: 0, dialog: 0 })
  } finally { failWrites = false }
})

test("PW3 impressora desligada → aviso claro sem repetir a venda; religada → Tentar novamente imprime uma vez", async ({ page }) => {
  await mount(page)
  await setPrinter({ online: false })
  const before = (await spooled()).length
  await sell(page)
  await expect(feedback(page)).toContainText("comprovante não enviado", { timeout: 15000 })
  await expect(feedback(page)).toContainText("impressora desligada ou desconectada")
  await expect(feedback(page).getByRole("button", { name: "Abrir impressão do navegador" })).toBeVisible()
  expect((await spooled()).length).toBe(before)
  await setPrinter({ online: true })
  await feedback(page).getByRole("button", { name: "Tentar novamente" }).click()
  await expect(feedback(page)).toContainText("Comprovante enviado à fila da impressora", { timeout: 15000 })
  expect((await spooled()).length - before).toBe(1)
  expect(salePosts).toHaveLength(1)
  expect(await browserCounts(page)).toMatchObject({ open: 0, print: 0, childPrint: 0 })
})

test("PW4 segunda via explícita com confirmação de risco → SEGUNDA VIA na impressora", async ({ page }) => {
  await mount(page)
  await sell(page)
  await expect(feedback(page)).toContainText("Comprovante enviado à fila da impressora", { timeout: 15000 })
  const before = (await spooled()).length
  await feedback(page).getByRole("button", { name: "Imprimir 2ª via" }).click()
  await expect(feedback(page)).toContainText("Confirmar segunda via?")
  await expect(feedback(page)).toContainText("pode(m) já ter saído")
  expect((await spooled()).length).toBe(before) // nothing before the explicit confirmation
  await feedback(page).getByRole("button", { name: "Confirmar 2ª via" }).click()
  await expect(feedback(page)).toContainText("Comprovante enviado à fila da impressora", { timeout: 15000 })
  expect((await spooled()).length - before).toBe(1)
  expect((await spooled()).at(-1)!.text).toContain("SEGUNDA VIA - REIMPRESSAO")
  expect(salePosts).toHaveLength(1)
})

test("PW5 modo manual: nada é enviado até o operador clicar em Imprimir comprovante", async ({ page }) => {
  await mount(page, { imprimirAutomatico: false })
  const before = (await spooled()).length
  await sell(page)
  await expect(feedback(page)).toContainText("confirmada")
  await page.waitForTimeout(1200)
  expect((await spooled()).length).toBe(before)
  expect(printCalls.filter(c => c === "POST /api/print/direct/jobs")).toHaveLength(0)
  await feedback(page).getByRole("button", { name: "Imprimir comprovante" }).click()
  await expect(feedback(page)).toContainText("Comprovante enviado à fila da impressora", { timeout: 15000 })
  expect((await spooled()).length - before).toBe(1)
})

test("PW6 agente fora do ar → 'não respondeu' sem impressão tardia; agente volta → Tentar novamente imprime uma vez", async ({ page }) => {
  runtime = withPolicy(runtime, { dispatchLeaseMs: 2500 })
  await stopAgent()
  await mount(page)
  const before = (await spooled()).length
  await sell(page)
  await expect(feedback(page)).toContainText("o agente de impressão não respondeu", { timeout: 20000 })
  await startAgent()
  await page.waitForTimeout(1500)
  expect((await spooled()).length).toBe(before) // lapsed lease: no surprise late print
  await feedback(page).getByRole("button", { name: "Tentar novamente" }).click()
  await expect(feedback(page)).toContainText("Comprovante enviado à fila da impressora", { timeout: 15000 })
  expect((await spooled()).length - before).toBe(1)
  expect(salePosts).toHaveLength(1)
})

test("PW7 loja/terminal sem impressão direta ativada → fluxo atual intacto (sem chamada nova)", async ({ page }) => {
  await mount(page, { impressaoDireta: false, imprimirAutomatico: true })
  await sell(page)
  await expect.poll(() => legacy(page)).toEqual({ auto: 1, dialog: 0 })
  expect(printCalls).toEqual([])
  await expect(feedback(page)).toHaveCount(0)
})

test("PW8 navegador por escolha explícita: registrado pelo servidor, HTML escapado e marcado; sem via térmica depois", async ({ page }) => {
  await mount(page, { imprimirAutomatico: false })
  const before = (await spooled()).length
  await sell(page, "Pão <b>doce</b>")
  await feedback(page).getByRole("button", { name: "Abrir impressão do navegador" }).click()
  await expect(feedback(page)).toContainText("Impressão do navegador aberta")
  const b = await browserCounts(page)
  expect([b.open, b.childPrint, b.print]).toEqual([1, 1, 0])
  expect(b.html).toContain("VIA IMPRESSA PELO NAVEGADOR")
  expect(b.html).toContain("Pão &lt;b&gt;doce&lt;/b&gt;")
  expect(b.html).not.toMatch(/<script|<b>doce/)
  await expect(feedback(page).getByRole("button", { name: "Imprimir comprovante" })).toHaveCount(0)
  expect((await spooled()).length).toBe(before)
  expect(printCalls.filter(c => c === "POST /api/print/direct/browser-fallback")).toHaveLength(1)
})

test("PW9 resultado incerto: nada é reenviado; navegador exige confirmação e sai como SEGUNDA VIA", async ({ page }) => {
  await mount(page)
  await pushFault("TIMEOUT_AFTER")
  await sell(page)
  await expect(feedback(page)).toContainText("resultado da impressão incerto", { timeout: 15000 })
  await expect(feedback(page)).toContainText("Nada será reenviado automaticamente")
  await expect(feedback(page).getByRole("button", { name: "Tentar novamente" })).toHaveCount(0)
  const before = (await spooled()).length
  await feedback(page).getByRole("button", { name: "Abrir impressão do navegador" }).click()
  await expect(feedback(page)).toContainText("Imprimir pelo navegador como SEGUNDA VIA?")
  expect(await browserCounts(page)).toMatchObject({ html: "", childPrint: 0 }) // the window opened by the click was closed unused
  await feedback(page).getByRole("button", { name: "Imprimir pelo navegador (2ª via)" }).click()
  await expect(feedback(page)).toContainText("Impressão do navegador aberta")
  const b = await browserCounts(page)
  expect([b.open, b.childPrint]).toEqual([2, 1])
  expect(b.html).toContain("SEGUNDA VIA - IMPRESSAO PELO NAVEGADOR")
  await page.waitForTimeout(1500)
  expect((await spooled()).length).toBe(before)
  expect(salePosts).toHaveLength(1)
})

test("PW10 venda fora do contrato (KG) → volta ao fluxo anterior (automático e manual); nada térmico, nada pelo navegador", async ({ page }) => {
  await mount(page)
  const before = (await spooled()).length
  await sell(page, "Queijo minas [KG]")
  await expect.poll(() => legacy(page)).toEqual({ auto: 1, dialog: 0 })
  await expect(feedback(page)).toHaveCount(0)
  expect((await spooled()).length).toBe(before)
  expect(await browserCounts(page)).toMatchObject({ open: 0, print: 0, childPrint: 0 })
})

test("PW11 venda KG com impressão automática desligada → diálogo manual existente", async ({ page }) => {
  await mount(page, { imprimirAutomatico: false })
  await sell(page, "Pão por peso [KG]")
  await expect(feedback(page)).toContainText("confirmada")
  await feedback(page).getByRole("button", { name: "Imprimir comprovante" }).click()
  await expect.poll(() => legacy(page)).toEqual({ auto: 0, dialog: 1 })
  await expect(feedback(page)).toHaveCount(0)
})

test("PW21 agente escolhido com disponibilidade desconhecida: feedback REAL não tenta TCP nem navegador", async ({ page }) => {
  registryDown = "/terminal-status"
  await mount(page, { realLegacyFeedback: true, impressoraHost: "192.168.0.50" })
  await sell(page)
  await expect(page.getByTestId("pdv-auto-print-feedback")).toContainText("Omni Print")
  expect(legacyRawCalls).toHaveLength(0)
  expect(printCalls.filter(c => c === "POST /api/print/direct/jobs")).toHaveLength(0)
  expect(await browserCounts(page)).toMatchObject({ open: 0, print: 0, childPrint: 0 })
  expect(salePosts).toHaveLength(1)
})

test("PW22 KG recusado sem job: feedback/runtime REAIS preservam uma tentativa de rede explicitamente configurada", async ({ page }) => {
  allowLegacyRaw = true
  await mount(page, { realLegacyFeedback: true, impressoraHost: "192.168.0.50" })
  await sell(page, "Queijo minas [KG]")
  await expect(page.getByTestId("pdv-auto-print-feedback")).toContainText("envio aceito pelo transporte")
  expect(legacyRawCalls).toHaveLength(1)
  expect(legacyRawCalls[0].host).toBe("192.168.0.50")
  expect(Buffer.from(legacyRawCalls[0].data, "base64").toString("latin1")).toContain("Queijo minas")
  expect(await browserCounts(page)).toMatchObject({ open: 0, print: 0, childPrint: 0 })
  expect(salePosts).toHaveLength(1)
  const jobs = await prisma.$queryRawUnsafe<Json[]>(`SELECT count(*)::int n FROM public.print_jobs j JOIN public.print_documents d ON d.id=j.document_id WHERE d.sale_id=$1 AND j.store_id=$2`, "srv-" + salePosts[0].clientSaleId, STORE)
  expect(jobs[0].n).toBe(0)
})

// ── D01-A1: reimpressão registrada pelo Histórico de vendas / Conferência do caixa (mesmo diálogo real: CupomNaoFiscal) ──
const panel = (page: Page) => page.getByTestId("direct-reprint-panel")
const legacyPrint = (page: Page) => page.evaluate(() => window.__legacyPrint)
const asCaixa = () => depsFor(db, runtime, sessionOf(IDS.caixaA))
const jobRequest = (saleId: string, uiContextId: string) => new Request(ORIGIN + "/api/print/direct/jobs", { method: "POST",
  headers: { origin: ORIGIN, "content-type": "application/json", "x-assistec-loja-id": STORE },
  body: JSON.stringify({ saleId, kind: "INITIAL", terminalId: TERMINAL.id, uiContextId }) })
/** INITIAL through the real API (as the PDV does), accepted by the real agent with the simulated spooler. */
async function printInitial(saleId: string) {
  const res = await direct.createJob(jobRequest(saleId, "pw-initial"), asCaixa())
  const body = await res.json() as Json
  expect(res.status, JSON.stringify(body)).toBe(200)
  return body.job.jobId as string
}
const jobPhase = async (jobId: string) => ((await (await direct.getJob(new Request(ORIGIN + "/api/print/direct/jobs/" + jobId,
  { headers: { origin: ORIGIN, "x-assistec-loja-id": STORE } }), asCaixa(), jobId)).json()) as Json).job.phase as string
const reprintEvents = async (saleId: string) => prisma.$queryRawUnsafe<Json[]>(`SELECT e.details->>'mark' mark,e.details->>'origin' origin FROM public.print_events e
  JOIN public.print_documents d ON d.id=e.document_id WHERE d.sale_id=$1 AND e.event_type='BROWSER_FALLBACK_PRINTED' ORDER BY e.created_at`, saleId)
const jobsOf = async (saleId: string) => prisma.$queryRawUnsafe<Json[]>(`SELECT j.kind FROM public.print_jobs j JOIN public.print_documents d ON d.id=j.document_id
  WHERE d.sale_id=$1 ORDER BY j.created_at`, saleId)

/** The panel writes nothing to the server until the operator asks to reprint (P3-9 of review round 6). */
const startReprint = (page: Page) => panel(page).getByRole("button", { name: "Reimprimir como 2ª via" }).click()
const documentsOf = async (saleId: string) => prisma.$queryRawUnsafe<Json[]>(`SELECT 1 FROM public.print_documents WHERE sale_id=$1`, saleId)

async function mountReprint(page: Page, saleId: string, cfg: Json = {}) {
  const storage: Record<string, string> = {}
  seedStorage({ setItem: (k, v) => { storage[k] = v } })
  const [row] = await prisma.$queryRawUnsafe<Json[]>(`SELECT "pedidoId",total FROM public.vendas WHERE id=$1`, saleId)
  const cupom = { numeroPedido: row.pedidoId, at: new Date().toISOString(), lojaNome: "Loja Sintética A", total: Number(row.total), status: "concluida", vendaId: saleId,
    itens: [{ nome: "Café coado — grão especial", quantidade: 2, precoUnitario: 7.5, lineTotal: 15 }], pagamentos: [{ label: "Dinheiro", valor: Number(row.total) }] }
  await page.addInitScript(([entries, printCfg, data, store]) => {
    for (const [k, v] of Object.entries(entries as Record<string, string>)) localStorage.setItem(k, v)
    window.__printCfg = printCfg as Json
    window.__cupom = data as Json
    window.__reprintStore = store as string
    window.__browser = { open: 0, print: 0, childPrint: 0, html: "" }
    window.print = () => { window.__browser.print++ }
    window.open = (() => { window.__browser.open++; return { document: { open() {}, write(h: string) { window.__browser.html += h }, close() {} }, focus() {}, print() { window.__browser.childPrint++ }, close() {} } }) as unknown as typeof window.open
  }, [storage, { impressaoDireta: true, ...cfg }, cupom, STORE] as const)
  await page.goto("/reprint")
}

test("PW12 reimpressão registrada (Histórico/Conferência) pela térmica do caixa: risco informado, sai SEGUNDA VIA, nada pelo fluxo antigo", async ({ page }) => {
  const sale = await confirmedSale(prisma, STORE, { terminalId: TERMINAL.id })
  const before = (await spooled()).length
  await printInitial(sale.id)
  await expect.poll(async () => (await spooled()).length, { timeout: 15000 }).toBe(before + 1)
  await mountReprint(page, sale.id)
  await expect(panel(page)).toContainText("Reimpressão registrada")
  expect(printCalls.filter(c => !c.includes("terminal-status"))).toEqual([]) // opening the receipt writes nothing
  await startReprint(page)
  await expect(panel(page)).toContainText("1 via(s) desta venda pode(m) já ter saído")
  await expect(panel(page)).toContainText("SEGUNDA VIA")
  await expect(page.getByRole("button", { name: "Enviar para térmica" })).toHaveCount(0) // legacy unregistered print is gone
  expect((await spooled()).length).toBe(before + 1) // nothing before the explicit choice
  await panel(page).getByRole("button", { name: "Imprimir 2ª via na impressora do caixa" }).click()
  await expect(panel(page)).toContainText("Confirmar 2ª via na impressora do caixa?")
  await page.waitForTimeout(500)
  expect((await spooled()).length).toBe(before + 1) // still nothing: the risk must be confirmed
  await panel(page).getByRole("button", { name: "Confirmar 2ª via na impressora do caixa" }).click()
  await expect(panel(page)).toContainText("Segunda via enviada à fila da impressora", { timeout: 15000 })
  expect((await spooled()).length).toBe(before + 2)
  expect((await spooled()).at(-1)!.text).toContain("SEGUNDA VIA - REIMPRESSAO")
  expect((await jobsOf(sale.id)).map(j => j.kind)).toEqual(["INITIAL", "REPRINT"])
  expect(await legacyPrint(page)).toEqual({ thermal: 0, html: 0 })
  expect(await browserCounts(page)).toMatchObject({ open: 0, print: 0, childPrint: 0 })
})

test("PW13 reimpressão registrada pelo navegador: HTML do servidor marcado SEGUNDA VIA - REIMPRESSAO, evento auditável, nada térmico", async ({ page }) => {
  const sale = await confirmedSale(prisma, STORE, { terminalId: TERMINAL.id })
  const before = (await spooled()).length
  await printInitial(sale.id)
  await expect.poll(async () => (await spooled()).length, { timeout: 15000 }).toBe(before + 1)
  await mountReprint(page, sale.id)
  await startReprint(page)
  await expect(panel(page)).toContainText("pode(m) já ter saído")
  await panel(page).getByRole("button", { name: "Imprimir 2ª via pelo navegador" }).click()
  await expect(panel(page)).toContainText("Impressão do navegador aberta")
  const b = await browserCounts(page)
  expect([b.open, b.childPrint]).toEqual([1, 1])
  expect(b.html).toContain("SEGUNDA VIA - REIMPRESSAO PELO NAVEGADOR")
  expect(b.html).not.toContain("<script")
  expect(await reprintEvents(sale.id)).toEqual([{ mark: "SEGUNDA VIA - REIMPRESSAO PELO NAVEGADOR", origin: "REPRINT" }])
  await page.waitForTimeout(1500)
  expect((await spooled()).length).toBe(before + 1)
  expect(await legacyPrint(page)).toEqual({ thermal: 0, html: 0 })
})

test("PW14 venda sem via registrada: reimpressão sai SEGUNDA VIA mesmo assim e fecha a 1ª via (nenhum 'original' depois)", async ({ page }) => {
  const sale = await confirmedSale(prisma, STORE, { terminalId: TERMINAL.id })
  const before = (await spooled()).length
  await mountReprint(page, sale.id)
  await expect(panel(page)).toContainText("Reimpressão registrada")
  expect(await documentsOf(sale.id)).toEqual([])
  await startReprint(page)
  await expect(panel(page)).toContainText("Nenhuma via desta venda foi registrada como impressa")
  await panel(page).getByRole("button", { name: "Imprimir 2ª via pelo navegador" }).click()
  await expect(panel(page)).toContainText("Impressão do navegador aberta")
  expect((await browserCounts(page)).html).toContain("SEGUNDA VIA - REIMPRESSAO PELO NAVEGADOR")
  const res = await direct.createJob(jobRequest(sale.id, "pw14"), asCaixa())
  expect(((await res.json()) as Json).error).toBe("BROWSER_COPY_ALREADY_ISSUED")
  await page.waitForTimeout(1500)
  expect((await spooled()).length).toBe(before)
})

test("PW15 duas abas: navegador pede nova confirmação quando outra aba já imprimiu; térmica nas duas abas converge em 1 via", async ({ page, context }) => {
  const sale = await confirmedSale(prisma, STORE, { terminalId: TERMINAL.id })
  const other = await context.newPage()
  await mountReprint(page, sale.id)
  await mountReprint(other, sale.id)
  await startReprint(page)
  await startReprint(other)
  await expect(panel(page)).toContainText("Nenhuma via desta venda foi registrada")
  await expect(panel(other)).toContainText("Nenhuma via desta venda foi registrada")
  await panel(page).getByRole("button", { name: "Imprimir 2ª via pelo navegador" }).click()
  await expect(panel(page)).toContainText("Impressão do navegador aberta")
  // The other tab still shows the old quote: the server refuses to print without a new confirmation.
  await panel(other).getByRole("button", { name: "Imprimir 2ª via pelo navegador" }).click()
  await expect(panel(other)).toContainText("Confirme de novo: a situação das vias mudou")
  await expect(panel(other)).toContainText("1 via(s) desta venda pode(m) já ter saído")
  expect((await browserCounts(other)).html).toBe("")
  expect(await reprintEvents(sale.id)).toHaveLength(1)
  await panel(other).getByRole("button", { name: "Confirmar 2ª via pelo navegador" }).click()
  await expect(panel(other)).toContainText("Impressão do navegador aberta")
  expect(await reprintEvents(sale.id)).toHaveLength(2)

  // Thermal from two tabs with the same quote: the second click converges on the job of the first (one paper).
  const sale2 = await confirmedSale(prisma, STORE, { terminalId: TERMINAL.id })
  const p1 = await context.newPage(), p2 = await context.newPage()
  await mountReprint(p1, sale2.id)
  await mountReprint(p2, sale2.id)
  await startReprint(p1)
  await startReprint(p2)
  await expect(panel(p1)).toContainText("Nenhuma via")
  await expect(panel(p2)).toContainText("Nenhuma via")
  const before = (await spooled()).length
  await Promise.all([panel(p1).getByRole("button", { name: "Imprimir 2ª via na impressora do caixa" }).click(),
    panel(p2).getByRole("button", { name: "Imprimir 2ª via na impressora do caixa" }).click()])
  await expect(panel(p1)).toContainText("Segunda via enviada à fila da impressora", { timeout: 15000 })
  await expect(panel(p2)).toContainText("Segunda via enviada à fila da impressora", { timeout: 15000 })
  await page.waitForTimeout(1500)
  expect((await spooled()).length - before).toBe(1)
  expect((await jobsOf(sale2.id)).map(j => j.kind)).toEqual(["REPRINT"])

  // Both tabs already see a risk (copy accepted by the printer): the browser copy of the second tab asks again.
  const sale3 = await confirmedSale(prisma, STORE, { terminalId: TERMINAL.id })
  const s3before = (await spooled()).length
  await printInitial(sale3.id)
  await expect.poll(async () => (await spooled()).length, { timeout: 15000 }).toBe(s3before + 1)
  const r1 = await context.newPage(), r2 = await context.newPage()
  await mountReprint(r1, sale3.id)
  await mountReprint(r2, sale3.id)
  await startReprint(r1)
  await startReprint(r2)
  await expect(panel(r1)).toContainText("1 via(s) desta venda pode(m) já ter saído")
  await expect(panel(r2)).toContainText("1 via(s) desta venda pode(m) já ter saído")
  await panel(r1).getByRole("button", { name: "Imprimir 2ª via pelo navegador" }).click()
  await expect(panel(r1)).toContainText("Impressão do navegador aberta")
  await panel(r2).getByRole("button", { name: "Imprimir 2ª via pelo navegador" }).click()
  await expect(panel(r2)).toContainText("Confirme de novo: a situação das vias mudou")
  await expect(panel(r2)).toContainText("2 via(s) desta venda pode(m) já ter saído")
  expect((await browserCounts(r2)).html).toBe("")
  expect(await reprintEvents(sale3.id)).toHaveLength(1)
  await Promise.all([other.close(), p1.close(), p2.close(), r1.close(), r2.close()])
})

test("PW16 resultado incerto da 1ª via: reimpressão informa o risco, sai uma SEGUNDA VIA e nada é reenviado sozinho", async ({ page }) => {
  const sale = await confirmedSale(prisma, STORE, { terminalId: TERMINAL.id })
  await pushFault("TIMEOUT_AFTER")
  const initial = await printInitial(sale.id)
  await expect.poll(() => jobPhase(initial), { timeout: 20000 }).toBe("UNCERTAIN")
  const afterInitial = (await spooled()).length
  await mountReprint(page, sale.id)
  await startReprint(page)
  await expect(panel(page)).toContainText("pode(m) já ter saído")
  await panel(page).getByRole("button", { name: "Imprimir 2ª via na impressora do caixa" }).click()
  await expect(panel(page)).toContainText("Confirmar 2ª via na impressora do caixa?")
  await expect(panel(page)).toContainText("nada é reenviado automaticamente")
  expect((await spooled()).length).toBe(afterInitial)
  await panel(page).getByRole("button", { name: "Confirmar 2ª via na impressora do caixa" }).click()
  await expect(panel(page)).toContainText("Segunda via enviada à fila da impressora", { timeout: 15000 })
  await page.waitForTimeout(1500)
  expect((await spooled()).length - afterInitial).toBe(1)
  expect((await spooled()).at(-1)!.text).toContain("SEGUNDA VIA - REIMPRESSAO")
  expect(await jobPhase(initial)).toBe("UNCERTAIN")
})

test("PW17 Omni Print desligado na loja: diálogo antigo idêntico, nenhuma chamada nova", async ({ page }) => {
  const sale = await confirmedSale(prisma, STORE, { terminalId: TERMINAL.id })
  await mountReprint(page, sale.id, { impressaoDireta: false })
  await page.getByRole("button", { name: "Enviar para térmica" }).click()
  await expect.poll(() => legacyPrint(page)).toEqual({ thermal: 1, html: 0 })
  await expect(panel(page)).toHaveCount(0)
  expect(printCalls).toEqual([])
})

test("PW18 venda fora do contrato (KG) ou servidor com o recurso fechado: volta ao fluxo antigo sem registrar nada", async ({ page, context }) => {
  const kg = await confirmedSale(prisma, STORE, { terminalId: TERMINAL.id })
  await prisma.$executeRawUnsafe(`UPDATE public.vendas SET payload=payload||'{"manualKg":true}'::jsonb WHERE id=$1`, kg.id)
  await mountReprint(page, kg.id)
  await startReprint(page)
  await expect(page.getByRole("button", { name: "Enviar para térmica" })).toBeVisible()
  await expect(page.getByTestId("reprint-legacy-notice")).toContainText("sem registro de segunda via")
  await expect(panel(page)).toHaveCount(0)
  await page.getByRole("button", { name: "Enviar para térmica" }).click()
  await expect.poll(() => legacyPrint(page)).toEqual({ thermal: 1, html: 0 })
  expect(await reprintEvents(kg.id)).toEqual([])

  runtime = { enabled: false, reason: "OWNER_APPROVAL_REQUIRED" } as unknown as EnabledRuntime
  const sale = await confirmedSale(prisma, STORE, { terminalId: TERMINAL.id })
  const p2 = await context.newPage()
  await mountReprint(p2, sale.id)
  await startReprint(p2)
  await expect(p2.getByRole("button", { name: "Enviar para térmica" })).toBeVisible()
  await expect(panel(p2)).toHaveCount(0)
  expect(await jobsOf(sale.id)).toEqual([])
  await p2.close()
})

test("PW19 registro de impressão indisponível: nada imprime, nada volta ao fluxo antigo, a janela aberta é fechada", async ({ page }) => {
  const sale = await confirmedSale(prisma, STORE, { terminalId: TERMINAL.id })
  registryDown = "/reprint-quote"
  await mountReprint(page, sale.id)
  await startReprint(page)
  await expect(panel(page)).toContainText("Não foi possível reimprimir")
  await expect(panel(page).getByRole("button", { name: "Tentar de novo" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Enviar para térmica" })).toHaveCount(0) // never the unregistered flow
  registryDown = "/browser-fallback"
  await panel(page).getByRole("button", { name: "Tentar de novo" }).click()
  await expect(panel(page)).toContainText("Nenhuma via desta venda foi registrada")
  await panel(page).getByRole("button", { name: "Imprimir 2ª via pelo navegador" }).click()
  await expect(panel(page)).toContainText("Não foi possível reimprimir")
  const b = await browserCounts(page)
  expect([b.open, b.childPrint, b.html]).toEqual([1, 0, ""]) // the window opened by the click was closed unused
  expect(await legacyPrint(page)).toEqual({ thermal: 0, html: 0 })
  expect(await reprintEvents(sale.id)).toEqual([])
})

test("PW20 vias configuradas acima do limite da impressão direta: operador é avisado; saem só as 2 permitidas, sem erro nem repetição", async ({ page }) => {
  await mount(page, { viasCupom: 3 })
  const before = (await spooled()).length
  await sell(page)
  await expect(feedback(page)).toContainText("Comprovante enviado à fila da impressora", { timeout: 15000 })
  await expect(page.getByTestId("pdv-direct-print-copies-limit")).toContainText("no máximo 2 vias; a configuração pede 3")
  expect((await spooled()).length - before).toBe(2)
  expect(printCalls.filter(c => c === "POST /api/print/direct/jobs")).toHaveLength(1)
  expect(await legacy(page)).toEqual({ auto: 0, dialog: 0 })
})
