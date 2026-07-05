"use server";

// ============================================================================
// Operações V3 — GOAL OPS-V4-ORC-RAPIDO-024 · "⚡ Orçamento Rápido"
// ----------------------------------------------------------------------------
// Entrada leve: cria uma OS mínima (cliente + marca/modelo + defeito) e já
// materializa o orçamento multiopção (itens fixos + 1 grupo de escolha) em
// RASCUNHO — sem enviar (025), sem seleção/aprovação (026), sem transição de
// status manual (a OS fica no status inicial da criação).
//
// Orquestração — reusa integralmente o motor já existente, mesmo padrão de
// `atendimento-rapido-actions.ts`:
//   1. resolverClienteOperacoesV3  — existente|novo, PF, sem balcão/campos
//      estendidos (GOAL 022; a mesma config de Nova OS/Atendimento Rápido).
//   2. criarOSEnterpriseV3         — OS mínima (Nova OS write-path seguro).
//   3. gerarOrcamentoDaOS + salvarOrcamentoV3 — materializa e grava itens
//      fixos + linhas do grupo + `gruposV3` num ÚNICO write, pelo contrato
//      OFICIAL de `SalvarOrcamentoV3Input` (GOAL OPS-V4-ORC-APROVACAO-
//      SELECAO-026 aposentou o patch cru que existia aqui antes).
//
// Compensação: qualquer falha DEPOIS da OS criada cancela pelo CAMINHO SEGURO
// (`aplicarTransicaoStatusV3` → "cancelada", com motivo automático) — nunca
// uma OS órfã meio-montada. Falha ANTES da OS existir não precisa compensar.
//
// Tipos/validação/montagem PUROS vivem em `orcamento-rapido-model.ts` — um
// módulo "use server" só pode exportar funções async.
// ============================================================================

import { revalidatePath } from "next/cache";
import type { OrdemServico } from "@/types/os";
import { auth } from "@/auth";
import { requireEnterpriseWith } from "@/lib/auth/guard-enterprise";
import { assertActiveStoreId } from "@/lib/operacoes/assert-active-store";
import { resolverClienteOperacoesV3 } from "./cliente-resolver";
import { criarOSEnterpriseV3 } from "./nova-os-actions";
import { gerarOrcamentoDaOS, salvarOrcamentoV3 } from "./orcamento-actions";
import { aplicarTransicaoStatusV3 } from "./status-actions";
import { novaOSDraftVazioV3, type NovaOSDraftV3 } from "./nova-os-model";
import {
  montarGrupoMetaOrcamentoRapidoV3,
  montarServicosOrcamentoRapidoV3,
  novoGrupoIdOrcamentoRapidoV3,
  validarOrcamentoRapidoInputV3,
  type CriarOrcamentoRapidoResultV3,
  type OrcamentoRapidoInputV3,
} from "./orcamento-rapido-model";

// ----------------------------------------------------------------------------
// Orquestração
// ----------------------------------------------------------------------------

/**
 * Cria a OS mínima do Orçamento Rápido e materializa o orçamento multiopção
 * em rascunho. Lança Error com mensagem amigável em validação/permissão.
 * Compensa (cancela a OS pelo caminho seguro) se qualquer passo pós-criação
 * falhar — nunca deixa uma OS órfã meio-montada.
 */
export async function criarOrcamentoRapidoV3(storeId: string, input: OrcamentoRapidoInputV3): Promise<CriarOrcamentoRapidoResultV3> {
  const sid = (storeId ?? "").trim();
  assertActiveStoreId(sid, "Operações V3");

  const session = await auth();
  if (!session?.user?.id) throw new Error("Faça login para criar o orçamento.");
  const guard = await requireEnterpriseWith(sid, (p) => p.operacoes.criarOs, "Sem permissão para abrir OS nesta unidade.");
  if (!guard.ok) throw new Error(guard.error);

  const erro = validarOrcamentoRapidoInputV3(input);
  if (erro) throw new Error(erro);

  // 1. Cliente — existente ou novo (PF, sem balcão, sem campos estendidos: GOAL 022).
  const opts = { permitirBalcao: false, permitirCamposEstendidos: false };
  const cliente =
    input.cliente.modo === "existente"
      ? await resolverClienteOperacoesV3(
          sid,
          { modo: "existente", clienteId: input.cliente.clienteId, nome: input.cliente.nome?.trim() || "", telefone: input.cliente.telefone?.trim() || undefined },
          opts,
        )
      : await resolverClienteOperacoesV3(sid, { modo: "novo", nome: input.cliente.nome?.trim(), telefone: input.cliente.telefone?.trim() || undefined }, opts);

  // 2. OS mínima — marca, modelo, defeito. Sem IMEI/senha/fotos/acessórios/catálogo.
  const draft: NovaOSDraftV3 = {
    ...novaOSDraftVazioV3(),
    cliente: { id: cliente.id, nome: cliente.nome, telefone: cliente.telefone, tipo: "PF" },
    equipamento: { tipo: "", marca: input.aparelho.marca.trim(), modelo: input.aparelho.modelo.trim(), senhaTipo: "numerica", acessorios: [] },
    problema: { defeitoRelatado: input.defeitoRelatado.trim() },
  };
  const { os } = await criarOSEnterpriseV3(sid, draft);
  const osId = os.id;

  // 3. Orçamento multiopção — materializado em rascunho, SEM transição de status.
  //    `gruposV3` grava no MESMO write de `salvarOrcamentoV3` (contrato oficial,
  //    GOAL 026) — nenhum patch cru separado.
  try {
    await gerarOrcamentoDaOS(sid, osId);
    const grupoId = novoGrupoIdOrcamentoRapidoV3();
    const servicos = montarServicosOrcamentoRapidoV3(input, grupoId);
    await salvarOrcamentoV3(sid, osId, {
      servicos,
      pecas: [],
      desconto: 0,
      gruposV3: [montarGrupoMetaOrcamentoRapidoV3(input, grupoId)],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await aplicarTransicaoStatusV3(sid, osId, "cancelada", {
      motivo: `Orçamento Rápido: falha ao materializar o orçamento (${msg}).`,
    }).catch((err) => console.error("[orcamento-rapido] compensação falhou", err));
    throw new Error(`Não foi possível concluir o Orçamento Rápido: ${msg}`);
  }

  revalidatePath("/dashboard/operacoes-v3");
  return { osId, codigo: (os as OrdemServico).codigo, clienteNome: cliente.nome };
}
