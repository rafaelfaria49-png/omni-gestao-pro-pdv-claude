// Windows spooler adapter: ONE persistent PowerShell 5.1 host (C# winspool P/Invoke compiled once),
// JSON lines over stdin/stdout. Avoids the ~8.8 s cold Add-Type per job measured in 003A.
// RAW datatype straight to a named queue: no window.print, no dialog, no preview, no default-printer fallback.
import { spawn } from "node:child_process"
import { writeFileSync, mkdirSync } from "node:fs"
import path from "node:path"
import os from "node:os"
import { randomUUID } from 'node:crypto'
import { durableRecord, windowsEnv } from './runtime.mjs'

const HOST_PS1 = String.raw`
param([int]$AgentPid, [string]$AgentStarted, [string]$HostNonce)
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.Encoding]::UTF8
[Console]::OutputEncoding = New-Object Text.UTF8Encoding $false
Add-Type -AssemblyName System.Security
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class OmniRaw {
  static System.Diagnostics.Process watchedParent, hostProcess;
  [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr h, uint ms);
  [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr h, uint code);
  public static void WatchParent(int pid, string expected) {
    watchedParent = System.Diagnostics.Process.GetProcessById(pid);
    var handle = watchedParent.Handle; // static Process references keep the SafeHandles alive
    if (expected != "" && watchedParent.StartTime.ToFileTimeUtc().ToString() != expected) throw new Exception("PARENT_IDENTITY_MISMATCH");
    hostProcess = System.Diagnostics.Process.GetCurrentProcess();
    var thread = new System.Threading.Thread(() => {
      uint result = WaitForSingleObject(handle, 0xffffffff);
      // WAIT_OBJECT_0 proves parent death; an invalid monitor also closes this host, with a fatal status.
      TerminateProcess(hostProcess.Handle, result == 0 ? 0u : 65u);
    });
    thread.IsBackground = true; thread.Start();
  }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public class DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool OpenPrinter(string n, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode)] static extern int StartDocPrinter(IntPtr h, int l, [In] DOCINFO d);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool WritePrinter(IntPtr h, byte[] b, int c, out int w);
  public static string Send(string printer, string doc, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) return "BEFORE:OPEN_FAILED:" + Marshal.GetLastWin32Error();
    try {
      DOCINFO di = new DOCINFO(); di.pDocName = doc; di.pDataType = "RAW";
      int job = StartDocPrinter(h, 1, di);
      if (job <= 0) return "BEFORE:START_DOC_FAILED:" + Marshal.GetLastWin32Error();
      // From here a spool job exists: any failure is AFTER (result unknown).
      if (!StartPagePrinter(h)) { int e0 = Marshal.GetLastWin32Error(); EndDocPrinter(h); return "AFTER:WRITE_FAILED:" + e0; }
      int written; bool ok = WritePrinter(h, data, data.Length, out written); int e1 = Marshal.GetLastWin32Error();
      EndPagePrinter(h);
      if (!EndDocPrinter(h)) return "AFTER:END_DOC_FAILED:" + Marshal.GetLastWin32Error() + ":" + job;
      if (!ok || written != data.Length) return "AFTER:WRITE_FAILED:" + e1 + ":" + job;
      return "OK:" + job;
    } finally { ClosePrinter(h); }
  }
}
"@
function Out-Json($o) { [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress -Depth 4)); [Console]::Out.Flush() }
[OmniRaw]::WatchParent($AgentPid, $AgentStarted)
$selfProcess = [Diagnostics.Process]::GetCurrentProcess()
Out-Json @{ id = 0; ok = $true; pid = $PID; started = $selfProcess.StartTime.ToFileTimeUtc().ToString(); image = $selfProcess.MainModule.FileName; nonce = $HostNonce }
function Get-Status($name) {
  $svc = Get-Service -Name Spooler -ErrorAction SilentlyContinue
  if (-not $svc -or $svc.Status -ne 'Running') { return @{ exists = $false; serviceUp = $false } }
  $p = Get-CimInstance -ClassName Win32_Printer -Filter ("Name='" + $name.Replace("\","\\").Replace("'","\'") + "'") -ErrorAction SilentlyContinue
  if (-not $p) { return @{ exists = $false; serviceUp = $true } }
  $online = -not $p.WorkOffline -and $p.PrinterStatus -ne 7 -and $p.DetectedErrorState -ne 9
  if ($p.PortName -match '^USB\d+$') {
    # 003A finding: Get-Printer says "Normal" for a switched-off USB printer; USBPRINT PnP presence is the reliable signal.
    $dev = Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -like 'USBPRINT\*' -and $_.InstanceId -like ('*' + $p.PortName) }
    if (-not $dev) { $online = $false }
  }
  return @{ exists = $true; serviceUp = $true; online = [bool]$online; paused = ($p.PrinterStatus -eq 1 -and $p.Status -eq 'Degraded'); error = ($p.DetectedErrorState -in 7,8,10); paperOut = ($p.DetectedErrorState -eq 4) }
}
while ($null -ne ($line = [Console]::In.ReadLine())) {
  try {
    $req = $line | ConvertFrom-Json
    if ($req.op -eq 'list') {
      $items = @(Get-CimInstance -ClassName Win32_Printer | ForEach-Object { @{ name = $_.Name; online = (-not $_.WorkOffline -and $_.PrinterStatus -ne 7); status = [string]$_.PrinterStatus; isDefault = [bool]$_.Default; portKind = $(if ($_.PortName -match '^USB') { 'USB' } elseif ($_.PortName -match '^(IP_|\d)') { 'NETWORK' } else { 'OTHER' }) } })
      Out-Json @{ id = $req.id; ok = $true; printers = $items }
    } elseif ($req.op -eq 'status') {
      Out-Json @{ id = $req.id; ok = $true; status = (Get-Status $req.printer) }
    } elseif ($req.op -eq 'send') {
      $r = [OmniRaw]::Send([string]$req.printer, [string]$req.doc, [Convert]::FromBase64String([string]$req.data))
      Out-Json @{ id = $req.id; ok = $true; result = $r }
    } elseif ($req.op -eq 'protect') {
      # Same DPAPI CurrentUser + UTF-16LE + hexadecimal representation as Windows PowerShell SecureString.
      # Explicit API avoids inherited PowerShell module-version differences; old config remains readable.
      $plain = [Text.Encoding]::Unicode.GetBytes([string]$req.value)
      try {
        $cipher = [Security.Cryptography.ProtectedData]::Protect($plain,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
        Out-Json @{ id = $req.id; ok = $true; value = [BitConverter]::ToString($cipher).Replace('-','').ToLowerInvariant() }
      } finally { [Array]::Clear($plain,0,$plain.Length) }
    } elseif ($req.op -eq 'unprotect') {
      $hex=[string]$req.value
      if ($hex.Length -gt 16384 -or $hex -notmatch '^(?:[a-fA-F0-9]{2}){32,}$') { throw 'DPAPI_CIPHER_INVALID' }
      $cipher=New-Object byte[] ($hex.Length / 2)
      for($i=0;$i -lt $cipher.Length;$i++) { $cipher[$i]=[Convert]::ToByte($hex.Substring($i*2,2),16) }
      $plain=[Security.Cryptography.ProtectedData]::Unprotect($cipher,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
      try { Out-Json @{id=$req.id;ok=$true;value=[Text.Encoding]::Unicode.GetString($plain)} }
      finally { [Array]::Clear($plain,0,$plain.Length) }
    } else { Out-Json @{ id = $req.id; ok = $false; error = 'UNKNOWN_OP' } }
  } catch { Out-Json @{ id = $req.id; ok = $false; error = $_.Exception.Message } }
}
`

export class WindowsSpooler {
  /**
   * @param {{ dir?: string, powershell?: string, requestTimeoutMs?: number, hostCommand?: { command: string, args: string[] } }} [opts]
   * hostCommand replaces the PowerShell host (tests only); the protocol is the same JSON lines.
   */
  constructor({ dir = path.join(os.tmpdir(), "omni-print-agent"), powershell = path.join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'), requestTimeoutMs = 15_000, hostCommand = null, registryFile = null, parentStarted = '' } = {}) {
    this.kind = "WINDOWS_SPOOLER"
    this.dir = dir; this.powershell = powershell; this.requestTimeoutMs = requestTimeoutMs; this.hostCommand = hostCommand
    this.host = null; this.seq = 0; this.dying = new Set()
    this.registryFile = registryFile; this.parentStarted = parentStarted
  }
  /** Every host owns its pending map and buffer: a dying old host can never reject or orphan a newer one (P2-2). */
  ensure() {
    if (this.host) return this.host
    let command = this.hostCommand?.command, args = this.hostCommand?.args
    const nonce = randomUUID()
    if (!command) {
      mkdirSync(this.dir, { recursive: true })
      const script = path.join(this.dir, "omni-print-host.ps1")
      writeFileSync(script, "\ufeff" + HOST_PS1)
      command = this.powershell; args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, '-AgentPid', String(process.pid), '-AgentStarted', this.parentStarted, '-HostNonce', nonce]
    }
    const child = spawn(command, args, { windowsHide: true, env: windowsEnv, stdio: ["pipe", "pipe", "pipe"] })
    const host = { child, pid: child.pid, pending: new Map(), buffer: "", exited: false, exitWaiters: [] }
    // Tests with an injected host are never armed for a real printer. The production host must introduce itself.
    host.ready = this.hostCommand ? Promise.resolve() : new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('HOST_START_TIMEOUT')), 60_000)
      host.pending.set(0, { resolve: m => {
        clearTimeout(timer)
        try {
          if (m.pid !== child.pid || m.nonce !== nonce || !m.started || !m.image) throw new Error('HOST_IDENTITY_UNPROVEN')
          if (this.registryFile) { durableRecord(this.registryFile, { op: 'OPEN', ...m, nonce }); host.registered = true; host.nonce = nonce }
          resolve()
        } catch (e) { reject(e) }
      }, reject: e => { clearTimeout(timer); reject(e) } })
    })
    // Attach a rejection handler immediately, even if startup is being reset before request() awaits it.
    host.ready.catch(() => {})
    child.stdin.on('error', () => {})
    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk) => {
      host.buffer += chunk
      let nl
      while ((nl = host.buffer.indexOf("\n")) >= 0) {
        const line = host.buffer.slice(0, nl).trim(); host.buffer = host.buffer.slice(nl + 1)
        if (!line) continue
        try { const msg = JSON.parse(line); const w = host.pending.get(msg.id); if (w) { host.pending.delete(msg.id); w.resolve(msg) } } catch { /* ignore non-protocol output */ }
      }
    })
    // A host that never started may never emit "exit": mark it gone so it cannot block later resets.
    child.on("error", () => { if (child.pid === undefined && !host.exited) { host.exited = true; host.pending.forEach(w => w.reject(Object.assign(new Error("HOST_SPAWN_FAILED"), { phase: "BEFORE" }))); host.pending.clear(); if (this.host === host) this.host = null; for (const r of host.exitWaiters.splice(0)) r() } })
    child.on("exit", () => {
      host.exited = true
      if (host.registered && this.registryFile) { try { durableRecord(this.registryFile, { op: 'CLOSED', nonce: host.nonce }) } catch { /* recovery will verify the process identity on next startup */ } }
      for (const w of host.pending.values()) w.reject(Object.assign(new Error("HOST_EXITED"), { phase: "KILLED" }))
      host.pending.clear()
      if (this.host === host) this.host = null
      for (const r of host.exitWaiters.splice(0)) r()
    })
    this.host = host
    return host
  }
  async request(op, args, timeoutMs = this.requestTimeoutMs) {
    const host = this.ensure()
    await host.ready
    if (host.exited) throw new Error('HOST_EXITED')
    const id = ++this.seq
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { host.pending.delete(id); reject(Object.assign(new Error("HOST_TIMEOUT"), { timeout: true })) }, timeoutMs)
      host.pending.set(id, { resolve: (m) => { clearTimeout(timer); resolve(m) }, reject: (e) => { clearTimeout(timer); reject(e) } })
      host.child.stdin.write(JSON.stringify({ id, op, ...args }) + "\n")
    })
  }
  /**
   * Kills the current host (whole process tree) and resolves true only once it has really exited, so a hung call can
   * never write later. Resolves false if the exit was not observed in time (the caller must not declare egress closed).
   */
  async reset(waitMs = 10_000) {
    if (this.host) { this.dying.add(this.host); this.host = null }
    const pending = [...this.dying].filter(h => !h.exited)
    await Promise.all(pending.map(host => {
      // ChildProcess owns the process handle on Windows. Never terminate a newly reused PID or its tree.
      try { host.child.kill('SIGKILL') } catch { /* observed exit below is the only success criterion */ }
      return new Promise((resolve) => {
        const timer = setTimeout(resolve, waitMs)
        host.exitWaiters.push(() => { clearTimeout(timer); resolve() })
      })
    }))
    for (const h of [...this.dying]) if (h.exited) this.dying.delete(h)
    return this.dying.size === 0
  }
  async listPrinters() {
    const r = await this.request("list", {}, 60_000)
    if (!r.ok) throw Object.assign(new Error(r.error), { reason: "SPOOLER_UNAVAILABLE" })
    return (Array.isArray(r.printers) ? r.printers : r.printers ? [r.printers] : []).slice(0, 32)
  }
  async status(name) {
    const r = await this.request("status", { printer: name }, 60_000)
    if (!r.ok) return { exists: false, serviceUp: false }
    return r.status
  }
  async submit(name, bytes, docName) {
    const r = await this.request("send", { printer: name, doc: docName, data: Buffer.from(bytes).toString("base64") })
    // A host-level exception may have happened after StartDocPrinter: never claim "nothing sent" for it (P3-8).
    if (!r.ok) throw Object.assign(new Error(r.error), { phase: "AFTER", reason: "WRITE_FAILED" })
    const [kind, reason, , job] = String(r.result).split(":")
    if (kind === "OK") return { spoolJobId: reason }
    throw Object.assign(new Error(r.result), { phase: kind === "BEFORE" ? "BEFORE" : "AFTER", reason, spoolJobId: job ?? null })
  }
  async protect(value) { const r = await this.request("protect", { value }, 60_000); if (!r.ok) throw new Error("DPAPI_PROTECT_FAILED"); return r.value }
  async unprotect(value) { const r = await this.request("unprotect", { value }, 60_000); if (!r.ok) throw new Error("DPAPI_UNPROTECT_FAILED"); return r.value }
  close() { return this.reset() }
}
