import type { Metadata } from "next"
import { SairClient } from "./sair-client"

export const metadata: Metadata = { title: "Encerrando sessão — OmniGestão Pro" }

/**
 * Logout verificado (SEC-342). Fica sob `/login/*` (rota pública no proxy) e fora do
 * painel: nenhuma consulta do dashboard roda aqui para regravar o cookie de sessão.
 */
export default function SairPage() {
  return <SairClient />
}
