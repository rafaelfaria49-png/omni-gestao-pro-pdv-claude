"use client";

import { Hammer, PlugZap } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Pílula honesta para sinalizar telas/áreas ainda não conectadas.
 * - variant="construcao" → "Em construção"
 * - variant="conectar"   → "A conectar" (existe leitura real prevista, mas ainda não ligada)
 */
export function ConstructionBadgeV3({
  label,
  variant = "construcao",
  className,
}: {
  label?: string;
  variant?: "construcao" | "conectar";
  className?: string;
}) {
  const isConectar = variant === "conectar";
  const text = label ?? (isConectar ? "A conectar" : "Em construção");
  const Icon = isConectar ? PlugZap : Hammer;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11px] font-medium",
        isConectar
          ? "border-info/40 bg-info/10 text-info"
          : "border-warning/40 bg-warning/10 text-warning",
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {text}
    </span>
  );
}
