/** Metadata-only probe; never construct/start speech, request mic or install packs. */
import { chromium } from "@playwright/test"
/** What the client editor does for each on-device answer (CAD-R2-021 local-only policy). */
const ptBRBehaviour = (ptBR) => ptBR === "available" ? "DICTATION_OFFERED" : ptBR === "downloadable" ? "EXPLICIT_INSTALL_OFFERED" : "TEXT_ONLY"
import { createServer } from "node:http"
import { mkdir, writeFile } from "node:fs/promises"

const server = createServer((_, response) => {
  response.setHeader("Content-Type", "text/html")
  response.setHeader("Cache-Control", "no-store")
  response.setHeader("Permissions-Policy", "microphone=(), on-device-speech-recognition=(self)")
  response.end("<!doctype html><title>Synthetic metadata-only compatibility probe</title>")
})
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
const origin = `http://127.0.0.1:${server.address().port}`
let browser
try {
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ permissions: [] })
  let blockedPageRequests = 0
  await context.route("**/*", (route) => {
    if (route.request().url().startsWith(`${origin}/`)) return route.continue()
    blockedPageRequests++
    return route.abort()
  })
  const page = await context.newPage()
  await page.goto(origin)
  const result = await page.evaluate(async () => {
    const ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition
    const hasLocalProperty = !!ctor && "processLocally" in ctor.prototype
    const hasAvailable = typeof ctor?.available === "function"
    const hasInstall = typeof ctor?.install === "function"
    let ptBR = "NOT_CHECKABLE"
    if (hasLocalProperty && hasAvailable) {
      let timer
      try {
        ptBR = await Promise.race([
          ctor.available({ langs: ["pt-BR"], processLocally: true }),
          new Promise((resolve) => { timer = setTimeout(() => resolve("TIMEOUT"), 5000) }),
        ])
      } catch { ptBR = "QUERY_REJECTED" }
      finally { clearTimeout(timer) }
    }
    return { secureContext: isSecureContext, genericRecognitionExposed: !!ctor, hasLocalProperty, hasAvailable, hasInstall, ptBR }
  })
  const evidence = "docs/ai-execution/_evidence/CAD-R2-021-CLIENTE-TEXTO-VOZ"
  await mkdir(evidence, { recursive: true })
  await writeFile(`${evidence}/voice-compatibility.json`, JSON.stringify({
    checkedAt: new Date().toISOString(), browser: `Playwright Chromium ${browser.version()}`, ...result,
    blockedPageRequests, microphonePolicy: "denied", engineConstructed: false, audioCaptureStarted: false,
    languagePacksInstalledByAgent: false, productIntegration: "LOCAL_ONLY_PROCESS_LOCALLY_PT_BR",
    productBehaviour: ptBRBehaviour(result.ptBR), recognitionAccuracy: "NOT_TESTED_BY_THIS_PROBE",
    limitation: "Metadata availability is not proof of usable pt-BR recognition on operator devices; real recognition is a separate device validation (real-voice-capture-local.mjs).",
  }, null, 2) + "\n")
  console.log(JSON.stringify({ voiceCompatibilityProbe: "RECORDED_WITHOUT_CAPTURE", ptBR: result.ptBR, productBehaviour: ptBRBehaviour(result.ptBR) }))
} finally {
  await browser?.close()
  await new Promise((resolve) => server.close(resolve))
}
