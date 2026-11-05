param([string]$PackageRoot = (Split-Path -Parent $PSScriptRoot), [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'OmniPrintAgentApp'), [switch]$Apply, [switch]$AuthorizedLab)
. (Join-Path $PSScriptRoot 'Common.ps1')
Assert-Lab $Apply $AuthorizedLab
$InstallRoot = Assert-LocalRoot $InstallRoot
$maintenance=$null
if($Apply) { $maintenance=Enter-Maintenance $InstallRoot }
try {
$old = Get-Installation $InstallRoot; $task = Get-OwnedTask $old
$manifest = Read-Package $PackageRoot
if (-not $Apply) { 'PLAN_UPDATE_DRAIN_DISABLE_PRESERVE_STATE'; return }
Set-Halt $old
if ($task) { Disable-ScheduledTask -InputObject $task | Out-Null }
Wait-Drained $old
$release = Join-Path $InstallRoot ('releases\' + $manifest.version + '-' + $manifest.contentId.Substring(0,12))
if (-not (Test-Path -LiteralPath $release)) {
  New-PrivateDirectory $release $old.ownerSid
  foreach ($entry in $manifest.files.PSObject.Properties) {
    $target = Join-Path $release $entry.Name
    [void][IO.Directory]::CreateDirectory((Split-Path -Parent $target))
    [IO.File]::Copy((Join-Path $PackageRoot $entry.Name),$target,$false)
  }
  [IO.File]::Copy((Join-Path $PackageRoot 'MANIFEST.json'),(Join-Path $release 'MANIFEST.json'),$false)
}
$installedManifest=Read-Package $release
if($installedManifest.contentId -ne $manifest.contentId) { throw 'RELEASE_DIFFERS_FROM_PACKAGE' }
$new = $old.PSObject.Copy(); $new.releaseRoot=$release; $new.contentId=$manifest.contentId; $new.version=$manifest.version
$new.taskArguments = '"' + (Join-Path $release 'supervisor.mjs') + '" --data-dir "' + $old.dataRoot + '"'
$file = Join-Path $InstallRoot 'installation.json'
$pending = Join-Path $InstallRoot ('installation-pending-' + [Guid]::NewGuid().ToString('N') + '.json')
$backup = Join-Path $InstallRoot ('installation-history-' + [Guid]::NewGuid().ToString('N') + '.json')
Write-NewJson $pending $new
try {
  Register-AgentTask $new -Replace
  [IO.File]::Replace($pending,$file,$backup)
} catch {
  Register-AgentTask $old -Replace
  throw 'UPDATE_FAILED_TASK_DISABLED_STATE_PRESERVED'
}
'UPDATE_PASS_TASK_DISABLED_STATE_PRESERVED'
} finally { if($maintenance) { $maintenance.Dispose() } }
