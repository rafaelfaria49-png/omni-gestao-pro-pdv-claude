import { createFileRoute } from "@tanstack/react-router";
import { ThemeProvider } from "@/components/theme-provider";
import { CadastrosHub } from "@/components/cadastros/CadastrosHub";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cadastros HUB — OmniGestão Pro" },
      { name: "description", content: "Centralize clientes, produtos, serviços, fornecedores, técnicos e equipamentos no Cadastros HUB do OmniGestão Pro." },
      { property: "og:title", content: "Cadastros HUB — OmniGestão Pro" },
      { property: "og:description", content: "ERP omnichannel com IA: a base operacional centralizada do seu negócio." },
    ],
  }),
  component: () => (
    <ThemeProvider>
      <CadastrosHub />
    </ThemeProvider>
  ),
});
