import type { Orcamento, OrdemServico } from "@/types/os";
import { prisma } from "@/lib/prisma";
import { lerOSTravadaV3, TX_PAYLOAD_OS_V3 } from "@/lib/operacoes-v3/os-payload-lock";

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
 *
 * Trava a OS (loja + id) ANTES de tocar os itens e relê `estoqueConsumido` e o orçamento sob
 * a trava: mesma ordem OS → itens do consumo/restauração/delta de estoque (sem ciclo — o INSERT
 * do item pede KEY SHARE na OS, que já é desta transação), e um rascunho lido antes da entrega
 * nunca substitui o ledger consumido.
 */
export async function syncOrdemServicoDraftItensFromOrcamento(params: { storeId: string; osId: string }): Promise<void> {
  const { storeId, osId } = params;
  if (!storeId?.trim() || !osId?.trim()) return;

  await prisma.$transaction(async (tx) => {
    const os = await lerOSTravadaV3(tx, storeId, osId);
    if (!os || !os.payloadValido) return;
    const p = os.payload as OrdemServico & Record<string, unknown>;
    if (p.estoqueConsumido === true) return;
    const orcamento = isRecord(p.orcamento as unknown) ? (p.orcamento as Orcamento) : null;
    if (!orcamento) return;

    await tx.ordemServicoItem.deleteMany({ where: { ordemServicoId: osId } });

    for (const peca of Array.isArray(orcamento.pecas) ? orcamento.pecas : []) {
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

    for (const s of Array.isArray(orcamento.servicos) ? orcamento.servicos : []) {
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
  }, TX_PAYLOAD_OS_V3);
}
