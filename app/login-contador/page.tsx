"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type PortalStatus = "checking" | "available" | "disabled"

function errorMessage(error: string | undefined, retryAfterSeconds: number | null): string {
  switch (error) {
    case "invalid_pin":
      return "Senha incorreta."
    case "rate_limited":
      return retryAfterSeconds
        ? `Muitas tentativas. Tente novamente em ${Math.ceil(retryAfterSeconds / 60)} min.`
        : "Muitas tentativas. Tente novamente mais tarde."
    case "portal_disabled":
      return "Este portal está temporariamente desativado."
    case "unavailable":
      return "Autenticação indisponível no momento. Fale com o administrador do sistema."
    default:
      return "Não foi possível autenticar."
  }
}

function LoginContadorForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = searchParams.get("next") || "/contador"
  const [pin, setPin] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [portalStatus, setPortalStatus] = useState<PortalStatus>("checking")

  useEffect(() => {
    let cancelled = false
    fetch("/api/auth/contador", { method: "GET" })
      .then((r) => r.json() as Promise<{ authenticated?: boolean; portalEnabled?: boolean }>)
      .then((j) => {
        if (cancelled) return
        setPortalStatus(j.portalEnabled === false ? "disabled" : "available")
      })
      .catch(() => {
        if (!cancelled) setPortalStatus("available")
      })
    return () => {
      cancelled = true
    }
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const r = await fetch("/api/auth/contador", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      })
      if (!r.ok) {
        const j = (await r.json()) as { error?: string }
        const retryAfterHeader = r.headers.get("Retry-After")
        const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : null
        if (j.error === "portal_disabled") setPortalStatus("disabled")
        setError(errorMessage(j.error, retryAfterSeconds))
        return
      }
      router.push(nextPath.startsWith("/") ? nextPath : "/contador")
      router.refresh()
    } catch {
      setError("Falha de rede. Tente novamente.")
    } finally {
      setLoading(false)
    }
  }

  if (portalStatus === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando…</div>
    )
  }

  if (portalStatus === "disabled") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md border-border">
          <CardHeader>
            <CardTitle>Área do Contador</CardTitle>
            <CardDescription>Este portal está temporariamente desativado pelo administrador do sistema.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/" className="text-sm underline underline-offset-4">
              Voltar para a página inicial
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border">
        <CardHeader>
          <CardTitle>Área do Contador</CardTitle>
          <CardDescription className="space-y-2">
            <span className="block">
              Acesso restrito. Use a senha definida em{" "}
              <code className="text-xs">CONTADOR_PIN</code> (diferente do PIN de administrador).
            </span>
            <span className="block text-xs text-muted-foreground">
              Equipe da loja (dono, gerente ou vendedor) entra pela{" "}
              <Link href="/login" className="underline underline-offset-4">
                tela de login
              </Link>
              .
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contador-pin">Senha</Label>
              <Input
                id="contador-pin"
                type="password"
                autoComplete="current-password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={loading || !pin.trim()}>
              {loading ? "Entrando…" : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default function LoginContadorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando…</div>
      }
    >
      <LoginContadorForm />
    </Suspense>
  )
}
