import { prisma } from "@/lib/prisma"
import type { AssistenteWhatsAppConfig, SituacaoVinculoWhatsAppDados } from "@/lib/gestor-money/contracts"
import {
  requireGestorMoneyApiContext,
  respostaPrivadaJson,
} from "@/lib/gestor-money/server/auth-boundary"
import { diagnosticarStorageComprovantes } from "@/lib/gestor-money/server/documents-adapter"
import { situacaoVinculo } from "@/lib/gestor-money-assistente/whatsapp/vinculo"
import { canalGestaoLigado } from "@/lib/gestor-money-assistente/whatsapp/webhook"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * Retorna o estado real e honesto do assistente WhatsApp para o perfil autorizado.
 *
 * Regras de honestidade (G006 / G007 / G008):
 * - Nunca exibe WhatsApp como conectado (`ATIVO`) quando o canal oficial GESTAO
 *   (`GESTOR_MONEY_WHATSAPP_GESTAO === "ligado"` + `whatsapp_canais.ativo === true`)
 *   ou o vínculo do usuário (`gm_assist_vinculos` ATIVO) não estiver disponível.
 * - O vínculo real é gerido exclusivamente pelas Server Actions canônicas em
 *   `app/actions/gestor-money-vinculo.ts` (PR #417).
 * - Áudio (STT) e Imagem (OCR) permanecem honestamente `false` (fora desta etapa).
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const tipo = url.searchParams.get("tipo")
  const perfilId = url.searchParams.get("perfilId")
  const storeId = url.searchParams.get("storeId")
  const seletor =
    tipo === "PESSOAL"
      ? storeId !== null
        ? { tipo, perfilId, storeId }
        : { tipo, perfilId }
      : { tipo, perfilId, storeId }

  const authRes = await requireGestorMoneyApiContext(seletor, "view")
  if (!authRes.ok) return authRes.response

  const canalFlagLigada = canalGestaoLigado(process.env)
  const numeroAssistente = process.env.GESTOR_MONEY_WHATSAPP_NUMERO_EXIBICAO?.trim() || null

  // Leitura defensiva de whatsapp_canais (G006):
  // Por isolamento RLS do G006 (`g006_canal_read`), o runtime web normalmente não tem visibilidade
  // sobre `whatsapp_canais` (apenas `omni_gastos_ingress`/`worker`/`operator`). Quando inacessível,
  // a disponibilidade no runtime web exige flag ligada + número oficial de exibição configurado;
  // se a tabela estiver visível e registrar canal inativo, prevalece o bloqueio honesto.
  const canalGestao = canalFlagLigada
    ? await prisma.whatsAppCanal
        .findFirst({
          where: { papel: "GESTAO", storeId: null },
          select: { ativo: true, versao: true },
          orderBy: [{ ativo: "desc" }, { createdAt: "desc" }],
        })
        .catch(() => null)
    : null

  const canalAtivo = canalFlagLigada
    ? canalGestao !== null
      ? Boolean(canalGestao.ativo)
      : Boolean(numeroAssistente)
    : false

  let situacaoInicial: SituacaoVinculoWhatsAppDados | null = null
  if (canalFlagLigada) {
    const rawSit = await situacaoVinculo(prisma, authRes.contexto.userId).catch(() => null)
    if (rawSit) {
      situacaoInicial = {
        ...rawSit,
        numeroAssistente,
      }
    }
  }

  const vinculado = situacaoInicial?.estado === "VINCULADO" && situacaoInicial.vinculado !== null
  const numeroVinculadoMascarado = situacaoInicial?.vinculado?.telefoneMascarado ?? null

  // Regra estrita: só exibe ATIVO quando flag ligada + canal oficial GESTAO ativo + vínculo ATIVO.
  const estadoConexao: AssistenteWhatsAppConfig["estadoConexao"] = !canalFlagLigada
    ? "DESCONECTADO_AGUARDANDO_G007"
    : !canalAtivo
      ? "CANAL_INATIVO"
      : vinculado
        ? "ATIVO"
        : "AGUARDANDO_VINCULO"

  const estadoDescricao =
    estadoConexao === "ATIVO"
      ? `WhatsApp vinculado e conectado no canal oficial GESTAO (${numeroVinculadoMascarado}). Cada gravação financeira continua exigindo confirmação explícita (G004/G008).`
      : estadoConexao === "AGUARDANDO_VINCULO"
        ? "Canal oficial WhatsApp GESTAO ativo. Inicie o pareamento abaixo informando seu número e aceite o consentimento para gerar o código temporário de 6 dígitos."
        : estadoConexao === "CANAL_INATIVO"
          ? vinculado
            ? `Existe vínculo registrado para ${numeroVinculadoMascarado}, mas o canal oficial WhatsApp GESTAO não está ativo em whatsapp_canais. O assistente permanece desconectado até ativação do canal.`
            : "Canal oficial WhatsApp GESTAO indisponível em whatsapp_canais. Nenhuma mensagem real pode ser recebida ou enviada."
          : "Canal WhatsApp GESTAO desligado neste ambiente (GESTOR_MONEY_WHATSAPP_GESTAO !== 'ligado'). O pareamento permanece indisponível até ativação controlada."

  const podeAlterarConexaoReal = canalFlagLigada && canalAtivo
  const motivoConexaoIndisponivel = !canalFlagLigada
    ? "Indisponível enquanto GESTOR_MONEY_WHATSAPP_GESTAO !== 'ligado'."
    : !canalAtivo
      ? "Canal oficial WhatsApp GESTAO inativo ou não registrado em whatsapp_canais."
      : null

  const storageDiag = diagnosticarStorageComprovantes()

  const config: AssistenteWhatsAppConfig = {
    estadoConexao,
    estadoDescricao,
    canalPapel: "GESTAO",
    canalAtivo,
    canalFlagLigada,
    workerFilaAtivo: canalFlagLigada && canalAtivo,
    numeroVinculadoMascarado,
    podeAlterarConexaoReal,
    motivoConexaoIndisponivel,
    situacaoVinculoInicial: situacaoInicial,
    preferenciasConfirmacao: {
      exigirConfirmacaoSempre: true,
      limiteConfirmacaoDuplaCentavos: "50000",
      confirmarTrocaPerfil: true,
      exigirComprovanteAcimaCentavos: "25000",
    },
    notificacoes: {
      alertasVencimento: true,
      diasAntecedenciaVencimento: 3,
      resumoDiario: false,
      horarioResumoDiario: "08:30",
      alertasFaturaCartao: true,
      alertasDividaVencida: true,
    },
    dependenciasPendentes: [
      {
        codigo: "G007",
        titulo: "Vínculo de telefone WhatsApp GESTAO (Server Actions canônicas) + Webhook Meta",
        status:
          canalFlagLigada && canalAtivo
            ? "DISPONIVEL_NO_RUNTIME"
            : "PENDENTE_G007",
        detalhe:
          canalFlagLigada && canalAtivo
            ? "Pareamento por prova de dupla posse (sessão web + código de 6 dígitos no WhatsApp) ativo via app/actions/gestor-money-vinculo.ts."
            : motivoConexaoIndisponivel ??
              "Canal oficial WhatsApp GESTAO dormente neste ambiente.",
      },
      {
        codigo: "G003-STORAGE",
        titulo: "Gate formal de armazenamento privado Cloudflare R2 (lib/gastos/documentos-storage.ts)",
        status: storageDiag.runtimeLiberado ? "DISPONIVEL_NO_RUNTIME" : "BLOQUEADO_G003_STORAGE",
        detalhe: storageDiag.motivo,
      },
    ],
    alinhamentoG007: {
      principalAutorizadoAtual:
        estadoConexao === "ATIVO" ? "VINCULO_TELEFONE_G007" : "SESSAO_WEB",
      verificadorVinculoDisponivel: canalFlagLigada,
      canalGestaoRegistrado: Boolean(canalGestao),
      canalVersao: canalGestao?.versao ?? null,
      motorConversacionalPr417:
        canalFlagLigada && canalAtivo ? "ATIVO" : "DORMENTE_PR_417",
      homologacoes: {
        whatsappOficial: canalFlagLigada && canalAtivo,
        audioStt: false,
        imagemOcr: false,
      },
    },
  }

  return respostaPrivadaJson({ ok: true, config }, 200)
}
