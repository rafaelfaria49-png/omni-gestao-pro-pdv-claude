param([string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'OmniPrintAgentApp'), [switch]$ProbeCredential, [switch]$AuthorizedLab)
. (Join-Path $PSScriptRoot 'Common.ps1')
Assert-Lab $ProbeCredential $AuthorizedLab
$m = Get-Installation (Assert-LocalRoot $InstallRoot); $task = Get-OwnedTask $m
[void](Read-Package $m.releaseRoot)
$haltFile = Join-Path $m.dataRoot 'halt.json'; $reason = $null
if (Test-Path -LiteralPath $haltFile) { $reason = (Get-Content -LiteralPath $haltFile -Raw | ConvertFrom-Json).reason }
$paired = Test-Path -LiteralPath (Join-Path $m.dataRoot 'config.json')
$report = @{ integrity='PASS'; version=$m.version; signed=$false; paired=$paired; sameWindowsUser=$true; haltReason=$reason; taskPresent=[bool]$task; credentialProbe='NOT_REQUESTED'; physicalHomologation='PENDING' }
if ($task) {
  $report.logonInteractiveLimited = ($task.Principal.LogonType -eq 'Interactive' -and $task.Principal.RunLevel -eq 'Limited')
  $report.singleInstance = $task.Settings.MultipleInstances -eq 'IgnoreNew'
  $report.taskState = [string]$task.State
  if (-not $report.logonInteractiveLimited -or -not $report.singleInstance) { throw 'TASK_SETTINGS_INVALID' }
}
if ($ProbeCredential) {
  & $m.nodePath (Join-Path $m.releaseRoot 'agent.mjs') diagnose --data-dir $m.dataRoot
  if ($LASTEXITCODE -ne 0) { throw 'CREDENTIAL_DIAGNOSIS_FAILED' }
  $report.credentialProbe='DPAPI_CURRENT_USER_PASS'
}
$report | ConvertTo-Json -Depth 4
