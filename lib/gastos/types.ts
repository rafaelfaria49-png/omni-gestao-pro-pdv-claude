/** Escopos separados: PESSOAL não pertence à loja ativa. */
export type FinanceiroPerfilSeletor =
  | { tipo: "PESSOAL"; perfilId: string; storeId?: never }
  | { tipo: "EMPRESA"; perfilId: string; storeId: string }

export type FinanceiroAcao = "view" | "edit"

declare const contextoAutorizado: unique symbol

/** Emitido somente por access.ts; nunca aceitar objeto serializado como autorização. */
export type FinanceiroContextoAutorizado = Readonly<
  { readonly [contextoAutorizado]: true; userId: string; perfilId: string } &
    (
      | { tipo: "PESSOAL"; ownerAdminUserId: string; storeId?: never }
      | { tipo: "EMPRESA"; storeId: string; ownerAdminUserId?: never }
    )
>

export type FinanceiroAccessResult =
  | { ok: true; contexto: FinanceiroContextoAutorizado }
  | { ok: false; status: 401 | 403 | 503; error: string }
