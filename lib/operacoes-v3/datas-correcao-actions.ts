"use server";

// ============================================================================
// Operações V3/V4 — "Corrigir datas" · write-path auditado
// (GOAL OPS-DATAS-ENTRADA-ENTREGA-RETROATIVAS-001)
// ----------------------------------------------------------------------------
// Corrige datas operacionais de uma OS existente SEM reexecutar nada: não
// entrega de novo, não cobra, não baixa estoque, não envia WhatsApp, não fecha
// retorno, não mexe na assinatura. Grava só as datas (e espelhos), a garantia
// derivada dessa entrega e um evento de auditoria — tudo numa transação.
//
// Serialização: a MESMA trava por OS dos writers de pagamento da V3
// (advisory lock `chaveLockRecebimentoMistoV3` → OS FOR UPDATE → releitura).
// Um recebimento concorrente espera esta correção (ou vice-versa) e relê o
// payload: nenhum dos dois apaga o outro. Concorrência entre operadores: trava
// otimista por campo (`esperados`) — snapshot velho recebe conflito explícito.
// ============================================================================

import { revalidatePath } from "next/cache";
import type { Session } from "next-auth";
import type { Prisma } from "@/generated/prisma";
import type { OrdemServico } from "@/types/os";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireEnterpriseWith } from "@/lib/auth/guard-enterprise";
import { assertActiveStoreId } from "@/lib/operacoes/assert-active-store";
import { recebimentoLoteAdvisoryLock } from "@/lib/financeiro/services/recebimento-lote-service";
import { chaveLockRecebimentoMistoV3, travarOS } from "./recebimento-misto-service";
import { planejarCorrecaoDatasV3, type CorrecaoDatasInputV3, type DiffCampoDataV3, type ImpactoGarantiaV3 } from "./datas-correcao-model";

function operadorLabel(session: Session | null): string {
  const u = session?.user;
  return (u?.name || u?.email || "Você").trim() || "Você";
}

function eventId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `ev_${Date.now()}`;
}

/** Recusa com o tipo e o campo (para o formulário apontar o problema). */
export interface CorrigirDatasFalhaV3 {
  ok: false;
  tipo: "validacao" | "conflito" | "impedimento" | "confirmacao";
  mensagem: string;
  campo?: string;
  garantia?: ImpactoGarantiaV3;
}

export interface CorrigirDatasSucessoV3 {
  ok: true;
  diff: DiffCampoDataV3[];
  garantia: ImpactoGarantiaV3;
  os: OrdemServico;
}

class RecusaCorrecaoV3 extends Error {
  constructor(readonly falha: CorrigirDatasFalhaV3) {
    super(falha.mensagem);
  }
}

const TX_CORRECAO_DATAS_V3 = { maxWait: 5_000, timeout: 15_000 } as const;

/**
 * Corrige datas operacionais da OS. Recusas previsíveis (validação, conflito,
 * impedimento da garantia, confirmação pendente) voltam como `{ ok: false }`
 * para o formulário continuar aberto com os dados; nada é gravado nelas.
 */
export async function corrigirDatasOSV3(
  storeId: string,
  osId: string,
  input: CorrecaoDatasInputV3,
): Promise<CorrigirDatasSucessoV3 | CorrigirDatasFalhaV3> {
  const sid = (storeId ?? "").trim();
  const id = (osId ?? "").trim();
  assertActiveStoreId(sid, "Operações V3");
  if (!id) throw new Error("OS não informada.");

  const session = await auth();
  if (!session?.user?.id) throw new Error("Faça login para corrigir datas.");
  const guard = await requireEnterpriseWith(sid, (p) => p.operacoes.editarOs, "Sem permissão para corrigir datas desta OS.");
  if (!guard.ok) throw new Error(guard.error);
  const mexeEntrega = !!input?.alteracoes && Object.prototype.hasOwnProperty.call(input.alteracoes, "dataEntrega");
  if (mexeEntrega) {
    const g2 = await requireEnterpriseWith(sid, (p) => p.operacoes.entregarOs, "Sem permissão para corrigir a data de entrega desta OS.");
    if (!g2.ok) throw new Error(g2.error);
  }

  const operador = operadorLabel(session);
  const operadorId = session.user.id;
  const agora = new Date();

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      // 1) Mesma serialização por OS dos writers de pagamento — primeira instrução.
      await recebimentoLoteAdvisoryLock(tx, chaveLockRecebimentoMistoV3(sid, id));
      // 2) OS travada e relida: o patch parte do payload MAIS RECENTE, nunca de rascunho.
      if (!(await travarOS(tx, sid, id))) throw new RecusaCorrecaoV3({ ok: false, tipo: "validacao", mensagem: "OS não encontrada." });
      const row = await tx.ordemServico.findFirst({ where: { id, storeId: sid }, select: { id: true, payload: true } });
      const payload = row?.payload as unknown;
      if (!row || !payload || typeof payload !== "object") {
        throw new RecusaCorrecaoV3({ ok: false, tipo: "validacao", mensagem: "OS sem payload compatível." });
      }
      // Linhas de garantia da OS travadas (FOR UPDATE) antes da leitura: um writer
      // de garantia que não passa pela trava da OS espera este commit para
      // alterá-las. A leitura seguinte (novo snapshot) parte do estado mais recente.
      if (mexeEntrega) {
        await tx.$queryRaw`
          SELECT "id" FROM "garantia_ordem_servico" WHERE "storeId" = ${sid} AND "ordemServicoId" = ${id} FOR UPDATE
        `;
      }
      const garantias = mexeEntrega
        ? (
            await tx.garantiaOrdemServico.findMany({
              where: { storeId: sid, ordemServicoId: id },
              select: { id: true, status: true, dataInicio: true, dataFim: true },
            })
          ).map((g) => ({ id: g.id, status: g.status, dataInicio: g.dataInicio.toISOString(), dataFim: g.dataFim.toISOString() }))
        : [];

      const plano = planejarCorrecaoDatasV3(payload, input, {
        agora,
        operador,
        operadorId,
        garantias,
        eventoId: eventId(),
        exigirAssinaturaGarantia: true,
      });
      if (!plano.ok) throw new RecusaCorrecaoV3(plano);

      const garantiaMudou = () =>
        new RecusaCorrecaoV3({
          ok: false,
          tipo: "conflito",
          campo: "dataEntrega",
          mensagem: "A garantia desta OS mudou durante a correção. Reabra a correção e revise.",
        });
      // 3) Garantia operacional ATIVA ancorada nesta entrega: mesma transação, com
      // CAS do status E das datas lidas (nunca grava sobre cobertura alterada).
      for (const linha of plano.garantia.linhas) {
        const r = await tx.garantiaOrdemServico.updateMany({
          where: {
            id: linha.id,
            storeId: sid,
            ordemServicoId: id,
            status: "ativa",
            dataInicio: new Date(linha.dataInicioAntes),
            dataFim: new Date(linha.dataFimAntes),
          },
          data: { dataInicio: new Date(linha.dataInicio), dataFim: new Date(linha.dataFim) },
        });
        if (r.count !== 1) throw garantiaMudou();
      }
      // Garantia criada por outro caminho durante a correção (linha nova): conflito.
      if (mexeEntrega) {
        const lidas = new Set(garantias.map((g) => g.id));
        const agoraNaOS = await tx.garantiaOrdemServico.findMany({ where: { storeId: sid, ordemServicoId: id }, select: { id: true } });
        if (agoraNaOS.some((g) => !lidas.has(g.id))) throw garantiaMudou();
      }
      // 4) Payload: só datas + auditoria. Prisma atualiza `updatedAt` (trava otimista dos outros editores).
      await tx.ordemServico.update({ where: { id }, data: { payload: plano.next as unknown as Prisma.InputJsonValue } });
      return plano;
    }, TX_CORRECAO_DATAS_V3);

    try {
      revalidatePath("/dashboard/operacoes-v3");
      revalidatePath("/dashboard/operacoes-v4-preview");
    } catch (e) {
      console.error("[corrigirDatasOSV3 revalidatePath]", e);
    }
    return { ok: true, diff: resultado.diff, garantia: resultado.garantia, os: resultado.next as unknown as OrdemServico };
  } catch (e) {
    if (e instanceof RecusaCorrecaoV3) return e.falha;
    throw e;
  }
}
