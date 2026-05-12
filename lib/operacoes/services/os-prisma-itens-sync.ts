import type { Orcamento, OrdemServico } from "@/types/os";
import { prisma } from "@/lib/prisma";

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function safeFloorQty(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : 0;
}

function safeMoney(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Espelha o orçamento atual em `ordem_servico_item` (rascunho / pré-baixa).
 * Não roda quando o estoque já foi consumido na entrega (itens = ledger de baixa real).
 */
export async function syncOrdemServicoDraftItensFromOrcamento(params: {
  storeId: string;
  osId: string;
  orcamento: Orcamento;
  payload: OrdemServico;
}): Promise<void> {
  const { storeId, osId, orcamento, payload } = params;
  if (!storeId?.trim() || !osId?.trim()) return;

  const p = payload as OrdemServico & Record<string, unknown>;
  if (p.estoqueConsumido === true) return;

  await prisma.$transaction(async (tx) => {
    await tx.ordemServicoItem.deleteMany({ where: { ordemServicoId: osId } });

    for (const peca of orcamento.pecas) {
      const q = safeFloorQty(peca.quantidade);
      if (q < 1) continue;
      const descricao = String(peca.nome ?? "").trim() || "Peça";
      const observacao = String(peca.observacao ?? "").trim();
      const pid = String(peca.produtoId ?? "").trim();
      const precoUnitario = safeMoney(peca.valorUnitario);

      if (pid) {
        const prod = await tx.produto.findFirst({ where: { id: pid, storeId }, select: { id: true } });
        if (!prod) continue;
        await tx.ordemServicoItem.create({
          data: {
            ordemServicoId: osId,
            produtoId: pid,
            tipo: "peca",
            descricao,
            quantidade: q,
            precoUnitario,
            observacao,
          },
        });
      } else {
        await tx.ordemServicoItem.create({
          data: {
            ordemServicoId: osId,
            produtoId: null,
            tipo: "peca",
            descricao,
            quantidade: q,
            precoUnitario,
            observacao,
          },
        });
      }
    }

    for (const s of orcamento.servicos) {
      const bruto = safeMoney(s.valor);
      const desc = safeMoney(s.desconto);
      const liquido = Math.max(0, bruto - desc);
      const descricao = String(s.descricao ?? "").trim() || "Serviço";
      const observacao = String(s.observacao ?? "").trim();
      await tx.ordemServicoItem.create({
        data: {
          ordemServicoId: osId,
          produtoId: null,
          tipo: "servico",
          descricao,
          quantidade: 1,
          precoUnitario: liquido,
          observacao,
        },
      });
    }
  });
}

export async function loadOrcamentoFromOsRow(storeId: string, osId: string): Promise<{
  orcamento: Orcamento | null;
  payload: OrdemServico | null;
}> {
  const row = await prisma.ordemServico.findFirst({
    where: { id: osId, storeId },
    select: { payload: true },
  });
  if (!row?.payload || !isRecord(row.payload as unknown)) return { orcamento: null, payload: null };
  const payload = row.payload as unknown as OrdemServico;
  const orc = payload.orcamento;
  if (!orc || typeof orc !== "object") return { orcamento: null, payload };
  return { orcamento: orc as Orcamento, payload };
}
