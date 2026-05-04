import { createFileRoute } from "@tanstack/react-router";
import { ShoppingCart } from "lucide-react";
import PlaceholderModule from "../features/vendas/PlaceholderModule";

export const Route = createFileRoute("/vendas/nova")({
  head: () => ({ meta: [{ title: "Venda completa — OmniGestão Pro" }] }),
  component: () => (
    <PlaceholderModule
      title="Venda completa"
      description="Venda detalhada com emissão fiscal e dados completos do cliente."
      icon={ShoppingCart}
    />
  ),
});