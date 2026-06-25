/** Operações V4 Preview — workspace (cockpit): contexto + superfície central + atividade. */
import { C } from "../tokens";
import type { V4Vals } from "../use-v4-preview";
import { ContextColumn } from "./ContextColumn";
import { CommandHeader } from "./CommandHeader";
import { PipelineSpine } from "./PipelineSpine";
import { StagePanel } from "./StagePanel";
import { ActivityColumn } from "./ActivityColumn";

export function WorkspaceView({ v }: { v: V4Vals }) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex" }}>
      <ContextColumn v={v} />
      <section style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: C.appBg }}>
        <CommandHeader v={v} />
        <PipelineSpine v={v} />
        <StagePanel v={v} />
      </section>
      <ActivityColumn v={v} />
    </div>
  );
}
