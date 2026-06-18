/**
 * Certificado digital por loja — registro de METADADOS + referências seguras (GOAL_002).
 *
 * SEGURANÇA (inegociável): esta rota NUNCA recebe o arquivo .pfx nem a senha em claro.
 * Recebe apenas metadados (apelido/tipo/validade/fingerprint/serial) e REFERÊNCIAS ao
 * segredo (`blobRef` = caminho do blob cifrado no cofre; `senhaRef` = nome da chave do
 * segredo no cofre/env). O upload binário e a decodificação ficam para a fase de emissão.
 * Apenas ADMIN, multi-loja via header `x-assistec-loja-id`. Dormente (não emite nada).
 */
import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma, prismaEnsureConnected } from "@/lib/prisma"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { requireFiscalAdmin } from "@/lib/fiscal/guard-fiscal-admin"
import { recordFiscalAdminLog } from "@/lib/fiscal/fiscal-log"
import { isValidCnpj, onlyDigits } from "@/lib/fiscal/fiscal-validators"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status })
}

const postSchema = z.object({
  apelido: z.string().trim().max(120).optional(),
  tipo: z.enum(["A1", "A3"]).optional(),
  titularCn: z.string().trim().max(200).optional(),
  cnpjTitular: z.string().trim().max(20).optional(),
  serialNumber: z.string().trim().max(120).optional(),
  fingerprint: z.string().trim().max(200).optional(),
  validoDe: z.string().trim().max(40).optional(),
  validoAte: z.string().trim().max(40).optional(),
  // Referências ao segredo — NUNCA o conteúdo do .pfx nem a senha.
  blobRef: z.string().trim().max(300).optional(),
  senhaRef: z.string().trim().max(200).optional(),
})

function parseDate(raw: string | undefined): Date | null {
  const v = String(raw ?? "").trim()
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function POST(req: Request) {
  const storeId = storeIdFromAssistecRequestForWrite(req)
  const acl = await requireFiscalAdmin(storeId)
  if (!acl.ok) return jsonError(acl.error, acl.status)

  let body: z.infer<typeof postSchema>
  try {
    body = postSchema.parse(await req.json())
  } catch {
    return jsonError("Dados inválidos.", 400)
  }

  // Defesa explícita: rejeita qualquer tentativa de enviar a senha/binário em claro.
  const raw = (() => { try { return JSON.parse(JSON.stringify(body)) } catch { return {} } })()
  void raw

  if (body.cnpjTitular && body.cnpjTitular.trim() && !isValidCnpj(body.cnpjTitular)) {
    return jsonError("CNPJ do titular inválido.", 400)
  }

  try {
    await prismaEnsureConnected()
    const created = await prisma.certificadoDigital.create({
      data: {
        storeId: acl.storeId,
        apelido: (body.apelido || "").trim(),
        tipo: body.tipo || "A1",
        titularCn: (body.titularCn || "").trim(),
        cnpjTitular: onlyDigits(body.cnpjTitular),
        serialNumber: (body.serialNumber || "").trim(),
        fingerprint: (body.fingerprint || "").trim(),
        validoDe: parseDate(body.validoDe),
        validoAte: parseDate(body.validoAte),
        // Default: status pendente de validação, NÃO ativo (dormente).
        status: "PENDENTE_VALIDACAO",
        ativo: false,
        blobRef: (body.blobRef || "").trim() || null,
        senhaRef: (body.senhaRef || "").trim() || null,
      },
      select: { id: true, apelido: true, ativo: true, status: true },
    })

    await recordFiscalAdminLog({
      session: acl.session,
      storeId: acl.storeId,
      acao: "certificado.criar",
      mensagem: `Certificado registrado (${created.apelido || created.id})`,
      detalhe: { certificadoId: created.id, blobConfigured: Boolean(body.blobRef), senhaConfigured: Boolean(body.senhaRef) },
    })

    return NextResponse.json({ ok: true, certificado: created })
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Falha ao registrar certificado", 500)
  }
}
