"use client"

import { Orcamentos } from "@/components/dashboard/orcamentos/orcamentos"
import { useOperationsStore } from "@/lib/operations-store"

export default function DashboardOrcamentosPage() {
  const { ordens, setOrdens } = useOperationsStore()
  return <Orcamentos ordens={ordens} setOrdens={setOrdens} />
}
