/** Browser smoke of the actual HUB editor. Only Action I/O is simulated.
 * Uses the build CSS (`npm run build`); `SMOKE_CSS_FROM_SOURCE=1` compiles app/globals.css instead.
 * No auth bypass or DB. Voice runs against a SIMULATED local engine injected in the page:
 * it proves the UI lifecycle and privacy contract, not real recognition (see real-voice-capture-local.mjs).
 */
import { chromium, expect } from "@playwright/test"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import assert from "node:assert/strict"
import { applicationCss, buildClienteEditorBundle, serveHarness } from "./cliente-editor-harness.mjs"

const root = process.cwd()
const evidence = path.join(root, "docs/ai-execution/_evidence/CAD-R2-021-CLIENTE-TEXTO-VOZ")
await mkdir(evidence, { recursive: true })
const server = await serveHarness({ js: await buildClienteEditorBundle(root), css: await applicationCss(root) })
const { origin } = server

/** Page-side instrumentation: any microphone/permission/storage touch is counted. */
function instrument(engine) {
  window.__voiceAttempts = { constructed: 0, started: 0, microphone: 0, permissions: 0, devices: 0, available: [], install: [] }
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
    getUserMedia() { window.__voiceAttempts.microphone++; throw new Error("Microphone forbidden in smoke") },
    enumerateDevices() { window.__voiceAttempts.devices++; throw new Error("Device enumeration forbidden") },
  } })
  Object.defineProperty(navigator, "permissions", { configurable: true, value: {
    query() { window.__voiceAttempts.permissions++; throw new Error("Permission query forbidden") },
  } })
  const attempts = window.__voiceAttempts
  if (engine === "generic") {
    // Generic recognition may be remote: the client path must never construct it.
    class Generic { constructor() { attempts.constructed++ } start() { attempts.started++ } stop() {} abort() {} }
    window.SpeechRecognition = Generic
    window.webkitSpeechRecognition = Generic
    return
  }
  // SIMULATED on-device engine: no audio, events are driven by the smoke runner.
  class Local {
    #local = false
    constructor() { attempts.constructed++; window.__rec = this; this.aborted = false; this.stopped = false }
    get processLocally() { return this.#local }
    set processLocally(v) { this.#local = v }
    start() { attempts.started++; this.startedLocal = this.#local; this.startedLang = this.lang }
    stop() { this.stopped = true }
    abort() { this.aborted = true }
    static available(o) { attempts.available.push(o); return Promise.resolve(window.__availability ?? "available") }
    static install(o) { attempts.install.push(o); window.__availability = "available"; return Promise.resolve(true) }
  }
  window.__availability = "downloadable"
  window.__say = (text, isFinal) => window.__rec.onresult?.({ resultIndex: 0, results: { length: 1, 0: { length: 1, isFinal, 0: { transcript: text } } } })
  window.__end = () => window.__rec.onend?.()
  window.SpeechRecognition = Local
}

let browser
const results = []
try {
  browser = await chromium.launch({ headless: true })
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
    const page = await browser.newPage({ viewport })
    const errors = [], externalRequests = []
    page.on("pageerror", (error) => errors.push(error.message))
    page.on("request", (req) => { if (!req.url().startsWith(origin)) externalRequests.push(req.url()) })
    await page.addInitScript(instrument, "local")
    await page.goto(`${origin}/?voice=true&captureSource=voice&approved=true&processLocally=false`)
    await page.getByRole("dialog", { name: "Novo cliente", exact: true }).waitFor()
    // Explicit pack install, then dictation (simulated engine).
    await page.getByRole("button", { name: "Instalar voz local pt-BR" }).click()
    await page.getByRole("button", { name: "Ditar por voz" }).click()
    const config = await page.evaluate(() => ({ local: window.__rec.startedLocal, lang: window.__rec.startedLang }))
    assert.deepEqual(config, { local: true, lang: "pt-BR" })
    await page.evaluate(() => window.__say("novo cliente Lia", false))
    await expect.poll(() => page.getByLabel("Descreva o novo cliente").inputValue()).toBe("novo cliente Lia")
    assert.equal(await page.getByRole("button", { name: "Interpretar texto", exact: true }).isDisabled(), true)
    assert.equal(await page.getByText(/Ouvindo · 0:0\d de 0:30/).isVisible(), true)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
    await page.getByLabel("Descreva o novo cliente").scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(evidence, `voice-listening-${viewport.width}.png`), fullPage: true })
    await page.evaluate(() => window.__say("novo cliente Lia de Teste telefone 14 99999 8888 mora em Itaí", true))
    await page.getByRole("button", { name: "Parar ditado" }).click()
    assert.equal(await page.evaluate(() => window.__rec.stopped), true)
    await page.evaluate(() => window.__end())
    await expect.poll(() => page.getByLabel("Descreva o novo cliente").inputValue()).toBe("novo cliente Lia de Teste, telefone 14 99999 8888, mora em Itaí")
    assert.equal(await page.evaluate(() => window.__interpretations.length + window.__saves.length), 0)
    await page.getByRole("button", { name: "Interpretar texto", exact: true }).click()
    await page.getByLabel("Sugestão: Nome", { exact: true }).waitFor()
    assert.equal(await page.getByLabel("Sugestão: Nome", { exact: true }).inputValue(), "Lia de Teste")
    assert.equal(await page.getByLabel("Sugestão: CPF / CNPJ", { exact: true }).inputValue(), "")
    assert.deepEqual(await page.evaluate(() => window.__interpretations), [{ store: "loja-a", source: "voice" }])
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
    await page.screenshot({ path: path.join(evidence, `review-${viewport.width}.png`), fullPage: true })
    await page.getByLabel("Sugestão: Nome", { exact: true }).fill("Lia Corrigida de Teste")
    await page.getByRole("button", { name: "Aplicar aos campos vazios" }).click()
    assert.equal(await page.getByLabel("Nome *", { exact: true }).inputValue(), "Lia Corrigida de Teste")
    assert.equal(await page.getByLabel("Telefone / WhatsApp", { exact: true }).inputValue(), "(14) 99999-8888")
    assert.equal(await page.getByRole("button", { name: "Salvar cliente" }).isDisabled(), true)
    await page.getByRole("checkbox").check()
    await page.getByLabel("Cidade", { exact: true }).fill("Cidade de Teste")
    assert.equal(await page.getByRole("checkbox").isChecked(), false)
    await page.getByRole("checkbox").check()
    await page.getByRole("button", { name: "Salvar cliente" }).click()
    await expect.poll(() => page.evaluate(() => window.__saves.length)).toBe(1)
    assert.equal(await page.evaluate(() => /novo cliente|voice|transcri/i.test(JSON.stringify(window.__saves))), false)
    // Reopen: cancel a dictation, then a late engine event must not reach the editor.
    await page.getByRole("button", { name: "Novo cliente isolado" }).click()
    assert.equal(await page.getByLabel("Descreva o novo cliente").inputValue(), "")
    await page.getByRole("button", { name: "Ditar por voz" }).click()
    await page.evaluate(() => window.__say("SYNTHETIC-CANCELLED", true))
    await page.getByRole("button", { name: "Cancelar ditado" }).click()
    assert.equal(await page.evaluate(() => { const r = window.__rec; r.onresult?.({ resultIndex: 0, results: { length: 1, 0: { length: 1, isFinal: true, 0: { transcript: "SYNTHETIC-LATE" } } } }); return r.aborted }), true)
    assert.equal(await page.getByLabel("Descreva o novo cliente").inputValue(), "")
    // Store switch during dictation aborts the engine; the new store's editor starts clean.
    await page.getByRole("button", { name: "Ditar por voz" }).click()
    await page.evaluate(() => window.__say("SYNTHETIC-LOJA-A", true))
    const oldRec = await page.evaluateHandle(() => window.__rec)
    await page.evaluate(() => window.__switchStore())
    assert.equal(await oldRec.evaluate((r) => r.aborted), true)
    await page.getByRole("button", { name: "Ditar por voz" }).waitFor()
    assert.equal(await page.getByLabel("Descreva o novo cliente").inputValue(), "")
    assert.equal(await page.getByText(/SYNTHETIC-/).count(), 0)
    // Text path and stale interpretation after store switch remain covered.
    await page.evaluate(() => { window.__delayMs = 300 })
    await page.getByLabel("Descreva o novo cliente").fill("Lia Antiga de Teste")
    await page.getByRole("button", { name: "Interpretar texto", exact: true }).click()
    await page.getByRole("button", { name: "Cancelar", exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.__interpretations.length)).toBe(2)
    assert.equal(await page.evaluate(() => window.__saves.length), 1)
    const attempts = await page.evaluate(() => window.__voiceAttempts)
    assert.deepEqual([attempts.microphone, attempts.permissions, attempts.devices], [0, 0, 0])
    assert.deepEqual(attempts.install, [{ langs: ["pt-BR"], processLocally: true }])
    assert.ok(attempts.available.every((o) => o.processLocally === true && o.langs.join() === "pt-BR"))
    assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length]), [0, 0])
    assert.deepEqual(externalRequests, []); assert.deepEqual(errors, [])
    await page.close()

    // Generic (possibly remote) engine only: voice stays off and is never constructed.
    const generic = await browser.newPage({ viewport })
    const genericErrors = []
    generic.on("pageerror", (error) => genericErrors.push(error.message))
    await generic.addInitScript(instrument, "generic")
    await generic.goto(origin)
    await generic.getByRole("dialog", { name: "Novo cliente", exact: true }).waitFor()
    assert.equal(await generic.getByRole("button", { name: "Voz indisponível" }).isDisabled(), true)
    assert.equal(await generic.getByText(/pode enviar o áudio a serviços externos/).isVisible(), true)
    await generic.getByLabel("Descreva o novo cliente").fill("Nome: Lia de Teste")
    await generic.getByRole("button", { name: "Interpretar texto", exact: true }).click()
    await generic.getByLabel("Sugestão: Nome", { exact: true }).waitFor()
    const genericAttempts = await generic.evaluate(() => window.__voiceAttempts)
    assert.deepEqual([genericAttempts.constructed, genericAttempts.started, genericAttempts.microphone], [0, 0, 0])
    assert.deepEqual(await generic.evaluate(() => window.__interpretations), [{ store: "loja-a", source: "text" }])
    assert.deepEqual(genericErrors, [])
    await generic.close()

    results.push({
      viewport, engine: "SIMULATED_LOCAL", installExplicit: "PASS", startLocalPtBR: "PASS", liveTranscript: "PASS", stopToEditableTranscript: "PASS",
      interpretSource: "voice", review: "PASS", save: "SIMULATED_IO_ONLY", cancelDiscardsLateEvents: "PASS", storeSwitchAbortsEngine: "PASS",
      genericEngineRefused: "PASS", microphoneOrPermissionApiByApp: 0, forgedQueryIgnored: true, overflow: false,
      externalRequests: 0, storageEntries: 0, pageErrors: 0,
    })
  }
  await writeFile(path.join(evidence, "browser-smoke.json"), JSON.stringify({
    scope: "Actual editor/parser in Chromium; speech engine SIMULATED (no audio); Action I/O simulated; production DB writes 0",
    realRecognition: "NOT_COVERED_HERE",
    browser: `Playwright Chromium ${browser.version()}`,
    results,
  }, null, 2) + "\n")
  console.log(JSON.stringify({ browserSmoke: "PASS", viewports: results.length, engine: "SIMULATED_LOCAL", externalRequests: 0, productionDbWrites: 0 }))
} finally {
  await browser?.close()
  await server.close()
}
