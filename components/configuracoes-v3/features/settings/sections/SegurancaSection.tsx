"use client"
import { useState } from "react"
import { useSession } from "next-auth/react"
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm"
import { Button } from "@/components/ui/button"
import { signOutBrowserSession } from "@/lib/auth/browser-signout"
import { SettingsCard } from "../components/SettingsCard"

export function SegurancaSection() {
  const { data: session } = useSession()
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)

  async function handleSignOut() {
    setSigningOut(true)
    setSignOutError(null)
    try {
      window.location.assign(await signOutBrowserSession("/login"))
    } catch {
      setSigningOut(false)
      setSignOutError("Não foi possível encerrar a sessão agora. Verifique a conexão e tente novamente.")
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Segurança da conta</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {session?.user?.name} · {session?.user?.email}
        </p>
      </header>
      <SettingsCard title="Alterar minha senha">
        <ChangePasswordForm />
      </SettingsCard>
      <SettingsCard title="Acesso à conta">
        <p className="mb-4 text-sm text-muted-foreground">
          Se precisar redefinir uma senha esquecida, procure o responsável pela plataforma.
        </p>
        <div className="flex flex-col items-start gap-2">
          <Button variant="outline" disabled={signingOut} onClick={() => void handleSignOut()}>
            {signingOut ? "Encerrando…" : "Encerrar sessão"}
          </Button>
          {signOutError ? (
            <p role="alert" className="text-sm text-destructive">
              {signOutError}
            </p>
          ) : null}
        </div>
      </SettingsCard>
    </div>
  )
}
