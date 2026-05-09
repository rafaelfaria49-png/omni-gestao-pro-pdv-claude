"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { signInAction } from "@/app/actions/auth"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

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

export default function LoginPage() {
  const [state, formAction] = useActionState(signInAction, { error: null })

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
            <form action={formAction} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="admin@rafacell.com.br"
                  autoComplete="email"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </div>

              {state.error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive ring-1 ring-destructive/20">
                  {state.error}
                </p>
              )}

              <SubmitButton />
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Sistema exclusivo para colaboradores autorizados.
        </p>
      </div>
    </div>
  )
}
