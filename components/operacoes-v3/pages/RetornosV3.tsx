"use client";

import { RotateCcw } from "lucide-react";
import { PlaceholderScreenV3 } from "../components/PlaceholderScreenV3";
import { PLACEHOLDER_COPY, SCREEN_COPY } from "../data/screen-copy";

export function RetornosV3() {
  return (
    <PlaceholderScreenV3
      titulo={SCREEN_COPY.retornos.titulo}
      subtitulo={SCREEN_COPY.retornos.subtitulo}
      copy={PLACEHOLDER_COPY.retornos}
      icon={<RotateCcw className="h-8 w-8" />}
    />
  );
}
