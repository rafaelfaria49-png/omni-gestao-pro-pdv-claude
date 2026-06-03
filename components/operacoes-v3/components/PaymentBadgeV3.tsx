"use client";

import { cn } from "@/lib/utils";
import { formatBRL } from "../lib/format";
import type { PagamentoEstado } from "../lib/os-derive";

const CONFIG: Record<PagamentoEstado, { label: string; cls: string }> = {
  aberto: { label: "Em aberto", cls: "bg-warning/10 text-warning border-warning/25" },
  parcial: { label: "Parcial", cls: "bg-info/10 text-info border-info/25" },
  quitado: { label: "Quitado", cls: "bg-success/10 text-success border-success/25" },
  "sem-cobranca": { label: "Sem cobrança", cls: "bg-muted text-muted-foreground border-border" },
  "a-conectar": {
    label: "Pagamento a conectar",
    cls: "bg-muted text-muted-foreground border-dashed border-border",
  },
};

/**
 * PaymentBadgeV3 — suporta os estados reais (aberto/parcial/quitado) para a fase
 * em que o Financeiro estiver acoplado. Nesta sprint, as telas só passam
 * `a-conectar` ou `sem-cobranca` (sem simular recebimento). Ver os-derive.pagamentoInfo.
 */
export function PaymentBadgeV3({
  estado,
  total,
  recebido,
  showValor = true,
  className,
}: {
  estado: PagamentoEstado;
  total?: number;
  recebido?: number;
  showValor?: boolean;
  className?: string;
}) {
  const cfg = CONFIG[estado];
  let valor: string | null = null;
  if (estado === "parcial" && typeof recebido === "number" && typeof total === "number") {
    valor = `${formatBRL(recebido)} de ${formatBRL(total)}`;
  } else if (showValor && typeof total === "number" && total > 0) {
    valor = formatBRL(total);
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        cfg.cls,
        className,
      )}
    >
      {cfg.label}
      {valor ? <span className="opacity-70">· {valor}</span> : null}
    </span>
  );
}
