"use client";

import type { ReactNode } from "react";
import { Construction } from "lucide-react";
import { SectionShellV3 } from "./SectionShellV3";
import { EmptyStateV3 } from "./EmptyStateV3";
import { ConstructionBadgeV3 } from "./ConstructionBadgeV3";
import type { PlaceholderCopy } from "../data/screen-copy";

/** Tela placeholder honesta: empty-state + lista do que virá quando conectada. */
export function PlaceholderScreenV3({
  titulo,
  subtitulo,
  copy,
  icon,
  variant = "construcao",
  actions,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  copy?: PlaceholderCopy;
  icon?: ReactNode;
  variant?: "construcao" | "conectar";
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <SectionShellV3
      titulo={titulo}
      subtitulo={subtitulo}
      badge={<ConstructionBadgeV3 variant={variant} />}
      actions={actions}
    >
      <div className="space-y-4">
        <EmptyStateV3
          icon={icon ?? <Construction className="h-8 w-8" />}
          titulo={copy?.resumo ?? "Esta área ainda está em construção."}
          descricao="Nada aqui simula dados reais — a estrutura está pronta para ser ligada na próxima fase."
        />
        {children}
        {copy?.planejado && copy.planejado.length > 0 ? (
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="mb-2 text-sm font-medium text-foreground">O que esta tela fará quando conectada</p>
            <ul className="space-y-1.5">
              {copy.planejado.map((p) => (
                <li key={p} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" aria-hidden />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </SectionShellV3>
  );
}
