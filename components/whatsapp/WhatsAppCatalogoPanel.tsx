"use client"

import { Package, Search, Tags, Warehouse } from "lucide-react"
import { ComingSoonScreen } from "./whatsapp-preview-ui"

export function WhatsAppCatalogoPanel() {
  return (
    <ComingSoonScreen
      icon={Package}
      title="Catálogo"
      description="Consulta somente leitura ao estoque e aos preços do ERP, por loja, para apoiar o atendimento."
      features={[
        {
          icon: Search,
          title: "Busca por nome/SKU/EAN",
          description: "Encontrar peça, acessório ou serviço rapidamente durante a conversa.",
          tag: "busca",
        },
        {
          icon: Warehouse,
          title: "Preço e estoque por loja",
          description: "Saldo sincronizado do estoque real, sem edição por aqui.",
          tag: "somente leitura",
        },
        {
          icon: Tags,
          title: "Orçamento sugerido",
          description: "IA monta sugestão de orçamento; aprovação humana antes de enviar.",
          tag: "aprovação humana",
        },
      ]}
      footnote="Protótipo visual · sem efeito real. Esta seção será construída na fase de desenvolvimento, consultando o estoque real em modo somente leitura."
    />
  )
}
