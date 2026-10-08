/**
 * Allowlist de ambiente: nenhuma autoridade, token, .env ou NODE_OPTIONS herdado.
 * @param {Record<string, string | undefined>} [source]
 */
export function safeEnvironment(source = process.env) {
  const allowed = /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|TMPDIR|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMW6432|SYSTEMDRIVE|OS|HOME|LANG|LC_[A-Z_]+)$/i
  return Object.fromEntries(Object.entries(source).filter(([key]) => allowed.test(key)))
}
