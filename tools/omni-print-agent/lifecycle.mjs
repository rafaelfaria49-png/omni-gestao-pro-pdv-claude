import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Agent } from './agent.mjs'
import { AGENT_VERSION, createClient, normalizeServerUrl } from './protocol.mjs'
import { acquireLease } from './runtime.mjs'
import { WindowsSpooler } from './spooler-windows.mjs'

export function checkRuntime(platform = process.platform, version = process.versions.node) {
  if (platform !== 'win32') throw new Error('WINDOWS_REQUIRED')
  const [major, minor] = version.split('.').map(Number)
  if (major !== 24 || minor < 12) throw new Error('NODE_24_LTS_REQUIRED')
}
export function secureServer(raw) {
  const url = normalizeServerUrl(raw)
  if (!url.startsWith('https://')) throw new Error('SERVER_URL_MUST_BE_HTTPS')
  return url
}
export function saveNewJson(file, value) {
  const fd = openSync(file, 'wx', 0o600)
  try { writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fsyncSync(fd) } finally { closeSync(fd) }
}
export async function runCli(cmd, arg, { configDir, configFile, spooler: injectedSpooler, fetchImpl, platform, version } = {}) {
  checkRuntime(platform, version)
  mkdirSync(configDir, { recursive: true })
  const journalFile = path.join(configDir, 'journal.jsonl')
  const haltFile = path.join(configDir, 'halt.json')
  const lease = await acquireLease(journalFile)
  const spooler = injectedSpooler ?? new WindowsSpooler({ dir: configDir, registryFile: journalFile + '.hosts.jsonl', parentStarted: lease.owner.started })
  let agent = null
  const halt = reason => { if (!existsSync(haltFile)) saveNewJson(haltFile, { reason, at: new Date().toISOString() }) }
  try {
    if (cmd === 'printers') { console.log(JSON.stringify(await spooler.listPrinters(), null, 2)); return }
    if (cmd === 'pair') {
      // Check before consuming a code. The OS lease serializes pairing with run/maintenance.
      if (existsSync(configFile) || existsSync(path.join(configDir, 'pairing.pending.json'))) throw new Error('ALREADY_PAIRED_OR_PENDING')
      const serverUrl = secureServer(arg('server')), code = arg('code')
      if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(code ?? '')) throw new Error('PAIR_CODE_REQUIRED')
      saveNewJson(path.join(configDir, 'pairing.pending.json'), { at: new Date().toISOString(), serverUrl })
      const r = await createClient({ serverUrl, fetchImpl })('/api/print/agent/pair', { code, agentVersion: AGENT_VERSION })
      const cfg = { serverUrl, installationId: r.installationId, storeId: r.storeId, ownerSid: lease.owner.sid, token: await spooler.protect(r.token) }
      // The pending record remains as history. Failure leaves pairing blocked for operator reconciliation.
      saveNewJson(configFile, cfg)
      console.log('PAIRED_DPAPI_CURRENT_USER')
      return
    }
    if (cmd === 'run' || cmd === 'diagnose') {
      if (!existsSync(configFile)) throw new Error('PAIRING_REQUIRED')
      const cfg = JSON.parse(readFileSync(configFile, 'utf8'))
      const serverUrl = secureServer(cfg.serverUrl)
      if (cfg.ownerSid && cfg.ownerSid !== lease.owner.sid) throw new Error('WINDOWS_USER_MISMATCH')
      if (!cfg.installationId || !cfg.storeId || typeof cfg.token !== 'string') throw new Error('CONFIG_INVALID')
      const token = await spooler.unprotect(cfg.token)
      if (cmd === 'diagnose') { console.log(JSON.stringify({ status: 'PASS', credential: 'DPAPI_CURRENT_USER_OK', agentVersion: AGENT_VERSION, paired: true })); return }
      if (existsSync(haltFile)) { console.log('HALTED_REQUIRES_OPERATOR'); return }
      agent = new Agent({ serverUrl, token, fetchImpl, spooler, journalFile, lease, shouldStop: () => existsSync(haltFile),
        log: e => console.log(new Date().toISOString(), JSON.stringify(e)) })
      const stop = () => { halt('INTENTIONAL'); agent.stop() }
      process.once('SIGINT', stop); process.once('SIGTERM', stop)
      try { const reason = await agent.run(); halt(reason) }
      finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop) }
      return
    }
    throw new Error('USAGE_PRINTERS_PAIR_RUN_DIAGNOSE')
  } catch (e) {
    if (cmd === 'run' && e?.message !== 'AGENT_ALREADY_RUNNING') halt('FATAL')
    throw e
  } finally {
    if (!agent) { await spooler.close(); await lease.release() }
  }
}
