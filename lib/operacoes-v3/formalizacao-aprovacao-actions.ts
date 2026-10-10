"use server";

// ============================================================================
// Operações V3 — "Formalizar aprovação pendente" · actions
// (GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002, item D)
// ----------------------------------------------------------------------------
// Conferência (leitura) e formalização (escrita) da ação administrativa
// excepcional (regras no modelo `formalizacao-aprovacao-model.ts`). Acesso:
// papel administrador (`enterpriseRoleFromUserRole` = admin) E
// `operacoes.editarOs`, conferidos no servidor antes de qualquer leitura. A
// escrita roda sob as MESMAS travas dos writers de pagamento e na mesma ordem
// (advisory da OS → OS → título): nenhum recebimento ou estorno grava entre a
// revalidação e a formalização. Mesma `operacaoId` + mesmo conteúdo devolve o
// resultado gravado; outro conteúdo é conflito. Recusa nunca grava nada.
// ============================================================================

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma";
import type { OrdemServico } from "@/types/os";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireEnterpriseWith } from "@/lib/auth/guard-enterprise";
import { enterpriseRoleFromUserRole } from "@/lib/auth/enterprise-permissions";
import { getContaReceberByLocalKey } from "@/lib/financeiro/services/contas-receber-service";
import { recebimentoLoteAdvisoryLock } from "@/lib/financeiro/services/recebimento-lote-service";
import { localKeyContaReceberOSV3 } from "./payment-model";
import { chaveLockRecebimentoMistoV3, travarOS, travarTitulo } from "./recebimento-misto-service";
import {
  aplicarFormalizacaoV3,
  assinaturaFormalizacaoV3,
  decidirFormalizacaoV3,
  DECLARACAO_FORMALIZACAO_APROVACAO_V3,
  lerFormalizacaoAprovacaoV3,
  montarEscopoFormalizacaoV3,
  normalizarEntradaFormalizacaoV3,
  type EntradaFormalizacaoV3,
  type EscopoFormalizacaoV3,
  type RecusaFormalizacaoV3,
} from "./formalizacao-aprovacao-model";

type OSPayloadFull = OrdemServico & Record<string, unknown>;

/** Transação curta, mesmos limites dos writers de pagamento. */
const TX_FORMALIZACAO_V3 = { maxWait: 5_000, timeout: 15_000 } as const;

const SEM_ACESSO_FORMALIZACAO_V3 =
  "Somente um administrador com permissão de editar OS pode formalizar uma aprovação pendente. Peça a um administrador da loja.";

export type ConferenciaFormalizacaoResultV3 =
  | { ok: true; escopo: EscopoFormalizacaoV3; vencido: boolean; declaracao: string }
  | RecusaFormalizacaoV3;

export type FormalizacaoAprovacaoResultV3 =
  | { ok: true; jaRegistrado: boolean; operacaoId: string; formalizadoEm: string; formalizadoPor: string }
  | (RecusaFormalizacaoV3 & {
      /** `true` = conferido no servidor: nada gravado com esta chave (pode abandoná-la). */
      naoRegistrada?: true;
    });

function falha(code: RecusaFormalizacaoV3["code"], mensagem: string): RecusaFormalizacaoV3 {
  return { ok: false, code, mensagem };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Sessão + `operacoes.editarOs` + papel administrador — antes de qualquer leitura da OS. */
async function autorizarFormalizacaoV3(sid: string): Promise<{ ok: true; operador: string; operadorId: string } | RecusaFormalizacaoV3> {
  const session = await auth();
  if (!session?.user?.id) return falha("nao_autenticado", "Faça login para formalizar a aprovação.");
  const guard = await requireEnterpriseWith(sid, (p) => p.operacoes.editarOs, SEM_ACESSO_FORMALIZACAO_V3);
  if (!guard.ok) return falha("sem_permissao", guard.error);
  if (enterpriseRoleFromUserRole((session.user as { role?: string }).role) !== "admin") {
    return falha("sem_permissao", SEM_ACESSO_FORMALIZACAO_V3);
  }
  const u = session.user;
  return { ok: true, operador: (u.name || u.email || "Administrador").trim() || "Administrador", operadorId: session.user.id };
}

/**
 * Conferência: o escopo atual (linhas, revisão, totais, título e pagamentos) que o responsável
 * vê antes de formalizar. Só leitura — nada é gravado nem travado.
 */
export async function conferirFormalizacaoAprovacaoV3(storeId: string, osId: string): Promise<ConferenciaFormalizacaoResultV3> {
  const sid = (storeId ?? "").trim();
  const id = (osId ?? "").trim();
  if (!sid) return falha("entrada_invalida", "Selecione uma unidade ativa para continuar (Operações V3).");
  if (!id) return falha("entrada_invalida", "OS não informada.");
  const acesso = await autorizarFormalizacaoV3(sid);
  if (!acesso.ok) return acesso;

  const row = await prisma.ordemServico.findFirst({ where: { id, storeId: sid }, select: { payload: true, valorTotal: true } });
  if (!row || !isRecord(row.payload)) return falha("os_nao_encontrada", "OS não encontrada nesta loja.");
  const titulo = await getContaReceberByLocalKey(sid, localKeyContaReceberOSV3(sid, id));
  const montagem = montarEscopoFormalizacaoV3({
    storeId: sid,
    osId: id,
    payload: row.payload as unknown as OSPayloadFull,
    prismaValorTotal: Number(row.valorTotal ?? 0),
    titulo,
    agora: Date.now(),
  });
  if (!montagem.ok) return montagem;
  return { ok: true, escopo: montagem.escopo, vencido: montagem.vencido, declaracao: DECLARACAO_FORMALIZACAO_APROVACAO_V3 };
}

/** Conflito de escrita concorrente detectado pelo banco: nada desta tentativa ficou gravado. */
function conflitoConcorrenteV3(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  return code === "P2002" || code === "P2034";
}

export async function formalizarAprovacaoPendenteV3(
  storeId: string,
  osId: string,
  input: EntradaFormalizacaoV3,
): Promise<FormalizacaoAprovacaoResultV3> {
  const sid = (storeId ?? "").trim();
  const id = (osId ?? "").trim();
  if (!sid) return falha("entrada_invalida", "Selecione uma unidade ativa para continuar (Operações V3).");
  if (!id) return falha("entrada_invalida", "OS não informada.");
  // Permissão ANTES de qualquer leitura — inclusive da conferência de replay.
  const acesso = await autorizarFormalizacaoV3(sid);
  if (!acesso.ok) return acesso;
  const entrada = normalizarEntradaFormalizacaoV3(input);
  if (!entrada.ok) return { ...entrada, naoRegistrada: true };

  const requestFingerprint = createHash("sha256").update(assinaturaFormalizacaoV3({ storeId: sid, osId: id }, entrada.valor)).digest("hex");
  const agora = new Date().toISOString();
  try {
    const resultado = await prisma.$transaction(async (tx): Promise<FormalizacaoAprovacaoResultV3> => {
      // 1) Mesma serialização por OS dos writers de pagamento — primeira instrução.
      await recebimentoLoteAdvisoryLock(tx, chaveLockRecebimentoMistoV3(sid, id));
      // 2) OS travada e relida.
      if (!(await travarOS(tx, sid, id))) return falha("os_nao_encontrada", "OS não encontrada nesta loja.");
      const row = await tx.ordemServico.findFirst({ where: { id, storeId: sid }, select: { id: true, payload: true, valorTotal: true } });
      if (!row || !isRecord(row.payload)) return falha("os_nao_encontrada", "OS sem dados compatíveis nesta loja.");
      const payload = row.payload as unknown as OSPayloadFull;

      // 3) Replay ANTES de revalidar: a mesma formalização já gravada devolve o gravado.
      const anterior = lerFormalizacaoAprovacaoV3(payload);
      if (anterior && anterior.operacaoId === entrada.valor.operacaoId) {
        if (anterior.requestFingerprint !== requestFingerprint) {
          return falha("idempotencia_conflito", "Esta formalização já foi registrada com outro conteúdo. Atualize a OS antes de tentar de novo.");
        }
        return {
          ok: true,
          jaRegistrado: true,
          operacaoId: anterior.operacaoId,
          formalizadoEm: anterior.formalizadoEm,
          formalizadoPor: anterior.formalizadoPorNome,
        };
      }

      // 4) Título travado e relido (mesma ordem do recebimento e do estorno).
      const localKey = localKeyContaReceberOSV3(sid, id);
      await travarTitulo(tx, sid, localKey);
      const titulo = await getContaReceberByLocalKey(sid, localKey, tx);

      // 5) Revalidação completa sobre o estado travado; recusa não grava nada.
      const decisao = decidirFormalizacaoV3(
        { storeId: sid, osId: id, payload, prismaValorTotal: Number(row.valorTotal ?? 0), titulo, agora: Date.parse(agora) },
        entrada.valor,
      );
      if (!decisao.ok) return decisao;

      // 6) Só o payload: colunas, título, caixa, garantia e status técnico intocados.
      const { payload: proximo } = aplicarFormalizacaoV3(payload, {
        entrada: entrada.valor,
        escopo: decisao.escopo,
        vencido: decisao.vencido,
        requestFingerprint,
        operador: acesso.operador,
        operadorId: acesso.operadorId,
        agora,
        eventoId: randomUUID(),
      });
      await tx.ordemServico.update({ where: { id: row.id }, data: { payload: proximo as unknown as Prisma.InputJsonValue } });
      return { ok: true, jaRegistrado: false, operacaoId: entrada.valor.operacaoId, formalizadoEm: agora, formalizadoPor: acesso.operador };
    }, TX_FORMALIZACAO_V3);

    if (!resultado.ok) return { ...resultado, naoRegistrada: true };
    if (!resultado.jaRegistrado) {
      try {
        revalidatePath("/dashboard/operacoes-v3");
      } catch (e) {
        console.error("[formalizarAprovacaoPendenteV3 revalidatePath]", e);
      }
    }
    return resultado;
  } catch (e) {
    if (conflitoConcorrenteV3(e)) {
      return falha("conflito_concorrente", "A OS foi alterada por outra operação ao mesmo tempo. Nada foi gravado — confira de novo.");
    }
    throw e;
  }
}
