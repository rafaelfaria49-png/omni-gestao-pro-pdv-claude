"use client"

import { useCallback, useEffect, useState } from "react"
import { KeyRound, ShieldAlert, ShieldCheck, Loader2, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"

type Status =
  | { state: "loading" }
  | { state: "missing" }
  | { state: "ok"; isDefault: boolean; name: string | null }
  | { state: "error"; message: string }

const PIN_REGEX = /^\d{4,12}$/

/**
 * Card de gestão do PIN de supervisor do PDV.
 *
 * Lê o status via GET /api/admin/supervisor-pin (somente flags — não retorna o PIN)
 * e troca via POST /api/admin/supervisor-pin (exige PIN atual + novo PIN).
 *
 * Exibe aviso quando o PIN atual é o padrão de seed ("1234").
 */
export function SupervisorPinCard() {
  const { toast } = useToast()
  const [status, setStatus] = useState<Status>({ state: "loading" })
  const [currentPin, setCurrentPin] = useState("")
  const [newPin, setNewPin] = useState("")
  const [confirmPin, setConfirmPin] = useState("")
  const [showPins, setShowPins] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadStatus = useCallback(async () => {
    setStatus({ state: "loading" })
    try {
      const r = await fetch("/api/admin/supervisor-pin", {
        credentials: "include",
        cache: "no-store",
      })
      if (r.status === 401 || r.status === 403) {
        setStatus({ state: "error", message: "Sem permissão para gerenciar o PIN." })
        return
      }
      if (!r.ok) {
        setStatus({ state: "error", message: `Falha ao consultar status (HTTP ${r.status}).` })
        return
      }
      const j = (await r.json()) as { exists?: boolean; isDefault?: boolean; name?: string | null }
      if (!j.exists) {
        setStatus({ state: "missing" })
        return
      }
      setStatus({ state: "ok", isDefault: !!j.isDefault, name: j.name ?? null })
    } catch (e) {
      setStatus({
        state: "error",
        message: e instanceof Error ? e.message : "Falha ao consultar status.",
      })
    }
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  const resetForm = () => {
    setCurrentPin("")
    setNewPin("")
    setConfirmPin("")
    setShowPins(false)
  }

  const handleSubmit = useCallback(async () => {
    const cur = currentPin.trim()
    const nv = newPin.trim()
    const conf = confirmPin.trim()

    if (!cur) {
      toast({ variant: "destructive", title: "Informe o PIN atual." })
      return
    }
    if (!PIN_REGEX.test(nv)) {
      toast({
        variant: "destructive",
        title: "Novo PIN inválido",
        description: "Use de 4 a 12 dígitos numéricos.",
      })
      return
    }
    if (nv !== conf) {
      toast({ variant: "destructive", title: "Confirmação não confere com o novo PIN." })
      return
    }
    if (nv === cur) {
      toast({
        variant: "destructive",
        title: "O novo PIN deve ser diferente do atual.",
      })
      return
    }

    setSaving(true)
    try {
      const r = await fetch("/api/admin/supervisor-pin", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPin: cur, newPin: nv }),
      })
      const j = (await r.json().catch(() => null)) as { error?: string; ok?: boolean } | null
      if (!r.ok || !j?.ok) {
        toast({
          variant: "destructive",
          title: "Não foi possível trocar o PIN",
          description: j?.error || `HTTP ${r.status}`,
        })
        return
      }
      toast({
        title: "PIN atualizado",
        description: "O novo PIN está ativo no PDV.",
      })
      resetForm()
      await loadStatus()
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Erro ao trocar PIN",
        description: e instanceof Error ? e.message : "Falha de rede.",
      })
    } finally {
      setSaving(false)
    }
  }, [currentPin, newPin, confirmPin, toast, loadStatus])

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-card">
      <header className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <KeyRound className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold tracking-tight text-foreground">
            PIN do Supervisor (PDV)
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Usado no PDV para autorizar desconto manual, remoção de item e
            limpeza do carrinho.
          </p>
        </div>
      </header>

      {status.state === "loading" && (
        <div className="mt-5 space-y-3" aria-busy="true">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-10 w-48" />
        </div>
      )}

      {status.state === "error" && (
        <div className="mt-5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {status.message}
        </div>
      )}

      {status.state === "missing" && (
        <div className="mt-5 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning-foreground">
          <p className="font-medium">Nenhum supervisor configurado.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Rode no servidor:{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              npm run db:seed-supervisor-pin
            </code>
            . Isso cria um usuário <strong>ADMIN</strong> com o PIN padrão e
            permite alterar aqui depois.
          </p>
        </div>
      )}

      {status.state === "ok" && (
        <>
          <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Supervisor ativo
              </p>
              <p className="mt-1 truncate font-medium text-foreground">
                {status.name || "Supervisor"}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Estado do PIN
              </p>
              <div className="mt-1 flex items-center gap-1.5 font-medium">
                {status.isDefault ? (
                  <>
                    <ShieldAlert className="h-4 w-4 text-warning" />
                    <span className="text-warning-foreground">
                      Padrão inicial
                    </span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4 text-success" />
                    <span className="text-success">
                      Personalizado
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {status.isDefault && (
            <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
              <p className="font-medium text-warning-foreground">
                Altere o PIN padrão após a primeira configuração.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                O PIN padrão é apenas para bootstrap. Troque por um valor
                conhecido apenas pela gerência da loja.
              </p>
            </div>
          )}

          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">
                Trocar PIN
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 gap-1 text-xs"
                onClick={() => setShowPins((p) => !p)}
              >
                {showPins ? (
                  <>
                    <EyeOff className="h-3.5 w-3.5" /> Ocultar
                  </>
                ) : (
                  <>
                    <Eye className="h-3.5 w-3.5" /> Mostrar
                  </>
                )}
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="current-pin" className="text-xs">
                  PIN atual
                </Label>
                <Input
                  id="current-pin"
                  type={showPins ? "text" : "password"}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={12}
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="Atual"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-pin" className="text-xs">
                  Novo PIN (4–12 dígitos)
                </Label>
                <Input
                  id="new-pin"
                  type={showPins ? "text" : "password"}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={12}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="Novo"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-pin" className="text-xs">
                  Confirmar novo PIN
                </Label>
                <Input
                  id="confirm-pin"
                  type={showPins ? "text" : "password"}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={12}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="Confirmar"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={resetForm}
                disabled={saving}
              >
                Limpar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void handleSubmit()}
                disabled={
                  saving ||
                  !currentPin.trim() ||
                  !PIN_REGEX.test(newPin.trim()) ||
                  newPin.trim() !== confirmPin.trim()
                }
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Atualizando…
                  </>
                ) : (
                  "Atualizar PIN"
                )}
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
