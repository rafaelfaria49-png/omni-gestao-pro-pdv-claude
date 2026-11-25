"use client";

import { ArrowRight } from "lucide-react";
import { Button } from "@/components/configuracoes-v3/components/ui/button";
import { SettingsFeedbackBanner } from "./SettingsFeedbackBanner";

type Props = {
  /** Texto curto abaixo do aviso (opcional). */
  hint?: string;
  /** Quando true, orienta seleção pelo topo sem referenciar a aba Lojas (visão cliente). */
  clientMode?: boolean;
  /** Ação opcional para abrir a seção Lojas (visão plataforma). */
  onSelectStore?: () => void;
};

/** Bloqueio explícito quando nenhuma unidade está selecionada na Config V3. */
export function UnidadeAtivaRequiredBanner({ hint, clientMode = false, onSelectStore }: Props) {
  return (
    <SettingsFeedbackBanner
      variant="warning"
      title="Nenhuma unidade ativa"
      action={
        !clientMode && onSelectStore ? (
          <Button type="button" variant="outline" size="sm" onClick={onSelectStore}>
            Selecionar em Lojas
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        ) : undefined
      }
    >
      <p style={{ color: "var(--cfg-muted)" }}>
        {clientMode ? (
          "Selecione a unidade no topo da tela para visualizar e editar os dados da loja."
        ) : (
          <>
            Abra a seção{" "}
            <span className="font-semibold" style={{ color: "var(--cfg-fg)" }}>
              Lojas
            </span>{" "}
            e selecione a unidade cujas configurações deseja editar. Preferências não são compartilhadas entre unidades.
          </>
        )}
      </p>
      {hint ? (
        <p className="mt-1 text-xs" style={{ color: "var(--cfg-muted)" }}>
          {hint}
        </p>
      ) : null}
    </SettingsFeedbackBanner>
  );
}
