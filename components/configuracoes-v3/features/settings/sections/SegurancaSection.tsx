"use client"
import { useSession, signOut } from "next-auth/react"
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm"
import { Button } from "@/components/ui/button"
import { SettingsCard } from "../components/SettingsCard"
export function SegurancaSection() {
  const { data: session } = useSession()
  return <div className="space-y-6"><header><h1 className="text-2xl font-semibold">Segurança da conta</h1><p className="mt-2 text-sm text-muted-foreground">{session?.user?.name} · {session?.user?.email}</p></header>
    <SettingsCard title="Alterar minha senha"><ChangePasswordForm /></SettingsCard>
    <SettingsCard title="Acesso à conta"><p className="mb-4 text-sm text-muted-foreground">Se precisar redefinir uma senha esquecida, procure o responsável pela plataforma.</p><Button variant="outline" onClick={() => void signOut({ callbackUrl: "/login" })}>Encerrar sessão</Button></SettingsCard>
  </div>
}
