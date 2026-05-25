"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import {
  Monitor,
  Plus,
  Power,
  Check,
  Loader2,
  AlertTriangle,
  ArrowRight,
  Lock,
  ShieldCheck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { getEnterprisePermissions } from "@/lib/auth/enterprise-permissions"
import {
  listTerminais,
  criarTerminal,
  setTerminalStatus,
  type PdvTerminalDTO,
} from "@/app/actions/terminais"
import { getDeviceId, lockTerminal, type TerminalSnapshot } from "@/lib/pdv-terminal"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"

interface TerminalSelectorProps {
  storeId: string
  /** Chamado quando o operador garante o lock e seleciona um terminal. */
  onSelected: (terminal: TerminalSnapshot) => void
  /**
   * Fallback para não bloquear a operação caso o backend de terminais esteja
   * indisponível. Quando ausente, o botão "Continuar sem terminal" não é exibido.
   */
  onSkip?: () => void
  /** Código do terminal já selecionado (destaca o card atual). */
  selectedCode?: string | null
  className?: string
}

/** Atualiza a lista periodicamente para refletir locks que expiram. */
const SELECTOR_REFRESH_MS = 20_000

function fmtHora(iso: string | null): string {
  if (!iso) return "--:--"
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  } catch {
    return "--:--"
  }
}

export function TerminalSelector({
  storeId,
  onSelected,
  onSkip,
  selectedCode,
  className,
}: TerminalSelectorProps) {
  const { toast } = useToast()
  const { data: session } = useSession()
  const canManage = useMemo(
    () => getEnterprisePermissions(session?.user?.role).pdv.cancelarVenda,
    [session?.user?.role],
  )

  const [terminais, setTerminais] = useState<PdvTerminalDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<
    { kind: "assumir" | "liberar"; terminal: PdvTerminalDTO } | null
  >(null)
  const pollRef = useRef<number | null>(null)

  const carregar = useCallback(
    async (silent = false) => {
      const sid = (storeId || "").trim()
      if (!sid) {
        setLoading(false)
        setError(true)
        return
      }
      if (!silent) setLoading(true)
      try {
        const rows = await listTerminais(sid, getDeviceId())
        setTerminais(rows)
        setError(rows.length === 0)
      } catch {
        if (!silent) {
          setTerminais([])
          setError(true)
        }
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [storeId],
  )

  useEffect(() => {
    void carregar()
    pollRef.current = window.setInterval(() => void carregar(true), SELECTOR_REFRESH_MS)
    return () => {
      if (pollRef.current != null) clearInterval(pollRef.current)
    }
  }, [carregar])

  // Seleção: garante o lock antes de entrar no terminal.
  const handleUsar = async (t: PdvTerminalDTO) => {
    setBusyId(t.id)
    try {
      const r = await lockTerminal(storeId, t.id)
      if ((r.ok && r.granted) || r.degraded) {
        onSelected({ id: t.id, code: t.code, name: t.name })
        return
      }
      if (r.occupied) {
        toast({
          variant: "destructive",
          title: "Terminal ocupado",
          description: `Em uso por ${r.lockedByOperador || "outro dispositivo"}.`,
        })
        await carregar(true)
        return
      }
      toast({
        variant: "destructive",
        title: "Não foi possível usar o terminal",
        description: r.error || "Tente novamente.",
      })
    } finally {
      setBusyId(null)
    }
  }

  const handleAssumir = async (t: PdvTerminalDTO) => {
    setBusyId(t.id)
    try {
      const r = await lockTerminal(storeId, t.id, { force: true })
      if ((r.ok && r.granted) || r.degraded) {
        toast({ title: "Terminal assumido", description: `${t.name} agora é deste dispositivo.` })
        onSelected({ id: t.id, code: t.code, name: t.name })
        return
      }
      toast({
        variant: "destructive",
        title: "Não foi possível assumir",
        description: r.error || "Sem permissão ou terminal indisponível.",
      })
      await carregar(true)
    } finally {
      setBusyId(null)
    }
  }

  const handleLiberar = async (t: PdvTerminalDTO) => {
    setBusyId(t.id)
    try {
      const res = await fetch("/api/ops/terminal/unlock", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", [ASSISTEC_LOJA_HEADER]: storeId },
        body: JSON.stringify({ terminalId: t.id, force: true }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (res.ok && data.ok) {
        toast({ title: "Terminal liberado", description: `${t.name} está livre.` })
      } else {
        toast({
          variant: "destructive",
          title: "Não foi possível liberar",
          description: data.error || "Sem permissão ou terminal indisponível.",
        })
      }
      await carregar(true)
    } finally {
      setBusyId(null)
    }
  }

  const handleAdicionar = async () => {
    setAdding(true)
    try {
      const res = await criarTerminal(storeId)
      if (res.ok && res.terminal) {
        toast({ title: "Terminal adicionado", description: `${res.terminal.name} criado.` })
        await carregar(true)
      } else {
        toast({
          variant: "destructive",
          title: "Não foi possível adicionar",
          description: res.error || "Tente novamente.",
        })
      }
    } finally {
      setAdding(false)
    }
  }

  const handleToggleAtivo = async (t: PdvTerminalDTO) => {
    setBusyId(t.id)
    try {
      const next = t.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"
      const res = await setTerminalStatus(storeId, t.id, next)
      if (res.ok) {
        await carregar(true)
      } else {
        toast({
          variant: "destructive",
          title: "Não foi possível atualizar",
          description: res.error || "Tente novamente.",
        })
      }
    } finally {
      setBusyId(null)
    }
  }

  const confirmAction = async () => {
    if (!confirm) return
    const { kind, terminal } = confirm
    setConfirm(null)
    if (kind === "assumir") await handleAssumir(terminal)
    else await handleLiberar(terminal)
  }

  return (
    <div className={cn("mx-auto w-full max-w-3xl", className)}>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
          <Monitor className="h-6 w-6 text-primary" />
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-foreground">Selecionar Terminal</h2>
          <p className="text-sm text-muted-foreground">
            Escolha em qual PDV este computador vai operar. Um terminal em uso não pode
            ser aberto em dois computadores ao mesmo tempo.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-card py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Carregando terminais…
        </div>
      ) : (
        <>
          {error && terminais.length === 0 && (
            <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div className="min-w-0 text-sm">
                <p className="font-medium text-amber-600 dark:text-amber-400">
                  Terminais indisponíveis no momento
                </p>
                <p className="text-muted-foreground">
                  Não foi possível carregar os terminais desta loja. Você pode continuar
                  sem terminal — a operação não fica bloqueada.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {terminais.map((t) => {
              const s = t.lock.status
              const atual = selectedCode != null && t.code === selectedCode
              const busy = busyId === t.id
              return (
                <div
                  key={t.id}
                  className={cn(
                    "flex flex-col rounded-xl border bg-card p-4 transition-colors min-w-0",
                    s === "INATIVO"
                      ? "border-dashed border-border/70 opacity-70"
                      : "border-border",
                    s === "OCUPADO" && "border-destructive/40",
                    atual && "border-primary ring-1 ring-primary",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    {s === "OCUPADO" ? (
                      <Lock className="h-5 w-5 shrink-0 text-destructive" />
                    ) : (
                      <Monitor
                        className={cn(
                          "h-5 w-5 shrink-0",
                          s === "INATIVO" ? "text-muted-foreground" : "text-primary",
                        )}
                      />
                    )}
                    <TerminalStatusBadge status={s} />
                  </div>

                  <div className="mt-3 min-w-0">
                    <p className="truncate text-base font-semibold text-foreground">{t.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{t.code}</p>
                    {(s === "OCUPADO" || s === "EXPIRADO") && (
                      <p className="mt-1 truncate text-[11px] text-muted-foreground">
                        {t.lock.lockedByOperador ? `${t.lock.lockedByOperador} · ` : ""}
                        {s === "EXPIRADO" ? "sem sinal desde " : "último sinal "}
                        {fmtHora(t.lock.heartbeatAt)}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 flex flex-col gap-2">
                    {s === "INATIVO" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        disabled={busy}
                        onClick={() => void handleToggleAtivo(t)}
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ativar"}
                      </Button>
                    ) : s === "OCUPADO" ? (
                      <>
                        <Button size="sm" className="w-full" disabled title="Terminal em uso">
                          Em uso
                        </Button>
                        {canManage && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              disabled={busy}
                              onClick={() => setConfirm({ kind: "assumir", terminal: t })}
                            >
                              <ShieldCheck className="mr-1 h-4 w-4" />
                              Assumir
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="flex-1 text-muted-foreground"
                              disabled={busy}
                              onClick={() => setConfirm({ kind: "liberar", terminal: t })}
                            >
                              Liberar
                            </Button>
                          </div>
                        )}
                      </>
                    ) : (
                      <Button
                        size="sm"
                        className="w-full font-semibold"
                        disabled={busy}
                        onClick={() => void handleUsar(t)}
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : atual || s === "EM_USO" ? (
                          <>
                            <Check className="mr-1 h-4 w-4" /> Continuar
                          </>
                        ) : (
                          "Usar"
                        )}
                      </Button>
                    )}
                    {s !== "INATIVO" && s !== "OCUPADO" && canManage && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-full text-[11px] text-muted-foreground hover:text-destructive"
                        disabled={busy}
                        onClick={() => void handleToggleAtivo(t)}
                      >
                        <Power className="mr-1 h-3.5 w-3.5" />
                        Desativar
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}

            <button
              type="button"
              onClick={() => void handleAdicionar()}
              disabled={adding}
              className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/50 p-4 text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
            >
              {adding ? <Loader2 className="h-6 w-6 animate-spin" /> : <Plus className="h-6 w-6" />}
              <span className="text-sm font-medium">Adicionar terminal</span>
            </button>
          </div>

          {onSkip && (
            <div className="mt-6 flex justify-center">
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onSkip}>
                Continuar sem terminal
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      <AlertDialog open={confirm != null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "assumir" ? "Assumir terminal?" : "Liberar terminal?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "assumir"
                ? `O ${confirm?.terminal.name} está em uso por ${confirm?.terminal.lock.lockedByOperador || "outro dispositivo"}. Assumir vai desconectar o outro operador deste terminal.`
                : `Liberar o ${confirm?.terminal.name} vai remover o controle do dispositivo atual. Use apenas se o terminal travou ou foi abandonado.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmAction()}>
              {confirm?.kind === "assumir" ? "Assumir" : "Liberar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function TerminalStatusBadge({ status }: { status: PdvTerminalDTO["lock"]["status"] }) {
  switch (status) {
    case "LIVRE":
      return (
        <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
          Livre
        </Badge>
      )
    case "EM_USO":
      return (
        <Badge variant="outline" className="border-primary/40 text-primary">
          Em uso (aqui)
        </Badge>
      )
    case "OCUPADO":
      return (
        <Badge variant="outline" className="border-destructive/40 text-destructive">
          Em uso
        </Badge>
      )
    case "EXPIRADO":
      return (
        <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">
          Offline
        </Badge>
      )
    case "INATIVO":
    default:
      return (
        <Badge variant="outline" className="text-muted-foreground">
          Inativo
        </Badge>
      )
  }
}
