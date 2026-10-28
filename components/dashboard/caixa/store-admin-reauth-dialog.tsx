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
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { activeCaixaSessionUrl } from "@/lib/pdv-caixa-session"

/**
 * Caixa Seguro na experiência STORE (GOAL PADARIA-STORE-ADMIN-CASH-AUTH-001).
 *
 * `mode="admin"`: a administradora confirma a senha de login da própria conta. A
 * validação é do servidor (`POST /api/auth/store-admin-reauth`), que grava a
 * autorização em cookie httpOnly — este componente nunca vê o token. A senha vive só
 * no estado do campo e é apagada em sucesso, erro, cancelamento e fechamento.
 *
 * `mode="employee"`: funcionário STORE não aprova. Mostra a orientação, sem campo
 * nenhum — e nunca oferece o PIN global como alternativa.
 */
export function StoreAdminReauthDialog({
  open,
  onOpenChange,
  onAuthorized,
  mode,
  storeId,
  sessaoId,
  terminalId = null,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAuthorized: () => void
  mode: "admin" | "employee"
  storeId: string | null
  sessaoId: string | null
  terminalId?: string | null
}) {
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const reset = () => {
    setPassword("")
    setErr(null)
    setBusy(false)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const confirmar = async () => {
    if (!password || busy) return
    if (!storeId) {
      setPassword("")
      setErr("Selecione a unidade ativa e tente de novo.")
      return
    }
    setErr(null)
    setBusy(true)
    const senha = password
    setPassword("")
    try {
      // Sem `sessaoId` local (ex.: referência perdida), usa a sessão ABERTA deste terminal
      // no servidor — a mesma reconciliação do modal de fechamento.
      const alvo =
        sessaoId ??
        (await fetch(activeCaixaSessionUrl(storeId, terminalId), {
          credentials: "include",
          cache: "no-store",
          headers: { [ASSISTEC_LOJA_HEADER]: storeId },
        })
          .then(async (r) => (r.ok ? ((await r.json()) as { sessoes?: Array<{ id: string }> }).sessoes?.[0]?.id ?? null : null))
          .catch(() => null))
      if (!alvo) {
        setErr("Nenhum caixa aberto encontrado no servidor. Use “Atualizar caixa”.")
        return
      }
      const r = await fetch("/api/auth/store-admin-reauth", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json", [ASSISTEC_LOJA_HEADER]: storeId },
        body: JSON.stringify({ password: senha, sessaoId: alvo }),
      })
      if (!r.ok) {
        setErr(
          r.status === 429
            ? "Muitas tentativas. Aguarde alguns minutos e tente de novo."
            : r.status === 409
              ? "Este caixa não está mais aberto. Atualize o caixa."
              : r.status === 403
                ? "Esta conta não pode liberar o caixa desta loja."
                : r.status === 401
                  ? "Senha incorreta."
                  : "Não foi possível validar agora. Tente de novo.",
        )
        return
      }
      reset()
      onOpenChange(false)
      onAuthorized()
    } catch {
      setErr("Falha de conexão ao validar a senha. Tente de novo.")
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
            Resumo do Caixa protegido
          </DialogTitle>
          <DialogDescription>
            {mode === "admin"
              ? "Confirme a senha da sua conta para ver valores, movimentar e fechar o caixa."
              : "Somente a administradora da loja libera o resumo, a sangria, o suprimento e o fechamento do caixa."}
          </DialogDescription>
        </DialogHeader>
        {mode === "admin" ? (
          <form
            className="space-y-3 pt-1"
            onSubmit={(e) => {
              e.preventDefault()
              void confirmar()
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="store-admin-reauth-password" className="text-sm">
                Senha da administradora
              </Label>
              <Input
                id="store-admin-reauth-password"
                type="password"
                autoComplete="off"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11"
              />
              {err ? <p className="text-xs text-destructive">{err}</p> : null}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy || password.length === 0}>
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Validando…
                  </>
                ) : (
                  "Liberar"
                )}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-3 pt-1">
            <p className="text-sm text-muted-foreground">
              Peça para a administradora entrar com a conta dela neste computador para fechar o caixa.
            </p>
            <div className="flex justify-end pt-1">
              <Button onClick={() => handleOpenChange(false)}>Entendi</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
