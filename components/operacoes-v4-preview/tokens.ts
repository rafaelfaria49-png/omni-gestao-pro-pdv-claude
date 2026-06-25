/**
 * Operações V4 Preview — paleta e fragmentos de estilo.
 *
 * Fonte: `design/operacoes-v4/Operacoes-V4-HANDOFF.md` §5 (tokens do redesign).
 *
 * ⚠️ Exceção escopada de tokens (documentada): este módulo é um **Preview visual
 * isolado** cuja função é reproduzir fielmente o mockup canônico da Operações V4.
 * Por isso usa a paleta própria do design (índigo + neutros claros), e não os
 * tokens semânticos globais do OmniGestão (zinc / dark-mode). A paleta vive
 * centralizada aqui — nenhuma cor "solta" espalhada pelos componentes — seguindo
 * o mesmo precedente dos documentos A4 de impressão da V3. Quando a V4 sair de
 * Preview e for integrada, a migração para tokens semânticos acontece nesta fase.
 */
import type { CSSProperties } from "react";

/** Paleta canônica do redesign V4 (HANDOFF §5). */
export const C = {
  // Texto
  ink: "#11131a",
  body: "#1a1d23",
  muted: "#6b7280",
  subtle: "#9aa0ab",
  faint: "#c2c6cd",
  faint2: "#b9bec7",
  bodySoft: "#4a4f58",
  bodySoft2: "#5b616b",

  // Superfícies
  surface: "#ffffff",
  surface2: "#fafbfc",
  surface3: "#fbfbfc",
  appBg: "#f5f6f8",
  appBg2: "#e7e8ec",
  muted50: "#f4f5f7",
  muted100: "#f1f2f5",

  // Bordas
  line: "#e9eaee",
  line2: "#ebedf0",
  line3: "#f0f1f4",
  line4: "#f2f3f5",
  inputBd: "#e2e4e8",
  inputBd2: "#d9dbe1",
  hatch: "#cfd2d8",
  dashed: "#d3d6dc",

  // Primary (indigo)
  primary: "#4f46e5",
  primaryHover: "#4338ca",
  primaryBg: "#eef0fe",
  primaryBd: "#c7ccfa",
  primarySoft: "#f6f7ff",
  primaryBd2: "#d8d9f7",

  // Success
  success: "#16a34a",
  successFg: "#15803d",
  successBg: "#e7f6ec",
  successBg2: "#f1f6f2",
  successBd: "#bfe6cc",

  // Warning
  warn: "#d97706",
  warnFg: "#b45309",
  warnBg: "#fbf1e3",
  warnBg2: "#fffaf1",
  warnBd: "#fbe7c8",
  warnFg2: "#c08a3e",

  // Danger
  danger: "#dc2626",
  dangerFg: "#b91c1c",
  dangerBg: "#fbeaea",
  dangerBd: "#f3cccc",
  dangerBd2: "#fbe0e0",

  // Info
  info: "#2563eb",
  infoFg: "#1d4ed8",
  infoBg: "#eaf1fe",
  infoBd: "#cfe0fb",

  // Neutros sólidos
  black: "#11131a",
  white: "#ffffff",
} as const;

export const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

/** Hachura usada nos placeholders de foto/assinatura. */
export const HATCH = `repeating-linear-gradient(45deg,${C.muted100},${C.muted100} 5px,${C.line} 5px,${C.line} 10px)`;
export const HATCH_SOFT =
  `repeating-linear-gradient(45deg,${C.surface2},${C.surface2} 6px,#f3f4f6 6px,#f3f4f6 12px)`;

/* ---- fragmentos reutilizáveis ---- */

export const card: CSSProperties = {
  border: `1px solid ${C.line2}`,
  background: C.surface,
  borderRadius: 12,
  padding: 14,
};

export const cardTitle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: C.body,
};

/** Label uppercase pequeno (10px) usado nos campos. */
export const upLabel: CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  color: C.subtle,
  fontWeight: 600,
};

export const rowBetween: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

export const mono: CSSProperties = { fontFamily: MONO };

export const inputBase: CSSProperties = {
  width: "100%",
  height: 32,
  padding: "0 11px",
  border: `1px solid ${C.inputBd}`,
  borderRadius: 8,
  fontSize: 12.5,
  color: C.body,
  background: C.surface,
};

/** Pílula/badge genérica. */
export function pill(bg: string, fg: string): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    height: 22,
    padding: "0 9px",
    background: bg,
    color: fg,
    borderRadius: 999,
    fontSize: 11.5,
    fontWeight: 600,
  };
}

export const btnPrimary: CSSProperties = {
  border: "none",
  background: C.primary,
  color: C.white,
  borderRadius: 8,
  fontWeight: 600,
  cursor: "pointer",
};

export const btnGhost: CSSProperties = {
  border: `1px solid ${C.inputBd}`,
  background: C.surface,
  color: C.body,
  borderRadius: 8,
  fontWeight: 500,
  cursor: "pointer",
};

/** Formata número como moeda BRL (espelha fmt() do protótipo). */
export function fmt(n: number): string {
  return (
    "R$ " +
    (Math.round(n * 100) / 100).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}
