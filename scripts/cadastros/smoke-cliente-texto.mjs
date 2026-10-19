/** Browser smoke of the actual HUB editor. Only Action I/O is simulated.
 * Requires npm run build for the actual application CSS. No auth bypass or DB.
 */
import { build } from "esbuild"
import { chromium, expect } from "@playwright/test"
import { createServer } from "node:http"
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import assert from "node:assert/strict"

const root = process.cwd()
const evidence = path.join(root, "docs/ai-execution/_evidence/CAD-R2-021-CLIENTE-TEXTO-VOZ")
await mkdir(evidence, { recursive: true })
const bundle = await build({
  stdin: { resolveDir: root, loader: "tsx", contents: `
    import React,{useState} from 'react'; import {createRoot} from 'react-dom/client';
    import {ClienteEditorDialog} from '@/components/cadastros/lovable/components/cadastros/ClienteEditor';
    window.__saves=[]; window.__interpretations=0; window.__delayMs=0;
    function App(){const [open,setOpen]=useState(true);const [store,setStore]=useState('loja-a');
      window.__switchStore=()=>setStore('loja-b');
      return <main className="p-6"><h1>Smoke isolado do editor real de Clientes</h1>
        <button onClick={()=>setOpen(true)}>Novo cliente isolado</button>
        <ClienteEditorDialog key={store} open={open} storeId={store} editing={null}
          onClose={()=>setOpen(false)} onSaved={()=>setOpen(false)}/></main>}
    createRoot(document.getElementById('root')).render(<App/>);` },
  bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "isolated-actions", setup(api) {
    api.onResolve({ filter: /^@\/app\/actions\/cliente-texto-livre$/ }, () => ({ path: "actions", namespace: "isolated" }))
    api.onLoad({ filter: /.*/, namespace: "isolated" }, () => ({ resolveDir: root, contents: `
      import {interpretarTextoCliente} from '@/lib/cadastros/natural-text/cliente';
      export async function interpretarClienteTextoLivre(store,text,source){
        if(source!=='text')throw new Error('Voice forbidden');
        await new Promise(r=>setTimeout(r,window.__delayMs));
        window.__interpretations++;return {ok:true,sugestao:interpretarTextoCliente(text)};
      }
      export async function salvarClienteRevisado(store,id,values,confirmed){
        if(!confirmed)throw new Error('Review required');
        window.__saves.push({store,id,values,confirmed});return {ok:true,id:'synthetic'};
      }` }))
  } }],
})
const cssDir = path.join(root, ".next/static/css")
const css = (await Promise.all((await readdir(cssDir)).filter((f) => f.endsWith(".css")).map((f) => readFile(path.join(cssDir, f), "utf8")))).join("\n")
const server = createServer((req, res) => {
  res.setHeader("Cache-Control", "no-store")
  if (req.url === "/bundle.js") { res.setHeader("Content-Type", "text/javascript"); res.end(bundle.outputFiles[0].text) }
  else if (req.url === "/style.css") { res.setHeader("Content-Type", "text/css"); res.end(css) }
  else {
    res.setHeader("Content-Type", "text/html; charset=utf-8")
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'")
    res.end('<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><title>Cliente isolated smoke</title></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>')
  }
})
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
const origin = `http://127.0.0.1:${server.address().port}`
let browser
const results = []
try {
  browser = await chromium.launch({ headless: true })
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
    const page = await browser.newPage({ viewport })
    const errors = [], externalRequests = []
    page.on("pageerror", (error) => errors.push(error.message))
    page.on("request", (req) => { if (!req.url().startsWith(origin)) externalRequests.push(req.url()) })
    // Fail the real browser smoke if rendering or clicking the blocked control
    // even consults speech engines, permission APIs or microphone devices.
    await page.addInitScript(() => {
      window.__voiceAttempts = { speech: 0, microphone: 0, permissions: 0, devices: 0 }
      for (const name of ["SpeechRecognition", "webkitSpeechRecognition"]) {
        Object.defineProperty(window, name, { configurable: true, get() {
          window.__voiceAttempts.speech++
          throw new Error("Blocked client path consulted speech recognition")
        } })
      }
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
        getUserMedia() { window.__voiceAttempts.microphone++; throw new Error("Microphone forbidden") },
        enumerateDevices() { window.__voiceAttempts.devices++; throw new Error("Device enumeration forbidden") },
      } })
      Object.defineProperty(navigator, "permissions", { configurable: true, value: {
        query() { window.__voiceAttempts.permissions++; throw new Error("Permission query forbidden") },
      } })
    })
    await page.goto(`${origin}/?voice=true&captureSource=voice&approved=true`)
    await page.getByRole("dialog", { name: "Novo cliente", exact: true }).waitFor()
    assert.equal(await page.getByRole("button", { name: "Voz indisponível" }).isDisabled(), true)
    await page.getByLabel("Descreva o novo cliente").fill("Novo cliente Lia de Teste, telefone 14999998888, mora em Itaí")
    await page.getByRole("button", { name: "Interpretar texto", exact: true }).click()
    await page.getByLabel("Sugestão: Nome", { exact: true }).waitFor()
    assert.equal(await page.getByLabel("Sugestão: Nome", { exact: true }).inputValue(), "Lia de Teste")
    assert.equal(await page.getByLabel("Sugestão: CPF / CNPJ", { exact: true }).inputValue(), "")
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
    assert.equal(await page.evaluate(() => JSON.stringify(window.__saves).includes("Novo cliente")), false)
    await page.getByRole("button", { name: "Novo cliente isolado" }).click()
    assert.equal(await page.getByLabel("Descreva o novo cliente").inputValue(), "")
    await page.evaluate(() => { window.__delayMs = 300 })
    await page.getByLabel("Descreva o novo cliente").fill("Lia Antiga de Teste")
    await page.getByRole("button", { name: "Interpretar texto", exact: true }).click()
    await page.evaluate(() => window.__switchStore())
    await expect.poll(() => page.evaluate(() => window.__interpretations)).toBe(2)
    assert.equal(await page.getByLabel("Descreva o novo cliente").inputValue(), "")
    assert.equal(await page.getByLabel("Sugestão: Nome", { exact: true }).count(), 0)
    await page.getByRole("button", { name: "Cancelar", exact: true }).click()
    assert.equal(await page.evaluate(() => window.__saves.length), 1)
    assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length]), [0, 0])
    assert.deepEqual(await page.evaluate(() => window.__voiceAttempts), { speech: 0, microphone: 0, permissions: 0, devices: 0 })
    assert.deepEqual(externalRequests, []); assert.deepEqual(errors, [])
    results.push({ viewport, review: "PASS", save: "SIMULATED_IO_ONLY", staleStoreResponse: "PASS", cancelWithoutWrite: "PASS", voiceApiAttempts: 0, forgedQueryIgnored: true, overflow: false, externalRequests: 0, storageEntries: 0, pageErrors: 0 })
    await page.close()
  }
  await writeFile(path.join(evidence, "browser-smoke.json"), JSON.stringify({ scope: "Actual editor/parser; Action I/O simulated; production DB writes 0", results }, null, 2) + "\n")
  console.log(JSON.stringify({ browserSmoke: "PASS", viewports: results.length, externalRequests: 0, productionDbWrites: 0 }))
} finally {
  await browser?.close()
  await new Promise((resolve) => server.close(resolve))
}
