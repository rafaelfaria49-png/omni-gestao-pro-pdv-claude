/**
 * Step-up de supervisor OBRIGATÓRIO no servidor para estornar/cancelar uma venda —
 * GOAL CAIXA-CONFERENCIA-VENDAS-ACOES-REAIS-007A (BLOCKER-1).
 *
 * Antes deste guard, `POST /api/vendas/[id]/cancelar` exigia apenas sessão NextAuth +
 * `pdv.cancelarVenda`. O step-up existia SÓ na UI da Conferência, então quem já tinha a
 * permissão estornava chamando a rota direto e o supervisor nunca era consultado — o
 * segundo fator era decorativo.
 *
 * NÃO cria mecanismo novo. Consome exatamente a autorização que
 * `POST /api/auth/admin` já emite (`lib/auth/pin-authorization.ts`), o mesmo cookie
 * assinado que `lib/api-auth.ts#isAdminSession` consome para a trilha de auditoria:
 *
 *   - assinatura HMAC-SHA256 com chave derivada por domínio do schema;
 *   - `exp` de 15 min conferido SEMPRE no servidor (o `maxAge` do cookie é conveniência);
 *   - vínculo com o `userId` da sessão que pediu E com o `storeId` da operação;
 *   - cookie httpOnly + SameSite=strict — o browser não fabrica nem reenvia cross-site.
 *
 * O `storeId` É conferido aqui (ao contrário de `isAdminSession`, cujo consumidor lê
 * trilha global): estornar venda é operação escopada por unidade, então uma autorização
 * emitida para outra loja não vale.
 *
 * **Complementa, não substitui, a permissão normal.** A rota continua exigindo
 * `pdv.cancelarVenda` antes de chegar aqui: step-up sem permissão continua negado.
 *
 * GOAL 007B — VÍNCULO POR AÇÃO E POR VENDA. Antes, a autorização valia por 15 min para
 * o par (utilizador, loja): co-assinar o estorno da Venda A liberava, via API, o estorno
 * da Venda B sem o supervisor saber. Agora a verificação exige que o token tenha sido
 * emitido para a ação `estornar_venda` E para ESTE `pedidoId`. Autorização genérica
 * (sem escopo) deixa de autorizar estorno — recusa explícita, não silenciosa.
 */

import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import {
  ADMIN_AUTHORIZATION_COOKIE,
  resolvePinAuthorizationSecret,
  verifyPinAuthorizationToken,
  type PinAuthorizationFailure,
} from "@/lib/auth/pin-authorization"
import { SUPERVISOR_ROLE_FILTER } from "@/lib/auth/verify-supervisor-pin"
import { ESTORNO_STEP_UP_ACTION } from "@/lib/vendas/estorno-step-up-contract"

export type EstornoStepUpResult =
  | {
      ok: true
      /** `User.id` do supervisor que co-assinou — vem do TOKEN, não do corpo da requisição. */
      supervisorId: string
      /** Nome do supervisor quando ainda existe e continua com papel de admin. */
      supervisorNome: string | null
    }
  | { ok: false; status: number; error: string; code: string }

/** Resposta única para toda recusa — não revela ao cliente qual propriedade falhou. */
const NEGADO = {
  ok: false as const,
  status: 403,
  error:
    "Autorização de supervisor obrigatória para estornar venda. Refaça a autorização e tente de novo.",
  code: "step_up_required",
}

/**
 * Motivos que valem log estruturado separado — ajudam a distinguir "nunca autorizou"
 * de "autorização expirou" no suporte, sem contar isso ao cliente.
 */
const MOTIVO_LOG: Record<PinAuthorizationFailure, string> = {
  missing_server_secret: "servidor sem segredo de autorização configurado",
  missing_cookie: "sem autorização de supervisor",
  malformed_token: "autorização malformada",
  invalid_signature: "assinatura inválida",
  schema_mismatch: "schema de autorização antigo",
  expired: "autorização expirada",
  user_mismatch: "autorização de outro utilizador",
  store_mismatch: "autorização de outra unidade",
  action_mismatch: "autorização concedida para outra ação",
  resource_mismatch: "autorização concedida para outra venda",
}

/**
 * Exige step-up válido para `storeId` e devolve QUEM autorizou.
 *
 * `userId` é o da sessão NextAuth corrente (o operador). O supervisor sai do payload
 * assinado — é por isso que o autorizador gravado na auditoria deixa de depender de
 * texto enviado pelo frontend.
 */
export async function requireEstornoStepUp(
  userId: string,
  storeId: string,
  pedidoId: string,
): Promise<EstornoStepUpResult> {
  const alvo = pedidoId.trim()
  if (!alvo) return NEGADO

  const jar = await cookies()
  const verification = await verifyPinAuthorizationToken(
    jar.get(ADMIN_AUTHORIZATION_COOKIE)?.value,
    resolvePinAuthorizationSecret(),
    // `action` + `resource` tornam a recusa estrita: token genérico ou emitido para
    // outra venda não passa. O alvo é o número da venda que ESTA requisição estorna.
    { userId, storeId, action: ESTORNO_STEP_UP_ACTION, resource: alvo },
  )

  if (!verification.ok) {
    console.warn(
      "[vendas/cancelar:step-up] negado",
      JSON.stringify({ storeId, reasonCode: verification.reason, motivo: MOTIVO_LOG[verification.reason] }),
    )
    return NEGADO
  }

  const supervisorId = verification.payload.supervisorId
  // Nome é conveniência de auditoria: se o supervisor foi desativado/removido depois da
  // emissão, a autorização continua válida (já foi dada) mas o nome sai null em vez de
  // inventado. A prova de autorização é o token, não a linha em `users`.
  let supervisorNome: string | null = null
  try {
    const row = await prisma.user.findFirst({
      where: { id: supervisorId, ...SUPERVISOR_ROLE_FILTER },
      select: { name: true },
    })
    supervisorNome = row?.name?.trim() || null
  } catch (e) {
    console.error("[vendas/cancelar:step-up] falha ao resolver nome do supervisor:", e)
  }

  return { ok: true, supervisorId, supervisorNome }
}
