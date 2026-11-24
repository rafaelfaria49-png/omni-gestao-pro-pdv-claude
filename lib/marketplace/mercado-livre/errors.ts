import "server-only"

const failures = {
  not_configured: { status: 403, message: "Mercado Livre não configurado para esta unidade." },
  invalid_state: { status: 400, message: "Autorização inválida ou expirada. Inicie a conexão novamente." },
  denied: { status: 400, message: "Autorização cancelada no Mercado Livre." },
  account_mismatch: { status: 409, message: "Use a conta autorizada para esta unidade. A conta informada não pode ser vinculada aqui." },
  test_seller_required: { status: 403, message: "Este Preview exige um vendedor oficial de teste do Mercado Livre." },
  insufficient_permissions: { status: 403, message: "Permissão insuficiente no Mercado Livre. Confira o acesso de leitura e o acesso offline e reconecte." },
  reconnect_required: { status: 409, message: "Reconecte a conta do Mercado Livre para continuar." },
  disconnected: { status: 409, message: "A conta Mercado Livre está desconectada." },
  operation_in_progress: { status: 409, message: "Há uma autorização ou renovação em andamento. Aguarde um instante ou conclua a autorização." },
  invalid_cursor: { status: 400, message: "A página expirou. Volte à primeira página de anúncios." },
  rate_limited: { status: 429, message: "O Mercado Livre limitou as consultas. Aguarde e tente novamente." },
  communication_error: { status: 502, message: "Não foi possível consultar o Mercado Livre. Tente novamente." },
} as const

export type MeliFailureCode = keyof typeof failures

export class MeliFailure extends Error {
  readonly status: number

  constructor(readonly code: MeliFailureCode, readonly retryAfter?: number) {
    super(failures[code].message)
    this.status = failures[code].status
  }
}

export function meliFailure(error: unknown) {
  return error instanceof MeliFailure ? error : new MeliFailure("communication_error")
}
