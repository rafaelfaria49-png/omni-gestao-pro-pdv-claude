import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm"
import Link from "next/link"

export default async function AccountSecurityPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  return <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-6 px-6 py-12">
    <div><p className="text-sm text-muted-foreground">OmniGestão Pro · Sua conta</p><h1 className="mt-2 text-2xl font-semibold">{session.user.mustChangePassword ? "Primeiro acesso" : "Segurança da conta"}</h1></div>
    <ChangePasswordForm required={session.user.mustChangePassword} />
    {!session.user.mustChangePassword && <Link href="/dashboard" className="text-sm underline">Voltar ao início</Link>}
  </main>
}
