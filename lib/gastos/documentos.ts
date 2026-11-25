import "server-only"
import { createHash, randomUUID } from "node:crypto"
import { z } from "zod"
import type { Prisma } from "@/generated/prisma"
import { comContextoFinanceiro, storeDoContexto, type FinanceiroDb } from "./financeiro-scope"
import { comLeituraFinanceira, FinanceiroReadError, leituraPerfilWhere } from "./read-scope"
import { documentoStorageRef, type DocumentoStoragePort } from "./documentos-fixture"
import type { FinanceiroContextoAutorizado } from "./types"

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,191}$/)
const registro = z.object({
  nomeArquivo: z.string().trim().min(1).max(180).refine(nome => [...nome].every(char =>
    char !== "/" && char !== "\\" && char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)),
  conteudo: z.instanceof(Uint8Array).refine(bytes => bytes.byteLength > 0 && bytes.byteLength <= 10 * 1024 * 1024),
  proveniencia: z.enum(["FIXTURE", "UPLOAD_INTERNO"]),
}).strict()
const alvoSchema = z.object({ tipo: z.enum(["PAGAR", "RECEBER", "CONTA", "MOVIMENTACAO"]), id }).strict()
const DOWNLOAD_TTL = 60

const documentoSelect = {
  id: true, nomeArquivo: true, mime: true, bytes: true, estado: true, createdAt: true,
} satisfies Prisma.DocumentoGastoSelect

function dto(row: { id: string; nomeArquivo: string; mime: string; bytes: number; estado: string; createdAt: Date }) {
  return { id: row.id, nomeArquivo: row.nomeArquivo, mime: row.mime, bytes: row.bytes,
    estado: row.estado, criadoEm: row.createdAt.toISOString() }
}

function documentoWhere(ctx: FinanceiroContextoAutorizado, documentoId?: string) {
  return { ...(documentoId ? { id: documentoId } : {}), perfilId: ctx.perfilId,
    storeId: storeDoContexto(ctx), ownerAdminUserId: ctx.tipo === "PESSOAL" ? ctx.userId : null }
}

function mimeDosBytes(bytes: Buffer): string {
  if (bytes.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf"
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png"
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg"
  // Texto simples é útil para comprovantes sintéticos. HTML/SVG não são servidos como mídia.
  const text = bytes.toString("utf8")
  if (!text.includes("\uFFFD") && !bytes.some(byte => byte < 9 || byte === 11 || byte === 12 || (byte >= 14 && byte < 32))
    && !/^\s*</.test(text)) return "text/plain"
  throw new FinanceiroReadError(422)
}

async function storagePrivado(storage: DocumentoStoragePort) {
  if (storage.ambiente !== "fixture") throw new FinanceiroReadError(503)
  const bucket = await storage.verificarBucket()
  if (!bucket.existe || bucket.publico !== false) throw new FinanceiroReadError(503)
}

/** Só o contexto opaco fornece perfil/owner; metadados são derivados dos bytes no servidor. */
export async function registrarDocumentoGasto(contexto: unknown, input: unknown, storage: DocumentoStoragePort) {
  const parsed = registro.safeParse(input)
  if (!parsed.success) throw new FinanceiroReadError(422)
  const bytes = Buffer.from(parsed.data.conteudo)
  const mime = mimeDosBytes(bytes), sha256 = createHash("sha256").update(bytes).digest("hex")
  let criadoPath: string | undefined
  try {
    return await comContextoFinanceiro(contexto, async (db, ctx) => {
      await storagePrivado(storage)
      const lock = `gastos:documento:${ctx.perfilId}:${sha256}`
      await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lock}))::text AS lock`
      const existente = await db.documentoGasto.findFirst({ where: { ...documentoWhere(ctx), sha256 }, select: documentoSelect })
      if (existente) return dto(existente)
      const documentoId = randomUUID(), storageRef = documentoStorageRef(ctx.perfilId, documentoId)
      await storage.enviarConteudoPrivado(storageRef, bytes, mime)
      criadoPath = storageRef
      const metadata = await storage.obterMetadata(storageRef)
      const salvo = await storage.abrirConteudoPrivado(storageRef)
      if (metadata?.bytes !== bytes.length || metadata.mime !== mime
        || createHash("sha256").update(salvo).digest("hex") !== sha256) throw new FinanceiroReadError(503)
      const row = await db.documentoGasto.create({ data: {
        id: documentoId, perfilId: ctx.perfilId, storeId: storeDoContexto(ctx),
        ownerAdminUserId: ctx.tipo === "PESSOAL" ? ctx.userId : null, criadoPorAdminUserId: ctx.userId,
        nomeArquivo: parsed.data.nomeArquivo, mime, bytes: bytes.length, sha256, storageRef,
        proveniencia: parsed.data.proveniencia,
        historico: [{ acao: "REGISTRADO", at: new Date().toISOString(), atorId: ctx.userId }],
      }, select: documentoSelect })
      return dto(row)
    })
  } catch {
    // Se a transação falhou, este path novo nunca pertenceu a outro documento/perfil.
    if (criadoPath) await storage.removerObjeto(criadoPath).catch(() => {})
    throw new FinanceiroReadError()
  }
}

export async function listarDocumentosGasto(contexto: unknown) {
  return comLeituraFinanceira(contexto, async (db, ctx) => (await db.documentoGasto.findMany({
    where: documentoWhere(ctx), select: documentoSelect, orderBy: { id: "asc" }, take: 100,
  })).map(dto))
}

export async function consultarDocumentoGasto(contexto: unknown, documentoId: string) {
  if (!id.safeParse(documentoId).success) throw new FinanceiroReadError(404)
  return comLeituraFinanceira(contexto, async (db, ctx) => {
    const row = await db.documentoGasto.findFirst({ where: documentoWhere(ctx, documentoId), select: documentoSelect })
    if (!row) throw new FinanceiroReadError(404)
    return dto(row)
  })
}

export async function autorizarDownloadDocumentoGasto(contexto: unknown, documentoId: string, storage: DocumentoStoragePort) {
  if (!id.safeParse(documentoId).success) throw new FinanceiroReadError(404)
  return comLeituraFinanceira(contexto, async (db, ctx) => {
    const row = await db.documentoGasto.findFirst({ where: {
      ...documentoWhere(ctx, documentoId), estado: { in: ["DISPONIVEL", "RETIDO"] },
    }, select: { ...documentoSelect, storageRef: true, sha256: true } })
    if (!row || row.storageRef !== documentoStorageRef(ctx.perfilId, row.id)) throw new FinanceiroReadError(404)
    await storagePrivado(storage)
    // O storageRef persistido também é verificado no consumo; não aceitar path/URL do caller.
    const conteudo = await storage.abrirConteudoPrivado(row.storageRef)
    if (conteudo.length !== row.bytes || createHash("sha256").update(conteudo).digest("hex") !== row.sha256) throw new FinanceiroReadError(404)
    const download = await storage.criarDownloadAssinado(row.storageRef, row.nomeArquivo, DOWNLOAD_TTL)
    return { documento: dto(row), ...download, headers: { "Cache-Control": "private, no-store, max-age=0" } }
  }).catch(() => { throw new FinanceiroReadError(404) })
}

/** Vínculos reais e extensíveis por migration futura; não inventar FK de Gasto/Operação G004. */
export async function vincularDocumentoGasto(contexto: unknown, documentoId: string, input: unknown) {
  return comContextoFinanceiro(contexto, (db, ctx) => vincularDocumentoGastoNaTransacao(db, ctx, documentoId, input))
}

/** Composição pelo motor G004; o chamador mantém autorização e locks na mesma transação. */
export async function vincularDocumentoGastoNaTransacao(db: FinanceiroDb, ctx: FinanceiroContextoAutorizado, documentoId: string, input: unknown) {
  const parsed = alvoSchema.safeParse(input)
  if (!id.safeParse(documentoId).success || !parsed.success) throw new FinanceiroReadError(404)
    const documento = await db.documentoGasto.findFirst({ where: { ...documentoWhere(ctx, documentoId), estado: { not: "QUARENTENA" } }, select: { id: true } })
    if (!documento) throw new FinanceiroReadError(404)
    const alvo = parsed.data, where = { ...leituraPerfilWhere(ctx), id: alvo.id }
    const valido = alvo.tipo === "PAGAR" ? await db.contaPagarTitulo.findFirst({ where: { ...where, ativo: true }, select: { id: true } })
      : alvo.tipo === "RECEBER" ? await db.contaReceberTitulo.findFirst({ where: { ...where, ativo: true }, select: { id: true } })
      : alvo.tipo === "CONTA" ? await db.carteiraFinanceira.findFirst({ where: { ...where, ativo: true }, select: { id: true } })
      : await db.movimentacaoFinanceira.findFirst({ where, select: { id: true } })
    if (!valido) throw new FinanceiroReadError(404)
    const target = { pagarTituloId: alvo.tipo === "PAGAR" ? alvo.id : null,
      receberTituloId: alvo.tipo === "RECEBER" ? alvo.id : null,
      carteiraId: alvo.tipo === "CONTA" ? alvo.id : null, movimentacaoId: alvo.tipo === "MOVIMENTACAO" ? alvo.id : null }
    await db.documentoVinculo.createMany({ data: [{ documentoId, perfilId: ctx.perfilId, storeId: storeDoContexto(ctx), ...target }], skipDuplicates: true })
    const row = await db.documentoVinculo.findFirst({ where: { documentoId, perfilId: ctx.perfilId, ...target }, select: { id: true } })
    if (!row) throw new FinanceiroReadError(404)
    return { id: row.id, documentoId, alvo }
}

/** Orfandade não é descarte: quarentena após 24h, revisão em 30 dias, sem excluir bytes/histórico.
 * Documentos vinculados permanecem retidos por prazo indeterminado até política futura aprovada.
 */
export async function revisarOrfaosDocumentosGasto(contexto: unknown, agora = new Date()) {
  if (!Number.isFinite(agora.getTime())) throw new FinanceiroReadError(422)
  return comContextoFinanceiro(contexto, async (db, ctx) => {
    const rows = await db.documentoGasto.findMany({ where: { ...documentoWhere(ctx), estado: "DISPONIVEL",
      createdAt: { lte: new Date(agora.getTime() - 86_400_000) }, vinculos: { none: {} } },
      select: { id: true, versao: true, historico: true } })
    let quarentenados = 0
    for (const row of rows) {
      // A inserção de vínculo trava o mesmo documento. Após esperar o lock,
      // o UPDATE seguinte observa os vínculos já commitados e não os quarentena.
      await db.$queryRaw`SELECT "id" FROM "documentos_gastos" WHERE "id" = ${row.id} AND "perfilId" = ${ctx.perfilId} FOR UPDATE`
      if (!Array.isArray(row.historico)) throw new FinanceiroReadError(409)
      const update = await db.documentoGasto.updateMany({ where: { id: row.id, versao: row.versao, vinculos: { none: {} } }, data: {
        estado: "QUARENTENA", versao: { increment: 1 }, retencaoRevisarEm: new Date(agora.getTime() + 30 * 86_400_000),
        historico: [...row.historico, { acao: "ORFAO_QUARENTENA", at: agora.toISOString(), atorId: ctx.userId }],
      } })
      quarentenados += update.count
    }
    return { quarentenados, excluidos: 0 }
  })
}
