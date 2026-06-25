/**
 * Operações V4 Preview — casca raiz (client component, 100% visual, dados mock).
 *
 * Conversão React do protótipo Cloud Design `design/operacoes-v4`. Totalmente
 * isolado: NÃO importa nada da Operações V3, NÃO chama Server Actions/APIs/Prisma.
 * Todo o estado é local (`useV4Preview`) e todos os dados são mockados.
 *
 * `height:100%` (e não 100vh) mantém o AppShell como dono do scroll — o Preview
 * só rola internamente no painel de etapa / nas telas de módulo.
 */
"use client";

import { C } from "./tokens";
import { useV4Preview } from "./use-v4-preview";
import { TopBar } from "./parts/TopBar";
import { IconRail } from "./parts/IconRail";
import { WorkspaceView } from "./parts/WorkspaceView";
import { ModuleView } from "./parts/ModuleView";
import { AuditoriaPage } from "./parts/AuditoriaPage";
import { NovaOSModal } from "./parts/NovaOSModal";
import { ReciboModal } from "./parts/ReciboModal";
import { Toast } from "./parts/Toast";

export function OperacoesV4Preview() {
  const v = useV4Preview();

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        background: C.appBg,
        overflow: "hidden",
        fontSize: 14,
        position: "relative",
        borderRadius: 12,
        border: `1px solid ${C.line}`,
        color: C.body,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      }}
    >
      <TopBar v={v} />

      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <IconRail v={v} />
        {v.isWorkspace && <WorkspaceView v={v} />}
        {v.isModule && <ModuleView v={v} />}
        {v.isAuditoria && <AuditoriaPage v={v} />}
      </div>

      <NovaOSModal v={v} />
      <ReciboModal v={v} />
      <Toast v={v} />
    </div>
  );
}
