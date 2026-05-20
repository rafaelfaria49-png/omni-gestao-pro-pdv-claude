import { createFileRoute } from "@tanstack/react-router";
import WhatsAppHub from "@/components/whatsapp/WhatsAppHub";

export const Route = createFileRoute("/whatsapp")({
  head: () => ({
    meta: [
      { title: "WhatsApp Automação HUB — OmniGestão Pro" },
      { name: "description", content: "Centro de atendimento e automações via WhatsApp." },
    ],
  }),
  component: WhatsAppHub,
});
