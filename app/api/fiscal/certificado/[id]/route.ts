/**
 * Certificado digital por loja — ativar/desativar e atualizar METADADOS (GOAL_002).
 *
 * - Apenas ADMIN, multi-loja (header `x-assistec-loja-id`).
 * - "1 ativo por loja": ativar um certificado desativa os demais da loja e aponta
 *   `ConfiguracaoFiscalLoja.certificadoAtivoId` — tudo em transação.
 * - NUNCA recebe senha/.pfx; só metadados + referências (`blobRef`/`senhaRef`).
 * - Não deleta (registro auditável): desativar é a operação reversível.
 */
import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma, prismaEnsureConnected } from "@/lib/prisma"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { requireFiscalAdmin } from "@/lib/fiscal/guard-fiscal-admin"
import { recordFiscalAdminLog, type FiscalLogAcao } from "@/lib/fiscal/fiscal-log"
import type { Prisma } from "@/generated/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status })
}

const patchSchema = z.object({
  ativo: z.boolean().optional(),
  apelido: z.string().trim().max(120).optional(),
  blobRef: z.string().trim().max(300).nullable().optional(),
  senhaRef: z.string().trim().max(200).nullable().optional(),
})

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const storeId = storeIdFromAssistecRequestForWrite(req)
  const acl = await requireFiscalAdmin(storeId)
  if (!acl.ok) return jsonError(acl.error, acl.status)

  const { id } = await ctx.params
  const certId = String(id ?? "").trim()
  if (!certId) return jsonError("Certificado não informado.", 400)

  let body: z.infer<typeof patchSchema>
  try {
    body = patchSchema.parse(await req.json())
  } catch {
    return jsonError("Dados inválidos.", 400)
  }

  try {
    await prismaEnsureConnected()
    // Escopo de loja: o certificado precisa pertencer à loja ativa (defesa multi-loja).
    const cert = await prisma.certificadoDigital.findFirst({
      where: { id: certId, storeId: acl.storeId },
      select: { id: true, apelido: true, ativo: true },
    })
    if (!cert) return jsonError("Certificado não encontrado nesta unidade.", 404)

    let acao: FiscalLogAcao = "certificado.update"

    await prisma.$transaction(async (tx) => {
      const data: Prisma.CertificadoDigitalUpdateInput = {}
      if (typeof body.apelido === "string") data.apelido = body.apelido.trim()
      if (body.blobRef !== undefined) data.blobRef = (body.blobRef || "").trim() || null
      if (body.senhaRef !== undefined) data.senhaRef = (body.senhaRef || "").trim() || null

      if (typeof body.ativo === "boolean") {
        data.ativo = body.ativo
        if (body.ativo) {
          acao = "certificado.ativar"
          // 1 ativo por loja: desativa os demais.
          await tx.certificadoDigital.updateMany({
            where: { storeId: acl.storeId, NOT: { id: certId } },
            data: { ativo: false },
          })
        } else {
          acao = "certificado.desativar"
        }
      }

      await tx.certificadoDigital.update({ where: { id: certId }, data })

      // Aponta/limpa o certificado ativo na configuração da loja (se existir).
      if (typeof body.ativo === "boolean") {
        const cfg = await tx.configuracaoFiscalLoja.findUnique({
          where: { storeId: acl.storeId },
          select: { storeId: true, certificadoAtivoId: true },
        })
        if (cfg) {
          await tx.configuracaoFiscalLoja.update({
            where: { storeId: acl.storeId },
            data: { certificadoAtivoId: body.ativo ? certId : (cfg.certificadoAtivoId === certId ? null : cfg.certificadoAtivoId) },
          })
        }
      }
    })

    await recordFiscalAdminLog({
      session: acl.session,
      storeId: acl.storeId,
      acao,
      mensagem: `Certificado ${acao.replace("certificado.", "")} (${cert.apelido || cert.id})`,
      detalhe: { certificadoId: certId },
    })

    const updated = await prisma.certificadoDigital.findUnique({
      where: { id: certId },
      select: { id: true, apelido: true, ativo: true, status: true },
    })
    return NextResponse.json({ ok: true, certificado: updated })
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Falha ao atualizar certificado", 500)
  }
}
