import { prisma } from "@/lib/prisma"
import type { AssistenteWhatsAppConfig } from "@/lib/gestor-money/contracts"
import {
  requireGestorMoneyApiContext,
  respostaPrivadaJson,
} from "@/lib/gestor-money/server/auth-boundary"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * Retorna o estado real e honesto do assistente WhatsApp para o perfil autorizado.
 *
 * - Consulta somente leitura em `whatsAppCanal` (`papel: "GESTAO"`, sem `storeId`).
 * - Mantém WhatsApp honestamente desconectado enquanto G007 (`VerificadorVinculo` + webhook) não estiver integrado.
 * - Alinha metadados visuais com os contratos G007/G008 (PR #417 `lib/gestor-money-assistente/`) sem duplicar o motor conversacional.
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

  // Leitura pura do estado do canal GESTAO (G006) — nunca expõe credenciais ou segredos
  const canalGestao = await prisma.whatsAppCanal
    .findFirst({
      where: { papel: "GESTAO", storeId: null },
      select: { ativo: true, versao: true },
      orderBy: { createdAt: "desc" },
    })
    .catch(() => null)

  const config: AssistenteWhatsAppConfig = {
    estadoConexao: "DESCONECTADO_AGUARDANDO_G007",
    estadoDescricao:
      "WhatsApp canal GESTAO permanece desconectado. O vínculo de telefone (VerificadorVinculo · G007) e o webhook oficial Meta ainda não foram integrados.",
    canalPapel: "GESTAO",
    canalAtivo: Boolean(canalGestao?.ativo),
    workerFilaAtivo: false,
    numeroVinculadoMascarado: null,
    podeAlterarConexaoReal: false,
    motivoConexaoIndisponivel:
      "Indisponível até G007: nenhum envio ou pareamento real é habilitado antes do vínculo oficial por telefone.",
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
        titulo: "Vínculo de telefone WhatsApp GESTAO (VerificadorVinculo) + Webhook Meta",
        status: "PENDENTE_G007",
        detalhe:
          "Fornece principal autenticado por telefone para o motor conversacional G008 (PR #417), que hoje aceita somente SESSAO_WEB.",
      },
      {
        codigo: "G003-STORAGE",
        titulo: "Liberação do Cloudflare R2 privado em lib/gastos/documentos.ts",
        status: "PENDENTE_PR_405",
        detalhe:
          "Adapter R2 já existe em lib/contador/documentos/storage-r2.ts; aguarda gate G003-STORAGE na fundação sem bypass.",
      },
    ],
    alinhamentoG007: {
      principalAutorizadoAtual: "SESSAO_WEB",
      verificadorVinculoDisponivel: false,
      canalGestaoRegistrado: Boolean(canalGestao),
      canalVersao: canalGestao?.versao ?? null,
      motorConversacionalPr417: "DORMENTE_PR_417",
      homologacoes: {
        whatsappOficial: false,
        audioStt: false,
        imagemOcr: false,
      },
    },
  }

  return respostaPrivadaJson({ ok: true, config }, 200)
}
