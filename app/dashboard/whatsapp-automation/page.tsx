"use client"

import Link from "next/link"
import { ArrowRight, MessageSquare } from "lucide-react"
import { WhatsAppAutomationHub } from "@/components/dashboard/whatsapp-automation/whatsapp-automation-hub"
import { Button } from "@/components/ui/button"

export default function WhatsAppAutomationPage() {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 p-4 md:p-6">
      <div className="glass-card flex flex-wrap items-center justify-between gap-3 rounded-xl border-amber-500/30 bg-amber-500/5 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            Ferramentas admin · legado
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Este painel não envia mensagens via Meta. Para atendimento real, use o HUB operacional.
          </p>
        </div>
        <Button asChild size="sm" className="shrink-0 gap-1.5">
          <Link href="/dashboard/whatsapp">
            <MessageSquare className="h-4 w-4" />
            Abrir HUB operacional
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
      <WhatsAppAutomationHub />
    </div>
  )
}
