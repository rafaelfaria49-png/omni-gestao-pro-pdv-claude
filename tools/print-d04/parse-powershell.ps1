$ErrorActionPreference='Stop'
$files=@(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '../omni-print-agent') -Filter '*.ps1' -Recurse) + @(Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.ps1')
foreach ($file in $files) {
  $errorsFound=$null; $tokens=$null
  [void][Management.Automation.Language.Parser]::ParseFile($file.FullName,[ref]$tokens,[ref]$errorsFound)
  if ($errorsFound.Count) { throw ('POWERSHELL_PARSE_FAILED: '+$file.Name) }
}
'POWERSHELL_PARSE_PASS '+$files.Count
