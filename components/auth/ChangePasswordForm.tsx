"use client"

import { useState } from "react"
import { signOut } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function ChangePasswordForm({ required = false }: { required?: boolean }) {
  const [currentPassword, setCurrent] = useState("")
  const [newPassword, setNew] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  return <form className="space-y-4" onSubmit={async (event) => {
    event.preventDefault()
    setError("")
    if (newPassword !== confirmation) { setError("As senhas novas não coincidem."); return }
    setBusy(true)
    try {
      const res = await fetch("/api/account/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) })
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Não foi possível alterar a senha."); return }
      setCurrent(""); setNew(""); setConfirmation("")
      await signOut({ callbackUrl: "/login?passwordChanged=1" })
    } catch { setError("Falha de conexão. Tente novamente.") }
    finally { setBusy(false) }
  }}>
    <p className="text-sm text-muted-foreground">{required ? "Defina sua senha pessoal antes de operar a loja." : "Após salvar, entre novamente. As sessões anteriores serão encerradas."}</p>
    <div className="space-y-2"><Label htmlFor="current-password">Senha atual</Label><Input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} required maxLength={128} /></div>
    <div className="space-y-2"><Label htmlFor="new-password">Nova senha</Label><Input id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNew(e.target.value)} required minLength={12} maxLength={72} aria-describedby="password-help" /></div>
    <p id="password-help" className="text-xs text-muted-foreground">Ao menos 12 caracteres, com letras maiúsculas, minúsculas e números.</p>
    <div className="space-y-2"><Label htmlFor="confirm-password">Confirme a nova senha</Label><Input id="confirm-password" type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required minLength={12} maxLength={72} /></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="submit" disabled={busy}>{busy ? "Salvando…" : "Alterar minha senha"}</Button>
  </form>
}
