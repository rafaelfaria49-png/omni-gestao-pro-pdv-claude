import { createFileRoute } from "@tanstack/react-router";
import { Receipt } from "lucide-react";
import PlaceholderModule from "../features/vendas/PlaceholderModule";

export const Route = createFileRoute("/fiscal")({
  head: () => ({ meta: [{ title: "Nota fiscal — OmniGestão Pro" }] }),
  component: () => (
    <PlaceholderModule
      title="Nota fiscal"
      description="Emita e acompanhe documentos fiscais vinculados às vendas."
      icon={Receipt}
    />
  ),
});