// ============================================================================
// Operações V3 — Helpers de formatação (puros, sem dependências de domínio)
// ============================================================================

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(value: number | null | undefined): string {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return BRL.format(n);
}

export function parseIso(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatData(iso?: string | null): string {
  const d = parseIso(iso);
  if (!d) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatDataHora(iso?: string | null): string {
  const d = parseIso(iso);
  if (!d) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Distância relativa simples (pt-BR), sem libs externas. */
export function formatRelativo(iso?: string | null): string {
  const d = parseIso(iso);
  if (!d) return "—";
  const diffMs = Date.now() - d.getTime();
  const min = Math.round(diffMs / 60000);
  if (Math.abs(min) < 1) return "agora";
  if (Math.abs(min) < 60) return min > 0 ? `há ${min} min` : `em ${-min} min`;
  const h = Math.round(min / 60);
  if (Math.abs(h) < 24) return h > 0 ? `há ${h} h` : `em ${-h} h`;
  const dias = Math.round(h / 24);
  return dias > 0 ? `há ${dias} d` : `em ${-dias} d`;
}

/** Iniciais para avatares (cliente/técnico). */
export function iniciais(nome?: string | null): string {
  const parts = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
