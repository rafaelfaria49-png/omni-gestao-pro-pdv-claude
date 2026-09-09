"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { FlaskConical } from "lucide-react"
import { localDevSignInAction } from "@/app/actions/auth"

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg border border-warning/40 bg-warning/10 px-4 py-2 text-sm font-semibold text-warning transition-opacity hover:bg-warning/15 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Entrando…" : "Entrar no ambiente de teste"}
    </button>
  )
}

/**
 * Bloco de login sem senha do ambiente LOCAL de desenvolvimento
 * (LOCALHOST-DEV-AUTH-BYPASS-002). Só é renderizado quando o guard server-side
 * libera o bypass — nunca aparece em produção/Vercel. A autorização real acontece
 * no servidor (localDevSignInAction → authorize), nunca no cliente.
 */
export function LocalDevLoginBlock() {
  const [state, formAction] = useActionState(localDevSignInAction, { error: null })

  return (
    <div className="rounded-lg border border-dashed border-warning/40 bg-warning/5 p-3">
      <p className="flex items-center justify-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-warning">
        <FlaskConical className="h-3 w-3" />
        Ambiente local de desenvolvimento
      </p>
      <form action={formAction} className="mt-2">
        <SubmitButton />
      </form>
      <p className="mt-2 text-center text-[10px] text-muted-foreground">
        Usa somente o banco local de desenvolvimento.
      </p>
      {state.error && (
        <p className="mt-1 text-center text-xs text-destructive">{state.error}</p>
      )}
    </div>
  )
}
