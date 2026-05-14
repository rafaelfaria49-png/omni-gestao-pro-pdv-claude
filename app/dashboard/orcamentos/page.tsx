"use client"

import Link from "next/link"
import { Orcamentos } from "@/components/dashboard/orcamentos/orcamentos"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useOperationsStore } from "@/lib/operations-store"

export default function DashboardOrcamentosPage() {
  const { ordens, setOrdens } = useOperationsStore()
  return (
    <div className="min-w-0 space-y-4 p-4 lg:p-6">
      <div
        className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
        role="note"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Legado / transição</Badge>
          <span className="text-foreground font-medium">Orçamentos (fluxo local)</span>
        </div>
        <p className="mt-2 leading-relaxed">
          O fluxo oficial de ordem de serviço e orçamento aprovado pela RafaCell é o{" "}
          <span className="font-medium text-foreground">Operações HUB</span>. Use esta página apenas enquanto migra
          dados ou processos antigos.
        </p>
        <Button asChild variant="secondary" size="sm" className="mt-3">
          <Link href="/dashboard/operacoes-v2">Abrir Operações HUB</Link>
        </Button>
      </div>
      <Orcamentos ordens={ordens} setOrdens={setOrdens} />
    </div>
  )
}
