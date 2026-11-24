/** Real built PWA + Next server, anonymous print API, isolated browser. No pairing, sale or printer. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { createServer, request } from 'node:http'
import { chromium } from 'playwright'

assert(existsSync('.next/BUILD_ID') && existsSync('public/sw.js'), 'BUILD_REQUIRED')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const portProbe = createServer()
portProbe.listen(0, '127.0.0.1'); await once(portProbe, 'listening')
const backendPort = portProbe.address().port
await new Promise(resolve => portProbe.close(resolve))
let offline = false, browser, nextLog = ''
const next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(backendPort)], {
  windowsHide: true,
  env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP,
    NODE_ENV: 'production', DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/isolated', DIRECT_URL: 'postgresql://test:test@127.0.0.1:1/isolated',
    MIGRATION_AUTHORITY_ENABLED: 'false', OMNI_PRINT_DIRECT_ENABLED: '0', OMNI_PRINT_DIRECT_LAB: '0',
    AUTH_SECRET: 'synthetic-sw-proof-no-real-accounts', AUTH_TRUST_HOST: 'true', NEXT_TELEMETRY_DISABLED: '1' },
})
for (const stream of [next.stdout, next.stderr]) stream.on('data', bytes => { nextLog = (nextLog + bytes).slice(-100_000) })
// This proxy drops requests from BOTH page and worker. Playwright setOffline alone does not cover worker requests.
const proxy = createServer((req, res) => {
  if (offline) { req.socket.destroy(); return }
  const upstream = request({ host: '127.0.0.1', port: backendPort, method: req.method, path: req.url, headers: req.headers }, incoming => {
    res.writeHead(incoming.statusCode, incoming.headers); incoming.pipe(res)
  })
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end() })
  req.pipe(upstream)
})
proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening')
const origin = `http://127.0.0.1:${proxy.address().port}`
try {
  let ready = false
  for (let i = 0; i < 120; i++) {
    if (next.exitCode !== null) throw new Error('NEXT_START_FAILED\n' + nextLog)
    try { const response = await fetch(origin + '/api/print/direct/terminal-status', { signal: AbortSignal.timeout(1500) }); ready = response.status === 404 } catch { /* startup only */ }
    if (ready) break
    await sleep(500)
  }
  assert(ready, 'NEXT_NOT_READY\n' + nextLog)
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ serviceWorkers: 'allow' })
  const page = await context.newPage()
  await page.goto(origin + '/login', { waitUntil: 'domcontentloaded' })
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js')
    await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('SW_INSTALL_TIMEOUT')), 60_000))])
  })
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, { timeout: 30_000 })
  const online = await page.evaluate(async () => {
    const url = location.origin + '/api/print/direct/terminal-status?terminalId=synthetic-sw'
    const cached = await caches.open('apis')
    await cached.put(url, new Response(JSON.stringify({ ok: true, store: 'SYNTHETIC_A_CACHE_SENTINEL' }), { headers: { 'Content-Type': 'application/json' } }))
    const response = await fetch(url, { headers: { 'x-assistec-loja-id': 'synthetic-b' } })
    return { status: response.status, body: await response.json(), controlled: !!navigator.serviceWorker.controller }
  })
  assert.equal(online.status, 404)
  assert.equal(online.body.error, 'DIRECT_PRINT_DISABLED')
  assert.equal(online.controlled, true)
  offline = true
  const disconnected = await page.evaluate(async () => {
    const url = location.origin + '/api/print/direct/terminal-status?terminalId=synthetic-sw'
    const sentinelRemains = !!await (await caches.open('apis')).match(url)
    try { const response = await fetch(url, { headers: { 'x-assistec-loja-id': 'synthetic-b' } }); return { sentinelRemains, networkFailed: false, status: response.status } }
    catch { return { sentinelRemains, networkFailed: true } }
  })
  assert.equal(disconnected.sentinelRemains, true)
  assert.equal(disconnected.networkFailed, true, 'PRINT_API_USED_CACHED_RESPONSE_WHILE_OFFLINE')
  console.log(JSON.stringify({ result: 'PASS', worker: 'public/sw.js_FROM_ACTUAL_NEXT_BUILD', online, disconnected,
    serviceWorkers: 'allow', offlineMechanism: 'PROXY_DROPS_PAGE_AND_WORKER_CONNECTIONS', authenticatedPdv: false, physicalPrint: false }))
} finally {
  await browser?.close()
  proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve))
  if (next.exitCode === null) { const ended = once(next, 'exit'); next.kill(); await ended }
}
