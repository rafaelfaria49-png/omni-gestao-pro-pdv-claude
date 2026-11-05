param([string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'OmniPrintAgentApp'), [switch]$Apply, [switch]$AuthorizedLab)
. (Join-Path $PSScriptRoot 'Common.ps1')
Assert-Lab $Apply $AuthorizedLab
$maintenance=$null
if($Apply) { $maintenance=Enter-Maintenance (Assert-LocalRoot $InstallRoot) }
try {
$m = Get-Installation (Assert-LocalRoot $InstallRoot); $task = Get-OwnedTask $m
if (-not $Apply) { 'PLAN_STOP_PRESERVE_DATA'; return }
Set-Halt $m
if ($task) { Disable-ScheduledTask -InputObject $task | Out-Null }
Wait-Drained $m
'STOP_PASS_HOSTS_CLOSED_DATA_PRESERVED'
} finally { if($maintenance) { $maintenance.Dispose() } }
