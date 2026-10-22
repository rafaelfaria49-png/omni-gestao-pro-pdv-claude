"use client"
import Link from "next/link"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { useEnterprisePermissions } from "@/lib/auth/use-enterprise-permissions"
import { filterDashboardNav, hubsNavItems } from "@/lib/navigation/dashboard-nav-items"
import InternalDashboard from "@/components/painel-inicial/InternalDashboard"

export default function DashboardPage() {
  const p = useEnterprisePermissions()
  const { lojaAtivaRaw } = useLojaAtiva()
  if (!p) return <p role="status">Carregando acesso…</p>
  if (p.platformAuthority) return <InternalDashboard />
  return <div className="mx-auto w-full max-w-5xl space-y-8">
    <header><p className="text-xs uppercase tracking-wide text-muted-foreground">Início</p><h1 className="mt-2 text-2xl font-semibold">{lojaAtivaRaw?.nomeFantasia || "Sua loja"}</h1><p className="mt-2 text-sm text-muted-foreground">Escolha uma atividade disponível para sua conta.</p></header>
    <nav aria-label="Atividades da loja" className="grid gap-3 sm:grid-cols-2">{filterDashboardNav(hubsNavItems, p).map((item) => <Link key={item.to} href={item.to} className="flex min-h-20 items-center gap-4 rounded-lg border border-border bg-card p-4 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><item.icon className="h-5 w-5 text-primary" /><span className="font-medium">{item.label}</span></Link>)}</nav>
    <Link href="/conta/seguranca" className="inline-block text-sm underline">Segurança da minha conta</Link>
  </div>
}
