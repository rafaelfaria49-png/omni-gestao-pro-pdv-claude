"use server"
/**
 * G007 — onboarding do vínculo WhatsApp do Gestor Money, iniciado pelo usuário AUTENTICADO.
 * Identidade vem só da sessão (nunca do formulário). DESLIGADO sem `GESTOR_MONEY_ENABLED=true` e
 * `GESTOR_MONEY_WHATSAPP_GESTAO=ligado`. Erros voltam como resultado (Server Action mascara exceções em produção).
 * Sem UI nesta entrega: a interface (Antigravity, #418) consome estas actions — contrato em
 * docs/ai-execution/_evidence/OMNI-GESTOR-MONEY-G007-G008-FINAL-INTEGRATION-002/CONTRATOS_PAREAMENTO_PR418.md.
 */
import { prisma } from "@/lib/prisma"
import { requireEnterpriseSession } from "@/lib/auth/guard-enterprise"
import { canalGestaoLigado } from "@/lib/gestor-money-assistente/whatsapp/webhook"
import { cancelarPareamento, CONSENTIMENTO_VERSAO_ATUAL, iniciarPareamento, revogarVinculo, situacaoVinculo, VinculoError } from "@/lib/gestor-money-assistente/whatsapp/vinculo"

type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: string }
const MENSAGENS: Record<string, string> = {
  TELEFONE_INVALIDO: "Informe o telefone no formato internacional, por exemplo +5511999990000.",
  CONSENTIMENTO_AUSENTE: "É preciso aceitar os termos de uso do assistente pelo WhatsApp.",
  LIMITE_DESAFIOS: "Muitos códigos gerados na última hora. Tente novamente mais tarde.",
  USUARIO_INVALIDO: "Sua conta não pode vincular o WhatsApp agora.",
  SEM_VINCULO: "Não há WhatsApp vinculado à sua conta.",
}

async function usuario(): Promise<string | null> {
  if (!canalGestaoLigado(process.env)) return null
  const s = await requireEnterpriseSession()
  return s.ok ? s.session.user.id : null
}

function falha(e: unknown): { ok: false; erro: string } {
  return { ok: false, erro: e instanceof VinculoError ? MENSAGENS[e.codigo] : "Não foi possível concluir agora." }
}

export async function gerarCodigoVinculoWhatsApp(input: { telefoneE164: string; aceitouConsentimento: boolean }):
  Promise<Resultado<{ codigo: string; expiraEm: string; telefoneMascarado: string }>> {
  const userId = await usuario()
  if (!userId) return { ok: false, erro: "Indisponível." }
  try {
    const r = await iniciarPareamento(prisma, { userId, telefoneE164: input?.telefoneE164,
      consentimentoVersao: input?.aceitouConsentimento === true ? CONSENTIMENTO_VERSAO_ATUAL : "" })
    return { ok: true, dados: { codigo: r.codigo, expiraEm: r.expiraEm.toISOString(), telefoneMascarado: r.telefoneMascarado } }
  } catch (e) { return falha(e) }
}

export async function revogarVinculoWhatsApp(): Promise<Resultado<{ revogado: true }>> {
  const userId = await usuario()
  if (!userId) return { ok: false, erro: "Indisponível." }
  try { await revogarVinculo(prisma, { userId, motivo: "USUARIO" }); return { ok: true, dados: { revogado: true } } } catch (e) { return falha(e) }
}

/** Estado para a tela; a confirmação acontece no WhatsApp, então a UI consulta isto até VINCULADO/EXPIRADO. */
export async function situacaoVinculoWhatsApp() {
  const userId = await usuario()
  if (!userId) return { ok: false as const, erro: "Indisponível." }
  try {
    // Número do assistente só para exibição (o roteamento real é por whatsapp_canais, inacessível ao runtime web).
    const numero = process.env.GESTOR_MONEY_WHATSAPP_NUMERO_EXIBICAO?.trim() || null
    return { ok: true as const, dados: { ...(await situacaoVinculo(prisma, userId)), numeroAssistente: numero } }
  } catch { return { ok: false as const, erro: "Não foi possível concluir agora." } }
}

export async function cancelarPareamentoWhatsApp(): Promise<Resultado<{ cancelado: boolean }>> {
  const userId = await usuario()
  if (!userId) return { ok: false, erro: "Indisponível." }
  try { return { ok: true, dados: await cancelarPareamento(prisma, userId) } } catch (e) { return falha(e) }
}
