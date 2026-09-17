"use client"

import { useState, type ReactNode } from "react"
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

/** Supervisor que co-assinou a autorização — devolvido por `POST /api/auth/admin`. */
export type SupervisorAutorizador = { id: string; name: string }

/**
 * Diálogo compartilhado de autorização de supervisor/gerente.
 *
 * Valida o PIN NO SERVIDOR via `POST /api/auth/admin` (mesmo mecanismo já usado
 * pelo PDV Supermercado, payment-modal e correção de venda) — `User.pin` com role
 * ADMIN. Não há validação fake/local: sem `r.ok` do servidor, nada é liberado.
 *
 * Em sucesso dispara `onAuthorized(admin)` e fecha. O cookie httpOnly
 * `assistec_admin_session` que o endpoint grava NÃO é usado aqui para pular o PIN —
 * quem decide o ciclo de "sessão revelada" é o consumidor (ex.: CaixaStatusBar,
 * janela de 5 min). Assim o Resumo do Caixa permanece "protegido por padrão".
 *
 * O supervisor que co-assinou volta em `onAuthorized` (GOAL
 * CAIXA-CONFERENCIA-VENDAS-ACOES-REAIS-007 §7): ação destrutiva precisa registrar QUEM
 * autorizou, não apenas que houve autorização. O PIN em si nunca sai deste componente
 * e nunca é guardado em estado persistente — some com o `reset()`.
 *
 * `children` é o slot do contexto da ação (resumo do que será feito, motivo
 * obrigatório). Fica acima do campo de PIN para o supervisor ler o que está assinando;
 * `canSubmit` deixa o consumidor travar "Autorizar" enquanto esse contexto não estiver
 * válido — assim o PIN não é gasto numa tentativa que falharia depois.
 */
export function SupervisorGateDialog({
  open,
  onOpenChange,
  onAuthorized,
  title = "Autorização do supervisor",
  description = "Esta ação exige a senha de um supervisor/gerente.",
  children,
  canSubmit = true,
  confirmLabel = "Autorizar",
  closeOnAuthorized = true,
  scope,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `admin` é o supervisor que co-assinou — `null` se o servidor não o devolveu. */
  onAuthorized: (admin: SupervisorAutorizador | null) => void
  title?: string
  description?: string
  /** Contexto da ação exibido acima do PIN (ex.: resumo + motivo obrigatório). */
  children?: ReactNode
  /** `false` mantém "Autorizar" desabilitado mesmo com PIN preenchido. */
  canSubmit?: boolean
  confirmLabel?: string
  /**
   * `false` deixa o diálogo ABERTO após o PIN ser aceito, para o consumidor fechá-lo
   * só depois de saber o resultado da ação. Sem isso, uma recusa do servidor (ex.: o
   * step-up expirou entre autorizar e enviar) chegava com o diálogo já desmontado e o
   * operador não via erro nenhum. O PIN é limpo de qualquer forma.
   */
  closeOnAuthorized?: boolean
  /**
   * Vincula a autorização a UMA ação sobre UM alvo (GOAL 007B). Quando informado, o
   * token emitido só serve para esse par — co-assinar o estorno da Venda A deixa de
   * liberar a Venda B. Sem `scope`, o token nasce genérico (fluxo legado).
   */
  scope?: { action: string; resource?: string }
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
        body: JSON.stringify({
          pin: value,
          ...(scope ? { action: scope.action, resource: scope.resource } : {}),
        }),
      })
      if (!r.ok) {
        setErr(r.status === 429 ? "Muitas tentativas. Aguarde e tente de novo." : "Senha inválida.")
        return
      }
      // O endpoint responde { ok, admin: { id, name } }. Resposta sem `admin` ainda é
      // autorização válida — o consumidor decide como registrar o autorizador ausente.
      const j = (await r.json().catch(() => null)) as { admin?: SupervisorAutorizador } | null
      const admin = j?.admin?.id ? { id: j.admin.id, name: j.admin.name ?? "" } : null
      reset()
      if (closeOnAuthorized) onOpenChange(false)
      onAuthorized(admin)
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
          {children}
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
            <Button
              onClick={() => void autorizar()}
              disabled={busy || !canSubmit || pin.trim().length === 0}
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Validando…
                </>
              ) : (
                confirmLabel
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
