import { createFileRoute } from "@tanstack/react-router";
import { Zap } from "lucide-react";
import PlaceholderModule from "../features/vendas/PlaceholderModule";

export const Route = createFileRoute("/pdv")({
  head: () => ({ meta: [{ title: "PDV rápido — OmniGestão Pro" }] }),
  component: () => (
    <PlaceholderModule
      title="PDV rápido"
      description="Venda rápida para balcão, caixa e atendimento imediato."
      icon={Zap}
    />
  ),
});