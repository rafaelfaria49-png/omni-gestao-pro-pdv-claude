"use client";

import { Globe } from "lucide-react";
import { PlaceholderScreenV3 } from "../components/PlaceholderScreenV3";
import { PLACEHOLDER_COPY, SCREEN_COPY } from "../data/screen-copy";

export function PortalClienteV3() {
  return (
    <PlaceholderScreenV3
      titulo={SCREEN_COPY.portal.titulo}
      subtitulo={SCREEN_COPY.portal.subtitulo}
      copy={PLACEHOLDER_COPY.portal}
      icon={<Globe className="h-8 w-8" />}
    />
  );
}
