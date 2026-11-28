/**
 * Saída das respostas conversacionais (perguntas, resumos, confirmações, onboarding) no MESMO número de gestão.
 *
 * O RESULTADO financeiro não passa por aqui: sai pela outbox G006 (`gastos_outbox` → job ENVIAR_RESULTADO),
 * que só existe depois do COMMIT G004. Esta fila cobre o resto, com as mesmas regras de entrega do G006:
 * - reutiliza `decidirFalha` (backoff, 429 comprovado, DLQ de 4xx, INCERTO após cruzar a fronteira externa);
 * - lease por linha (`FOR UPDATE SKIP LOCKED`), lease vencida em ENVIANDO vira INCERTA (pode ter saído) —
 *   nunca reenvia sozinha o que pode ter sido entregue;
 * - idempotência por `chave` (inbox + ordem): reprocessar a mesma mensagem não duplica respostas;
 * - minimização: o texto é apagado (NULL) quando o provedor aceita.
 * Credencial do canal: lida pelo papel do worker em `whatsapp_canais` (só referência de env, nunca segredo no DB).
 */
import { randomUUID } from "node:crypto"
import type { PrismaClient } from "@/generated/prisma"
import { credenciaisDoCanal } from "@/lib/gastos/channels"
import { decidirFalha, type FalhaTransporte } from "@/lib/gastos/retry"
import type { GmDb } from "./vinculo"

export const LIMITE_TENTATIVAS_RESPOSTA = 5

export type MensagemConversa = Readonly<{
  canalId: string; phoneNumberId: string; destinatarioE164: string; texto: string;
  credenciais: { phoneNumberId: string; accessToken: string }; respostaRef: string;
}>
export type ResultadoTransporte = { tipo: "ACEITO"; externalMessageId: string } | { tipo: "FALHA"; falha: FalhaTransporte }
/** Port de saída. Nos testes: SIMULADO. O Meta real (`transporte-meta.ts`) fica desligado por padrão. */
export type TransporteConversa = { modo: "SIMULADO" | "META"; enviar(m: MensagemConversa, signal?: AbortSignal): Promise<ResultadoTransporte> }

export async function enfileirarRespostas(db: GmDb, input: {
  origemRef: string; inboxId: string; canalId: string; destinatarioE164: string; vinculoId: string | null; respostaId: string | null; mensagens: string[]
}) {
  const textos = input.mensagens.map(m => m.trim()).filter(Boolean)
  if (!textos.length) return 0
  // Uma mensagem WhatsApp por resposta do motor (linhas juntas), limitada ao tamanho de texto aceito.
  const blocos: string[] = []
  for (const t of textos) {
    const ultimo = blocos.at(-1)
    if (ultimo !== undefined && ultimo.length + t.length + 1 <= 4000) blocos[blocos.length - 1] = `${ultimo}\n${t}`
    else blocos.push(t.slice(0, 4000))
  }
  const r = await db.gmAssistResposta.createMany({ skipDuplicates: true, data: blocos.slice(0, 20).map((texto, ordem) => ({
    id: randomUUID(), chave: `${input.origemRef}:${ordem}`, inboxId: input.inboxId, canalId: input.canalId,
    destinatarioE164: input.destinatarioE164, vinculoId: input.vinculoId, respostaId: input.respostaId, ordem, texto })) })
  return r.count
}

/** Reply do usuário (context.id = wamid enviado por nós) → respostaId do motor, para casar confirmação/versão. */
export async function respostaIdPorMensagemExterna(db: GmDb, externalMessageId: string | null | undefined) {
  if (!externalMessageId) return undefined
  const row = await db.gmAssistResposta.findUnique({ where: { externalMessageId }, select: { respostaId: true } })
  return row?.respostaId ?? undefined
}

type Linha = { id: string; canalId: string; destinatarioE164: string; texto: string; tentativas: number; leaseToken: string }

async function reivindicar(db: GmDb, leaseMs: number): Promise<Linha | null> {
  return db.$transaction(async tx => {
    // Lease vencida em ENVIANDO: o provedor pode ter aceitado. Fica INCERTA até reconciliação com prova.
    await tx.$executeRaw`UPDATE gm_assist_respostas SET estado='INCERTA',"falhaCodigo"='ENVIO_INCERTO',"leaseToken"=NULL,"leaseUntil"=NULL,
      "atualizadoEm"=clock_timestamp() WHERE estado='ENVIANDO' AND "leaseUntil"<=clock_timestamp()`
    const token = randomUUID()
    const rows = await tx.$queryRaw<Linha[]>`WITH escolhida AS (
      SELECT id FROM gm_assist_respostas WHERE estado='PENDENTE' AND "runAfter"<=clock_timestamp()
      ORDER BY "runAfter","criadoEm",ordem FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE gm_assist_respostas r SET estado='ENVIANDO',tentativas=r.tentativas+1,"leaseToken"=${token},
      "leaseUntil"=clock_timestamp()+${leaseMs}*interval '1 millisecond',"atualizadoEm"=clock_timestamp()
      FROM escolhida e WHERE r.id=e.id RETURNING r.id,r."canalId",r."destinatarioE164",r.texto,r.tentativas,r."leaseToken"`
    return rows[0] ?? null
  })
}

async function finalizar(db: GmDb, l: Linha, sql: "ENVIADA" | "PENDENTE" | "FALHA" | "INCERTA", extra: { externalMessageId?: string; falhaCodigo?: string; esperaMs?: number }) {
  const n = await db.$executeRaw`UPDATE gm_assist_respostas SET estado=${sql},"leaseToken"=NULL,"leaseUntil"=NULL,
    "externalMessageId"=COALESCE(${extra.externalMessageId ?? null},"externalMessageId"),
    texto=CASE WHEN ${sql}='ENVIADA' THEN NULL ELSE texto END,
    "falhaCodigo"=${extra.falhaCodigo ?? null},"runAfter"=clock_timestamp()+${extra.esperaMs ?? 0}*interval '1 millisecond',
    "atualizadoEm"=clock_timestamp() WHERE id=${l.id} AND estado='ENVIANDO' AND "leaseToken"=${l.leaseToken}`
  return n === 1
}

/**
 * Envia até `limite` respostas pendentes. `fila` = conexão do papel do worker G006 (lê o canal);
 * `app` = runtime da aplicação (gm_assist_*). Retorna contagem por desfecho.
 */
export async function enviarRespostasPendentes(app: GmDb, fila: PrismaClient, transporte: TransporteConversa,
  opts: { env: Record<string, string | undefined>; limite?: number; leaseMs?: number; timeoutMs?: number }) {
  const total = { enviadas: 0, retentaveis: 0, falhas: 0, incertas: 0 }
  const leaseMs = opts.leaseMs ?? 30_000, timeoutMs = Math.min(opts.timeoutMs ?? 10_000, leaseMs - 1000)
  for (let i = 0; i < (opts.limite ?? 20); i++) {
    const l = await reivindicar(app, leaseMs)
    if (!l) break
    const canal = await fila.whatsAppCanal.findUnique({ where: { canalId: l.canalId } })
    if (!canal?.ativo || canal.papel !== "GESTAO") {
      await finalizar(app, l, "FALHA", { falhaCodigo: "CANAL_INVALIDO" }); total.falhas++; continue
    }
    let credenciais
    try { credenciais = credenciaisDoCanal(canal, opts.env) } catch {
      await finalizar(app, l, "FALHA", { falhaCodigo: "CONFIG_INVALIDA" }); total.falhas++; continue
    }
    let r: ResultadoTransporte
    const cancelar = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      r = await Promise.race([
        transporte.enviar({ canalId: canal.canalId, phoneNumberId: canal.phoneNumberId, destinatarioE164: l.destinatarioE164,
          texto: l.texto, credenciais, respostaRef: l.id }, cancelar.signal),
        new Promise<ResultadoTransporte>(res => { timer = setTimeout(() => { cancelar.abort(); res({ tipo: "FALHA", falha: { tipo: "TIMEOUT" } }) }, timeoutMs) }),
      ])
    } catch { r = { tipo: "FALHA", falha: { tipo: "DESCONHECIDA" } } } finally { clearTimeout(timer) }
    if (r.tipo === "ACEITO") {
      await finalizar(app, l, "ENVIADA", { externalMessageId: r.externalMessageId }); total.enviadas++; continue
    }
    const d = decidirFalha(r.falha, l.tentativas, true)
    if (d.acao === "INCERTO") { await finalizar(app, l, "INCERTA", { falhaCodigo: d.codigo }); total.incertas++ }
    else if (d.acao === "RETRY" && l.tentativas < LIMITE_TENTATIVAS_RESPOSTA) {
      await finalizar(app, l, "PENDENTE", { falhaCodigo: d.codigo, esperaMs: d.esperaMs }); total.retentaveis++
    } else { await finalizar(app, l, "FALHA", { falhaCodigo: d.acao === "RETRY" ? "LIMITE_TENTATIVAS" : d.codigo }); total.falhas++ }
  }
  return total
}

/** Reconciliação de resposta INCERTA SÓ com prova do provedor (status de entrega/consulta), nunca por palpite. */
export async function reconciliarRespostaIncerta(app: GmDb, id: string, prova: { estado: "ENTREGUE"; externalMessageId: string } | { estado: "NAO_ENVIADA" }) {
  const n = prova.estado === "ENTREGUE"
    ? await app.$executeRaw`UPDATE gm_assist_respostas SET estado='ENVIADA',"externalMessageId"=${prova.externalMessageId},texto=NULL,
        "falhaCodigo"=NULL,"atualizadoEm"=clock_timestamp() WHERE id=${id} AND estado='INCERTA'`
    : await app.$executeRaw`UPDATE gm_assist_respostas SET estado='FALHA',"falhaCodigo"='NAO_ENVIADO_COMPROVADO',
        "atualizadoEm"=clock_timestamp() WHERE id=${id} AND estado='INCERTA'`
  return n === 1
}
