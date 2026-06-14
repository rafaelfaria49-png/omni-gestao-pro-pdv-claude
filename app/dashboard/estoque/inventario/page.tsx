"use client"

import { ScanBarcode, BarChart3 } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { InventarioAssistido } from "@/components/dashboard/estoque/inventario-assistido"
import { InventarioRelatorios } from "@/components/dashboard/estoque/inventario-relatorios"

export default function InventarioPage() {
  return (
    <Tabs defaultValue="contagem" className="space-y-6">
      <TabsList>
        <TabsTrigger value="contagem" className="gap-2">
          <ScanBarcode className="h-4 w-4" /> Contagem
        </TabsTrigger>
        <TabsTrigger value="relatorios" className="gap-2">
          <BarChart3 className="h-4 w-4" /> Relatórios
        </TabsTrigger>
      </TabsList>
      <TabsContent value="contagem">
        <InventarioAssistido />
      </TabsContent>
      <TabsContent value="relatorios">
        <InventarioRelatorios />
      </TabsContent>
    </Tabs>
  )
}
