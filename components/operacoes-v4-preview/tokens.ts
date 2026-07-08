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
  ink: "var(--foreground)",
  body: "var(--foreground)",
  muted: "var(--muted-foreground)",
  subtle: "var(--muted-foreground)",
  faint: "var(--muted-foreground)",
  faint2: "var(--muted-foreground)",
  bodySoft: "var(--foreground)",
  bodySoft2: "var(--foreground)",

  // Superfícies
  surface: "var(--card)",
  surface2: "var(--muted)",
  surface3: "var(--background)",
  appBg: "var(--background)",
  appBg2: "var(--muted)",
  muted50: "var(--muted)",
  muted100: "var(--muted)",

  // Bordas
  line: "var(--border)",
  line2: "var(--border)",
  line3: "var(--border)",
  line4: "var(--border)",
  inputBd: "var(--border)",
  inputBd2: "var(--border)",
  hatch: "var(--border)",
  dashed: "var(--border)",

  // Primary
  primary: "var(--primary)",
  primaryHover: "var(--primary)",
  primaryBg: "color-mix(in srgb, var(--primary) 10%, transparent)",
  primaryBd: "color-mix(in srgb, var(--primary) 20%, transparent)",
  primarySoft: "color-mix(in srgb, var(--primary) 5%, transparent)",
  primaryBd2: "color-mix(in srgb, var(--primary) 20%, transparent)",

  // Success
  success: "var(--success)",
  successFg: "var(--success)",
  successBg: "color-mix(in srgb, var(--success) 10%, transparent)",
  successBg2: "color-mix(in srgb, var(--success) 5%, transparent)",
  successBd: "color-mix(in srgb, var(--success) 20%, transparent)",

  // Warning
  warn: "var(--warning)",
  warnFg: "var(--warning)",
  warnBg: "color-mix(in srgb, var(--warning) 10%, transparent)",
  warnBg2: "color-mix(in srgb, var(--warning) 5%, transparent)",
  warnBd: "color-mix(in srgb, var(--warning) 20%, transparent)",
  warnFg2: "var(--warning)",

  // Danger
  danger: "var(--destructive)",
  dangerFg: "var(--destructive)",
  dangerBg: "color-mix(in srgb, var(--destructive) 10%, transparent)",
  dangerBd: "color-mix(in srgb, var(--destructive) 20%, transparent)",
  dangerBd2: "color-mix(in srgb, var(--destructive) 20%, transparent)",

  // Info
  info: "var(--info)",
  infoFg: "var(--info)",
  infoBg: "color-mix(in srgb, var(--info) 10%, transparent)",
  infoBd: "color-mix(in srgb, var(--info) 20%, transparent)",

  // Neutros sólidos
  black: "var(--foreground)",
  white: "var(--background)",
} as const;

export const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

/** Hachura usada nos placeholders de foto/assinatura. */
export const HATCH = `repeating-linear-gradient(45deg,${C.muted100},${C.muted100} 5px,${C.line} 5px,${C.line} 10px)`;
export const HATCH_SOFT =
  `repeating-linear-gradient(45deg,${C.surface2},${C.surface2} 6px,${C.line} 6px,${C.line} 12px)`;

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
