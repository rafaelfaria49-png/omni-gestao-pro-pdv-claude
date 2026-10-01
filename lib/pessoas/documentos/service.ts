import { randomUUID } from "node:crypto"
import { storageR2 } from "@/lib/contador/documentos/storage-r2"
import type { StorageDocumentosPort } from "@/lib/contador/documentos/storage-types"
import { prisma } from "@/lib/prisma"
import { executarComando } from "../commands"
import { exigirModulo, PessoasError, sha256, texto } from "../domain"
import { exigirEscopo } from "../scope"
import { emitirIntent, verificarIntent, type Intent } from "./intent"
import { categoriaValida, categoriasLegiveis, classificacaoDe, nomeDownloadNeutro, podeLerDocumento } from "./politica"

const MAX_BYTES = 25 * 1024 * 1024
const MIME = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg" } as const
type Extensao = keyof typeof MIME

function storage(): StorageDocumentosPort {
  exigirModulo()
  if (process.env.PESSOAS_STORAGE_PROVIDER !== "r2") throw new PessoasError("STORAGE_INDISPONIVEL", 503)
  return storageR2
}
function nomeMime(entrada: { nomeArquivo: unknown; mime: unknown }) {
  const nome = texto(entrada.nomeArquivo, 180, true)!
  if (nome.includes("/") || nome.includes("\\") || nome.includes("..") ||
      /[<>:"|?*]/.test(nome)) throw new PessoasError("ARQUIVO_INVALIDO")
  const ext = nome.split(".").pop()?.toLowerCase() as Extensao | undefined
  const mime = typeof entrada.mime === "string" ? entrada.mime.toLowerCase().trim() : ""
  if (!ext || !(ext in MIME) || MIME[ext] !== mime) throw new PessoasError("ARQUIVO_INVALIDO")
  return { nome, mime, ext }
}

function metadados(input: { bytes: unknown; sha256: unknown; categoria: unknown; origem: unknown }) {
  if (typeof input.bytes !== "number" || !Number.isInteger(input.bytes) || input.bytes < 1 || input.bytes > MAX_BYTES) {
    throw new PessoasError("ARQUIVO_INVALIDO")
  }
  const hash = typeof input.sha256 === "string" ? input.sha256.toLowerCase() : ""
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new PessoasError("HASH_INVALIDO")
  if (!categoriaValida(input.categoria)) throw new PessoasError("CATEGORIA_INVALIDA")
  if (input.origem !== "INTERNO" && input.origem !== "CONTADOR_EXTERNO") throw new PessoasError("ORIGEM_INVALIDA")
  if (input.categoria === "holerite_externo" && input.origem !== "CONTADOR_EXTERNO") {
    throw new PessoasError("ORIGEM_INVALIDA")
  }
  return { bytes: input.bytes, sha256: hash, categoria: input.categoria, origem: input.origem as "INTERNO" | "CONTADOR_EXTERNO" }
}

function validarBytes(ext: Extensao, bytes: Buffer) {
  const assinatura = ext === "pdf" ? Buffer.from("%PDF") :
    ext === "png" ? Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) :
    Buffer.from([0xff, 0xd8, 0xff])
  if (bytes.length === 0 || !bytes.subarray(0, assinatura.length).equals(assinatura)) {
    throw new PessoasError("CONTEUDO_INVALIDO")
  }
}

function refCanonica(p: Pick<Intent, "empregadorId" | "storeId" | "documentoId">) {
  for (const value of [p.empregadorId, p.storeId, p.documentoId]) {
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(value)) throw new PessoasError("INTENT_INVALIDO", 403)
  }
  return `pessoas/${p.empregadorId}/${p.storeId}/${p.documentoId}`
}

export async function criarUploadIntent(input: {
  empregadorId: string; vinculoId: string; categoria: string; origem: "INTERNO" | "CONTADOR_EXTERNO"
  nomeArquivo: string; mime: string; bytes: number; sha256: string
}) {
  const escopo = await exigirEscopo(input.empregadorId, "editCadastro")
  if (!escopo.capacidades.includes("viewDocumento")) throw new PessoasError("ESCOPO_NEGADO", 403)
  const v = await prisma.dpVinculo.findFirst({
    where: { id: input.vinculoId, empregadorId: escopo.empregadorId, storeId: escopo.storeId },
    select: { id: true, pessoaId: true },
  })
  if (!v) throw new PessoasError("NAO_ENCONTRADO", 404)
  const { nome, mime } = nomeMime(input)
  const meta = metadados(input)
  if (!podeLerDocumento(meta.categoria, escopo.capacidades)) throw new PessoasError("ESCOPO_NEGADO", 403)
  const documentoId = randomUUID()
  const dados = {
    empregadorId: escopo.empregadorId, storeId: escopo.storeId, userId: escopo.userId,
    pessoaId: v.pessoaId, vinculoId: v.id, documentoId,
    storageRef: refCanonica({ empregadorId: escopo.empregadorId, storeId: escopo.storeId, documentoId }),
    categoria: meta.categoria, origem: meta.origem,
    nomeArquivo: nome, mime, bytes: meta.bytes, sha256: meta.sha256,
  }
  const intent = emitirIntent(dados)
  const upload = await storage().criarUploadAssinado(dados.storageRef)
  return {
    documentoId,
    signedUrl: upload.signedUrl,
    expiresInSec: upload.expiresInSec,
    headersObrigatorios: upload.headersObrigatorios,
    uploadIntent: intent,
  }
}

export async function confirmarUpload(token: unknown) {
  const intent = verificarIntent(token)
  const escopo = await exigirEscopo(intent.empregadorId, "editCadastro")
  if (!escopo.capacidades.includes("viewDocumento") ||
      intent.userId !== escopo.userId || intent.storeId !== escopo.storeId ||
      intent.storageRef !== refCanonica(intent)) throw new PessoasError("INTENT_INVALIDO", 403)
  if (!podeLerDocumento(intent.categoria, escopo.capacidades)) throw new PessoasError("ESCOPO_NEGADO", 403)
  const vinculo = await prisma.dpVinculo.findFirst({
    where: {
      id: intent.vinculoId, pessoaId: intent.pessoaId,
      empregadorId: escopo.empregadorId, storeId: escopo.storeId,
    },
    select: { id: true },
  })
  if (!vinculo) throw new PessoasError("NAO_ENCONTRADO", 404)
  const existente = await prisma.dpDocumento.findUnique({ where: { id: intent.documentoId } })
  if (existente) {
    if (existente.empregadorId !== escopo.empregadorId || existente.storeId !== escopo.storeId ||
        existente.storageRef !== intent.storageRef || existente.sha256 !== intent.sha256) {
      throw new PessoasError("INTENT_INVALIDO", 403)
    }
    return dtoDocumento(existente)
  }
  const { ext } = nomeMime(intent)
  metadados(intent)
  const objeto = await storage().abrirConteudoPrivado(intent.storageRef)
  try {
    if (objeto.length !== intent.bytes || sha256(objeto) !== intent.sha256) throw new PessoasError("INTEGRIDADE_INVALIDA")
    validarBytes(ext, objeto)
  } catch (e) {
    await storage().removerObjeto(intent.storageRef)
    throw e
  }
  await executarComando(escopo, "DOCUMENTO_CONFIRMAR", intent.documentoId, intent, async (tx) => {
    const doc = await tx.dpDocumento.create({
      data: {
        id: intent.documentoId, empregadorId: escopo.empregadorId,
        pessoaId: intent.pessoaId, vinculoId: intent.vinculoId, storeId: escopo.storeId,
        categoria: intent.categoria, classificacao: classificacaoDe(intent.categoria), origem: intent.origem,
        nomeArquivo: intent.nomeArquivo, storageRef: intent.storageRef,
        mime: intent.mime, bytes: intent.bytes, sha256: intent.sha256, enviadoPorId: escopo.userId,
      },
    })
    return { empregadorId: escopo.empregadorId, entidade: "documento", entidadeId: doc.id, campos: ["documentoConfirmado"] }
  }, escopo.empregadorId)
  const doc = await prisma.dpDocumento.findUnique({ where: { id: intent.documentoId } })
  if (!doc) throw new PessoasError("DOCUMENTO_INDISPONIVEL", 503)
  return dtoDocumento(doc)
}

type Doc = Awaited<ReturnType<typeof prisma.dpDocumento.findUnique>>
function dtoDocumento(doc: NonNullable<Doc>) {
  return {
    id: doc.id, vinculoId: doc.vinculoId, categoria: doc.categoria,
    classificacao: classificacaoDe(doc.categoria), origem: doc.origem,
    nomeArquivo: doc.nomeArquivo, mime: doc.mime, bytes: doc.bytes,
    sha256: doc.sha256, createdAt: doc.createdAt.toISOString(),
  }
}

export async function listarDocumentos(empregadorId: string, vinculoId: string) {
  const escopo = await exigirEscopo(empregadorId, "viewDocumento")
  const vinculo = await prisma.dpVinculo.findFirst({
    where: { id: vinculoId, empregadorId: escopo.empregadorId, storeId: escopo.storeId },
    select: { id: true },
  })
  if (!vinculo) throw new PessoasError("NAO_ENCONTRADO", 404)
  const docs = await prisma.dpDocumento.findMany({
    where: {
      empregadorId: escopo.empregadorId, storeId: escopo.storeId, vinculoId,
      categoria: { in: categoriasLegiveis(escopo.capacidades) },
    },
    orderBy: { createdAt: "desc" },
  })
  return docs.map(dtoDocumento)
}

export async function autorizarDownload(empregadorId: string, documentoId: string) {
  const escopo = await exigirEscopo(empregadorId, "viewDocumento")
  const doc = await prisma.dpDocumento.findFirst({
    where: { id: documentoId, empregadorId: escopo.empregadorId, storeId: escopo.storeId },
  })
  if (!doc || doc.storageRef !== refCanonica({ empregadorId: doc.empregadorId, storeId: doc.storeId, documentoId: doc.id })) throw new PessoasError("NAO_ENCONTRADO", 404)
  if (!podeLerDocumento(doc.categoria, escopo.capacidades)) throw new PessoasError("ESCOPO_NEGADO", 403)
  const nomeNeutro = nomeDownloadNeutro(doc.mime)
  if (!await storage().verificarExistencia(doc.storageRef)) throw new PessoasError("DOCUMENTO_INDISPONIVEL", 503)
  const url = await storage().criarDownloadAssinado(doc.storageRef, nomeNeutro, 300)
  await executarComando(escopo, "DOCUMENTO_DOWNLOAD_AUTORIZAR", randomUUID(), {
    documentoId: doc.id,
  }, async () => ({
    empregadorId: escopo.empregadorId, entidade: "documento", entidadeId: doc.id,
    campos: ["downloadAutorizado"],
  }), escopo.empregadorId)
  return { signedUrl: url.signedUrl, expiresInSec: url.expiresInSec }
}
