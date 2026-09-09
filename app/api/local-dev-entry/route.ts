import type { NextRequest } from "next/server"
import { auth, signIn } from "@/auth"
import { AuthError } from "next-auth"
import { evaluateLocalDevAuthBypass } from "@/lib/local-dev-auth-guard"
import { normalizeLocalCallbackPath } from "@/lib/local-dev-entry"

/**
 * Rota interna de entrada do ambiente LOCAL de desenvolvimento
 * (LOCALHOST-DEV-DIRECT-DASHBOARD-002B).
 *
 * `/` e `/login` no dev local redirecionam para cá. Fluxo:
 *   guard fail-closed → sessão existente? → callback : signIn(localBypass) → callback
 *
 * Reutiliza o MESMO mecanismo oficial do NextAuth (authorize com localBypass —
 * ver auth.ts). Sem cookie/JWT/sessão paralela. Fora do ambiente local seguro,
 * esta rota sempre devolve à landing — nunca autentica nada.
 *
 * Em caso de falha honesta (admin local ausente/inativo), responde com página de
 * erro própria (status 500) em vez de voltar para `/` ou `/login` — isso elimina
 * qualquer possibilidade de redirect loop.
 */

function errorPage(message: string): Response {
  const safeMessage = message.replace(/[<>&"]/g, "")
  return new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ambiente local — falha de login</title></head><body style="font-family:system-ui;padding:2rem;max-width:36rem;margin:auto"><h1 style="font-size:1.1rem">Ambiente local de desenvolvimento — falha no auto-login</h1><p>${safeMessage}</p><p style="color:#666">Crie o admin local com <code>scripts/seed-admin.ts</code> e recarregue a página.</p></body></html>`,
    { status: 500, headers: { "content-type": "text/html; charset=utf-8" } }
  )
}

export async function GET(req: NextRequest) {
  // Fonte autoritativa única do "é local seguro?" — mesma do authorize().
  const guard = evaluateLocalDevAuthBypass({ hostHeader: req.headers.get("host") })
  if (!guard.allowed) {
    // FAIL-CLOSED: fora do local seguro → landing normal, sem nenhum auto-login.
    return new Response(null, { status: 307, headers: { Location: "/" } })
  }

  const callbackPath = normalizeLocalCallbackPath(req.nextUrl.searchParams.get("callbackUrl"))

  const session = await auth()
  if (session?.user) {
    return new Response(null, { status: 307, headers: { Location: callbackPath } })
  }

  try {
    // Mesma sessão oficial do botão "Entrar no ambiente de teste" — o authorize()
    // revalida todos os guards; `redirect:false` devolve a URL sem redirecionar,
    // e o cookie de sessão é aplicado pelo próprio NextAuth neste request.
    await signIn("credentials", { localBypass: "true", redirect: false })
  } catch (error) {
    if (error instanceof AuthError) {
      return errorPage(
        "Não foi possível autenticar o admin local (usuário ausente ou inativo no banco de desenvolvimento)."
      )
    }
    console.error("[local-dev-entry]", error)
    return errorPage("Erro inesperado no auto-login local.")
  }

  return new Response(null, { status: 307, headers: { Location: callbackPath } })
}
