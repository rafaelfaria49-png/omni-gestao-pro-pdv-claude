import { afterEach, describe, expect, it } from 'vitest'
import { appendFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { fork, spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { createHash, randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { Agent } from '../omni-print-agent/agent.mjs'
import { Journal, PHASE } from '../omni-print-agent/journal.mjs'
import { FakeSpooler } from '../omni-print-agent/spooler-fake.mjs'
import { WindowsSpooler } from '../omni-print-agent/spooler-windows.mjs'
import { acquireLease, durableRecord, inspectProcess, recoverHosts, windowsEnv } from '../omni-print-agent/runtime.mjs'
import { checkRuntime, runCli, secureServer } from '../omni-print-agent/lifecycle.mjs'
import { restartDecision, supervise } from '../omni-print-agent/supervisor.mjs'
import { buildPackage } from './package.mjs'

const temp = () => mkdtempSync(path.join(os.tmpdir(), 'omni-print-d04-'))
const bytes = Buffer.from([65,10,29,86,0])
const dispatch = { sendKey: 'synthetic-key', attemptId: 'synthetic-attempt', printerName: 'POS-80 (simulada)', documentLabel: 'synthetic',
  payloadBase64: bytes.toString('base64'), payloadHash: createHash('sha256').update(bytes).digest('hex') }
const response = (body: object, status = 200) => new Response(JSON.stringify(body), { status })
const cleanups: (() => Promise<unknown> | void)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const make = (journalFile: string, extra: Record<string, unknown> = {}) => new Agent({ serverUrl: 'http://127.0.0.1:1', token: 'synthetic', journalFile, spooler: new FakeSpooler(), ...extra })

describe('D04 recovery invariants', { timeout: 120_000 }, () => {
  it('runtime Windows/Node 24 and HTTPS enforced at the installed CLI boundary', () => {
    expect(() => checkRuntime('win32','24.12.0')).not.toThrow()
    for (const [platform, version] of [['linux','24.22.1'],['win32','20.0.0'],['win32','26.0.0'],['win32','24.11.0']] as const) expect(() => checkRuntime(platform,version)).toThrow()
    expect(secureServer('https://synthetic.example/')).toBe('https://synthetic.example')
    expect(() => secureServer('http://127.0.0.1:1')).toThrow('SERVER_URL_MUST_BE_HTTPS')
  })
  it('an existing lock prevents even the repair of a torn journal tail', () => {
    const f = path.join(temp(),'journal.jsonl'); writeFileSync(f,'{"unfinished":')
    writeFileSync(f+'.lock',String(process.pid))
    expect(() => make(f)).toThrow('AGENT_ALREADY_RUNNING')
    expect(readFileSync(f,'utf8')).toBe('{"unfinished":')
  })
  it('interior corruption and invalid records fail closed, preserving all bytes', () => {
    for (const bad of ['not-json\n{}\n','{"phase":"ACCEPTED"}\n']) {
      const f = path.join(temp(),'journal.jsonl'); writeFileSync(f,bad)
      expect(() => new Journal(f)).toThrow('JOURNAL_CORRUPT'); expect(readFileSync(f,'utf8')).toBe(bad)
    }
  })
  it('torn final write is retained with its hash and recovered UNKNOWN survives repeated startups', () => {
    const f = path.join(temp(),'journal.jsonl'); new Journal(f).append({ sendKey: dispatch.sendKey, attemptId: dispatch.attemptId, phase: PHASE.SUBMITTING })
    appendFileSync(f,'{"unfinished":')
    const j = new Journal(f); j.recover()
    expect(new Journal(f).get(dispatch.sendKey)).toMatchObject({ phase: PHASE.UNKNOWN, reason: 'AGENT_RESTARTED' })
    expect(readFileSync(f,'utf8')).toContain('{"unfinished":\n{"phase":"TORN_TAIL"')
  })
  it('uncertain print never resubmits, including another attempt ID', async () => {
    const f = path.join(temp(),'journal.jsonl'), sp = new FakeSpooler()
    new Journal(f).append({ sendKey: dispatch.sendKey, attemptId: dispatch.attemptId, phase: PHASE.SUBMITTING })
    const a = make(f,{ spooler: sp }); cleanups.push(() => a.releaseLock())
    await a.handle(dispatch); await a.handle({ ...dispatch, attemptId:'another-attempt' })
    expect(sp.spooled).toHaveLength(0); expect(a.journal.get(dispatch.sendKey).phase).toBe(PHASE.UNKNOWN)
  })
  it('network disconnect reconnects without resubmitting and revocation closes the host and lock', async () => {
    let calls = 0, closed = false
    const f = path.join(temp(),'journal.jsonl'), sp = Object.assign(new FakeSpooler(), { close: async () => { closed = true; return true } })
    const a = make(f,{ spooler: sp, fetchImpl: async () => { calls++; if(calls===1) throw new TypeError('synthetic network failure'); return response({ ok:false,error:'AGENT_REVOKED' },401) } })
    expect(await a.run({ pollMs:1,heartbeatMs:1 })).toBe('REVOKED')
    expect(calls).toBe(2); expect(closed).toBe(true); expect(existsSync(f+'.lock')).toBe(false)
  })
  it('revocation after the first dispatch prevents every later dispatch in the batch', async () => {
    const sp = new FakeSpooler(), f = path.join(temp(),'journal.jsonl')
    const a = make(f,{ spooler:sp, fetchImpl:async (url: string) => url.endsWith('heartbeat') ? response({ok:true}) : url.endsWith('claim') ?
      response({ok:true,dispatches:[dispatch,{...dispatch,sendKey:'second-key',attemptId:'second-attempt'}]}) : response({ok:false,error:'AGENT_REVOKED'},401) })
    expect(await a.run({ pollMs:1 })).toBe('REVOKED')
    expect(sp.spooled).toHaveLength(1); expect(a.journal.unreported()).toHaveLength(1)
  })
  it('unavailable or blocked simulated printer proves no effect before any bytes', async () => {
    for (const patch of [{online:false},{paused:true},{serviceUp:false}]) {
      const sp = new FakeSpooler(), a = make(path.join(temp(),'j'),{spooler:sp}); cleanups.push(() => a.releaseLock())
      Object.assign(sp.printers.get('POS-80 (simulada)')!,patch)
      if ('serviceUp' in patch) sp.serviceUp=false
      await a.handle(dispatch); expect(sp.spooled).toHaveLength(0); expect(a.journal.get(dispatch.sendKey).phase).toBe(PHASE.NO_EFFECT)
    }
  })
  it('fatal local failure leaves a durable journal and releases the lock after host close', async () => {
    const f=path.join(temp(),'j'), a=make(f,{ fetchImpl:async()=>{throw new Error('LOCAL_FATAL')} })
    await expect(a.run({pollMs:1})).rejects.toThrow('LOCAL_FATAL')
    expect(existsSync(f+'.lock')).toBe(false)
  })
  it('fatal/revoked/intentional stops do not restart; transient failure has a finite budget', () => {
    for(const exit of [0,65]) expect(restartDecision({exit,signal:null,halted:false,starts:[]})).toBe('STOP')
    expect(restartDecision({exit:1,signal:null,halted:true,starts:[]})).toBe('STOP')
    expect(restartDecision({exit:1,signal:null,halted:false,starts:[]})).toBe('RETRY')
    expect(restartDecision({exit:1,signal:null,halted:false,starts:Array(4).fill(Date.now())})).toBe('EXHAUSTED')
  })
  it('supervisor really restarts a killed child and latches after four starts', async () => {
    const dir=temp(); let starts=0
    await supervise({dataDir:dir,launch:async()=>{
      starts++
      const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'})
      const exited=once(child,'exit'); await once(child,'spawn'); child.kill('SIGKILL')
      const [exit,signal]=await exited; return {exit,signal}
    },delay:async()=>{}})
    expect(starts).toBe(4); expect(JSON.parse(readFileSync(path.join(dir,'halt.json'),'utf8')).reason).toBe('RESTART_BUDGET_EXHAUSTED')
    await supervise({dataDir:dir,launch:async()=>{starts++;return {exit:0,signal:null}},delay:async()=>{}})
    expect(starts).toBe(4)
  })
  it('OS lease excludes two agents and does not alter the legitimate owner', async () => {
    const f=path.join(temp(),'j'), lease=await acquireLease(f); cleanups.push(()=>lease.release())
    const before=readFileSync(f+'.lock','utf8')
    await expect(acquireLease(f)).rejects.toThrow('AGENT_ALREADY_RUNNING')
    expect(readFileSync(f+'.lock','utf8')).toBe(before)
  })
  it('a live owner remains protected even when its guard has disappeared', async () => {
    const f=path.join(temp(),'j'), owner=await inspectProcess(process.pid)
    writeFileSync(f+'.lock',JSON.stringify({...owner,nonce:'synthetic'}))
    await expect(acquireLease(f)).rejects.toThrow('AGENT_ALREADY_RUNNING')
    expect(JSON.parse(readFileSync(f+'.lock','utf8')).nonce).toBe('synthetic')
  })
  it('reused PID is distinguished by creation identity without killing that process', async () => {
    const f=path.join(temp(),'j'); writeFileSync(f+'.lock',JSON.stringify({pid:process.pid,started:'old-boot-or-start',nonce:'old'}))
    const lease=await acquireLease(f); cleanups.push(()=>lease.release())
    expect(process.kill(process.pid,0)).toBe(true)
    expect(lease.nonce).not.toBe('old')
  })
  it('forced kill during send recovers UNKNOWN and never duplicates simulated paper', async () => {
    const dir=temp(), f=path.join(dir,'journal.jsonl'), paper=path.join(dir,'synthetic-paper.jsonl')
    const child=fork(path.join(__dirname,'runtime-child.mjs'),[f,paper],{stdio:['ignore','ignore','inherit','ipc']})
    cleanups.push(()=>{if(child.exitCode===null)child.kill('SIGKILL')})
    await once(child,'message'); const exited=once(child,'exit'); child.send({cmd:'crash'}); await exited
    const sp=new FakeSpooler(), a=await Agent.create({serverUrl:'http://127.0.0.1:1',token:'synthetic',journalFile:f,spooler:sp}); cleanups.push(()=>a.releaseLock())
    await a.handle(dispatch)
    expect(a.journal.get(dispatch.sendKey)).toMatchObject({phase:PHASE.UNKNOWN})
    expect(sp.spooled).toHaveLength(0); expect(readFileSync(paper,'utf8').trim().split('\n')).toHaveLength(1)
  })
  it('a corrupt host registry blocks startup before interrupted sending can be released', async () => {
    const f=path.join(temp(),'j'); new Journal(f).append({sendKey:dispatch.sendKey,attemptId:dispatch.attemptId,phase:PHASE.SUBMITTING})
    writeFileSync(f+'.hosts.jsonl','{"torn":')
    await expect(Agent.create({serverUrl:'http://127.0.0.1:1',token:'synthetic',journalFile:f,spooler:new FakeSpooler()})).rejects.toThrow('HOST_REGISTRY_CORRUPT')
    expect(new Journal(f).get(dispatch.sendKey).phase).toBe(PHASE.SUBMITTING)
  })
  it('package generation is byte reproducible and excludes data/secrets/test doubles', () => {
    const first=buildPackage(temp()), second=buildPackage(temp())
    expect(first.sha256).toBe(second.sha256); expect(first.signed).toBe(false)
    const manifest=JSON.parse(readFileSync(path.join(path.dirname(first.file),'omni-print-agent/MANIFEST.json'),'utf8'))
    expect(manifest.dependencies).toEqual([]); expect(Object.keys(manifest.files).some(n=>/config|journal\.jsonl|fake|test/.test(n))).toBe(false)
    expect(manifest.files['journal.mjs']).toBeTruthy()
  })
})

describe.skipIf(process.platform!=='win32')('D04 real Windows, synthetic data only', {timeout:120_000}, () => {
  it('real PowerShell host exits after its Node parent is force-killed',async()=>{
    const dir=temp(), child=fork(path.join(__dirname,'host-parent.mjs'),[dir],{stdio:['ignore','ignore','inherit','ipc']})
    cleanups.push(()=>{if(child.exitCode===null)child.kill('SIGKILL')})
    const [message]=await once(child,'message'), exited=once(child,'exit')
    // A live journal host does not belong to the supervisor's separate lease.
    const supervisor=await acquireLease(path.join(dir,'supervisor'));await supervisor.release()
    child.kill('SIGKILL'); await exited
    let state='alive'
    for(let i=0;i<8&&state==='alive';i++){await new Promise(r=>setTimeout(r,250));state=(await inspectProcess(message.hostPid)).state}
    expect(state).toBe('gone')
    const lease=await acquireLease(path.join(dir,'journal.jsonl')); await lease.release()
  })
  it('an unregistered legacy host blocks recovery and is never killed automatically',async()=>{
    const dir=temp(), script=path.join(dir,'omni-print-host.ps1')
    writeFileSync(script,readFileSync(path.join(__dirname,'orphan-host.ps1')))
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-File',script,'-HostNonce',randomUUID()],{windowsHide:true,stdio:['ignore','pipe','ignore']})
    cleanups.push(()=>{if(child.exitCode===null)child.kill('SIGKILL')})
    await once(child.stdout,'data')
    await expect(acquireLease(path.join(dir,'journal.jsonl'))).rejects.toThrow('LEGACY_HOST_UNPROVEN_REBOOT_REQUIRED')
    expect((await inspectProcess(child.pid)).state).toBe('alive')
    const exited=once(child,'exit');child.kill('SIGKILL');await exited
    const lease=await acquireLease(path.join(dir,'journal.jsonl'));await lease.release()
  })
  it('two simultaneous pairings consume exactly one synthetic code; a third preserves credentials', async () => {
    const dir=temp(); let calls=0
    const args=(name:string)=>({server:'https://synthetic.example',code:'TEST-TEST-TEST'} as Record<string,string>)[name]
    const opts={configDir:dir,configFile:path.join(dir,'config.json'),spooler:{protect:async(s:string)=>'dpapi-test:'+s,close:async()=>true},fetchImpl:async()=>{
      calls++; await new Promise(r=>setTimeout(r,100)); return response({ok:true,installationId:'synthetic-installation',storeId:'synthetic-store',token:'synthetic-only'})}}
    const results=await Promise.allSettled([runCli('pair',args,opts),runCli('pair',args,opts)])
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1); expect(calls).toBe(1)
    const original=readFileSync(opts.configFile,'utf8')
    await expect(runCli('pair',args,opts)).rejects.toThrow('ALREADY_PAIRED_OR_PENDING')
    expect(readFileSync(opts.configFile,'utf8')).toBe(original); expect(calls).toBe(1)
  })
  it('DPAPI round-trip uses the real current Windows user; malformed ciphertext fails closed', async () => {
    const sp=new WindowsSpooler({dir:temp()}); cleanups.push(()=>sp.close())
    const protectedValue=await sp.protect('synthetic-'+randomUUID())
    expect(protectedValue).not.toContain('synthetic-')
    expect(await sp.unprotect(protectedValue)).toMatch(/^synthetic-/)
    const legacy=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"ConvertTo-SecureString 'synthetic-legacy-only' -AsPlainText -Force | ConvertFrom-SecureString"],{env:windowsEnv,encoding:'utf8',windowsHide:true})
    expect(legacy.status).toBe(0)
    expect(await sp.unprotect(legacy.stdout.trim())).toBe('synthetic-legacy-only')
    await expect(sp.unprotect('not-a-dpapi-cipher')).rejects.toThrow('DPAPI_UNPROTECT_FAILED')
  })
  it('orphan host is reaped by verified identity and a reused PID is left untouched', async () => {
    const dir=temp(), f=path.join(dir,'hosts.jsonl'), nonce=randomUUID()
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'orphan-host.ps1'),'-HostNonce',nonce],{windowsHide:true,stdio:['ignore','pipe','ignore']})
    cleanups.push(()=>{if(child.exitCode===null)child.kill()})
    await once(child.stdout,'data')
    const owner=await inspectProcess(child.pid)
    durableRecord(f,{op:'OPEN',...owner,nonce})
    await recoverHosts(f)
    expect((await inspectProcess(child.pid)).state).toBe('gone')
    durableRecord(f,{op:'OPEN',pid:process.pid,started:'1',image:process.execPath,nonce:randomUUID()})
    await recoverHosts(f); expect(process.kill(process.pid,0)).toBe(true)
  })
  it('an unverified live host is preserved and blocks recovery', async () => {
    const f=path.join(temp(),'hosts.jsonl'), current=await inspectProcess(process.pid)
    durableRecord(f,{op:'OPEN',...current,nonce:randomUUID()})
    await expect(recoverHosts(f)).rejects.toThrow('PROCESS_IDENTITY_UNPROVEN')
    expect(process.kill(process.pid,0)).toBe(true)
  })
})
