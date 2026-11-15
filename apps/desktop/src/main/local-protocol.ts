import { protocol, type Session } from "electron"
import { readFile } from "node:fs/promises"
import path from "node:path"

/**
 * Esquema próprio para a tela local de status.
 *
 * O fuse GrantFileProtocolExtraPrivileges fica DESLIGADO (file:// sem privilégios extras e sem
 * ler o asar). Por isso a tela de status é servida por `omni-app://status/…`, registrado APENAS
 * na sessão da tela de status — a página remota não consegue nem resolver esse esquema.
 */
export const LOCAL_SCHEME = "omni-app"
export const STATUS_URL = `${LOCAL_SCHEME}://status/status.html`

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
}

/** Deve rodar antes de app.ready. */
export function registerLocalScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: LOCAL_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: false } },
  ])
}

/** Resolve um caminho do esquema para um arquivo dentro de rendererDir, ou null (traversal etc.). */
export function resolveLocalFile(rawUrl: string, rendererDir: string): string | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }
  if (url.protocol !== `${LOCAL_SCHEME}:` || url.host !== "status") return null
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "")
  if (!rel || rel.includes("\0")) return null
  const base = path.resolve(rendererDir)
  const file = path.resolve(base, rel)
  if (!file.startsWith(base + path.sep)) return null
  if (!TYPES[path.extname(file).toLowerCase()]) return null
  return file
}

export function handleLocalScheme(statusSession: Session, rendererDir: string) {
  statusSession.protocol.handle(LOCAL_SCHEME, async (request) => {
    const file = resolveLocalFile(request.url, rendererDir)
    if (!file) return new Response("not found", { status: 404 })
    try {
      // fs do processo principal lê dentro do app.asar normalmente.
      const body = await readFile(file)
      return new Response(body, {
        status: 200,
        headers: { "content-type": TYPES[path.extname(file).toLowerCase()], "x-content-type-options": "nosniff" },
      })
    } catch {
      return new Response("not found", { status: 404 })
    }
  })
}
