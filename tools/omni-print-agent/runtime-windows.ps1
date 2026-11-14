param(
  [ValidateSet('lease','inspect','reap','legacy-check')][string]$Operation,
  [string]$LeasePath,
  [string]$OwnerPath,
  [int]$TargetPid,
  [string]$ExpectedStart,
  [string]$ExpectedImage,
  [string]$HostNonce,
  [string]$HostScript
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object Text.UTF8Encoding $false
function Reply($v) { [Console]::Out.WriteLine(($v | ConvertTo-Json -Compress)); [Console]::Out.Flush() }
try {
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  if ($Operation -eq 'legacy-check') {
    foreach ($candidate in @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'")) {
      if ($candidate.ProcessId -eq $PID) { continue }
      $owner = Invoke-CimMethod -InputObject $candidate -MethodName GetOwnerSid
      if ($owner.ReturnValue -ne 0) { throw 'LEGACY_HOST_IDENTITY_UNPROVEN' }
      if ($owner.Sid -ne $sid) { continue }
      if (-not $candidate.CommandLine) { throw 'LEGACY_HOST_IDENTITY_UNPROVEN' }
      if ($candidate.CommandLine.IndexOf($HostScript,[StringComparison]::OrdinalIgnoreCase) -ge 0) {
        Reply @{ ok=$false; code='LEGACY_HOST_UNPROVEN_REBOOT_REQUIRED' }; exit 1
      }
    }
    Reply @{ ok=$true; state='legacy-egress-closed' }; exit 0
  }
  if ($Operation -eq 'lease') {
    # The OS owns exclusivity, including after kill/reboot. This file is NEVER removed.
    try { $stream = [IO.File]::Open($LeasePath, 'OpenOrCreate', 'ReadWrite', 'None') }
    catch [IO.IOException] { Reply @{ ok = $false; code = 'AGENT_ALREADY_RUNNING' }; exit 0 }
    try {
      # Deny writes/deletion to the owner file too: even a 004C agent that ignores .guard cannot reclaim it.
      $ownerStream = [IO.File]::Open($OwnerPath, 'OpenOrCreate', 'ReadWrite', 'Read')
      try {
      if ($ownerStream.Length -gt 8192) { throw 'LOCK_IDENTITY_UNPROVEN' }
      $oldBytes=New-Object byte[] ([int]$ownerStream.Length)
      [void]$ownerStream.Read($oldBytes,0,$oldBytes.Length)
      $p = [Diagnostics.Process]::GetProcessById($TargetPid)
      Reply @{ ok = $true; pid = $p.Id; started = $p.StartTime.ToFileTimeUtc().ToString(); sid = $sid; image = $p.MainModule.FileName; previous = [Text.Encoding]::UTF8.GetString($oldBytes) }
      $line=[Console]::In.ReadLine()
      if ($null -ne $line -and $line) {
        $command=$line | ConvertFrom-Json
        if ($command.action -ne 'commit') { throw 'LOCK_PROTOCOL_INVALID' }
        $record=$command.record
        if ($record.pid -ne $p.Id -or $record.started -ne $p.StartTime.ToFileTimeUtc().ToString()) { throw 'LOCK_PROTOCOL_INVALID' }
        $buffer=(New-Object Text.UTF8Encoding $false).GetBytes(($record | ConvertTo-Json -Compress))
        $ownerStream.Position=0; $ownerStream.SetLength(0); $ownerStream.Write($buffer,0,$buffer.Length); $ownerStream.Flush($true)
        Reply @{ok=$true;state='committed'}
        $line=[Console]::In.ReadLine()
        if ($null -ne $line -and $line) {
          $command=$line | ConvertFrom-Json
          if ($command.action -ne 'release' -or $command.nonce -ne $record.nonce) { throw 'LOCK_PROTOCOL_INVALID' }
          $record | Add-Member -NotePropertyName state -NotePropertyValue 'RELEASED' -Force
          $buffer=(New-Object Text.UTF8Encoding $false).GetBytes(($record | ConvertTo-Json -Compress))
          $ownerStream.Position=0; $ownerStream.SetLength(0); $ownerStream.Write($buffer,0,$buffer.Length); $ownerStream.Flush($true)
        }
      }
      # EOF is delivered even if Node is killed. A second agent still has to reap recorded hosts.
      } finally { $ownerStream.Dispose() }
    } finally { $stream.Dispose() }
    exit 0
  }
  try { $p = [Diagnostics.Process]::GetProcessById($TargetPid) }
  catch [ArgumentException] { Reply @{ ok = $true; state = 'gone' }; exit 0 }
  try {
    # Pin the actual process object before comparing creation time or terminating it.
    [void]$p.Handle
    if ($p.HasExited) { Reply @{ ok = $true; state = 'gone' }; exit 0 }
    $started = $p.StartTime.ToFileTimeUtc().ToString()
    $image = $p.MainModule.FileName
    if ($ExpectedStart -and $started -ne $ExpectedStart) { Reply @{ ok = $true; state = 'reused' }; exit 0 }
    if ($Operation -eq 'inspect') { Reply @{ ok = $true; state = 'alive'; pid = $p.Id; started = $started; image = $image; sid = $sid }; exit 0 }
    $cim = Get-CimInstance Win32_Process -Filter "ProcessId=$TargetPid"
    $owner = Invoke-CimMethod -InputObject $cim -MethodName GetOwnerSid
    if ($owner.ReturnValue -ne 0 -or $owner.Sid -ne $sid -or $image -ne $ExpectedImage -or
        -not $HostNonce -or -not $cim.CommandLine.Contains($HostNonce)) { throw 'HOST_IDENTITY_UNPROVEN' }
    if (-not $p.HasExited) { $p.Kill() }
    if (-not $p.WaitForExit(10000)) { throw 'HOST_EXIT_UNPROVEN' }
    Reply @{ ok = $true; state = 'reaped' }
  } finally { $p.Dispose() }
} catch { Reply @{ ok = $false; code = 'PROCESS_IDENTITY_UNPROVEN' }; exit 1 }
