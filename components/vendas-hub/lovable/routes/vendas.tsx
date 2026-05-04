import { createFileRoute } from "@tanstack/react-router";
import VendasHub from "../features/vendas/VendasHub";

export const Route = createFileRoute("/vendas")({
  head: () => ({
    meta: [
      { title: "Vendas HUB — OmniGestão Pro" },
      {
        name: "description",
        content:
          "Central de vendas: PDV rápido, venda completa, orçamentos, pedidos e nota fiscal.",
      },
      { property: "og:title", content: "Vendas HUB — OmniGestão Pro" },
      {
        property: "og:description",
        content: "Gerencie todas as operações de venda do OmniGestão Pro.",
      },
    ],
  }),
  component: VendasHub,
});