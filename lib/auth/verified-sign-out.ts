/**
 * Logout verificado (SEC-342 · logout).
 *
 * Com sessão JWT, o `auth()` do proxy e `GET /api/auth/session` regravam o
 * `authjs.session-token` em TODA resposta autenticada. Uma resposta que saiu do servidor
 * antes do signout e chega depois dele (polling da sessão, catálogo, versão do app…)
 * ressuscita o cookie: o usuário vê `/login`, mas a sessão continua válida — no CI da
 * #342 e no QA local isso aconteceu em 4 de 5 logouts.
 *
 * Por isso o logout roda numa página própria (`/login/sair`), longe das consultas do
 * painel, e só termina quando o SERVIDOR confirma que não há mais sessão. Sem confirmação
 * (rede fora, servidor sem resposta) devolve `ok: false` — nunca finge que saiu.
 */

export type SignOutFn = (options: { redirect: false }) => Promise<unknown>

export type VerifiedSignOutResult =
  | { ok: true; attempts: number }
  | { ok: false; attempts: number; reason: "sessao-ainda-ativa" | "sem-confirmacao" }

export type VerifiedSignOutDeps = {
  signOut: SignOutFn
  fetchImpl: typeof fetch
  wait: (ms: number) => Promise<void>
  /** Tentativas de signout + verificação. */
  attempts?: number
  /** Pausa antes da 1ª tentativa: deixa terminar as respostas que esta página já pediu. */
  quietMs?: number
  /** Pausa entre as duas leituras que confirmam a saída. */
  confirmMs?: number
}

type SessionProbe = "sem-sessao" | "com-sessao" | "inconclusivo"

async function probeSession(fetchImpl: typeof fetch): Promise<SessionProbe> {
  try {
    // URL única por sonda: `cache: "no-store"` não passa pelo service worker, e a regra `apis`
    // (NetworkFirst, chave = URL) responderia com a sessão guardada — com ou sem usuário.
    const res = await fetchImpl(`/api/auth/session?confirmar=${Date.now()}-${Math.random().toString(36).slice(2)}`, {
      cache: "no-store",
      credentials: "include",
    })
    if (!res.ok) return "inconclusivo"
    const body = (await res.json().catch(() => undefined)) as { user?: unknown } | null | undefined
    if (body === undefined) return "inconclusivo"
    return body && typeof body === "object" && body.user ? "com-sessao" : "sem-sessao"
  } catch {
    return "inconclusivo"
  }
}

export async function verifiedSignOut(deps: VerifiedSignOutDeps): Promise<VerifiedSignOutResult> {
  const attempts = Math.max(1, deps.attempts ?? 3)
  await deps.wait(deps.quietMs ?? 800)
  let last: SessionProbe = "inconclusivo"
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await deps.signOut({ redirect: false })
    } catch {
      /* falha do POST: a verificação abaixo decide */
    }
    // Margem para respostas em voo que ainda podem regravar o cookie.
    await deps.wait(300 * i)
    last = await probeSession(deps.fetchImpl)
    if (last !== "sem-sessao") continue
    // Segunda leitura depois de uma pausa: uma resposta em voo de outra aba pode ainda regravar
    // o cookie logo após a 1ª confirmação. Só duas leituras seguidas sem sessão encerram.
    await deps.wait(deps.confirmMs ?? 1_000)
    last = await probeSession(deps.fetchImpl)
    if (last === "sem-sessao") return { ok: true, attempts: i }
  }
  return { ok: false, attempts, reason: last === "com-sessao" ? "sessao-ainda-ativa" : "sem-confirmacao" }
}
