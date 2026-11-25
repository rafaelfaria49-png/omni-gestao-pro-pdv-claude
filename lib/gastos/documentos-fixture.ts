import "server-only"
import { randomBytes } from "node:crypto"
import type { StorageDocumentosPort } from "@/lib/contador/documentos/storage-types"
import { FinanceiroReadError } from "./read-scope"

/** Porta compatível com o storage privado existente; somente fixture é liberada no G003. */
export type DocumentoStoragePort = Pick<StorageDocumentosPort,
  "verificarBucket" | "enviarConteudoPrivado" | "obterMetadata" | "abrirConteudoPrivado" |
  "criarDownloadAssinado" | "removerObjeto"
> & { readonly ambiente: "fixture" }

export function documentoStorageRef(perfilId: string, documentoId: string): string {
  const id = /^[a-zA-Z0-9_-]{1,191}$/
  if (!id.test(perfilId) || !id.test(documentoId)) throw new FinanceiroReadError(404)
  return `gastos/v1/${perfilId}/${documentoId}`
}

function validarPath(path: string) {
  const match = /^gastos\/v1\/([a-zA-Z0-9_-]{1,191})\/([a-zA-Z0-9_-]{1,191})$/.exec(path)
  if (!match || documentoStorageRef(match[1], match[2]) !== path) throw new FinanceiroReadError(404)
}

/** Sem IO de rede, env, arquivo público ou credencial. Instância exclusiva por ensaio. */
export class DocumentoStorageFixture implements DocumentoStoragePort {
  readonly ambiente = "fixture" as const
  private readonly objetos = new Map<string, { bytes: Buffer; mime: string }>()
  private readonly tickets = new Map<string, { path: string; expiresAt: number }>()
  constructor(private readonly agora: () => number = Date.now) {}
  async verificarBucket() { return { existe: true, publico: false } }
  async enviarConteudoPrivado(path: string, bytes: Uint8Array, mime: string) {
    validarPath(path)
    if (this.objetos.has(path)) throw new FinanceiroReadError(409)
    this.objetos.set(path, { bytes: Buffer.from(bytes), mime })
  }
  async obterMetadata(path: string) {
    validarPath(path)
    const obj = this.objetos.get(path)
    return obj ? { bytes: obj.bytes.length, mime: obj.mime } : null
  }
  async abrirConteudoPrivado(path: string) {
    validarPath(path)
    const obj = this.objetos.get(path)
    if (!obj) throw new FinanceiroReadError(404)
    return Buffer.from(obj.bytes)
  }
  async criarDownloadAssinado(path: string, _nomeArquivo: string, expiresInSec = 60) {
    void _nomeArquivo // A capability opaca da fixture não incorpora o nome privado.
    validarPath(path)
    if (!this.objetos.has(path) || !Number.isInteger(expiresInSec) || expiresInSec < 1 || expiresInSec > 60) {
      throw new FinanceiroReadError(404)
    }
    const token = randomBytes(32).toString("base64url")
    this.tickets.set(token, { path, expiresAt: this.agora() + expiresInSec * 1000 })
    return { signedUrl: `fixture-private://download/${token}`, expiresInSec }
  }
  /** Consumo de capability no ensaio: URL opaca não contém hash/path/nome. */
  async consumirDownload(url: string) {
    const token = /^fixture-private:\/\/download\/([\w-]{43})$/.exec(url)?.[1]
    const ticket = token ? this.tickets.get(token) : undefined
    if (!ticket || this.agora() >= ticket.expiresAt) throw new FinanceiroReadError(404)
    return this.abrirConteudoPrivado(ticket.path)
  }
  async removerObjeto(path: string) {
    validarPath(path)
    this.objetos.delete(path)
    for (const [id, ticket] of this.tickets) if (ticket.path === path) this.tickets.delete(id)
  }
}
