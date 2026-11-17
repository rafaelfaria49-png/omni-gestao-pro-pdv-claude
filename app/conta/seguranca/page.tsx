import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm"
import { SignOutButton } from "@/components/auth/SignOutButton"
import Link from "next/link"

export default async function AccountSecurityPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  return <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-6 px-6 py-12">
    <div><p className="text-sm text-muted-foreground">OmniGestão Pro · Sua conta</p><h1 className="mt-2 text-2xl font-semibold">{session.user.mustChangePassword ? "Primeiro acesso" : "Segurança da conta"}</h1></div>
    <ChangePasswordForm required={session.user.mustChangePassword} />
    <div className="flex min-w-0 flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
      {!session.user.mustChangePassword ? <Link href="/dashboard" className="text-sm underline">Voltar ao início</Link> : <span />}
      {/* Todo usuário autenticado precisa conseguir sair — inclusive papéis sem acesso a Configurações. */}
      <SignOutButton />
    </div>
  </main>
}
