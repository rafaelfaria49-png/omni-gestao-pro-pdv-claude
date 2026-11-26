"use client"

import { useEffect, useState } from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Eye, EyeOff } from "lucide-react"
import { signInAction } from "@/app/actions/auth"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  isCachePurgeRetryNeeded,
  markCachePurgeRetryNeeded,
  purgeAuthenticatedBrowserCaches,
  setLocalSignOutInProgress,
  triggerSilentServiceWorkerUpdate,
} from "@/lib/auth/pwa-cache-privacy"

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Entrando…" : "Entrar"}
    </button>
  )
}

export function LoginForm({ showDesktopDownload = false }: { showDesktopDownload?: boolean }) {
  const [state, formAction] = useActionState(signInAction, { error: null })
  const [showPassword, setShowPassword] = useState(false)
  const [cacheCleanupWarning, setCacheCleanupWarning] = useState<string | null>(null)

  // Proteção adicional na entrada de /login (só monta sem sessão ativa no servidor):
  // limpa eventuais resíduos de CacheStorage de sessões anteriores/SW legado e aciona update
  // silencioso do SW, sem tocar em localStorage/IndexedDB (fila offline do PDV preservada).
  useEffect(() => {
    let active = true
    setLocalSignOutInProgress(false)
    const hadRetryFlag = isCachePurgeRetryNeeded()
    triggerSilentServiceWorkerUpdate()
    void purgeAuthenticatedBrowserCaches().then((res) => {
      if (!active) return
      if (res.ok) {
        markCachePurgeRetryNeeded(false)
        setCacheCleanupWarning(null)
      } else if (hadRetryFlag || res.failedCaches.length > 0 || res.error) {
        setCacheCleanupWarning(
          "Não foi possível limpar automaticamente o cache do navegador. Se este computador for compartilhado, feche o navegador antes do próximo acesso.",
        )
      }
    })
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Brand */}
        <div className="space-y-1 text-center">
          <div className="mb-2 inline-flex items-center justify-center rounded-2xl bg-primary/10 p-3">
            <svg
              className="h-8 w-8 text-primary"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h12a2.25 2.25 0 002.25-2.25V3M3.75 3h16.5M3.75 3l2.25 9h12l2.25-9" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 20.25h6m-3-4v4" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">OmniGestão Pro</h1>
          <p className="text-sm text-muted-foreground">Faça login para acessar o painel</p>
        </div>

        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Bem-vindo de volta</CardTitle>
            <CardDescription>Use o email e senha cadastrados</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={formAction}
              onSubmit={() => {
                // Segunda passada antes de autenticar o próximo usuário (espelho do LogoutGuard):
                // apaga respostas atrasadas de sessão anterior que possam ter chegado durante o /login.
                void purgeAuthenticatedBrowserCaches()
              }}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="email@empresa.com.br"
                  autoComplete="email"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground focus:outline-none"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {state.error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive ring-1 ring-destructive/20">
                  {state.error}
                </p>
              )}

              {cacheCleanupWarning && (
                <p role="status" className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                  {cacheCleanupWarning}
                </p>
              )}

              <SubmitButton />
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Sistema exclusivo para colaboradores autorizados.
        </p>
        {showDesktopDownload ? (
          <p className="text-center text-xs">
            <a href="/baixar" className="text-primary underline-offset-4 hover:underline">Programa para Windows</a>
          </p>
        ) : null}
      </div>
    </div>
  )
}
