import type { Garantia, OrdemServico } from "@/types/os";

/** Consolida prazos/termos de garantia do catálogo da OS e do orçamento (serviços e peças). */
export function snapshotGarantia(next: OrdemServico, inicioEm: string): Garantia | null {
  const partes: string[] = [];
  let maxDays = 0;

  for (const s of next.servicosCatalogo ?? []) {
    const d = Math.trunc(Number(s.prazoGarantiaDias || 0));
    maxDays = Math.max(maxDays, d);
    if (d > 0) {
      partes.push(`▸ ${s.descricao} (${d} dias)\n${s.termoGarantia ?? ""}`.trim());
    }
  }

  const orc = next.orcamento;
  if (orc) {
    for (const s of orc.servicos ?? []) {
      const d = Math.trunc(Number(s.prazoGarantiaDias ?? 0));
      maxDays = Math.max(maxDays, d);
      if (d > 0) {
        partes.push(`▸ ${s.descricao} (${d} dias)\n${s.termoGarantia ?? ""}`.trim());
      }
    }
    for (const p of orc.pecas ?? []) {
      const d = Math.trunc(Number(p.prazoGarantiaDias ?? 0));
      maxDays = Math.max(maxDays, d);
      if (d > 0) {
        partes.push(`▸ ${p.nome} (${d} dias)`.trim());
      }
    }
  }

  if (maxDays <= 0) return null;

  const fim = new Date(inicioEm);
  fim.setDate(fim.getDate() + maxDays);

  return {
    ...(next.garantia ?? { ativa: false }),
    ativa: true,
    prazoDias: maxDays,
    inicioEm,
    fimEm: fim.toISOString(),
    termo: partes.filter(Boolean).join("\n\n---\n\n") || next.garantia?.termo,
  };
}
