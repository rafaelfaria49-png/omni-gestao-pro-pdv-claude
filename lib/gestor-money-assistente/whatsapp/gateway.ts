import "server-only"
/**
 * G007/G008/G009/G010 — gateway do canal de GESTÃO sobre o pipeline oficial G006.
 *
 * Webhook (HMAC) → `persistirIngresso` (inbox+job STAGING, ACK durável) → worker G006 `claimJob` →
 * ESTE processador (gancho `staging` do `rodarWorker`) → [download/STT/OCR seguro quando mídia] →
 * motor conversacional G008 → respostas.
 *
 * Invariantes de segurança:
 * 1. Canal GESTAO vigente (`g006_canal_vigente`).
 * 2. Remetente sem vínculo: só pareamento ou onboarding — NUNCA baixa mídia nem aciona provider pago.
 * 3. Remetente vinculado: limite horário de mídia, download autenticado anti-SSRF, validação por magic bytes,
 *    STT/OCR fail-closed, limpeza do buffer em `finally`, e REVALIDAÇÃO do vínculo antes de chamar o motor.
 * 4. Nenhuma mídia ou OCR grava operação financeira diretamente: tudo passa pelo motor G008 (revisão + confirmação)
 *    e pelo G004 via `registrarOrigemCanal` (G006).
 * 5. Falhas transitórias de download/provider → `falharJob` RETRY (backoff G006) com idempotência.
 */
import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { requireFinanceiroPerfilAccessPorPrincipal } from "@/lib/gastos/access"
import { credenciaisDoCanal } from "@/lib/gastos/channels"
import type { DocumentoStoragePort } from "@/lib/gastos/documentos-fixture"
import { registrarOrigemCanal } from "@/lib/gastos/outbox"
import { concluirStaging, exigirLease, falharJob, type Claim } from "@/lib/gastos/queue"
import { decidirFalha } from "@/lib/gastos/retry"
import type { VerificadorVinculo } from "@/lib/gastos/messaging-types"
import type { FinanceiroContextoAutorizado } from "@/lib/gastos/types"
import type { ProcessadorStaging } from "@/lib/gastos/worker"
import type { PrismaClient } from "@/generated/prisma"
import {
  cadastrosGestorMoney,
  consultaG005,
  criarArquivamentoG003,
  duplicidadeG005,
  execucaoG004,
  listarPerfisDoUsuario,
} from "../adaptador-servidor"
import type { EntradaConversa } from "../entradas"
import { processarMensagem, reconciliarPendencia } from "../motor"
import { criarProviderTranscricaoOpenAI, processarAudioG009 } from "../multimodal/audio-g009"
import {
  LIMITES_MIDIA,
  type MimeAudioAceito,
  type MimeDocumentoAceito,
  type PortaArquivamentoDocumento,
  type PortaDownloadMidiaWhatsApp,
  type PortaDuplicidadeFinanceira,
  type PortaExtracaoDocumento,
  type PortaTranscricaoAudio,
} from "../multimodal/contratos"
import { criarProviderDocumentoOpenAI, processarDocumentoG010 } from "../multimodal/documento-g010"
import { criarDownloaderMidiaMeta } from "../multimodal/midia-seguranca"
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
  /** G009/G010: portas substituíveis (produção usa Meta + OpenAI fail-closed; testes injetam fixtures). */
  downloaderMidia?: PortaDownloadMidiaWhatsApp
  provedorAudio?: PortaTranscricaoAudio
  provedorDocumento?: PortaExtracaoDocumento
  duplicidade?: PortaDuplicidadeFinanceira
  arquivamento?: PortaArquivamentoDocumento
  storageDocumentos?: DocumentoStoragePort | null
  env?: Record<string, string | undefined>
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
  soTexto: "Por enquanto não consegui identificar o formato desta mensagem. Envie texto, áudio, imagem ou PDF de comprovante. Nada foi registrado.",
  midiaSemId: "Não encontrei o arquivo de mídia nesta mensagem. Tente reenviar o áudio ou documento. Nada foi registrado.",
  limiteMidia: "Você atingiu o limite temporário de processamento de áudios e documentos por hora. Tente novamente em instantes ou envie por texto.",
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

function dependenciasMotor(
  app: GmDb,
  fila: PrismaClient,
  inboxId: string | undefined,
  d: DependenciasGateway,
  midiaEfemera?: () => { nomeArquivo: string; bytes: Uint8Array } | null
): DependenciasMotor {
  return {
    autorizacao: autorizacaoVinculo(app),
    cadastros: cadastrosGestorMoney,
    consulta: consultaG005,
    execucao: execucaoComOrigem(fila, app, inboxId, d.execucao ?? execucaoG004),
    repositorio: repositorioConversaPg(app),
    agora: d.agora ?? (() => new Date()),
    novoId: d.novoId ?? (() => randomUUID()),
    duplicidade: d.duplicidade ?? duplicidadeG005,
    arquivamento: d.arquivamento ?? criarArquivamentoG003(d.storageDocumentos ?? null),
    ...(midiaEfemera ? { midiaEfemera } : {}),
  }
}

/** O resultado de escrita sai pela outbox G006 (pós-COMMIT): aqui não se duplica a mensagem de sucesso. */
const mensagensParaFila = (r: RespostaAssistente) => (r.codigo === "registrado" ? [] : r.mensagens)

class ErroMidiaTransitorio extends Error {
  readonly codigo: string
  constructor(codigo: string) {
    super(codigo)
    this.codigo = codigo
  }
}

export function processadorStagingGestao(d: DependenciasGateway = {}): ProcessadorStaging {
  const app = d.app ?? prisma
  return async (fila, claim, signal) => {
    try {
      await processar(fila, app, claim, d, signal)
      // PROCESSADO_G008 (#405): a mensagem foi efetivamente tratada pelo assistente (motor, mídia, pareamento ou onboarding).
      await concluirStaging(fila, claim, { estadoInbox: "PROCESSADO_G008" })
    } catch (e) {
      const codigo = (e as { codigo?: string })?.codigo
      if (codigo === "LEASE_PERDIDA") throw e
      // Infraestrutura ou falha transitória de download/provider (timeout/429/5xx): nova tentativa com backoff G006.
      await falharJob(fila, claim, codigo === "CANAL_ALTERADO" || codigo === "POISON_JOB"
        ? { acao: "DLQ", codigo, esperaMs: 0 }
        : decidirFalha({ tipo: "TEMPORARIA_LOCAL" }, claim.tentativasCiclo, false))
    }
  }
}

async function auditarMidia(app: GmDb, tipo: string, userId: string, vinculoId: string) {
  await app.gmAssistEvento.create({
    data: { id: randomUUID(), tipo, adminUserId: userId, vinculoId },
  }).catch(() => undefined)
}

async function processar(
  fila: PrismaClient,
  app: GmDb,
  claim: Claim,
  d: DependenciasGateway,
  signal?: AbortSignal
) {
  await fila.$transaction(tx => exigirLease(tx, claim))
  if (claim.tipo !== "STAGING" || !claim.inboxId) throw Object.assign(new Error("POISON_JOB"), { codigo: "POISON_JOB" })
  const [vigente] = await fila.$queryRaw<Array<{ valido: boolean }>>`SELECT g006_canal_vigente(${claim.inboxId}) AS valido`
  if (!vigente?.valido) throw Object.assign(new Error("CANAL_ALTERADO"), { codigo: "CANAL_ALTERADO" })
  const inbox = await fila.whatsAppGestaoInbox.findUniqueOrThrow({ where: { id: claim.inboxId } })
  const conteudo = inbox.conteudo as {
    tipo?: unknown
    texto?: unknown
    mediaId?: unknown
    mimeType?: unknown
    caption?: unknown
    filename?: unknown
    duracaoSegundos?: unknown
  }
  const base = { origemRef: `inbox:${inbox.id}`, inboxId: inbox.id, canalId: inbox.canalId, destinatarioE164: inbox.remetenteE164 }
  const vinculo = await vinculoAtivoPorTelefone(app, inbox.remetenteE164)

  // ── 1. Fluxo de mídia (G009 áudio / G010 imagem e documento PDF) ──────────
  if (conteudo?.tipo === "audio" || conteudo?.tipo === "foto" || conteudo?.tipo === "documento") {
    // Remetente sem vínculo NUNCA dispara download nem provider pago.
    if (!vinculo) {
      await app.gmAssistEvento.create({ data: { id: randomUUID(), tipo: "MENSAGEM_SEM_VINCULO" } })
      await enfileirarRespostas(app, { ...base, vinculoId: null, respostaId: null, mensagens: [TEXTOS.onboarding] })
      return
    }

    const mediaId =
      (typeof conteudo.mediaId === "string" && conteudo.mediaId.trim()) ||
      (typeof inbox.mediaId === "string" && inbox.mediaId.trim()) ||
      ""
    if (!mediaId) {
      await enfileirarRespostas(app, { ...base, vinculoId: vinculo.id, respostaId: null, mensagens: [TEXTOS.midiaSemId] })
      return
    }

    // Limite horário de processamento de mídia por usuário (controle de custo/abuso)
    const agora = (d.agora ?? (() => new Date()))()
    const ultimaHora = new Date(agora.getTime() - 60 * 60_000)
    const qtdMidiasHora = await app.gmAssistEvento.count({
      where: { adminUserId: vinculo.adminUserId, tipo: "MIDIA_PROCESSADA", criadoEm: { gt: ultimaHora } },
    })
    if (qtdMidiasHora >= LIMITES_MIDIA.MAX_MIDIAS_POR_HORA_USUARIO) {
      await enfileirarRespostas(app, { ...base, vinculoId: vinculo.id, respostaId: null, mensagens: [TEXTOS.limiteMidia] })
      return
    }

    const env = d.env ?? process.env
    const ehAudio = conteudo.tipo === "audio"
    const downloader = d.downloaderMidia ?? criarDownloaderMidiaMeta()
    let credenciais: { phoneNumberId: string; accessToken: string } | undefined
    if (!d.downloaderMidia) {
      const canal = await fila.whatsAppCanal.findUnique({
        where: { canalId: inbox.canalId },
        select: { phoneNumberId: true, credencialRef: true },
      })
      if (canal) {
        try {
          credenciais = credenciaisDoCanal(canal, env)
        } catch {
          credenciais = undefined
        }
      }
    }

    const dl = await downloader.baixar({
      mediaId,
      tipoEsperado: ehAudio ? "AUDIO" : "DOCUMENTO",
      credenciais,
      mimeDeclarado: typeof conteudo.mimeType === "string" ? conteudo.mimeType : undefined,
      duracaoSegundos: typeof conteudo.duracaoSegundos === "number" ? conteudo.duracaoSegundos : undefined,
      signal,
    })

    if (!dl.ok) {
      if (dl.transitorio) throw new ErroMidiaTransitorio(dl.codigo)
      await auditarMidia(app, "MIDIA_REJEITADA", vinculo.adminUserId, vinculo.id)
      await enfileirarRespostas(app, { ...base, vinculoId: vinculo.id, respostaId: null, mensagens: [dl.mensagemUsuario] })
      return
    }

    const midia = dl.midia
    const nomeArquivoSeguro =
      typeof conteudo.filename === "string" && conteudo.filename.trim()
        ? conteudo.filename.trim().replace(/[/\\]/g, "_").slice(0, 140)
        : `midia-${inbox.id.slice(0, 12)}.${midia.extensao}`

    try {
      let conteudoMotor: EntradaConversa["conteudo"]
      if (ehAudio) {
        const providerAudio = d.provedorAudio ?? criarProviderTranscricaoOpenAI(env)
        const resAudio = await processarAudioG009(
          {
            bytes: midia.bytes,
            mime: midia.mimeReal as MimeAudioAceito,
            nomeArquivo: nomeArquivoSeguro,
            sha256: midia.sha256,
            duracaoSegundos: typeof conteudo.duracaoSegundos === "number" ? conteudo.duracaoSegundos : undefined,
            signal,
          },
          providerAudio
        )
        if (!resAudio.ok) {
          if (resAudio.transitorio) throw new ErroMidiaTransitorio(resAudio.codigo)
          await auditarMidia(
            app,
            resAudio.codigo === "INJECAO_DETECTADA" ? "MIDIA_INJECAO_BLOQUEADA" : "MIDIA_REJEITADA",
            vinculo.adminUserId,
            vinculo.id
          )
          await enfileirarRespostas(app, { ...base, vinculoId: vinculo.id, respostaId: null, mensagens: [resAudio.mensagemUsuario] })
          return
        }
        conteudoMotor = {
          tipo: "AUDIO_TRANSCRITO",
          transcricao: resAudio.transcricaoSanitizada,
          idioma: "pt-BR",
          ...(resAudio.confianca !== undefined ? { confianca: resAudio.confianca } : {}),
          ...(resAudio.duracaoSegundos !== undefined ? { duracaoSegundos: resAudio.duracaoSegundos } : {}),
          sha256: resAudio.sha256,
          provedor: resAudio.provedor,
          homologado: resAudio.homologado,
        }
      } else {
        const providerDoc = d.provedorDocumento ?? criarProviderDocumentoOpenAI(env)
        const legenda = typeof conteudo.caption === "string" ? conteudo.caption.trim() : undefined
        const resDoc = await processarDocumentoG010(
          {
            bytes: midia.bytes,
            mime: midia.mimeReal as MimeDocumentoAceito,
            nomeArquivo: nomeArquivoSeguro,
            sha256: midia.sha256,
            paginasPdf: midia.paginasPdf,
            legendaUsuario: legenda,
            signal,
          },
          providerDoc
        )
        if (!resDoc.ok) {
          if (resDoc.transitorio) throw new ErroMidiaTransitorio(resDoc.codigo)
          await auditarMidia(
            app,
            resDoc.codigo === "INJECAO_DETECTADA" ? "MIDIA_INJECAO_BLOQUEADA" : "MIDIA_REJEITADA",
            vinculo.adminUserId,
            vinculo.id
          )
          await enfileirarRespostas(app, { ...base, vinculoId: vinculo.id, respostaId: null, mensagens: [resDoc.mensagemUsuario] })
          return
        }
        conteudoMotor = {
          tipo: "DOCUMENTO_EXTRAIDO",
          documento: resDoc.documento,
          sha256: resDoc.sha256,
          ...(legenda ? { legenda } : {}),
          avisoHonestidade: resDoc.avisoHonestidade,
          ...(resDoc.referenciaIntegracaoFutura ? { referenciaIntegracaoFutura: resDoc.referenciaIntegracaoFutura } : {}),
          provedor: resDoc.provedor,
          homologado: resDoc.homologado,
        }
      }

      // REVALIDAÇÃO OBRIGATÓRIA pós-processamento (revogação durante STT/OCR aborta tudo e nada é gravado!)
      const aindaVigente = await vinculoVigente(app, vinculo.id, vinculo.versao)
      if (!aindaVigente) {
        await auditarMidia(app, "MIDIA_ABORTADA_REVOGACAO", vinculo.adminUserId, vinculo.id)
        await enfileirarRespostas(app, { ...base, vinculoId: vinculo.id, respostaId: null, mensagens: [TEXTOS.revogado] })
        return
      }

      await auditarMidia(app, "MIDIA_PROCESSADA", vinculo.adminUserId, vinculo.id)
      const principal = emitirPrincipalVinculo(aindaVigente)
      const respondendoA = await respostaIdPorMensagemExterna(app, inbox.respondidoA)
      const midiaSnapshot = () => ({ nomeArquivo: nomeArquivoSeguro, bytes: new Uint8Array(midia.bytes) })
      let resposta: RespostaAssistente
      try {
        resposta = await processarMensagem(
          principal,
          {
            mensagemId: inbox.id,
            conversaId: aindaVigente.id,
            canal: "WHATSAPP_GESTAO",
            recebidaEm: inbox.ocorridoEm.toISOString(),
            ...(respondendoA ? { respondendoA } : {}),
            conteudo: conteudoMotor,
          },
          dependenciasMotor(app, fila, inbox.id, d, midiaSnapshot)
        )
      } catch (e) {
        if (!(e instanceof VinculoRevogadoError)) throw e
        await enfileirarRespostas(app, { ...base, vinculoId: vinculo.id, respostaId: null, mensagens: [TEXTOS.revogado] })
        return
      }
      await enfileirarRespostas(app, {
        ...base,
        vinculoId: aindaVigente.id,
        respostaId: resposta.respostaId,
        mensagens: mensagensParaFila(resposta),
      })
      return
    } finally {
      // Limpeza segura garantida do buffer temporário em memória
      midia.descartar()
    }
  }

  // ── 2. Fluxo textual canônico (pareamento G007 + motor G008) ─────────────
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

/** Gancho periódico do worker G006: entrega respostas pendentes do assistente e reconcilia pendências G004. */
export function cicloGestao(fila: PrismaClient, transporte: TransporteConversa, env: Record<string, string | undefined>, d: DependenciasGateway = {}) {
  const app = d.app ?? prisma
  return async () => {
    await reconciliarConversasGestao(fila, d)
    await enviarRespostasPendentes(app, fila, transporte, { env })
  }
}
