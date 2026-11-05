$ErrorActionPreference='Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or -not $env:RUNNER_TEMP) { throw 'GITHUB_DISPOSABLE_WINDOWS_RUNNER_ONLY' }
$userName='opd04' + [Guid]::NewGuid().ToString('N').Substring(0,12)
$dir=Join-Path $env:RUNNER_TEMP ('dpapi-' + [Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($dir)
$bytes=New-Object byte[] 32; $rng=[Security.Cryptography.RandomNumberGenerator]::Create(); $rng.GetBytes($bytes); $rng.Dispose()
$password=ConvertTo-SecureString (([Convert]::ToBase64String($bytes)) + '!aA7') -AsPlainText -Force
$created=$false
try {
  $account=New-LocalUser -Name $userName -Password $password -AccountNeverExpires -Description 'Disposable D04 CI DPAPI test only'
  $created=$true
  $acl=Get-Acl -LiteralPath $dir
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($account.SID,'Modify','ContainerInherit,ObjectInherit','None','Allow'))
  Set-Acl -LiteralPath $dir -AclObject $acl
  $cipher=ConvertTo-SecureString 'synthetic-cross-user-d04' -AsPlainText -Force | ConvertFrom-SecureString
  # Prove this is valid ciphertext for the original user before testing another identity.
  $sameUser=ConvertTo-SecureString $cipher
  $b=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($sameUser)
  try { if([Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) -ne 'synthetic-cross-user-d04') { throw 'SOURCE_DPAPI_FAILED' } }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
  [IO.File]::WriteAllText((Join-Path $dir 'cipher.txt'),$cipher)
  $probe=@'
param([string]$Root,[string]$ExpectedSid)
$ErrorActionPreference='Stop'
if([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -ne $ExpectedSid) { throw 'WRONG_TEST_IDENTITY' }
$cipher=Get-Content -LiteralPath (Join-Path $Root 'cipher.txt') -Raw
try {
  $secret=ConvertTo-SecureString $cipher
  [IO.File]::WriteAllText((Join-Path $Root 'result.txt'),'FAIL_DECRYPTED')
} catch { [IO.File]::WriteAllText((Join-Path $Root 'result.txt'),'PASS_WRONG_USER_REFUSED') }
'@
  [IO.File]::WriteAllText((Join-Path $dir 'probe.ps1'),$probe)
  $credential=New-Object Management.Automation.PSCredential(('.\'+$userName),$password)
  $process=Start-Process -FilePath powershell.exe -Credential $credential -LoadUserProfile -WindowStyle Hidden -PassThru -Wait -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',('"'+(Join-Path $dir 'probe.ps1')+'"'),'-Root',('"'+$dir+'"'),'-ExpectedSid',$account.SID.Value)
  $result=Get-Content -LiteralPath (Join-Path $dir 'result.txt') -Raw
  if ($process.ExitCode -ne 0 -or $result -ne 'PASS_WRONG_USER_REFUSED') { throw 'CROSS_USER_DPAPI_FAILED' }
  'DPAPI_REAL_DIFFERENT_WINDOWS_USER_PASS'
} finally {
  if ($created -and $userName -match '^opd04[a-f0-9]{12}$') { Remove-LocalUser -Name $userName }
  [Array]::Clear($bytes,0,$bytes.Length)
}
