param([string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'OmniPrintAgentApp'), [switch]$Apply, [switch]$AuthorizedLab, [switch]$ResumeAfterReview)
. (Join-Path $PSScriptRoot 'Common.ps1')
Assert-Lab $Apply $AuthorizedLab
$maintenance=$null
if($Apply) { $maintenance=Enter-Maintenance (Assert-LocalRoot $InstallRoot) }
try {
$m = Get-Installation (Assert-LocalRoot $InstallRoot); $task = Get-OwnedTask $m
if (-not $task) { throw 'TASK_MISSING' }
[void](Read-Package $m.releaseRoot)
if (-not $Apply) { 'PLAN_START_AFTER_DPAPI_DIAGNOSIS'; return }
& $m.nodePath (Join-Path $m.releaseRoot 'agent.mjs') diagnose --data-dir $m.dataRoot
if ($LASTEXITCODE -ne 0) { throw 'CREDENTIAL_DIAGNOSIS_FAILED' }
$halt = Join-Path $m.dataRoot 'halt.json'
if (Test-Path -LiteralPath $halt) {
  $state = Get-Content -LiteralPath $halt -Raw | ConvertFrom-Json
  if ($state.reason -eq 'REVOKED') { throw 'REVOKED_REQUIRES_NEW_AUTHORIZED_PAIRING' }
  if ($state.reason -ne 'INTENTIONAL' -and -not $ResumeAfterReview) { throw 'RECOVERY_REVIEW_REQUIRED' }
  # Preserve the stop reason as history; no log/journal/credential is removed.
  $archive = Join-Path $m.dataRoot ('halt-history-' + [Guid]::NewGuid().ToString('N') + '.json')
  [IO.File]::Move($halt,$archive)
}
Enable-ScheduledTask -InputObject $task | Out-Null
Start-ScheduledTask -InputObject $task
'START_REQUESTED_CHECK_DIAGNOSTICS'
} finally { if($maintenance) { $maintenance.Dispose() } }
