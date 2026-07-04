/**
 * Operações V4 Preview — casca raiz (client component).
 *
 * Conversão React do protótipo Cloud Design `design/operacoes-v4`. Isolado da V3
 * (não importa nada dela). Os STAGES leem a OS REAL por Server Actions de leitura
 * (`listOrdens`/`getOrdem` com `readOnly: true`). As telas de rail e o modal Nova OS
 * são protótipo e NÃO exibem dados fabricados (estado vazio honesto; Nova OS não cria
 * OS). O estado é local (`useV4Preview`) e nenhuma ação persiste — a Preview é somente
 * leitura (não grava no banco).
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
import { AtendimentoRapidoModal } from "./parts/AtendimentoRapidoModal";
import { EstornoRecebimentoModal } from "./parts/EstornoRecebimentoModal";
import { ReciboModal } from "./parts/ReciboModal";
import { DocPrintModal } from "./parts/DocPrintModal";
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
        {/* Modo foco recolhe o rail interno (junto das gavetas) para maximizar o workspace. */}
        {!v.focusActive && <IconRail v={v} />}
        {v.isWorkspace && <WorkspaceView v={v} />}
        {v.isModule && <ModuleView v={v} />}
        {v.isAuditoria && <AuditoriaPage v={v} />}
      </div>

      <NovaOSModal v={v} />
      <AtendimentoRapidoModal v={v} />
      <EstornoRecebimentoModal v={v} />
      <ReciboModal v={v} />
      <DocPrintModal v={v} />
      <Toast v={v} />
    </div>
  );
}
