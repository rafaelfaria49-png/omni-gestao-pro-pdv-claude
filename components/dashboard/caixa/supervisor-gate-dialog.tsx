"use client"

import { useState } from "react"
import { Loader2, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * Diálogo compartilhado de autorização de supervisor/gerente.
 *
 * Valida o PIN NO SERVIDOR via `POST /api/auth/admin` (mesmo mecanismo já usado
 * pelo PDV Supermercado, payment-modal e correção de venda) — `User.pin` com role
 * ADMIN. Não há validação fake/local: sem `r.ok` do servidor, nada é liberado.
 *
 * Em sucesso dispara `onAuthorized()` e fecha. O cookie httpOnly
 * `assistec_admin_session` que o endpoint grava NÃO é usado aqui para pular o PIN —
 * quem decide o ciclo de "sessão revelada" é o consumidor (ex.: CaixaStatusBar,
 * janela de 5 min). Assim o Resumo do Caixa permanece "protegido por padrão".
 */
export function SupervisorGateDialog({
  open,
  onOpenChange,
  onAuthorized,
  title = "Autorização do supervisor",
  description = "Esta ação exige a senha de um supervisor/gerente.",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAuthorized: () => void
  title?: string
  description?: string
}) {
  const [pin, setPin] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const reset = () => {
    setPin("")
    setErr(null)
    setBusy(false)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const autorizar = async () => {
    const value = pin.trim()
    if (!value || busy) return
    setErr(null)
    setBusy(true)
    try {
      const r = await fetch("/api/auth/admin", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: value }),
      })
      if (!r.ok) {
        setErr("Senha inválida.")
        return
      }
      reset()
      onOpenChange(false)
      onAuthorized()
    } catch {
      setErr("Falha ao validar a senha. Tente novamente.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm border-border bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <Label className="text-sm">Senha do supervisor</Label>
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              placeholder="PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void autorizar()
                }
              }}
              className="h-11"
            />
            {err ? <p className="text-xs text-destructive">{err}</p> : null}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={() => void autorizar()} disabled={busy || pin.trim().length === 0}>
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Validando…
                </>
              ) : (
                "Autorizar"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
