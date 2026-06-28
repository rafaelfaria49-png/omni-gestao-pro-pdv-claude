/** Operações V4 Preview — barra superior (40px): marca, busca, modos, ações. */
import { C } from "../tokens";
import type { V4Vals } from "../use-v4-preview";
import { SearchIcon } from "./icons";

export function TopBar({ v }: { v: V4Vals }) {
  return (
    <header
      style={{
        flex: "none",
        height: 40,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 12px",
        background: C.surface,
        borderBottom: `1px solid ${C.line}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "none" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 23,
            height: 23,
            borderRadius: 6,
            background: C.black,
            color: C.white,
            fontWeight: 700,
            fontSize: 12,
          }}
        >
          O
        </span>
        <span style={{ fontWeight: 600, fontSize: 13, color: C.body }}>OmniGestão</span>
        <span style={{ fontSize: 11.5, color: C.subtle, whiteSpace: "nowrap" }}>
          Operações <span style={{ color: C.primary, fontWeight: 600 }}>V4</span> · Preview
        </span>
      </div>

      <button
        type="button"
        onClick={v.goToOSSearch}
        title="Buscar OS por Nº, cliente, aparelho ou IMEI"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flex: 1,
          minWidth: 0,
          maxWidth: 380,
          height: 28,
          padding: "0 11px",
          background: C.muted50,
          border: `1px solid ${C.line}`,
          borderRadius: 8,
          color: C.subtle,
          fontSize: 12.5,
          cursor: "pointer",
        }}
      >
        <SearchIcon />
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          Ir para OS, cliente, IMEI…
        </span>
        <kbd
          style={{
            marginLeft: "auto",
            fontSize: 10,
            background: C.surface,
            border: `1px solid ${C.inputBd}`,
            borderRadius: 4,
            padding: "1px 5px",
            color: C.subtle,
            flex: "none",
          }}
        >
          ⌘K
        </kbd>
      </button>

      {/* Mode switcher */}
      <div
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: 3,
          height: 28,
          padding: 2,
          background: C.muted100,
          border: `1px solid ${C.line}`,
          borderRadius: 9,
        }}
      >
        {v.modeBtns.map((m) => (
          <button
            key={m.label}
            type="button"
            onClick={m.onClick}
            title={m.hint}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              height: 24,
              padding: "0 10px",
              border: "none",
              background: m.bg,
              color: m.fg,
              borderRadius: 7,
              fontSize: 11.5,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: m.shadow,
            }}
          >
            <span style={{ fontSize: 11 }}>{m.icon}</span>
            {m.label}
          </button>
        ))}
      </div>

      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
        <span style={{ fontSize: 11.5, color: C.muted, whiteSpace: "nowrap" }}>Loja ativa</span>
        <button
          type="button"
          onClick={v.goAuditoria}
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 28,
            padding: "0 11px",
            border: `1px solid ${C.inputBd2}`,
            background: C.surface,
            color: C.muted,
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Auditoria de UX
        </button>
        <button
          type="button"
          onClick={v.openNovaOS}
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 28,
            padding: "0 12px",
            border: "none",
            background: C.primary,
            color: C.white,
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          + Nova OS
        </button>
      </div>
    </header>
  );
}
