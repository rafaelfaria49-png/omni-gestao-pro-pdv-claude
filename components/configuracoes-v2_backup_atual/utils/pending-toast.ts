"use client";

import { toast } from "@/hooks/use-toast";

export function toastConfigV2Pending() {
  toast({
    title: "Em breve",
    description: "Funcionalidade em preparação nesta versão de comparação (mock).",
  });
}
