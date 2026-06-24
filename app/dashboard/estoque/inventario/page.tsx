"use client"

import { useState } from "react"
import { LayoutDashboard, ScanBarcode, ListChecks, BarChart3, Scale } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { InventarioPainel } from "@/components/dashboard/estoque/inventario-painel"
import { InventarioAssistido } from "@/components/dashboard/estoque/inventario-assistido"
import { InventarioAConferir } from "@/components/dashboard/estoque/inventario-a-conferir"
import { InventarioRelatorios } from "@/components/dashboard/estoque/inventario-relatorios"
import { InventarioConciliacao } from "@/components/dashboard/estoque/inventario-conciliacao"

export default function InventarioPage() {
  const [tab, setTab] = useState("painel")
  // Sessão escolhida no Histórico para abrir direto nos Relatórios.
  const [sessaoSelecionada, setSessaoSelecionada] = useState<string | null>(null)

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-6">
      <TabsList className="flex w-full flex-wrap justify-start gap-1">
        <TabsTrigger value="painel" className="gap-2">
          <LayoutDashboard className="h-4 w-4" /> Painel
        </TabsTrigger>
        <TabsTrigger value="contagem" className="gap-2">
          <ScanBarcode className="h-4 w-4" /> Contagem
        </TabsTrigger>
        <TabsTrigger value="a-conferir" className="gap-2">
          <ListChecks className="h-4 w-4" /> A conferir
        </TabsTrigger>
        <TabsTrigger value="relatorios" className="gap-2">
          <BarChart3 className="h-4 w-4" /> Relatórios
        </TabsTrigger>
        <TabsTrigger value="conciliacao" className="gap-2">
          <Scale className="h-4 w-4" /> Conciliação
        </TabsTrigger>
      </TabsList>
      <TabsContent value="painel">
        <InventarioPainel
          onIrParaContagem={() => setTab("contagem")}
          onIrParaAConferir={() => setTab("a-conferir")}
          onAbrirRelatorio={(id) => {
            setSessaoSelecionada(id)
            setTab("relatorios")
          }}
        />
      </TabsContent>
      <TabsContent value="contagem">
        <InventarioAssistido />
      </TabsContent>
      <TabsContent value="a-conferir">
        <InventarioAConferir onIrParaContagem={() => setTab("contagem")} />
      </TabsContent>
      <TabsContent value="relatorios">
        <InventarioRelatorios sessaoIdInicial={sessaoSelecionada} />
      </TabsContent>
      <TabsContent value="conciliacao">
        <InventarioConciliacao sessaoIdInicial={sessaoSelecionada} />
      </TabsContent>
    </Tabs>
  )
}
