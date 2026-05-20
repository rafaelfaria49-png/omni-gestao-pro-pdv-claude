import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import PlaceholderModule from "../features/vendas/PlaceholderModule";

export const Route = createFileRoute("/orcamentos")({
  head: () => ({ meta: [{ title: "Orçamentos — OmniGestão Pro" }] }),
  component: () => (
    <PlaceholderModule
      title="Orçamentos"
      description="Crie, acompanhe e converta orçamentos em vendas."
      icon={FileText}
    />
  ),
});