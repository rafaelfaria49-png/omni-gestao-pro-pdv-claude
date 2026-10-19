import { prisma } from "@/lib/prisma";
import { requireEnterpriseWith } from "@/lib/auth/guard-enterprise";
import type { NovaOSDraftV3 } from "./nova-os-model";
import { garantiaCatalogoV3, sugerirGarantiaPorDescricaoV3 } from "./garantia-textos";
import { validarPrazoGarantiaServicoV3 } from "./garantia-servicos-model";

/** Padrão do catálogo é lido na loja autorizada; override também é auditado na abertura. */
export async function prepararGarantiasAberturaV3(storeId: string, draft: NovaOSDraftV3, ator: { id: string; nome: string }) {
  const ids = [...new Set(draft.itens.flatMap((i) => i.categoria === "servico" && i.catalogoServicoId ? [i.catalogoServicoId] : []))];
  const catalogo = ids.length ? await prisma.servico.findMany({ where: { storeId, id: { in: ids } }, select: { id: true, name: true, warrantyDays: true, terms: true } }) : [];
  const auditoria: Record<string, unknown>[] = [];
  let exigePermissao = false;
  const itens = draft.itens.map((it) => {
    if (it.categoria !== "servico") return it;
    const cat = catalogo.find((c) => c.id === it.catalogoServicoId);
    if (it.catalogoServicoId && !cat) throw new Error("Serviço do catálogo não encontrado nesta loja. Selecione novamente.");
    const padraoModelo = cat ? cat.warrantyDays === 0 ? "sem_garantia" : sugerirGarantiaPorDescricaoV3(cat.name) ?? "personalizado" : it.garantiaModeloId;
    // Sem modelo confirmado (caller legado): preserva o prazo estruturado já informado.
    if (!padraoModelo) return it;
    const modeloId = it.garantiaModeloId || padraoModelo;
    const prazoDias = validarPrazoGarantiaServicoV3(modeloId, it.garantiaDias);
    const prazoPadrao = cat?.warrantyDays ?? garantiaCatalogoV3(padraoModelo).prazoDiasPadrao;
    if (modeloId !== padraoModelo || prazoDias !== prazoPadrao) {
      exigePermissao = true;
      if (!it.garantiaMotivo?.trim()) throw new Error(`Informe o motivo obrigatório da alteração da garantia de "${it.descricao}".`);
      auditoria.push({ linhaAberturaId: it.id, antes: { modeloId: padraoModelo, prazoDias: prazoPadrao }, depois: { modeloId, prazoDias }, operadorId: ator.id, operador: ator.nome, instante: new Date().toISOString(), origem: "abertura", motivo: it.garantiaMotivo.trim() });
    }
    return { ...it, garantiaModeloId: modeloId, garantiaDias: prazoDias, ...(cat?.terms ? { garantiaTermo: cat.terms } : {}) };
  });
  if (exigePermissao) {
    const guard = await requireEnterpriseWith(storeId, (p) => p.operacoes.garantia, "Sem permissão para alterar o padrão da garantia na abertura.");
    if (!guard.ok) throw new Error(guard.error);
  }
  return { draft: { ...draft, itens }, auditoria };
}
