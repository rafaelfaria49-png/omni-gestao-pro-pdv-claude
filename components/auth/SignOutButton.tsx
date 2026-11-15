"use client"

import { useState } from "react"
import { signOut } from "next-auth/react"
import { LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * "Sair da conta" para QUALQUER usuário autenticado, inclusive no primeiro acesso (troca de senha
 * pendente). Mesmo mecanismo do "Encerrar sessão" de Configurações → Segurança: `signOut` oficial do
 * NextAuth, que chama `/api/auth/signout` (liberado pelo proxy mesmo com troca pendente) e volta ao login.
 */
export function SignOutButton() {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  return (
    <div className="flex min-w-0 flex-col gap-1.5 sm:items-end">
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          setFailed(false)
          void signOut({ callbackUrl: "/login" }).catch(() => {
            setBusy(false)
            setFailed(true)
          })
        }}
        className="w-full gap-2 sm:w-auto"
      >
        <LogOut className="h-4 w-4" />
        {busy ? "Saindo…" : "Sair da conta"}
      </Button>
      {failed ? (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível sair agora. Verifique a conexão e tente de novo.
        </p>
      ) : null}
    </div>
  )
}
