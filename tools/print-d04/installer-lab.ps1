param([Parameter(Mandatory=$true)][string]$PackageRoot)
$ErrorActionPreference='Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or -not $env:RUNNER_TEMP) { throw 'GITHUB_DISPOSABLE_WINDOWS_RUNNER_ONLY' }
$lab = Join-Path $env:RUNNER_TEMP ('omni-d04-' + [Guid]::NewGuid().ToString('N'))
$app = Join-Path $lab 'app'; $data = Join-Path $lab 'data'
$task = 'OmniPrintAgent-Lab-' + [Guid]::NewGuid().ToString('N')
$scripts=Join-Path $PackageRoot 'windows'
$node=(Get-Command node.exe -CommandType Application).Source
$installed=$false
function Assert($Condition,[string]$Code) { if (-not $Condition) { throw $Code } }
try {
  . (Join-Path $scripts 'Common.ps1')
  New-PrivateDirectory $lab (Get-CurrentSid)
  New-PrivateDirectory $data (Get-CurrentSid)
  [IO.File]::WriteAllText((Join-Path $data 'journal.jsonl'),'{"sendKey":"synthetic","attemptId":"synthetic","phase":"UNKNOWN","reason":"AGENT_RESTARTED"}' + "`n",(New-Object Text.UTF8Encoding $false))
  [IO.File]::WriteAllText((Join-Path $data 'journal.jsonl.instance'),[Guid]::NewGuid().ToString())
  $journalHash=(Get-FileHash -LiteralPath (Join-Path $data 'journal.jsonl')).Hash
  $instanceHash=(Get-FileHash -LiteralPath (Join-Path $data 'journal.jsonl.instance')).Hash
  & (Join-Path $scripts 'Install-Agent.ps1') -PackageRoot $PackageRoot -InstallRoot $app -DataRoot $data -TaskName $task -NodePath $node
  Assert (-not (Test-Path -LiteralPath $app)) 'PLAN_WROTE_INSTALLATION'
  & (Join-Path $scripts 'Install-Agent.ps1') -PackageRoot $PackageRoot -InstallRoot $app -DataRoot $data -TaskName $task -NodePath $node -Apply -AuthorizedLab
  $installed=$true
  $t=Get-ScheduledTask -TaskName $task -TaskPath '\'
  Assert ($t.State -eq 'Disabled') 'INSTALL_TASK_NOT_DISABLED'
  Assert ($t.Principal.RunLevel -eq 'Limited') 'TASK_ELEVATED'
  Assert ($t.Principal.LogonType -eq 'Interactive') 'WRONG_LOGON_TYPE'
  Assert ($t.Settings.MultipleInstances -eq 'IgnoreNew') 'TASK_CONCURRENCY_UNSAFE'
  Assert (@($t.Triggers).Count -eq 1 -and $t.Triggers[0].CimClass.CimClassName -eq 'MSFT_TaskLogonTrigger') 'LOGON_TRIGGER_MISSING'
  'LOGON_TASK_DEFINITION_PASS (real logout/reboot remains D05)'
  # On-demand activation exercises the actual registered launcher, unpaired: no network or printer operation.
  $halt=Join-Path $data 'halt.json'; [IO.File]::Move($halt,(Join-Path $data 'halt-install-history.json'))
  Enable-ScheduledTask -InputObject $t | Out-Null; Start-ScheduledTask -InputObject $t
  $deadline=[DateTime]::UtcNow.AddSeconds(90)
  while (-not (Test-Path -LiteralPath $halt) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 500 }
  Assert (Test-Path -LiteralPath $halt) 'SCHEDULED_LAUNCH_DID_NOT_RUN'
  Assert ((Get-Content -LiteralPath $halt -Raw | ConvertFrom-Json).reason -eq 'FATAL') 'UNPAIRED_START_NOT_FATAL'
  'REGISTERED_LAUNCHER_EXECUTED_UNPAIRED_FAIL_CLOSED_PASS'
  & (Join-Path $scripts 'Stop-Agent.ps1') -InstallRoot $app -Apply -AuthorizedLab
  $cipher=ConvertTo-SecureString 'synthetic-d04-token-only' -AsPlainText -Force | ConvertFrom-SecureString
  $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $config=@{serverUrl='https://synthetic.invalid';installationId='synthetic-installation';storeId='synthetic-store';ownerSid=$sid;token=$cipher} | ConvertTo-Json
  [IO.File]::WriteAllText((Join-Path $data 'config.json'),$config,(New-Object Text.UTF8Encoding $false))
  $credentialHash=(Get-FileHash -LiteralPath (Join-Path $data 'config.json')).Hash
  & (Join-Path $scripts 'Diagnose-Agent.ps1') -InstallRoot $app -ProbeCredential -AuthorizedLab
  & (Join-Path $scripts 'Update-Agent.ps1') -PackageRoot $PackageRoot -InstallRoot $app -Apply -AuthorizedLab
  Assert ((Get-FileHash -LiteralPath (Join-Path $data 'config.json')).Hash -eq $credentialHash) 'UPDATE_CHANGED_DPAPI'
  Assert ((Get-FileHash -LiteralPath (Join-Path $data 'journal.jsonl')).Hash -eq $journalHash) 'UPDATE_CHANGED_JOURNAL'
  Assert ((Get-FileHash -LiteralPath (Join-Path $data 'journal.jsonl.instance')).Hash -eq $instanceHash) 'UPDATE_CHANGED_INSTANCE'
  'UPDATE_DPAPI_JOURNAL_INSTANCE_PRESERVED_PASS'
  & (Join-Path $scripts 'Uninstall-Agent.ps1') -InstallRoot $app -Apply -AuthorizedLab -RevocationConfirmed
  $installed=$false
  Assert (-not (Get-ScheduledTask -TaskName $task -TaskPath '\' -ErrorAction SilentlyContinue)) 'TASK_REMAINS'
  Assert ((Get-FileHash -LiteralPath (Join-Path $data 'journal.jsonl')).Hash -eq $journalHash) 'UNINSTALL_DELETED_HISTORY'
  Assert ((Get-FileHash -LiteralPath (Join-Path $data 'config.json')).Hash -eq $credentialHash) 'UNINSTALL_DELETED_DPAPI'
  'INSTALLER_VALIDATION_PASS (synthetic data, no physical printer, no real pairing)'
} finally {
  if ($installed) { & (Join-Path $scripts 'Uninstall-Agent.ps1') -InstallRoot $app -Apply -AuthorizedLab -RevocationConfirmed }
  # Keep laboratory files as evidence. The disposable runner is destroyed by GitHub.
}
