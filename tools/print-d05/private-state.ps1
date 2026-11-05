param([Parameter(Mandatory=$true)][ValidateSet('Initialize','Read','Update')][string]$Mode, [Parameter(Mandatory=$true)][string]$PrivateRoot, [switch]$InternalPipe)
$ErrorActionPreference = 'Stop'
$env:PSModulePath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\Modules'
try {
  . (Join-Path $PSScriptRoot '..\omni-print-agent\windows\Common.ps1')
  Add-Type -AssemblyName System.Security
  $sid = Get-CurrentSid
  $PrivateRoot = Assert-LocalRoot $PrivateRoot
  $repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..')).TrimEnd('\')
  if ($PrivateRoot.Equals($repo,[StringComparison]::OrdinalIgnoreCase) -or $PrivateRoot.StartsWith($repo + '\',[StringComparison]::OrdinalIgnoreCase)) { throw 'PRIVATE_STATE_OUTSIDE_REPOSITORY_REQUIRED' }
  New-PrivateDirectory $PrivateRoot $sid
  $file = Join-Path $PrivateRoot 'secrets.dpapi.json'
  [void](Assert-LocalRoot $file)
  if ($Mode -eq 'Read') {
    if (-not $InternalPipe -or -not [Console]::IsOutputRedirected) { throw 'INTERNAL_PIPE_REQUIRED' }
    $stored = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
    if ($stored.ownerSid -ne $sid) { throw 'PRIVATE_STATE_USER_MISMATCH' }
    $bytes = [Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($stored.ciphertext),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    try { [Console]::Out.Write([Text.Encoding]::UTF8.GetString($bytes)) } finally { [Array]::Clear($bytes,0,$bytes.Length) }
    exit 0
  }
  if ($Mode -eq 'Update') {
    if (-not $InternalPipe -or -not [Console]::IsInputRedirected) { throw 'INTERNAL_PIPE_REQUIRED' }
    $stored = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
    if ($stored.ownerSid -ne $sid) { throw 'PRIVATE_STATE_USER_MISMATCH' }
    $values = [Console]::In.ReadToEnd() | ConvertFrom-Json
    $url = $values.DIRECT_URL
  } else {
  if (Test-Path -LiteralPath $file) { throw 'PRIVATE_STATE_ALREADY_EXISTS' }
  $secret = Read-Host 'D05 test database URL (hidden)' -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
  try { $url = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $secret.Dispose() }
  $u = [Uri]$url
  if ($u.Scheme -notin @('postgresql','postgres') -or $u.Host -ne 'ep-nameless-boat-b6y438an.c-2.sa-east-1.aws.neon.tech' -or $u.AbsolutePath -ne '/omni_print_d05' -or $u.UserInfo.Split(':')[0] -ne 'omni_print_d05_app') { throw 'D05_DATABASE_TARGET_REFUSED' }
  $builder = New-Object UriBuilder $u
  $parameters = @($u.Query.TrimStart('?').Split('&') | Where-Object { $_ -and $_ -notmatch '^(sslmode|sslaccept)=' })
  $builder.Query = ($parameters + @('sslmode=require','sslaccept=strict')) -join '&'
  $url = $builder.Uri.AbsoluteUri
  function New-D05Secret {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes); return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_') }
    finally { $rng.Dispose(); [Array]::Clear($bytes,0,$bytes.Length) }
  }
  $values = [ordered]@{ DATABASE_URL=$url; DIRECT_URL=$url; AUTH_SECRET=(New-D05Secret); ADMIN_DEFAULT_PASSWORD=(New-D05Secret)
    OMNI_PRINT_CONTENT_KEY=(New-D05Secret); OMNI_PRINT_SIGNING_KEY=(New-D05Secret); CONTADOR_SESSION_SECRET=(New-D05Secret); CONTADOR_PIN=(New-D05Secret)
    NODE_ENV='production'; AUTH_TRUST_HOST='true'; AUTH_URL=''; NEXTAUTH_URL=''; NEXT_PUBLIC_APP_URL=''; CONTADOR_LEGACY_PORTAL='0'
    OMNI_PRINT_D05_ENVIRONMENT='1'; OMNI_PRINT_DIRECT_ENABLED='1'; OMNI_PRINT_DIRECT_RELEASE='OMNI-PRINT-D05-HOMOLOGACAO-1'
    OMNI_PRINT_RETENTION_ENABLED='0'; MIGRATION_AUTHORITY_ENABLED='false'; NEXT_TELEMETRY_DISABLED='1'
    WHATSAPP_ACCESS_TOKEN=''; WHATSAPP_PHONE_NUMBER_ID=''; WHATSAPP_BUSINESS_ACCOUNT_ID=''; WHATSAPP_APP_SECRET=''; WHATSAPP_VERIFY_TOKEN=''; WHATSAPP_WEBHOOK_STORE_ID='' }
  }
  foreach ($raw in @($values.DATABASE_URL,$values.DIRECT_URL)) {
    $target=[Uri]$raw
    if ($target.Host -ne 'ep-nameless-boat-b6y438an.c-2.sa-east-1.aws.neon.tech' -or $target.AbsolutePath -ne '/omni_print_d05' -or $target.UserInfo.Split(':')[0] -ne 'omni_print_d05_app') { throw 'D05_DATABASE_TARGET_REFUSED' }
  }
  $plain = [Text.Encoding]::UTF8.GetBytes(($values | ConvertTo-Json -Compress))
  try { $cipher = [Security.Cryptography.ProtectedData]::Protect($plain,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser) }
  finally { [Array]::Clear($plain,0,$plain.Length); $url=$null; $values=$null }
  $record = @{ format=1; ownerSid=$sid; scope='D05_TEST_ONLY'; ciphertext=[Convert]::ToBase64String($cipher) } | ConvertTo-Json -Compress
  $destination = if ($Mode -eq 'Update') { $file + '.' + [Guid]::NewGuid().ToString('N') + '.tmp' } else { $file }
  $stream = [IO.File]::Open($destination,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try { $bytes = (New-Object Text.UTF8Encoding $false).GetBytes($record); $stream.Write($bytes,0,$bytes.Length); $stream.Flush($true) }
  finally { $stream.Dispose() }
  if ($Mode -eq 'Update') { [IO.File]::Replace($destination,$file,($file + '.' + [Guid]::NewGuid().ToString('N') + '.backup')) }
  [Console]::WriteLine('D05_PRIVATE_STATE_WRITTEN_DPAPI_CURRENT_USER')
} catch { [Console]::Error.WriteLine('D05_PRIVATE_STATE_FAILED'); exit 1 }
