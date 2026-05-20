"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { LockKeyhole, ShieldCheck, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { StaffAppRole } from "@/lib/staff-session"
import { APP_DISPLAY_NAME } from "@/lib/app-brand"

type StaffCtx = {
  role: StaffAppRole | null
  profileName: string
  cargo: string
  lojaStatus: string
  logout: () => void
}

const StaffAccessContext = createContext<StaffCtx | null>(null)

export function useStaffAccess(): StaffAppRole | null {
  return useContext(StaffAccessContext)?.role ?? null
}

export function useStaffSession(): StaffCtx {
  const ctx = useContext(StaffAccessContext)
  if (!ctx) {
    return {
      role: null,
      profileName: "Rafael",
      cargo: "Dono",
      lojaStatus: "Loja Matriz - Ativa",
      logout: () => {},
    }
  }
  return ctx
}

type GateMode = StaffAppRole | null

const MOCK_AUTH_STORAGE_KEY = "omni.mock.staff.role"

const PROFILE_OPTIONS: Array<{ role: StaffAppRole; label: string; desc: string }> = [
  { role: "ADMIN", label: "Dono", desc: "Visão completa do sistema" },
  { role: "GERENTE", label: "Gerente", desc: "Gestão operacional e equipe" },
  { role: "MARKETING", label: "Marketing", desc: "Campanhas, mídia e IA" },
  { role: "OPERADOR", label: "Operador", desc: "Rotina operacional da loja" },
  { role: "VENDEDOR", label: "Vendedor", desc: "PDV, clientes e atendimento" },
]

function roleToCargo(role: StaffAppRole | null): string {
  if (role === "ADMIN") return "Dono"
  if (role === "GERENTE") return "Gerente"
  if (role === "MARKETING") return "Marketing"
  if (role === "OPERADOR") return "Operador"
  return "Vendedor"
}

export function AccessGate({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<StaffAppRole | null>(null)
  const [pick, setPick] = useState<GateMode>("ADMIN")
  const [pin, setPin] = useState("")
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const localRole = String(localStorage.getItem(MOCK_AUTH_STORAGE_KEY) || "").trim() as StaffAppRole
      if (PROFILE_OPTIONS.some((p) => p.role === localRole)) {
        setRole(localRole)
        setLoading(false)
        return
      }
    } catch {
      /* ignore */
    }
    try {
      const r = await fetch("/api/auth/staff", { method: "GET", credentials: "include", cache: "no-store" })
      const j = (await r.json().catch(() => null)) as { ok?: boolean; role?: StaffAppRole } | null
      if (j?.ok === true && j.role) setRole(j.role)
      else setRole(null)
    } catch {
      setRole(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pick) return
    setErr("")
    setBusy(true)
    try {
      const r = await fetch("/api/auth/staff", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: pick, pin }),
      })
      const j = (await r.json().catch(() => null)) as { error?: string } | null
      if (!r.ok) {
        setErr(j?.error === "invalid_pin" ? "Senha incorreta." : "Não foi possível entrar. Tente novamente.")
        return
      }
      try {
        localStorage.setItem(MOCK_AUTH_STORAGE_KEY, pick)
      } catch {
        /* ignore */
      }
      setPin("")
      setPick("ADMIN")
      await refresh()
    } catch {
      setErr("Falha de rede.")
    } finally {
      setBusy(false)
    }
  }

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(MOCK_AUTH_STORAGE_KEY)
    } catch {
      /* ignore */
    }
    setRole(null)
    setPick("ADMIN")
    setPin("")
    setErr("")
    void fetch("/api/auth/staff", { method: "DELETE", credentials: "include" }).catch(() => {})
    void fetch("/api/auth/admin", { method: "DELETE", credentials: "include" }).catch(() => {})
  }, [])

  const ctx = useMemo<StaffCtx>(
    () => ({
      role,
      profileName: "Rafael",
      cargo: roleToCargo(role),
      lojaStatus: "Loja Matriz - Ativa",
      logout,
    }),
    [role, logout]
  )

  if (loading) {
    return (
      <StaffAccessContext.Provider value={ctx}>
        <div className="relative min-h-screen min-h-[100dvh] w-full overflow-hidden bg-background text-foreground">
          <div className="pointer-events-none blur-sm opacity-70">{children}</div>
          <div className="absolute inset-0 grid place-items-center bg-background/50 backdrop-blur-md">
            <div className="rounded-2xl border border-border bg-card px-5 py-3 text-sm text-muted-foreground shadow-card">
              Carregando acesso...
            </div>
          </div>
        </div>
      </StaffAccessContext.Provider>
    )
  }

  if (!role) {
    return (
      <StaffAccessContext.Provider value={ctx}>
        <div className="relative min-h-screen min-h-[100dvh] w-full overflow-hidden bg-background text-foreground">
          <div className="pointer-events-none select-none blur-md brightness-75 transition duration-300">
            {children}
          </div>
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/50 p-4 backdrop-blur-md">
            <form
              onSubmit={submit}
              className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card/85 shadow-[0_24px_90px_rgba(0,0,0,0.35)] backdrop-blur-2xl"
            >
              <div className="border-b border-border px-7 py-6">
                <div className="mb-4 flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-primary shadow-glow">
                    <ShieldCheck className="h-5 w-5 text-primary-foreground" />
                  </span>
                  <div>
                    <h1 className="text-xl font-bold tracking-tight text-foreground">{APP_DISPLAY_NAME}</h1>
                    <p className="text-sm text-muted-foreground">Acesso rápido ao App Shell</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">Modo teste:</span> escolha um perfil e use a senha <span className="font-mono font-bold text-foreground">123456</span>.
                </div>
              </div>

              <div className="space-y-5 px-7 py-6">
                <div className="space-y-2">
                  <Label htmlFor="staff-profile">Perfil de acesso</Label>
                  <Select value={pick ?? "ADMIN"} onValueChange={(value) => setPick(value as StaffAppRole)}>
                    <SelectTrigger id="staff-profile" className="h-12 rounded-2xl border-border bg-background/70">
                      <SelectValue placeholder="Selecione o perfil" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-border bg-popover">
                      {PROFILE_OPTIONS.map((option) => (
                        <SelectItem key={option.role} value={option.role}>
                          <span className="flex flex-col py-1">
                            <span className="font-semibold">{option.label}</span>
                            <span className="text-xs text-muted-foreground">{option.desc}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="staff-pin">Senha</Label>
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="staff-pin"
                      type="password"
                      autoComplete="current-password"
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      placeholder="Digite 123456"
                      className="h-12 rounded-2xl border-border bg-background/70 pl-10 text-base"
                    />
                  </div>
                </div>

                {err ? <p className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</p> : null}

                <Button type="submit" className="h-12 w-full rounded-2xl text-base font-semibold" disabled={busy || !pin.trim()}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {busy ? "Entrando..." : "Entrar no sistema"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </StaffAccessContext.Provider>
    )
  }

  return <StaffAccessContext.Provider value={ctx}>{children}</StaffAccessContext.Provider>
}
