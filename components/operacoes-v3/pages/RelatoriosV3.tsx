"use client";

import { BarChart3 } from "lucide-react";
import { PlaceholderScreenV3 } from "../components/PlaceholderScreenV3";
import { PLACEHOLDER_COPY, SCREEN_COPY } from "../data/screen-copy";

export function RelatoriosV3() {
  return (
    <PlaceholderScreenV3
      titulo={SCREEN_COPY.relatorios.titulo}
      subtitulo={SCREEN_COPY.relatorios.subtitulo}
      copy={PLACEHOLDER_COPY.relatorios}
      icon={<BarChart3 className="h-8 w-8" />}
    />
  );
}
