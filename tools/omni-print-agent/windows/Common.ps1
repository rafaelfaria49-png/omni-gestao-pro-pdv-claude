Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
function Get-CurrentSid {
  if ($env:OS -ne 'Windows_NT' -or $PSVersionTable.PSVersion.Major -lt 5) { throw 'WINDOWS_POWERSHELL_5_REQUIRED' }
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  if ($sid -in @('S-1-5-18','S-1-5-19','S-1-5-20')) { throw 'INTERACTIVE_USER_REQUIRED' }
  return $sid
}
function Assert-Lab($Apply, $AuthorizedLab) {
  if ($Apply -and -not $AuthorizedLab) { throw 'AUTHORIZED_ISOLATED_LAB_REQUIRED' }
}
function Get-Node([string]$NodePath) {
  if (-not $NodePath) { $NodePath = (Get-Command node.exe -CommandType Application).Source }
  $NodePath = [IO.Path]::GetFullPath($NodePath)
  if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf)) { throw 'NODE_NOT_FOUND' }
  $version = & $NodePath -p 'process.versions.node'
  if ($LASTEXITCODE -ne 0 -or $version -notmatch '^24\.(\d+)\.\d+$' -or [int]$Matches[1] -lt 12) { throw 'NODE_24_LTS_REQUIRED' }
  return $NodePath
}
function Assert-LocalRoot([string]$Value) {
  if (-not [IO.Path]::IsPathRooted($Value) -or $Value.StartsWith('\\') -or $Value.Contains('"')) { throw 'LOCAL_ABSOLUTE_PATH_REQUIRED' }
  $full = [IO.Path]::GetFullPath($Value).TrimEnd('\')
  if ($full.Length -lt 8 -or $full -eq [IO.Path]::GetPathRoot($full).TrimEnd('\')) { throw 'UNSAFE_ROOT' }
  $cursor = $full
  while ($cursor) {
    if (Test-Path -LiteralPath $cursor) {
      if ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'REPARSE_POINT_REFUSED' }
    }
    $parent = Split-Path -Parent $cursor
    if ($parent -eq $cursor) { break }; $cursor = $parent
  }
  return $full
}
function Read-Package([string]$PackageRoot) {
  $PackageRoot = Assert-LocalRoot $PackageRoot
  $manifest = Get-Content -LiteralPath (Join-Path $PackageRoot 'MANIFEST.json') -Raw | ConvertFrom-Json
  if ($manifest.format -ne 1 -or $manifest.version -ne '0.2.0-d04' -or $manifest.contentId -notmatch '^[a-f0-9]{64}$' -or $null -ne $manifest.signature) { throw 'MANIFEST_INVALID' }
  foreach ($entry in $manifest.files.PSObject.Properties) {
    if ($entry.Name -notmatch '^[a-zA-Z0-9_./-]+$' -or $entry.Name.Contains('..') -or [IO.Path]::IsPathRooted($entry.Name)) { throw 'MANIFEST_PATH_INVALID' }
    $f = Join-Path $PackageRoot $entry.Name
    [void](Assert-LocalRoot $f)
    if ((Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.Value) { throw 'PACKAGE_HASH_MISMATCH' }
  }
  $actual = @(Get-ChildItem -LiteralPath $PackageRoot -File -Recurse)
  if ($actual.Count -ne @($manifest.files.PSObject.Properties).Count + 1) { throw 'PACKAGE_UNLISTED_FILE' }
  $ordered=[ordered]@{}
  $names=[string[]]@($manifest.files.PSObject.Properties.Name); [Array]::Sort($names,[StringComparer]::Ordinal)
  foreach($name in $names) { $ordered[$name]=$manifest.files.$name }
  $hasher=[Security.Cryptography.SHA256]::Create()
  try { $digest=([BitConverter]::ToString($hasher.ComputeHash((New-Object Text.UTF8Encoding $false).GetBytes(($ordered | ConvertTo-Json -Compress))))).Replace('-','').ToLowerInvariant() }
  finally { $hasher.Dispose() }
  if ($digest -ne $manifest.contentId) { throw 'PACKAGE_CONTENT_ID_MISMATCH' }
  return $manifest
}
function Write-NewJson([string]$File, $Value) {
  $stream = [IO.File]::Open($File, 'CreateNew', 'Write', 'None')
  try { $b = (New-Object Text.UTF8Encoding $false).GetBytes(($Value | ConvertTo-Json -Depth 8) + "`n"); $stream.Write($b,0,$b.Length); $stream.Flush($true) }
  finally { $stream.Dispose() }
}
function New-PrivateDirectory([string]$Dir, [string]$Sid) {
  if (Test-Path -LiteralPath $Dir) {
    $existing=Get-Acl -LiteralPath $Dir
    foreach($entry in $existing.Access) {
      $entrySid=$entry.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
      $writes=[Security.AccessControl.FileSystemRights]'Write,Delete,ChangePermissions,TakeOwnership'
      if ($entry.AccessControlType -eq 'Allow' -and ($entry.FileSystemRights -band $writes) -and $entrySid -notin @($Sid,'S-1-5-18','S-1-5-32-544','S-1-3-0')) { throw 'DIRECTORY_WRITABLE_BY_OTHER_USER' }
    }
    return
  }
  [void][IO.Directory]::CreateDirectory($Dir)
  $acl = New-Object Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true,$false)
  $acl.SetOwner((New-Object Security.Principal.SecurityIdentifier($Sid)))
  foreach ($id in @($Sid,'S-1-5-18')) {
    $identity=New-Object Security.Principal.SecurityIdentifier($id)
    $rule=[Security.AccessControl.FileSystemAccessRule]::new($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
    $acl.AddAccessRule($rule)
  }
  Set-Acl -LiteralPath $Dir -AclObject $acl
}
function Enter-Maintenance([string]$Root) {
  [void](Assert-LocalRoot $Root)
  New-PrivateDirectory $Root (Get-CurrentSid)
  try { return [IO.File]::Open((Join-Path $Root 'maintenance.guard'),'OpenOrCreate','ReadWrite','None') }
  catch [IO.IOException] { throw 'MAINTENANCE_ALREADY_RUNNING' }
}
function Get-Installation([string]$InstallRoot) {
  $m = Get-Content -LiteralPath (Join-Path $InstallRoot 'installation.json') -Raw | ConvertFrom-Json
  if ($m.ownerSid -ne (Get-CurrentSid) -or $m.installRoot -ne $InstallRoot) { throw 'WINDOWS_USER_OR_ROOT_MISMATCH' }
  [void](Assert-LocalRoot $m.dataRoot)
  if ($m.taskName -notmatch '^OmniPrintAgent(?:-Lab-[A-Za-z0-9-]+)?$') { throw 'TASK_NAME_INVALID' }
  [void](Get-Node $m.nodePath)
  return $m
}
function Get-OwnedTask($Metadata) {
  $task = Get-ScheduledTask -TaskPath '\' -TaskName $Metadata.taskName -ErrorAction SilentlyContinue
  $taskSid=$null
  if($task) {
    if($task.Principal.UserId -match '^S-1-') { $taskSid=$task.Principal.UserId }
    else { $taskSid=([Security.Principal.NTAccount]::new($task.Principal.UserId)).Translate([Security.Principal.SecurityIdentifier]).Value }
  }
  if ($task -and ($task.Description -ne ('OmniPrint D04 owner ' + $Metadata.ownerSid) -or $taskSid -ne $Metadata.ownerSid -or
      @($task.Actions).Count -ne 1 -or $task.Actions[0].Execute -ne $Metadata.nodePath -or $task.Actions[0].Arguments -ne $Metadata.taskArguments)) { throw 'TASK_OWNERSHIP_UNPROVEN' }
  return $task
}
function Set-Halt($Metadata, [string]$Reason = 'INTENTIONAL') {
  $file = Join-Path $Metadata.dataRoot 'halt.json'
  if (-not (Test-Path -LiteralPath $file)) { Write-NewJson $file @{ reason=$Reason; at=[DateTime]::UtcNow.ToString('o') } }
}
function Wait-Drained($Metadata) {
  & $Metadata.nodePath (Join-Path $Metadata.releaseRoot 'maintenance.mjs') $Metadata.dataRoot
  if ($LASTEXITCODE -ne 0) { throw 'DRAIN_UNPROVEN_PRESERVED' }
}
function Register-AgentTask($Metadata, [switch]$Replace) {
  $action = New-ScheduledTaskAction -Execute $Metadata.nodePath -Argument $Metadata.taskArguments -WorkingDirectory $Metadata.releaseRoot
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $Metadata.ownerSid
  $principal = New-ScheduledTaskPrincipal -UserId $Metadata.ownerSid -LogonType Interactive -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet -Disable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
  Register-ScheduledTask -TaskPath '\' -TaskName $Metadata.taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description ('OmniPrint D04 owner ' + $Metadata.ownerSid) -Force:$Replace | Out-Null
}
