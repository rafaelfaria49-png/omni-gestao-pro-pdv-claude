// ============================================================================
// Operações V4 — GOAL OPS-V4-ORC-ENVIO-WA-025 · prefill de "Duplicar orçamento"
// ----------------------------------------------------------------------------
// Módulo PURO (sem I/O, sem React). Monta `initialValues` do modal "⚡ Orçamento
// Rápido" (GOAL 024) a partir de uma OS REAL — visão INTERNA de operador
// (inclui custo interno por linha; nunca passa pela projeção client-safe do
// GOAL 023, que existe para o documento/mensagem do CLIENTE, não para reabrir
// edição). O cliente NUNCA é pré-preenchido — duplicar cria uma OS nova para
// um atendimento novo, o operador escolhe o cliente de novo (existente ou
// outro novo) a cada duplicação.
//
// Limitação registrada: o modal "Orçamento Rápido" só distingue Cobrado/
// Cortesia (sem opção "Interno" na UI) — uma linha "interno" no orçamento
// original vira um item cobrado comum no prefill (o operador revisa/ajusta
// antes de salvar). Só o PRIMEIRO grupo é usado (o motor desta V4 sempre
// cria exatamente um grupo; grupos extras, se um dia existirem, são ignorados).
// ============================================================================

import type { OrdemServico } from "@/types/os";
import { orcamentoRealV3, type PecaV3, type ServicoV3 } from "@/lib/operacoes-v3/orcamento-model";
import {
  novaVarianteVaziaV4,
  novoItemFixoVazioV4,
  orcamentoRapidoFormVazioV4,
  type OrcamentoRapidoFormV4,
  type OrcamentoRapidoItemFixoFormV4,
  type OrcamentoRapidoVarianteFormV4,
} from "./orcamento-rapido-form";

function txt(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Monta o prefill do "Orçamento Rápido" a partir da OS real, para "Duplicar
 * como novo orçamento". Retorna `null` quando não há orçamento materializado
 * — nada para duplicar (o botão que chama isto já deve estar oculto nesse caso).
 */
export function montarPrefillDuplicarOrcamentoV4(os: OrdemServico): OrcamentoRapidoFormV4 | null {
  const orc = orcamentoRealV3(os);
  if (!orc) return null;

  const pecas: PecaV3[] = Array.isArray(orc.pecas) ? orc.pecas : [];
  const servicos: ServicoV3[] = Array.isArray(orc.servicos) ? orc.servicos : [];

  const primeiroGrupoId = txt(orc.gruposV3?.[0]?.id);
  const primeiroGrupoRotulo = txt(orc.gruposV3?.[0]?.rotulo);

  const itensFixos: OrcamentoRapidoItemFixoFormV4[] = [];
  for (const p of pecas) {
    if (txt(p.grupoId)) continue;
    itensFixos.push({
      ...novoItemFixoVazioV4(),
      descricao: txt(p.nome) || "Peça",
      valor: typeof p.valorUnitario === "number" ? p.valorUnitario : 0,
      cortesia: p.kindV3 === "brinde",
      custoV3: typeof p.custoUnitario === "number" && p.custoUnitario > 0 ? p.custoUnitario : 0,
    });
  }
  for (const sv of servicos) {
    if (txt(sv.grupoId)) continue;
    itensFixos.push({
      ...novoItemFixoVazioV4(),
      descricao: txt(sv.descricao) || "Serviço",
      valor: typeof sv.valor === "number" ? sv.valor : 0,
      cortesia: sv.kindV3 === "brinde",
      custoV3: typeof sv.custoV3 === "number" && sv.custoV3 > 0 ? sv.custoV3 : 0,
    });
  }

  const variantesRaw: OrcamentoRapidoVarianteFormV4[] = [];
  if (primeiroGrupoId) {
    for (const p of pecas) {
      if (txt(p.grupoId) !== primeiroGrupoId) continue;
      variantesRaw.push({
        ...novaVarianteVaziaV4(),
        rotulo: txt(p.varianteV3?.rotulo) || txt(p.nome) || "Opção",
        valor: typeof p.valorUnitario === "number" ? p.valorUnitario : 0,
        garantiaDias: typeof p.varianteV3?.garantiaDias === "number" ? p.varianteV3.garantiaDias : 0,
        descricaoCurta: txt(p.varianteV3?.descricaoCurta),
        badge: txt(p.varianteV3?.badge),
        custoV3: typeof p.custoUnitario === "number" && p.custoUnitario > 0 ? p.custoUnitario : 0,
      });
    }
    for (const sv of servicos) {
      if (txt(sv.grupoId) !== primeiroGrupoId) continue;
      variantesRaw.push({
        ...novaVarianteVaziaV4(),
        rotulo: txt(sv.varianteV3?.rotulo) || txt(sv.descricao) || "Opção",
        valor: typeof sv.valor === "number" ? sv.valor : 0,
        garantiaDias: typeof sv.varianteV3?.garantiaDias === "number" ? sv.varianteV3.garantiaDias : 0,
        descricaoCurta: txt(sv.varianteV3?.descricaoCurta),
        badge: txt(sv.varianteV3?.badge),
        custoV3: typeof sv.custoV3 === "number" && sv.custoV3 > 0 ? sv.custoV3 : 0,
      });
    }
  }
  // Sempre pelo menos 2 variantes (mesmo piso do formulário vazio) — completa
  // com slots vazios quando o orçamento original não tinha grupo/tinha só 1.
  while (variantesRaw.length < 2) variantesRaw.push(novaVarianteVaziaV4());

  const base = orcamentoRapidoFormVazioV4();
  return {
    ...base,
    // Cliente SEMPRE vazio — duplicar é para um atendimento novo.
    clienteModo: "existente",
    clienteExistente: null,
    clienteNovoNome: "",
    clienteNovoTelefone: "",
    aparelhoMarca: txt(os.equipamento?.marca),
    aparelhoModelo: txt(os.equipamento?.modelo),
    defeitoRelatado: txt(os.equipamento?.defeitoRelatado),
    itensFixos,
    grupoRotulo: primeiroGrupoRotulo,
    variantes: variantesRaw,
  };
}
