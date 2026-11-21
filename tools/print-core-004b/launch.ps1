param(
 [Parameter(Mandatory=$true)][string]$Action
)
$ErrorActionPreference='Stop'
$labRoot=Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeBinary='C:\Users\rafae\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$start=[Diagnostics.ProcessStartInfo]::new()
$start.FileName=$nodeBinary
$start.WorkingDirectory=$labRoot
$start.UseShellExecute=$false
$start.CreateNoWindow=$true
$start.RedirectStandardOutput=$true
$start.RedirectStandardError=$true
$start.ArgumentList.Add((Join-Path $labRoot 'driver.mjs'))
$start.ArgumentList.Add($Action)
$start.Environment.Clear()
$labWindowsRoot=[Environment]::GetEnvironmentVariable('SystemRoot','Process')
$start.Environment['SystemRoot']=$labWindowsRoot
$start.Environment['WINDIR']=$labWindowsRoot
$start.Environment['ComSpec']=Join-Path $labWindowsRoot 'System32\cmd.exe'
$start.Environment['PATH']='C:\Program Files\nodejs;C:\Program Files\PostgreSQL\17\bin;C:\Program Files\Git\cmd;'+(Join-Path $labWindowsRoot 'System32')
$start.Environment['TEMP']=Join-Path $labRoot '.lab\tmp'
$start.Environment['TMP']=Join-Path $labRoot '.lab\tmp'
$start.Environment['OMNI_PRINT_LAB']='004B'
$start.Environment['CHECKPOINT_DISABLE']='1'
$start.Environment['PRISMA_HIDE_UPDATE_MESSAGE']='1'
$start.Environment['PRISMA_GENERATE_SKIP_AUTOINSTALL']='true'
$start.Environment['PRISMA_SCHEMA_ENGINE_BINARY']='C:\Projetos\omni-gestao\node_modules\@prisma\engines\schema-engine-windows.exe'
$start.Environment['PRISMA_QUERY_ENGINE_LIBRARY']='C:\Projetos\omni-gestao\node_modules\@prisma\engines\query_engine-windows.dll.node'
$start.Environment['NODE_PATH']='C:\Projetos\omni-gestao\node_modules'
$process=[Diagnostics.Process]::new()
$process.StartInfo=$start
$null=$process.Start()
$outTask=$process.StandardOutput.ReadToEndAsync()
$errTask=$process.StandardError.ReadToEndAsync()
$process.WaitForExit()
[Console]::Out.Write($outTask.GetAwaiter().GetResult())
[Console]::Error.Write($errTask.GetAwaiter().GetResult())
exit $process.ExitCode
