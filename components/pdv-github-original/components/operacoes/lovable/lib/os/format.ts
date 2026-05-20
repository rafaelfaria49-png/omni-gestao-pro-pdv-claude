import type { OrdemServico, SLAStatus } from "@/types/os";

export const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const dt = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

export const dtShort = (iso?: string) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

/** Tempo restante humanizado (ex: "2h 30m", "atrasado 3h") */
export function slaRestante(prazoIso: string): { texto: string; status: SLAStatus } {
  const diffMs = new Date(prazoIso).getTime() - Date.now();
  const absMin = Math.abs(Math.round(diffMs / 60000));
  const h = Math.floor(absMin / 60);
  const m = absMin % 60;
  const fmt = h > 0 ? `${h}h ${m}m` : `${m}m`;

  if (diffMs < 0) return { texto: `Atrasado ${fmt}`, status: "estourado" };
  if (diffMs < 4 * 3600 * 1000) return { texto: `Em ${fmt}`, status: "atencao" };
  return { texto: `Em ${fmt}`, status: "ok" };
}

export function totalOrcamento(os: OrdemServico): number {
  if (!os.orcamento) return 0;
  const pecas = os.orcamento.pecas.reduce((s, p) => s + p.quantidade * p.valorUnitario, 0);
  const servicos = os.orcamento.servicos.reduce((s, p) => s + p.valor, 0);
  return Math.max(0, pecas + servicos - os.orcamento.desconto);
}
