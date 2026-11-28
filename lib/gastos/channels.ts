import { createHash, randomUUID } from "node:crypto"
import { z } from "zod"
import type { WhatsAppCloudCredentials } from "@/lib/whatsapp"
import { e164, MensageriaError, type MensageriaClient, type MensageriaDb } from "./messaging-types"

const identificador = z.string().regex(/^[A-Za-z0-9_.:@-]{1,260}$/)
const referenciaCredencial = /^WHATSAPP_CANAL_TOKEN_[A-Z0-9_]{1,100}$/
const canalSchema = z.object({ canalId: z.string().uuid().optional(), phoneNumberId: z.string().regex(/^[0-9]{1,64}$/),
  wabaId: z.string().regex(/^[0-9]{1,64}$/), appId: z.string().regex(/^[0-9]{1,64}$/), telefoneE164: z.string().regex(e164),
  papel: z.enum(["GESTAO", "ATENDIMENTO"]), storeId: identificador.nullable(), credencialRef: z.string().regex(referenciaCredencial),
}).strict().refine(c => c.papel === "GESTAO" ? c.storeId === null : c.storeId !== null)

export async function exigirPapelSql(db: MensageriaDb, papel: "omni_gastos_operator" | "omni_gastos_worker" | "omni_gastos_ingress") {
  const [row] = await db.$queryRaw<Array<{ papel: string; superuser: boolean; bypass: boolean }>>`
    SELECT current_user AS papel,rolsuper AS superuser,rolbypassrls AS bypass FROM pg_roles WHERE rolname=current_user`
  if (row?.papel !== papel || row.superuser || row.bypass) throw new MensageriaError("OPERADOR_NEGADO")
}

export async function registrarCanal(db: MensageriaDb, input: unknown) {
  await exigirPapelSql(db, "omni_gastos_operator")
  const parsed = canalSchema.safeParse(input)
  if (!parsed.success) throw new MensageriaError("CANAL_INVALIDO")
  return db.whatsAppCanal.create({ data: parsed.data }) // Sempre inativo/versão1; sem segredo.
}

export async function configurarCanal(db: MensageriaDb, canalId: string, versao: number, ativo: boolean, credencialRef?: string) {
  await exigirPapelSql(db, "omni_gastos_operator")
  if (!Number.isSafeInteger(versao) || versao < 1 || typeof ativo !== "boolean"
    || (credencialRef !== undefined && !referenciaCredencial.test(credencialRef))) throw new MensageriaError("CANAL_INVALIDO")
  const r = await db.whatsAppCanal.updateMany({ where: { canalId, versao }, data: { ativo, credencialRef, versao: { increment: 1 } } })
  if (r.count !== 1) throw new MensageriaError("CANAL_ALTERADO")
  return db.whatsAppCanal.findUniqueOrThrow({ where: { canalId } })
}

export async function resolverCanalExato(db: MensageriaDb, input: { canalId: string; phoneNumberId: string; wabaId: string; appId: string }) {
  const row = await db.whatsAppCanal.findUnique({ where: { canalId: input.canalId } })
  if (!row?.ativo || row.phoneNumberId !== input.phoneNumberId || row.wabaId !== input.wabaId || row.appId !== input.appId) {
    throw new MensageriaError("CANAL_INVALIDO")
  }
  return row
}

/** Reusa o contrato do cliente Graph; não chama o transporte nem consulta loja. */
export function credenciaisDoCanal(canal: { phoneNumberId: string; credencialRef: string }, env: Record<string, string | undefined>): WhatsAppCloudCredentials {
  if (!referenciaCredencial.test(canal.credencialRef)) throw new MensageriaError("CONFIG_INVALIDA")
  const accessToken = env[canal.credencialRef]?.trim()
  if (!accessToken) throw new MensageriaError("CONFIG_INVALIDA")
  return { phoneNumberId: canal.phoneNumberId, accessToken }
}

const ingressoSchema = z.object({ provedor: z.literal("META"), canalId: z.string().uuid(), phoneNumberId: z.string().regex(/^[0-9]{1,64}$/),
  wabaId: z.string().regex(/^[0-9]{1,64}$/), appId: z.string().regex(/^[0-9]{1,64}$/), externalMessageId: identificador,
  remetenteE164: z.string().regex(e164), correlacaoId: identificador, respondidoA: identificador.optional(), mediaId: identificador.optional(),
  ocorridoEm: z.string().datetime({ offset: true }), conteudo: z.record(z.unknown()),
}).strict()

function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value)
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]"
  if (typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype) {
    return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + canonical((value as Record<string, unknown>)[k])).join(",") + "}"
  }
  throw new MensageriaError("INGRESSO_INVALIDO")
}

/** Retorna ACK durável SOMENTE após o COMMIT inbox+job; nenhuma rota pública em G006. */
export async function persistirIngresso(db: MensageriaClient, input: unknown) {
  const parsed = ingressoSchema.safeParse(input)
  if (!parsed.success) throw new MensageriaError("INGRESSO_INVALIDO")
  const p = parsed.data
  let conteudo: string, conteudoHash: string
  try {
    conteudo = canonical(p.conteudo)
    // jsonb::text acrescenta espaços aos separadores; até 30KiB canônicos
    // cabem no CHECK de 64KiB mesmo com arrays/objetos densos.
    if (Buffer.byteLength(conteudo) > 30 * 1024) throw new MensageriaError("INGRESSO_INVALIDO")
    conteudoHash = createHash("sha256").update(canonical({ canalId: p.canalId, phoneNumberId: p.phoneNumberId,
      remetenteE164: p.remetenteE164, respondidoA: p.respondidoA ?? null, mediaId: p.mediaId ?? null,
      ocorridoEm: new Date(p.ocorridoEm).toISOString(), conteudo: p.conteudo })).digest("hex")
  } catch { throw new MensageriaError("INGRESSO_INVALIDO") }
  try {
    return await db.$transaction(async tx => {
      const canal = await resolverCanalExato(tx, p)
      if (canal.papel !== "GESTAO") throw new MensageriaError("CANAL_INVALIDO")
      const criado = await tx.whatsAppGestaoInbox.createMany({ data: [{ id: randomUUID(), provedor: p.provedor, canalId: canal.canalId,
        canalVersao: canal.versao, phoneNumberId: canal.phoneNumberId, externalMessageId: p.externalMessageId,
        remetenteE164: p.remetenteE164, correlacaoId: p.correlacaoId, respondidoA: p.respondidoA, mediaId: p.mediaId,
        ocorridoEm: new Date(p.ocorridoEm), proveniencia: "INGRESSO_TECNICO_G006", conteudo: JSON.parse(conteudo), conteudoHash }], skipDuplicates: true })
      const row = await tx.whatsAppGestaoInbox.findUniqueOrThrow({ where: { provedor_phoneNumberId_externalMessageId: {
        provedor: p.provedor, phoneNumberId: p.phoneNumberId, externalMessageId: p.externalMessageId } } })
      if (row.conteudoHash !== conteudoHash) throw new MensageriaError("REPLAY_DIVERGENTE")
      await tx.gastoJob.createMany({ data: [{ id: randomUUID(), chave: `inbox:${row.id}`, tipo: "STAGING", inboxId: row.id }], skipDuplicates: true })
      const job = await tx.gastoJob.findUniqueOrThrow({ where: { inboxId: row.id }, select: { id: true } })
      return { ackDuravel: true as const, inboxId: row.id, jobId: job.id, replay: criado.count === 0 }
    })
  } catch (error) {
    if (error instanceof MensageriaError) throw error
    const dados = error as { code?: string; meta?: { code?: string; database_error?: string } }
    // A versão pode mudar após o SELECT do canal: isso pede nova resolução,
    // sem descartar um envelope válido como payload permanente.
    const detalhe = dados.meta?.database_error ?? (error instanceof Error ? error.message : "")
    if (detalhe.includes("G006 ingresso sem canal")) throw new MensageriaError("CANAL_ALTERADO")
    if (dados.code === "P2004" || dados.code === "23514" || dados.meta?.code === "23514"
      || dados.meta?.database_error?.includes("g006_inbox_check")
      || (error instanceof Error && error.name === "PrismaClientUnknownRequestError"
        && /PostgresError \{ code: "23514"/.test(error.message))) throw new MensageriaError("INGRESSO_INVALIDO")
    throw new MensageriaError("DB_INDISPONIVEL")
  }
}
