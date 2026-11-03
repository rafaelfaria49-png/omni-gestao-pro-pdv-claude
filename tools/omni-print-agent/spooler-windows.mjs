// Windows spooler adapter: ONE persistent PowerShell 5.1 host (C# winspool P/Invoke compiled once),
// JSON lines over stdin/stdout. Avoids the ~8.8 s cold Add-Type per job measured in 003A.
// RAW datatype straight to a named queue: no window.print, no dialog, no preview, no default-printer fallback.
import { spawn } from "node:child_process"
import { writeFileSync, mkdirSync } from "node:fs"
import path from "node:path"
import os from "node:os"

const HOST_PS1 = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.Encoding]::UTF8
[Console]::OutputEncoding = New-Object Text.UTF8Encoding $false
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class OmniRaw {
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
      Out-Json @{ id = $req.id; ok = $true; value = (ConvertTo-SecureString -String ([string]$req.value) -AsPlainText -Force | ConvertFrom-SecureString) }
    } elseif ($req.op -eq 'unprotect') {
      $s = ConvertTo-SecureString -String ([string]$req.value); $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
      try { $v = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
      Out-Json @{ id = $req.id; ok = $true; value = $v }
    } else { Out-Json @{ id = $req.id; ok = $false; error = 'UNKNOWN_OP' } }
  } catch { Out-Json @{ id = $req.id; ok = $false; error = $_.Exception.Message } }
}
`

export class WindowsSpooler {
  /**
   * @param {{ dir?: string, powershell?: string, requestTimeoutMs?: number, hostCommand?: { command: string, args: string[] } }} [opts]
   * hostCommand replaces the PowerShell host (tests only); the protocol is the same JSON lines.
   */
  constructor({ dir = path.join(os.tmpdir(), "omni-print-agent"), powershell = "powershell.exe", requestTimeoutMs = 15_000, hostCommand = null } = {}) {
    this.kind = "WINDOWS_SPOOLER"
    this.dir = dir; this.powershell = powershell; this.requestTimeoutMs = requestTimeoutMs; this.hostCommand = hostCommand
    this.host = null; this.seq = 0; this.dying = new Set()
  }
  /** Every host owns its pending map and buffer: a dying old host can never reject or orphan a newer one (P2-2). */
  ensure() {
    if (this.host) return this.host
    let command = this.hostCommand?.command, args = this.hostCommand?.args
    if (!command) {
      mkdirSync(this.dir, { recursive: true })
      const script = path.join(this.dir, "omni-print-host.ps1")
      writeFileSync(script, "\ufeff" + HOST_PS1)
      command = this.powershell; args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script]
    }
    const child = spawn(command, args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] })
    const host = { child, pid: child.pid, pending: new Map(), buffer: "", exited: false, exitWaiters: [] }
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
      for (const w of host.pending.values()) w.reject(Object.assign(new Error("HOST_EXITED"), { phase: "KILLED" }))
      host.pending.clear()
      if (this.host === host) this.host = null
      for (const r of host.exitWaiters.splice(0)) r()
    })
    this.host = host
    return host
  }
  request(op, args, timeoutMs = this.requestTimeoutMs) {
    const host = this.ensure()
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
      try { spawn("taskkill.exe", ["/PID", String(host.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }).on("error", () => host.child.kill("SIGKILL")) } catch { host.child.kill("SIGKILL") }
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
