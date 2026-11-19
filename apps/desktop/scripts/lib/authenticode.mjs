import { spawnSync } from "node:child_process"

/** Get-AuthenticodeSignature (Windows PowerShell 5.1) → status, titular, thumbprint e carimbo de tempo. */
export function authenticode(file) {
  if (process.platform !== "win32") return { status: "desconhecida", signer: "", thumbprint: "", timestamped: false }
  const script =
    "$s = Get-AuthenticodeSignature -LiteralPath $env:OMNI_SIG_FILE; " +
    "[pscustomobject]@{ status = $s.Status.ToString(); signer = [string]$s.SignerCertificate.Subject; " +
    "thumbprint = [string]$s.SignerCertificate.Thumbprint; timestamped = [bool]$s.TimeStamperCertificate } | ConvertTo-Json -Compress"
  const ps = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
    // Sem PSModulePath herdado do pwsh 7 (CI): o Windows PowerShell 5.1 não carregaria o módulo de segurança.
    env: { ...process.env, PSModulePath: undefined, OMNI_SIG_FILE: file },
    encoding: "utf8",
  })
  try {
    const r = JSON.parse(ps.stdout.trim())
    return {
      status: String(r.status),
      signer: String(r.signer ?? ""),
      thumbprint: String(r.thumbprint ?? "").toLowerCase(),
      timestamped: r.timestamped === true,
    }
  } catch {
    return { status: "desconhecida", signer: "", thumbprint: "", timestamped: false }
  }
}
