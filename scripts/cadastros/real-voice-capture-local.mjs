/** REAL on-device recognition of SYNTHETIC speech through the actual client editor (CAD-R2-021).
 *
 * Device validation only — never in CI, never with real people's voices or data.
 *   node scripts/cadastros/real-voice-capture-local.mjs --profile <dir> [--wav <file>] [--allow-install] [--headed]
 *
 * - Installed Chrome (Playwright channel "chrome") with the on-device Web Speech API.
 * - `--profile`: disposable Chrome profile. The pt-BR on-device pack must already be there, or
 *   `--allow-install` lets Chrome download the speech model from the browser vendor (explicit,
 *   separate authorization; no audio or form data is sent by that download).
 * - `--wav`: synthetic speech. Without it, on Windows, a pt-BR SAPI voice synthesizes the phrase locally.
 * - Recognition runs with the browser network blocked by a dead proxy (loopback still served): a
 *   transcript under that condition shows the audio was processed on the device.
 * Server Actions are simulated in-page (real parser); zero DB, zero application network.
 */
import { chromium } from "@playwright/test"
import { execFileSync } from "node:child_process"
import { mkdir, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { applicationCss, buildClienteEditorBundle, serveHarness } from "./cliente-editor-harness.mjs"

const PHRASE = "Novo cliente Lia de Teste. Telefone 1 4 9 9 9 9 9 8 8 8 8. Mora em Itaí."
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined }
const flag = (name) => process.argv.includes(name)
const profile = arg("--profile")
if (!profile) throw new Error("--profile <disposable Chrome profile dir> is required")
const root = process.cwd()
const evidence = path.join(root, "docs/ai-execution/_evidence/CAD-R2-021-CLIENTE-TEXTO-VOZ")
await mkdir(evidence, { recursive: true })
await mkdir(profile, { recursive: true })

async function synthesize() {
  if (arg("--wav")) return { wav: path.resolve(arg("--wav")), voice: "provided-wav" }
  if (process.platform !== "win32") throw new Error("Provide --wav with synthetic speech (SAPI synthesis is Windows-only)")
  const wav = path.join(profile, "synthetic-pt-br.wav")
  const ps = [
    "Add-Type -AssemblyName System.Speech",
    "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
    "$v = $s.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq 'pt-BR' } | Select-Object -First 1",
    "if (-not $v) { throw 'No pt-BR SAPI voice installed' }",
    "$s.SelectVoice($v.VoiceInfo.Name); $s.Rate = -1",
    "$f = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)",
    `$s.SetOutputToWaveFile('${wav.replace(/'/g, "''")}', $f)`,
    "$p = New-Object System.Speech.Synthesis.PromptBuilder([Globalization.CultureInfo]'pt-BR')",
    "$p.AppendBreak([TimeSpan]::FromMilliseconds(800))",
    `$p.AppendText('${PHRASE.replace(/'/g, "''")}')`,
    "$p.AppendBreak([TimeSpan]::FromMilliseconds(2500))",
    "$s.Speak($p); $s.Dispose(); $v.VoiceInfo.Name",
  ].join("; ")
  const voice = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { encoding: "utf8" }).trim()
  return { wav, voice }
}

/** Observe-only: records the engine configuration at start; behaviour unchanged. */
function observeEngine() {
  window.__engineStarts = []
  const C = window.SpeechRecognition ?? window.webkitSpeechRecognition
  if (!C) return
  const start = C.prototype.start
  C.prototype.start = function (...a) { window.__engineStarts.push({ processLocally: this.processLocally, lang: this.lang }); return start.apply(this, a) }
}

const { wav: wavPath, voice: ttsVoice } = await synthesize()
const wavBytes = (await stat(wavPath)).size
const wavSeconds = Math.max(1, (wavBytes - 44) / (16000 * 2))
const server = await serveHarness({ js: await buildClienteEditorBundle(root), css: await applicationCss(root) })
const fakeAudio = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${wavPath}%noloop`]
const launch = (offline) => chromium.launchPersistentContext(profile, {
  channel: "chrome", headless: !flag("--headed"), permissions: ["microphone"],
  args: [...fakeAudio, ...(offline ? ["--proxy-server=http://127.0.0.1:9"] : [])],
})
const report = {
  checkedAt: new Date().toISOString(), os: `${os.type()} ${os.release()}`, synthetic: true, phrase: PHRASE,
  ttsVoice, wavSeconds: Number(wavSeconds.toFixed(1)), installAllowed: flag("--allow-install"),
}
const supportOf = (page) => page.evaluate(async () => {
  const C = window.SpeechRecognition ?? window.webkitSpeechRecognition
  return typeof C?.available === "function" ? await C.available({ langs: ["pt-BR"], processLocally: true }) : "NO_LOCAL_API"
})

try {
  // Phase 1 (network allowed): availability and, only if authorized, the explicit pack install.
  let ctx = await launch(false)
  let page = await ctx.newPage()
  await page.goto(server.origin)
  report.browser = await page.evaluate(async () => (await navigator.userAgentData?.getHighEntropyValues(["fullVersionList"]))?.fullVersionList?.map((b) => `${b.brand} ${b.version}`).join(", ") ?? navigator.userAgent)
  report.availabilityBefore = await supportOf(page)
  if (report.availabilityBefore === "downloadable" && flag("--allow-install")) {
    await page.getByRole("button", { name: "Instalar voz local pt-BR" }).click()
    await page.getByRole("button", { name: "Ditar por voz" }).waitFor({ timeout: 10 * 60_000 })
    report.installPerformed = true
  }
  report.availabilityAfterInstallPhase = await supportOf(page)
  await ctx.close()
  if (report.availabilityAfterInstallPhase !== "available") {
    report.result = "NOT_RUN_LOCAL_PACK_UNAVAILABLE"
    throw Object.assign(new Error(`pt-BR on-device pack is ${report.availabilityAfterInstallPhase}`), { expected: true })
  }

  // Phase 2 (browser network blocked): real dictation through the editor.
  ctx = await launch(true)
  const probe = await ctx.newPage()
  report.browserNetworkBlocked = await probe.goto("https://www.gstatic.com/generate_204", { timeout: 15_000 }).then(() => false, (e) => /ERR_PROXY|ERR_TUNNEL|ERR_CONNECTION/.test(String(e)))
  await probe.close()
  if (!report.browserNetworkBlocked) throw new Error("Dead proxy did not block the browser network; refusing to capture")
  page = await ctx.newPage()
  const external = [], consoleTexts = [], pageErrors = []
  page.on("request", (r) => { if (!r.url().startsWith(server.origin)) external.push(r.url()) })
  page.on("console", (m) => consoleTexts.push(m.text()))
  page.on("pageerror", (e) => pageErrors.push(e.message))
  await page.addInitScript(observeEngine)
  await page.goto(server.origin)
  await page.getByRole("button", { name: "Ditar por voz" }).click()
  const startedAt = Date.now()
  await page.waitForTimeout(Math.ceil(wavSeconds * 1000) + 1500)
  if (await page.getByRole("button", { name: "Parar ditado" }).isEnabled().catch(() => false)) await page.getByRole("button", { name: "Parar ditado" }).click()
  await page.getByRole("button", { name: "Ditar por voz" }).waitFor({ timeout: 20_000 })
  report.captureMs = Date.now() - startedAt
  report.engineStarts = await page.evaluate(() => window.__engineStarts)
  report.statusMessage = await page.locator("[aria-live=polite]").first().innerText()
  report.transcriptInEditor = await page.getByLabel("Descreva o novo cliente").inputValue()
  report.autoInterpretedOrSaved = await page.evaluate(() => window.__interpretations.length + window.__saves.length)
  if (report.transcriptInEditor.trim()) {
    await page.getByRole("button", { name: "Interpretar texto", exact: true }).click()
    await page.getByLabel("Sugestão: Nome", { exact: true }).waitFor()
    report.interpretations = await page.evaluate(() => window.__interpretations)
    report.suggestion = {}
    for (const label of ["Nome", "Telefone / WhatsApp", "CPF / CNPJ", "Cidade"]) report.suggestion[label] = await page.getByLabel(`Sugestão: ${label}`, { exact: true }).inputValue()
  }
  await page.screenshot({ path: path.join(evidence, "real-voice-capture.png"), fullPage: true })
  report.externalPageRequests = external.length
  report.storageEntries = await page.evaluate(() => localStorage.length + sessionStorage.length)
  report.consoleMentionsTranscript = consoleTexts.some((t) => /Lia|Itaí|9999/.test(t))
  report.pageErrors = pageErrors
  await ctx.close()
  const local = report.engineStarts?.length === 1 && report.engineStarts[0].processLocally === true && report.engineStarts[0].lang === "pt-BR"
  report.result = local && report.transcriptInEditor.trim() && report.autoInterpretedOrSaved === 0 && !external.length && !report.storageEntries && !pageErrors.length
    ? "PASS_REAL_LOCAL_RECOGNITION_SYNTHETIC_SPEECH" : "FAIL"
} catch (error) {
  report.result ??= "ERROR"
  if (!error.expected) report.error = String(error).slice(0, 300)
} finally {
  await server.close()
  report.limitations = [
    "Synthetic TTS speech via fake audio device; not a human voice, accent, noise or a physical microphone.",
    "One Chrome build on this host; other devices/browsers need their own availability check (the app re-checks on every terminal).",
    "Browser-internal behaviour is observed through the spec contract (processLocally) plus the blocked-network condition, not by inspecting Chrome internals.",
  ]
  await writeFile(path.join(evidence, "real-voice-capture.json"), JSON.stringify(report, null, 2) + "\n")
  console.log(JSON.stringify({ realVoiceCapture: report.result, transcript: report.transcriptInEditor ?? null }))
}
