"use client"

import { useState } from "react"
import { LayoutDashboard, ScanBarcode, BarChart3 } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { InventarioPainel } from "@/components/dashboard/estoque/inventario-painel"
import { InventarioAssistido } from "@/components/dashboard/estoque/inventario-assistido"
import { InventarioRelatorios } from "@/components/dashboard/estoque/inventario-relatorios"

export default function InventarioPage() {
  const [tab, setTab] = useState("painel")
  // Sessão escolhida no Histórico para abrir direto nos Relatórios.
  const [sessaoSelecionada, setSessaoSelecionada] = useState<string | null>(null)

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-6">
      <TabsList>
        <TabsTrigger value="painel" className="gap-2">
          <LayoutDashboard className="h-4 w-4" /> Painel
        </TabsTrigger>
        <TabsTrigger value="contagem" className="gap-2">
          <ScanBarcode className="h-4 w-4" /> Contagem
        </TabsTrigger>
        <TabsTrigger value="relatorios" className="gap-2">
          <BarChart3 className="h-4 w-4" /> Relatórios
        </TabsTrigger>
      </TabsList>
      <TabsContent value="painel">
        <InventarioPainel
          onIrParaContagem={() => setTab("contagem")}
          onAbrirRelatorio={(id) => {
            setSessaoSelecionada(id)
            setTab("relatorios")
          }}
        />
      </TabsContent>
      <TabsContent value="contagem">
        <InventarioAssistido />
      </TabsContent>
      <TabsContent value="relatorios">
        <InventarioRelatorios sessaoIdInicial={sessaoSelecionada} />
      </TabsContent>
    </Tabs>
  )
}
