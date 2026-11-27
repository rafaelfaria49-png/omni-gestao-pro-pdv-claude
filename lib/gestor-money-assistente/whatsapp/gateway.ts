import "server-only"
/**
 * G007/G008 — gateway do canal de GESTÃO sobre o pipeline oficial G006.
 *
 * Webhook (HMAC) → `persistirIngresso` (inbox+job STAGING, ACK durável) → worker G006 `claimJob` →
 * ESTE processador (gancho `staging` do `rodarWorker`) → motor conversacional → respostas.
 *
 * Por mensagem:
 * 1. Canal GESTAO vigente (`g006_canal_vigente`) e conteúdo de texto (áudio/foto = G009/G010, fora do escopo).
 * 2. Remetente sem vínculo: só o fluxo de pareamento (código da sessão web) ou o onboarding. Nunca motor,
 *    nunca loja presumida, nunca a Inbox de clientes.
 * 3. Remetente vinculado: principal opaco BINDING_G007 → motor. Cada perfil/ato passa pelo emissor G001 por
 *    principal (`requireFinanceiroPerfilAccessPorPrincipal`), que revalida o vínculo e relê o banco.
 * 4. Escrita: antes do G004, `registrarOrigemCanal` (G006) amarra grupo↔mensagem↔vínculo; o resultado sai
 *    pela outbox G006 (ENVIAR_RESULTADO) só depois do COMMIT. Demais respostas: `respostas.ts`.
 * 5. Reentrega/reclaim: o motor devolve a resposta registrada (idempotência) e a fila deduplica por chave.
 * Falha de infraestrutura → `falharJob` RETRY (backoff G006); nada financeiro sem confirmação válida.
 */
import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { requireFinanceiroPerfilAccessPorPrincipal } from "@/lib/gastos/access"
import { registrarOrigemCanal } from "@/lib/gastos/outbox"
import { concluirStaging, exigirLease, falharJob, type Claim } from "@/lib/gastos/queue"
import { decidirFalha } from "@/lib/gastos/retry"
import type { VerificadorVinculo } from "@/lib/gastos/messaging-types"
import type { FinanceiroContextoAutorizado } from "@/lib/gastos/types"
import type { ProcessadorStaging } from "@/lib/gastos/worker"
import type { PrismaClient } from "@/generated/prisma"
import { cadastrosGestorMoney, consultaG005, execucaoG004, listarPerfisDoUsuario } from "../adaptador-servidor"
import { processarMensagem, reconciliarPendencia } from "../motor"
import type { DependenciasMotor, PortaAutorizacao, PortaExecucao, RespostaAssistente } from "../tipos"
import { conversasPendentes, emitirPrincipalVinculo, repositorioConversaPg, verificadorDoPrincipal, vinculoDoPrincipal, VinculoRevogadoError } from "./persistencia"
import { enfileirarRespostas, enviarRespostasPendentes, respostaIdPorMensagemExterna, type TransporteConversa } from "./respostas"
import { confirmarPareamentoPorMensagem, extrairCodigo, vinculoAtivoPorTelefone, vinculoVigente, type GmDb, type ResultadoPareamento } from "./vinculo"

export type DependenciasGateway = {
  /** Runtime da aplicação (gm_assist_* e serviços G001–G005, que usam o mesmo `@/lib/prisma`). */
  app?: GmDb
  agora?: () => Date
  novoId?: () => string
  /** Somente testes: substitui o executor G004 (ex.: injetar falha incerta). Produção usa o G004 real. */
  execucao?: PortaExecucao
}

export const TEXTOS = {
  onboarding: "Olá! Este é o assistente de gestão do OmniGestão. Para usar, vincule este WhatsApp: entre no OmniGestão, " +
    "abra Gestor Money › WhatsApp e envie aqui o código de 6 dígitos que aparecer na tela. Nenhuma informação foi registrada.",
  vinculado: "WhatsApp vinculado à sua conta ✅ Agora você pode registrar gastos e consultar suas finanças por aqui. " +
    "Para desfazer, use Gestor Money › WhatsApp › Revogar.",
  semDesafio: "Não encontrei um pareamento pendente para este número. Gere um novo código no OmniGestão.",
  expirado: "Esse código expirou. Gere um novo código no OmniGestão (vale 10 minutos).",
  bloqueado: "Muitas tentativas com código errado. Por segurança, gere um novo código no OmniGestão.",
  jaVinculado: "Este número já está vinculado a outra conta. O titular precisa revogar o vínculo antes de um novo pareamento.",
  revogado: "O vínculo deste WhatsApp foi revogado. Nada foi registrado. Para voltar a usar, faça um novo pareamento no OmniGestão.",
  soTexto: "Por enquanto eu entendo apenas mensagens de texto. Nada foi registrado.",
} as const

function textoPareamento(r: ResultadoPareamento): string | null {
  switch (r.tipo) {
    case "NAO_E_CODIGO": return null
    case "VINCULADO": return TEXTOS.vinculado
    case "SEM_DESAFIO": return TEXTOS.semDesafio
    case "EXPIRADO": return TEXTOS.expirado
    case "BLOQUEADO": return TEXTOS.bloqueado
    case "TELEFONE_JA_VINCULADO": return TEXTOS.jaVinculado
    case "CODIGO_INVALIDO": return `Código incorreto. Você ainda tem ${r.restantes} tentativa(s).`
  }
}

/** Port G007 exigido pelo G006 (`registrarOrigemCanal`/`executarEnvio`): vínculo ATIVO do remetente. */
export function verificadorVinculoG006(app: GmDb = prisma): VerificadorVinculo {
  return async input => {
    const v = await vinculoAtivoPorTelefone(app, input.remetenteE164)
    return v ? { userId: v.adminUserId, bindingRef: v.id, versao: v.versao } : null
  }
}

function autorizacaoVinculo(app: GmDb): PortaAutorizacao {
  return {
    async listarPerfis(p) {
      if (p.origem !== "BINDING_G007" || !vinculoDoPrincipal(p)) return []
      return listarPerfisDoUsuario(p.userId)
    },
    async contexto(p, ref, acao) {
      if (p.origem !== "BINDING_G007" || !vinculoDoPrincipal(p)) return { ok: false }
      const r = await requireFinanceiroPerfilAccessPorPrincipal(verificadorDoPrincipal(app, p), ref.tipo === "PESSOAL"
        ? { tipo: "PESSOAL", perfilId: ref.perfilId } : { tipo: "EMPRESA", perfilId: ref.perfilId, storeId: ref.storeId }, acao)
      if (!r.ok || r.contexto.userId !== p.userId) return { ok: false }
      return { ok: true, contexto: r.contexto }
    },
  }
}

/**
 * Executor G004 precedido do registro de origem G006. `inboxId` ausente = reconciliação: só prossegue se a
 * origem já existir (ela é sempre registrada antes do primeiro envio; sem ela, nada pode ter sido gravado).
 */
function execucaoComOrigem(fila: PrismaClient, app: GmDb, inboxId: string | undefined, base: PortaExecucao): PortaExecucao {
  return {
    async executar(ctxOpaco, input) {
      const ctx = ctxOpaco as FinanceiroContextoAutorizado
      const storeId = ctx.tipo === "EMPRESA" ? ctx.storeId : null
      const existente = await fila.gastoOrigemCanal.findUnique({ where: { perfilId_grupoChave: { perfilId: ctx.perfilId, grupoChave: input.grupoChave } } })
      if (!existente) {
        if (!inboxId) return { ok: false, tipo: "DEFINITIVO", codigo: "origem_ausente" }
        try {
          await registrarOrigemCanal(fila, { inboxId, perfilId: ctx.perfilId, storeId, grupoChave: input.grupoChave }, verificadorVinculoG006(app))
        } catch {
          return { ok: false, tipo: "DEFINITIVO", codigo: "acesso_negado" }
        }
      }
      return base.executar(ctxOpaco, input)
    },
  }
}

function dependenciasMotor(app: GmDb, fila: PrismaClient, inboxId: string | undefined, d: DependenciasGateway): DependenciasMotor {
  return { autorizacao: autorizacaoVinculo(app), cadastros: cadastrosGestorMoney, consulta: consultaG005,
    execucao: execucaoComOrigem(fila, app, inboxId, d.execucao ?? execucaoG004), repositorio: repositorioConversaPg(app),
    agora: d.agora ?? (() => new Date()), novoId: d.novoId ?? (() => randomUUID()) }
}

/** O resultado de escrita sai pela outbox G006 (pós-COMMIT): aqui não se duplica a mensagem de sucesso. */
const mensagensParaFila = (r: RespostaAssistente) => (r.codigo === "registrado" ? [] : r.mensagens)

export function processadorStagingGestao(d: DependenciasGateway = {}): ProcessadorStaging {
  const app = d.app ?? prisma
  return async (fila, claim) => {
    try {
      await processar(fila, app, claim, d)
      await concluirStaging(fila, claim)
    } catch (e) {
      const codigo = (e as { codigo?: string })?.codigo
      if (codigo === "LEASE_PERDIDA") throw e
      // Infraestrutura (DB/serviço): nova tentativa com backoff G006. Idempotência garante reprocessamento seguro.
      await falharJob(fila, claim, codigo === "CANAL_ALTERADO" || codigo === "POISON_JOB"
        ? { acao: "DLQ", codigo, esperaMs: 0 } : decidirFalha({ tipo: "TEMPORARIA_LOCAL" }, claim.tentativasCiclo, false))
    }
  }
}

async function processar(fila: PrismaClient, app: GmDb, claim: Claim, d: DependenciasGateway) {
  await fila.$transaction(tx => exigirLease(tx, claim))
  if (claim.tipo !== "STAGING" || !claim.inboxId) throw Object.assign(new Error("POISON_JOB"), { codigo: "POISON_JOB" })
  const [vigente] = await fila.$queryRaw<Array<{ valido: boolean }>>`SELECT g006_canal_vigente(${claim.inboxId}) AS valido`
  if (!vigente?.valido) throw Object.assign(new Error("CANAL_ALTERADO"), { codigo: "CANAL_ALTERADO" })
  const inbox = await fila.whatsAppGestaoInbox.findUniqueOrThrow({ where: { id: claim.inboxId } })
  const conteudo = inbox.conteudo as { tipo?: unknown; texto?: unknown }
  const base = { origemRef: `inbox:${inbox.id}`, inboxId: inbox.id, canalId: inbox.canalId, destinatarioE164: inbox.remetenteE164 }
  const vinculo = await vinculoAtivoPorTelefone(app, inbox.remetenteE164)
  if (conteudo?.tipo !== "texto" || typeof conteudo.texto !== "string") {
    await enfileirarRespostas(app, { ...base, vinculoId: vinculo?.id ?? null, respostaId: null, mensagens: [vinculo ? TEXTOS.soTexto : TEXTOS.onboarding] })
    return
  }
  const texto = conteudo.texto
  const codigo = extrairCodigo(texto)
  const pendenteNoTelefone = codigo
    ? await app.gmAssistDesafio.count({ where: { telefoneE164: inbox.remetenteE164, estado: "PENDENTE" } }) : 0
  if (!vinculo || (codigo && pendenteNoTelefone > 0)) {
    const r = await confirmarPareamentoPorMensagem(app, { remetenteE164: inbox.remetenteE164, texto })
    const msg = textoPareamento(r)
    if (!msg) await app.gmAssistEvento.create({ data: { id: randomUUID(), tipo: "MENSAGEM_SEM_VINCULO" } })
    await enfileirarRespostas(app, { ...base, vinculoId: r.tipo === "VINCULADO" ? r.vinculoId : null, respostaId: null,
      mensagens: [msg ?? TEXTOS.onboarding] })
    return
  }
  const principal = emitirPrincipalVinculo(vinculo)
  const respondendoA = await respostaIdPorMensagemExterna(app, inbox.respondidoA)
  let resposta: RespostaAssistente
  try {
    resposta = await processarMensagem(principal, { mensagemId: inbox.id, conversaId: vinculo.id, canal: "WHATSAPP_GESTAO",
      recebidaEm: inbox.ocorridoEm.toISOString(), ...(respondendoA ? { respondendoA } : {}), conteudo: { tipo: "TEXTO", texto } },
      dependenciasMotor(app, fila, inbox.id, d))
  } catch (e) {
    if (!(e instanceof VinculoRevogadoError)) throw e
    await enfileirarRespostas(app, { ...base, vinculoId: vinculo.id, respostaId: null, mensagens: [TEXTOS.revogado] })
    return
  }
  await enfileirarRespostas(app, { ...base, vinculoId: vinculo.id, respostaId: resposta.respostaId, mensagens: mensagensParaFila(resposta) })
}

/**
 * Reconciliação periódica: conversas com operação EM_EXECUCAO/INCERTO (worker caiu, resposta perdida).
 * Reenvia a MESMA chave G004 — se já houve COMMIT, o G004 devolve o resultado existente.
 */
export async function reconciliarConversasGestao(fila: PrismaClient, d: DependenciasGateway = {}, idadeMinimaMs = 60_000) {
  const app = d.app ?? prisma
  let n = 0
  for (const c of await conversasPendentes(app, 20, idadeMinimaMs)) {
    const row = await app.gmAssistVinculo.findUnique({ where: { id: c.vinculoId }, select: { versao: true } })
    const v = row ? await vinculoVigente(app, c.vinculoId, row.versao) : null
    if (!v) continue
    const r = await reconciliarPendencia(emitirPrincipalVinculo(v), v.id, dependenciasMotor(app, fila, undefined, d)).catch(() => null)
    if (!r) continue
    n++
    const ultima = await fila.whatsAppGestaoInbox.findFirst({ where: { remetenteE164: v.telefoneE164 }, orderBy: { recebidoEm: "desc" } })
    if (ultima) await enfileirarRespostas(app, { origemRef: `reconc:${c.chave}:${r.respostaId}`, inboxId: ultima.id, canalId: ultima.canalId,
      destinatarioE164: v.telefoneE164, vinculoId: v.id, respostaId: r.respostaId, mensagens: mensagensParaFila(r) })
  }
  return n
}

/** Tarefa por ciclo do worker (`aposCiclo`): reconciliação + envio das respostas conversacionais. */
export function cicloGestao(fila: PrismaClient, transporte: TransporteConversa, env: Record<string, string | undefined>, d: DependenciasGateway = {}) {
  return async () => {
    await reconciliarConversasGestao(fila, d)
    await enviarRespostasPendentes(d.app ?? prisma, fila, transporte, { env })
  }
}
