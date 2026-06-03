"use client";

import { Bell } from "lucide-react";
import { PlaceholderScreenV3 } from "../components/PlaceholderScreenV3";
import { PLACEHOLDER_COPY, SCREEN_COPY } from "../data/screen-copy";

export function NotificacoesV3() {
  return (
    <PlaceholderScreenV3
      titulo={SCREEN_COPY.notificacoes.titulo}
      subtitulo={SCREEN_COPY.notificacoes.subtitulo}
      copy={PLACEHOLDER_COPY.notificacoes}
      icon={<Bell className="h-8 w-8" />}
    />
  );
}
