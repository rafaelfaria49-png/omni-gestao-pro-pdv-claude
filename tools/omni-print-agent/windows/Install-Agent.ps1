param([string]$PackageRoot = (Split-Path -Parent $PSScriptRoot),
  [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'OmniPrintAgentApp'),
  [string]$DataRoot = (Join-Path $env:LOCALAPPDATA 'OmniPrintAgent'),
  [string]$NodePath, [string]$TaskName = 'OmniPrintAgent', [switch]$Apply, [switch]$AuthorizedLab)
. (Join-Path $PSScriptRoot 'Common.ps1')
Assert-Lab $Apply $AuthorizedLab
$sid = Get-CurrentSid; $node = Get-Node $NodePath
$InstallRoot = Assert-LocalRoot $InstallRoot; $DataRoot = Assert-LocalRoot $DataRoot
if ($InstallRoot -eq $DataRoot -or $InstallRoot.StartsWith($DataRoot+'\',[StringComparison]::OrdinalIgnoreCase) -or $DataRoot.StartsWith($InstallRoot+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'ROOTS_MUST_BE_SEPARATE' }
if ($TaskName -notmatch '^OmniPrintAgent(?:-Lab-[A-Za-z0-9-]+)?$') { throw 'TASK_NAME_INVALID' }
$manifest = Read-Package $PackageRoot
if (Test-Path -LiteralPath (Join-Path $InstallRoot 'installation.json')) { throw 'ALREADY_INSTALLED_USE_UPDATE' }
if (Get-ScheduledTask -TaskPath '\' -TaskName $TaskName -ErrorAction SilentlyContinue) { throw 'TASK_NAME_IN_USE' }
$release = Join-Path $InstallRoot ('releases\' + $manifest.version + '-' + $manifest.contentId.Substring(0,12))
$metadata = @{ ownerSid=$sid; installRoot=$InstallRoot; dataRoot=$DataRoot; nodePath=$node; releaseRoot=$release; taskName=$TaskName; contentId=$manifest.contentId; version=$manifest.version
  taskArguments=('"' + (Join-Path $release 'supervisor.mjs') + '" --data-dir "' + $DataRoot + '"') }
if (-not $Apply) { @{ mode='PLAN'; action='INSTALL_DISABLED_LOGON_TASK'; metadata=$metadata; signed=$false } | ConvertTo-Json -Depth 5; return }
New-PrivateDirectory $InstallRoot $sid; New-PrivateDirectory $DataRoot $sid
$maintenance=Enter-Maintenance $InstallRoot
try {
if (Test-Path -LiteralPath (Join-Path $InstallRoot 'installation.json')) { throw 'ALREADY_INSTALLED_USE_UPDATE' }
if (Get-ScheduledTask -TaskPath '\' -TaskName $TaskName -ErrorAction SilentlyContinue) { throw 'TASK_NAME_IN_USE' }
# Existing configuration/DPAPI/journal are never replaced, including a previous 004C pairing.
if (Test-Path -LiteralPath (Join-Path $DataRoot 'config.json')) {
  $cfg = Get-Content -LiteralPath (Join-Path $DataRoot 'config.json') -Raw | ConvertFrom-Json
  if ($cfg.PSObject.Properties['ownerSid'] -and $cfg.ownerSid -ne $sid) { throw 'WINDOWS_USER_MISMATCH' }
}
New-PrivateDirectory $release $sid
foreach ($entry in $manifest.files.PSObject.Properties) {
  $target = Join-Path $release $entry.Name
  [void][IO.Directory]::CreateDirectory((Split-Path -Parent $target))
  if (Test-Path -LiteralPath $target) { throw 'RELEASE_PATH_EXISTS' }
  [IO.File]::Copy((Join-Path $PackageRoot $entry.Name),$target,$false)
}
[IO.File]::Copy((Join-Path $PackageRoot 'MANIFEST.json'),(Join-Path $release 'MANIFEST.json'),$false)
[void](Read-Package $release)
Set-Halt $metadata
Write-NewJson (Join-Path $InstallRoot 'installation.json') $metadata
Register-AgentTask $metadata
'INSTALL_PASS_TASK_DISABLED_DATA_PRESERVED'
} finally { $maintenance.Dispose() }
