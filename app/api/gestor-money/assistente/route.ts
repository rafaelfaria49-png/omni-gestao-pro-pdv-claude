import type { AssistenteWhatsAppConfig } from "@/lib/gestor-money/contracts"
import {
  requireGestorMoneyApiContext,
  respostaPrivadaJson,
} from "@/lib/gestor-money/server/auth-boundary"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * Retorna o estado real do assistente WhatsApp para o perfil autorizado.
 * Mantém WhatsApp honestamente desconectado enquanto G007 (vínculo + webhook) não estiver integrado.
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

  const config: AssistenteWhatsAppConfig = {
    estadoConexao: "DESCONECTADO_AGUARDANDO_G007",
    estadoDescricao:
      "WhatsApp canal GESTAO permanece desconectado. O vínculo de telefone (VerificadorVinculo) e o webhook Meta oficial pertencem à etapa G007.",
    canalPapel: "GESTAO",
    canalAtivo: false,
    workerFilaAtivo: false,
    numeroVinculadoMascarado: null,
    podeAlterarConexaoReal: false,
    motivoConexaoIndisponivel:
      "Indisponível até G007: nenhum envio ou pareamento real é habilitado antes do vínculo oficial.",
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
        titulo: "Vínculo de telefone WhatsApp GESTAO + Webhook Meta",
        status: "PENDENTE_G007",
        detalhe: "Fornece VerificadorVinculo e entrada autenticada sem navegador.",
      },
      {
        codigo: "G003-STORAGE",
        titulo: "Bucket privado de comprovantes em produção",
        status: "PENDENTE_PR_405",
        detalhe: "Fronteira preparada via documents-adapter.ts; nenhum serviço externo contratado.",
      },
    ],
  }

  return respostaPrivadaJson({ ok: true, config }, 200)
}
