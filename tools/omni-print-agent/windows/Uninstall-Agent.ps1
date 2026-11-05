param([string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'OmniPrintAgentApp'), [switch]$Apply, [switch]$AuthorizedLab, [switch]$RevocationConfirmed)
. (Join-Path $PSScriptRoot 'Common.ps1')
Assert-Lab $Apply $AuthorizedLab
$maintenance=$null
if($Apply) { $maintenance=Enter-Maintenance (Assert-LocalRoot $InstallRoot) }
try {
$InstallRoot = Assert-LocalRoot $InstallRoot; $m = Get-Installation $InstallRoot; $task = Get-OwnedTask $m
if (-not $Apply) { 'PLAN_UNREGISTER_PRESERVE_CREDENTIAL_JOURNAL_AND_RELEASES'; return }
if ((Test-Path -LiteralPath (Join-Path $m.dataRoot 'config.json')) -and -not $RevocationConfirmed) { throw 'CONFIRM_SERVER_REVOCATION_FIRST' }
Set-Halt $m
if ($task) { Disable-ScheduledTask -InputObject $task | Out-Null }
Wait-Drained $m
if ($task) { Unregister-ScheduledTask -InputObject $task -Confirm:$false }
$marker = Join-Path $InstallRoot 'uninstalled.json'
if (-not (Test-Path -LiteralPath $marker)) { Write-NewJson $marker @{ at=[DateTime]::UtcNow.ToString('o'); retainedData=$true; taskRemoved=$true } }
'UNINSTALL_PASS_TASK_REMOVED_ALL_HISTORY_RETAINED'
} finally { if($maintenance) { $maintenance.Dispose() } }
