/** Operações V4 Preview — workspace (cockpit): contexto + superfície central + atividade. */
import { C } from "../tokens";
import type { V4Vals } from "../use-v4-preview";
import { ContextColumn } from "./ContextColumn";
import { CommandHeader } from "./CommandHeader";
import { PipelineSpine } from "./PipelineSpine";
import { StagePanel } from "./StagePanel";
import { ActivityColumn } from "./ActivityColumn";

function EmptyState({ v }: { v: V4Vals }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: C.appBg,
        padding: 24,
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: C.primaryBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 28,
            margin: "0 auto 20px",
          }}
        >
          📋
        </div>
        <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: C.ink, letterSpacing: "-.01em" }}>
          Selecione uma Ordem de Serviço
        </h2>
        <p style={{ margin: "0 0 24px", fontSize: 13.5, color: C.muted, lineHeight: 1.6 }}>
          Busque por OS, cliente ou IMEI, escolha uma OS na fila ou crie uma nova OS.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={v.railFila}
            style={{ height: 36, padding: "0 18px", border: `1px solid ${C.inputBd}`, background: C.surface, color: C.body, borderRadius: 9, fontSize: 13, fontWeight: 500, cursor: "pointer" }}
          >
            Ver fila
          </button>
          <button
            type="button"
            onClick={v.openNovaOS}
            style={{ height: 36, padding: "0 18px", border: `1px solid ${C.inputBd}`, background: C.surface, color: C.body, borderRadius: 9, fontSize: 13, fontWeight: 500, cursor: "pointer" }}
          >
            Nova OS
          </button>
          <button
            type="button"
            onClick={v.selectDemo}
            style={{ height: 36, padding: "0 18px", border: "none", background: C.primary, color: C.white, borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Usar exemplo de demonstração
          </button>
        </div>
      </div>
    </div>
  );
}

export function WorkspaceView({ v }: { v: V4Vals }) {
  if (!v.osSelected) {
    return <EmptyState v={v} />;
  }

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
