/**
 * Reader fiscal server-side — ADR-0018 (GOAL-013) §2.5.
 *
 * Lê o XML autorizado e o XML assinado **persistidos** para consumidores
 * futuros (reimpressão, DANFCE GOAL-021, download fiscal, Contador HUB
 * read-only). Lê direto da coluna `NotaFiscal.{xmlAutorizado,xmlAssinado,
 * protocolo,cStat,xMotivo,dataAutorizacao,digestValue,qrCodeData,urlConsulta,
 * xmlStorageRef}` e do SHA-256 persistido em `FiscalEmissaoJob.payload.
 * document.bytesSha256`.
 *
 * Regras inegociáveis:
 *  - Exige `storeId` (lança `FiscalStorageError('store_id_obrigatorio')`).
 *  - Valida isolamento: `where: { id: notaFiscalId, storeId }` — loja A não
 *    lê documento de loja B.
 *  - **Nunca** reconstrói XML a partir de dados vivos (venda/snapshot/produto).
 *  - **Nunca** permite alteração (read-only).
 *  - Nenhum XML completo em logs; somente hashes e identificadores.
 *  - Computa SHA-256 fresco do `xmlAutorizado`/`xmlAssinado` somente quando
 *    a coluna correspondente não estiver vazia.
 *
 * **Server-only por construção, não por diretiva:** este módulo importa
 * `@/lib/prisma` e portanto nunca entra no bundle do cliente. Não leva
 * `"use server"` — essa diretiva declara *Server Actions* (todo export precisa
 * ser função async), e aqui exportamos um factory e tipos.
 */
import { createHash } from "node:crypto"

import { prisma } from "@/lib/prisma"

import { resolveXmlStorageMirror } from "./mirror-vault"
import type {
  AuthorizedXmlDocument,
  FiscalDocumentLocator,
  FiscalXmlReader,
  XmlStorageMirror,
} from "./types"
import { FiscalStorageError } from "./types"

type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {}
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function safeHash(content: string | null): string | null {
  if (content === null) return null
  return createHash("sha256").update(content, "utf8").digest("hex")
}

/**
 * Implementação default do reader usando Prisma. `client` e `resolveMirror` são
 * injetáveis apenas para teste — o caller de produção usa o singleton `prisma`
 * e o espelho no-op (nenhum storage externo provisionado neste GOAL).
 */
export function createFiscalXmlReader(
  client: FiscalXmlReaderClient = prisma as unknown as FiscalXmlReaderClient,
  resolveMirror: () => XmlStorageMirror = resolveXmlStorageMirror,
): FiscalXmlReader {
  return {
    async readAuthorizedDocument(locator: FiscalDocumentLocator): Promise<AuthorizedXmlDocument | null> {
      if (!locator || !locator.storeId || locator.storeId.trim().length === 0) {
        throw new FiscalStorageError(
          "store_id_obrigatorio",
          "Reader fiscal exige storeId não-vazio para isolar a leitura por loja.",
        )
      }
      if (!locator.notaFiscalId || locator.notaFiscalId.trim().length === 0) {
        throw new FiscalStorageError(
          "nota_nao_encontrada",
          "Reader fiscal exige notaFiscalId não-vazio para localizar o documento.",
        )
      }
      const [nota, job] = await Promise.all([
        client.notaFiscal.findFirst({
          where: {
            id: locator.notaFiscalId,
            storeId: locator.storeId,
            ...(locator.vendaId ? { vendaId: locator.vendaId } : {}),
          },
          select: {
            id: true,
            storeId: true,
            vendaId: true,
            modelo: true,
            ambiente: true,
            status: true,
            serie: true,
            numero: true,
            chaveAcesso: true,
            xmlAssinado: true,
            xmlAutorizado: true,
            xmlStorageRef: true,
            protocolo: true,
            cStat: true,
            xMotivo: true,
            dataAutorizacao: true,
            digestValue: true,
            qrCodeData: true,
            urlConsulta: true,
          },
        }),
        client.fiscalEmissaoJob.findFirst({
          where: {
            storeId: locator.storeId,
            notaFiscalId: locator.notaFiscalId,
            ...(locator.vendaId ? { vendaId: locator.vendaId } : {}),
            tipo: "EMISSAO",
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { id: true, payload: true },
        }),
      ])
      const noteRow = record(nota)
      if (!noteRow.id) return null
      const xmlAutorizado = stringOrNull(noteRow.xmlAutorizado)
      const xmlAssinado = stringOrNull(noteRow.xmlAssinado)
      const columnBytesSha256 = safeHash(xmlAutorizado)
      const jobRow = record(job)
      const jobPayload = record(jobRow.payload)
      const jobDocument = record(jobPayload.document)
      const persistedAssinadoSha256 = stringOrNull(jobDocument.bytesSha256)
      const xmlAutorizadoSha256 = columnBytesSha256
      const xmlAssinadoSha256 = persistedAssinadoSha256 ?? safeHash(xmlAssinado)
      const xmlStorageRef = stringOrNull(noteRow.xmlStorageRef)
      const mirror = resolveMirror()
      let mirrorDivergent = false
      if (mirror.active && xmlStorageRef !== null && xmlAutorizadoSha256 !== null) {
        const verification = await mirror.verifyAgainstColumn({
          storeId: locator.storeId,
          notaFiscalId: locator.notaFiscalId,
          xmlStorageRef,
          columnBytesSha256: xmlAutorizadoSha256,
        })
        mirrorDivergent = verification.divergent
      }
      if (mirrorDivergent) {
        await client.fiscalLog.create({
          data: {
            storeId: locator.storeId,
            vendaId: stringOrNull(noteRow.vendaId) ?? null,
            notaFiscalId: locator.notaFiscalId,
            nivel: "WARN",
            acao: "fiscal.storage.mirror_divergent",
            mensagem: "Espelho privado divergiu da coluna; coluna permanece a fonte primária.",
            operador: "fiscal-goal-013-reader",
            detalhe: {
              xmlAutorizadoSha256,
              chaveAcesso: stringOrNull(noteRow.chaveAcesso),
            },
          },
        })
      }
      await client.fiscalLog.create({
        data: {
          storeId: locator.storeId,
          vendaId: stringOrNull(noteRow.vendaId) ?? null,
          notaFiscalId: locator.notaFiscalId,
          nivel: "INFO",
          acao: "fiscal.storage.authorized_read",
          mensagem: "Leitura server-side do XML autorizado persistido.",
          operador: "fiscal-goal-013-reader",
          detalhe: {
            chaveAcesso: stringOrNull(noteRow.chaveAcesso),
            xmlAutorizadoSha256,
            xmlAssinadoSha256,
            xmlStorageRef,
            mirrorActive: mirror.active,
            mirrorDivergent,
          },
        },
      })
      const dataAutorizacaoRaw = noteRow.dataAutorizacao
      const dataAutorizacao =
        dataAutorizacaoRaw instanceof Date
          ? dataAutorizacaoRaw
          : typeof dataAutorizacaoRaw === "string" || typeof dataAutorizacaoRaw === "number"
            ? new Date(dataAutorizacaoRaw)
            : null
      return {
        storeId: String(noteRow.storeId ?? locator.storeId),
        vendaId: String(noteRow.vendaId ?? locator.vendaId ?? ""),
        notaFiscalId: String(noteRow.id ?? locator.notaFiscalId),
        chaveAcesso: stringOrNull(noteRow.chaveAcesso),
        serie: noteRow.serie === null || noteRow.serie === undefined ? null : Number(noteRow.serie),
        numero: noteRow.numero === null || noteRow.numero === undefined ? null : Number(noteRow.numero),
        modelo: String(noteRow.modelo ?? "NFCE"),
        ambiente: String(noteRow.ambiente ?? "HOMOLOGACAO"),
        status: String(noteRow.status ?? ""),
        xmlAutorizado,
        xmlAssinado,
        xmlAutorizadoSha256,
        xmlAssinadoSha256,
        protocolo: stringOrNull(noteRow.protocolo),
        cStat: stringOrNull(noteRow.cStat),
        xMotivo: stringOrNull(noteRow.xMotivo),
        dataAutorizacao,
        digestValue: stringOrNull(noteRow.digestValue),
        qrCodeData: stringOrNull(noteRow.qrCodeData),
        urlConsulta: stringOrNull(noteRow.urlConsulta),
        xmlStorageRef,
      }
    },
  }
}

/**
 * Cliente Prisma mínimo aceito pelo reader (para injeção em testes).
 */
export type FiscalXmlReaderClient = {
  notaFiscal: {
    findFirst: (args: unknown) => Promise<unknown | null>
  }
  fiscalEmissaoJob: {
    findFirst: (args: unknown) => Promise<unknown | null>
  }
  fiscalLog: {
    create: (args: unknown) => Promise<unknown>
  }
}

/**
 * Instância singleton do reader com o Prisma de produção. Server-only.
 */
export const fiscalXmlReader: FiscalXmlReader = createFiscalXmlReader()