/** Operações V4 Preview — workspace (cockpit): contexto + superfície central + atividade. */
import type { V4Vals } from "../use-v4-preview";
import { ContextColumn } from "./ContextColumn";
import { CommandHeader } from "./CommandHeader";
import { PipelineSpine } from "./PipelineSpine";
import { StagePanel } from "./StagePanel";
import { ActivityColumn } from "./ActivityColumn";
import { OSPicker } from "./OSPicker";

export function WorkspaceView({ v }: { v: V4Vals }) {
  if (!v.osSelected) {
    return <OSPicker v={v} />;
  }

  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex" }}>
      <ContextColumn v={v} />
      <section style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: "var(--background)" }}>
        <CommandHeader v={v} />
        <PipelineSpine v={v} />
        <StagePanel v={v} />
      </section>
      <ActivityColumn v={v} />
    </div>
  );
}
