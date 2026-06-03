"use client";

import { Package } from "lucide-react";
import { PlaceholderScreenV3 } from "../components/PlaceholderScreenV3";
import { PLACEHOLDER_COPY, SCREEN_COPY } from "../data/screen-copy";

export function PecasPedidosV3() {
  return (
    <PlaceholderScreenV3
      titulo={SCREEN_COPY.pecas.titulo}
      subtitulo={SCREEN_COPY.pecas.subtitulo}
      copy={PLACEHOLDER_COPY.pecas}
      icon={<Package className="h-8 w-8" />}
    />
  );
}
