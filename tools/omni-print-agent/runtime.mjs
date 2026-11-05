// OS-backed lease and durable host identities. No PID-only stale-lock deletion or taskkill /T.
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const helper = fileURLToPath(new URL('./runtime-windows.ps1', import.meta.url))
const powershell = path.join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')
// PowerShell 7 callers can otherwise inject incompatible built-in modules into the 5.1 host.
export const windowsEnv = { ...Object.fromEntries(Object.entries(process.env).filter(([key])=>key.toLowerCase()!=='psmodulepath')),
  PSModulePath: path.join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/Modules') }
export const psCommand = (args) => ({ command: powershell, args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helper, ...args] })
const failure = code => Object.assign(new Error(code), { code })

function firstReply(child, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const lines = createInterface({ input: child.stdout })
    const timer = setTimeout(() => { child.kill(); reject(failure('RUNTIME_HELPER_TIMEOUT')) }, timeoutMs)
    const fail = () => { clearTimeout(timer); lines.close(); reject(failure('RUNTIME_HELPER_FAILED')) }
    child.once('error', fail); child.once('exit', fail)
    lines.once('line', line => {
      clearTimeout(timer); lines.close(); child.removeListener('error', fail); child.removeListener('exit', fail)
      try { const result = JSON.parse(line); result.ok ? resolve(result) : reject(failure(result.code || 'RUNTIME_HELPER_FAILED')) }
      catch (e) { reject(e) }
    })
  })
}
export async function inspectProcess(pid, expectedStart) {
  if (!Number.isInteger(pid) || pid <= 0) throw failure('PROCESS_IDENTITY_UNPROVEN')
  if (process.platform === 'win32') {
    const cmd = psCommand(['-Operation', 'inspect', '-TargetPid', String(pid), ...(expectedStart ? ['-ExpectedStart', expectedStart] : [])])
    return firstReply(spawn(cmd.command, cmd.args, { windowsHide: true, env: windowsEnv, stdio: ['ignore', 'pipe', 'ignore'] }))
  }
  // Linux is used only by the synthetic CI harness. A boot ID disambiguates PID reuse across reboot.
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ')
    const started = readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim() + ':' + stat[19]
    return { ok: true, state: expectedStart && expectedStart !== started ? 'reused' : 'alive', pid, started }
  } catch (e) { if (e.code === 'ENOENT') return { ok: true, state: 'gone' }; throw failure('PROCESS_IDENTITY_UNPROVEN') }
}
export function durableRecord(file, record) {
  const fd = openSync(file, 'a')
  try { writeFileSync(fd, JSON.stringify(record) + '\n'); fsyncSync(fd) } finally { closeSync(fd) }
}
export async function recoverHosts(file) {
  if (!existsSync(file)) return
  const active = new Map()
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue
    let r
    try { r = JSON.parse(line) } catch { throw failure('HOST_REGISTRY_CORRUPT') }
    if (r.op === 'OPEN') active.set(r.nonce, r)
    else if (r.op === 'CLOSED') active.delete(r.nonce)
    else throw failure('HOST_REGISTRY_CORRUPT')
  }
  for (const r of active.values()) {
    if (process.platform !== 'win32' || !Number.isInteger(r.pid) || !r.started || !r.image || !r.nonce) throw failure('HOST_IDENTITY_UNPROVEN')
    const cmd = psCommand(['-Operation', 'reap', '-TargetPid', String(r.pid), '-ExpectedStart', r.started, '-ExpectedImage', r.image, '-HostNonce', r.nonce])
    const result = await firstReply(spawn(cmd.command, cmd.args, { windowsHide: true, env: windowsEnv, stdio: ['ignore', 'pipe', 'ignore'] }))
    if (!['gone', 'reused', 'reaped'].includes(result.state)) throw failure('HOST_EXIT_UNPROVEN')
    durableRecord(file, { op: 'CLOSED', nonce: r.nonce, recovery: result.state })
  }
}
export async function acquireLease(journalFile, { transport = path.basename(journalFile)==='journal.jsonl' } = {}) {
  mkdirSync(path.dirname(journalFile), { recursive: true })
  let cmd
  if (process.platform === 'win32') cmd = psCommand(['-Operation', 'lease', '-LeasePath', journalFile + '.guard', '-OwnerPath', journalFile + '.lock', '-TargetPid', String(process.pid)])
  else cmd = { command: 'flock', args: ['-n', journalFile + '.guard', process.execPath, '-e', 'process.stdout.write(JSON.stringify({ok:true})+"\\n");process.stdin.resume();process.stdin.on("end",()=>process.exit(0))'] }
  const child = spawn(cmd.command, cmd.args, { windowsHide: true, env: windowsEnv, stdio: ['pipe', 'pipe', 'ignore'] })
  child.stdin.on('error',()=>{})
  let alive = true
  child.on('exit', () => { alive = false }); child.on('error', () => { alive = false })
  let owner
  try { owner = await firstReply(child) } catch (e) { child.stdin.destroy(); if (process.platform !== 'win32' && child.exitCode === 1) throw failure('AGENT_ALREADY_RUNNING'); throw e }
  if (process.platform !== 'win32') owner = await inspectProcess(process.pid)
  const lock = journalFile + '.lock', nonce = randomUUID()
  const lease = {
    owner, nonce, alive: () => alive,
    release: async () => {
      if (process.platform !== 'win32' && existsSync(lock)) {
        let r
        try { r = JSON.parse(readFileSync(lock, 'utf8')) } catch { throw failure('LOCK_CHANGED') }
        if (r.nonce !== nonce) throw failure('LOCK_CHANGED')
        unlinkSync(lock)
      }
      if (!alive) return
      await new Promise(resolve => { child.once('exit', resolve); child.stdin.end(JSON.stringify({action:'release',nonce})+'\n') })
    },
  }
  try {
    const previous = process.platform === 'win32' ? owner.previous : existsSync(lock) ? readFileSync(lock, 'utf8') : ''
    delete owner.previous
    if (previous) {
      const raw = previous
      let old
      try { old = JSON.parse(raw) } catch { throw failure('LOCK_IDENTITY_UNPROVEN') }
      const pid = typeof old === 'number' ? old : old.pid
      if (old?.state !== 'RELEASED') {
        const state = await inspectProcess(pid, typeof old === 'object' ? old.started : undefined)
        if (state.state === 'alive') throw failure('AGENT_ALREADY_RUNNING')
      }
    }
    // Egress must be proven closed before Journal.recover can release UNKNOWN attempts.
    if (transport) await recoverHosts(journalFile + '.hosts.jsonl')
    const legacyScript = path.join(path.dirname(journalFile), 'omni-print-host.ps1')
    if (transport && process.platform === 'win32' && existsSync(legacyScript)) {
      // D03 hosts had no registry/parent monitor. Absence of a D04 record is never proof of closure.
      const cmd = psCommand(['-Operation', 'legacy-check', '-HostScript', legacyScript])
      await firstReply(spawn(cmd.command, cmd.args, { windowsHide: true, env: windowsEnv, stdio: ['ignore','pipe','ignore'] }))
    }
    const record = { version:2, ...owner, nonce }
    if (process.platform === 'win32') {
      const committed=firstReply(child)
      child.stdin.write(JSON.stringify({action:'commit',record})+'\n')
      await committed
    } else {
      // Synthetic Linux harness: reclaim only the stale record inspected under flock; always create exclusively.
      if (previous) { if (readFileSync(lock,'utf8')!==previous) throw failure('LOCK_CHANGED'); unlinkSync(lock) }
      const fd = openSync(lock,'wx')
      try { writeFileSync(fd,JSON.stringify(record)); fsyncSync(fd) } finally { closeSync(fd) }
    }
    return lease
  } catch (e) { child.stdin.end('\n'); throw e }
}
