/** Bloqueio de destino para qualquer escrita de homologação Pessoas 001A. */
export function assertIsolatedUrl(raw) {
  if (!raw) throw new Error("PESSOAS_HOMOLOGATION_DATABASE_URL_AUSENTE")
  let url
  try { url = new URL(raw) } catch { throw new Error("PESSOAS_HOMOLOGATION_DATABASE_URL_INVALIDA") }
  if (
    url.protocol !== "postgresql:" ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "55439" ||
    url.username !== "omni_homolog" ||
    url.pathname !== "/omni_pessoas_001a_homolog"
  ) throw new Error("PESSOAS_DESTINO_NAO_ISOLADO")
  return { host: url.hostname, port: url.port, database: url.pathname.slice(1), user: url.username }
}

if (process.argv[1] && import.meta.url === new URL("file:///" + process.argv[1].replaceAll("\\", "/")).href) {
  const destino = assertIsolatedUrl(process.env.PESSOAS_HOMOLOGATION_DATABASE_URL)
  if (process.env.DATABASE_URL !== process.env.PESSOAS_HOMOLOGATION_DATABASE_URL ||
      process.env.DIRECT_URL !== process.env.PESSOAS_HOMOLOGATION_DATABASE_URL) {
    throw new Error("PESSOAS_URLS_DIVERGENTES")
  }
  process.stdout.write(`PASS destino isolado ${destino.host}:${destino.port}/${destino.database} role=${destino.user}\n`)
}
