import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";
import PlaceholderModule from "../features/vendas/PlaceholderModule";

export const Route = createFileRoute("/pedidos")({
  head: () => ({ meta: [{ title: "Pedidos — OmniGestão Pro" }] }),
  component: () => (
    <PlaceholderModule
      title="Pedidos"
      description="Gerencie pedidos em aberto, separados, pagos ou pendentes."
      icon={ClipboardList}
    />
  ),
});