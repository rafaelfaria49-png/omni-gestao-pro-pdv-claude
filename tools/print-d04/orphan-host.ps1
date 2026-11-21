param([string]$HostNonce)
$ErrorActionPreference='Stop'
[Console]::Out.WriteLine('READY'); [Console]::Out.Flush()
# Synthetic hung host, only ever started on isolated tests; no winspool or printer code.
Start-Sleep -Seconds 600
