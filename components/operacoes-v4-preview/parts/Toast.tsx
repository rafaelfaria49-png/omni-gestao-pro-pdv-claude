/** Operações V4 Preview — toast efêmero (feedback no rodapé central). */
import { C } from "../tokens";
import type { V4Vals } from "../use-v4-preview";

export function Toast({ v }: { v: V4Vals }) {
  if (!v.showToast) return null;
  return (
    <div
      style={{
        position: "absolute",
        bottom: 18,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        gap: 9,
        height: 38,
        padding: "0 16px",
        background: C.black,
        color: C.white,
        borderRadius: 10,
        boxShadow: "0 8px 24px rgba(17,19,26,.28)",
        fontSize: 12.5,
        fontWeight: 500,
      }}
    >
      <span style={{ color: "#7dd3a8" }}>✓</span>
      {v.toast}
    </div>
  );
}
