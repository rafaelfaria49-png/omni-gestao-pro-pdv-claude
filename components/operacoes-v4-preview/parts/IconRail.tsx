/** Operações V4 Preview — rail de ícones (62px) com navegação por módulo. */
import { C } from "../tokens";
import type { V4Vals } from "../use-v4-preview";
import { GearIcon, RailIcon } from "./icons";

export function IconRail({ v }: { v: V4Vals }) {
  return (
    <nav
      style={{
        flex: "none",
        width: 62,
        background: C.surface3,
        borderRight: `1px solid ${C.line}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        padding: "7px 0",
        gap: 1,
      }}
    >
      {v.rail.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={r.onClick}
          title={r.label}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 3,
            margin: "0 7px",
            padding: "7px 0 6px",
            border: "none",
            background: r.bg,
            color: r.fg,
            borderRadius: 10,
            cursor: "pointer",
          }}
        >
          <span style={{ display: "inline-flex" }}>
            <RailIcon id={r.id} />
          </span>
          <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: ".01em", lineHeight: 1 }}>
            {r.label}
          </span>
        </button>
      ))}
      <button
        type="button"
        onClick={v.railSettings}
        title="Configurações"
        style={{
          margin: "auto 7px 2px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 3,
          padding: "7px 0 6px",
          border: "none",
          background: "transparent",
          color: C.subtle,
          borderRadius: 10,
          cursor: "pointer",
        }}
      >
        <GearIcon />
        <span style={{ fontSize: 9, fontWeight: 600, lineHeight: 1 }}>Config</span>
      </button>
    </nav>
  );
}
