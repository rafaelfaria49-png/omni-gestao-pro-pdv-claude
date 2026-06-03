"use client";

import { MapPin } from "lucide-react";
import { PlaceholderScreenV3 } from "../components/PlaceholderScreenV3";
import { PLACEHOLDER_COPY, SCREEN_COPY } from "../data/screen-copy";

export function RastreioFisicoV3() {
  return (
    <PlaceholderScreenV3
      titulo={SCREEN_COPY.rastreio.titulo}
      subtitulo={SCREEN_COPY.rastreio.subtitulo}
      copy={PLACEHOLDER_COPY.rastreio}
      icon={<MapPin className="h-8 w-8" />}
    />
  );
}
