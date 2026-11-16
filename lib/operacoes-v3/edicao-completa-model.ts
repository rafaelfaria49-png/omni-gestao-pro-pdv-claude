import { z } from "zod";
import type { OrdemServico } from "@/types/os";
import { toStrongDocumentKey } from "@/lib/cadastros/client-identity/document";
import { computeTotaisV3, recalcOrcamentoV3, validarGruposOrcamentoV3, validarSelecaoCompletaV3, type OrcamentoV3, type ServicoV3, type PecaV3 } from "./orcamento-model";
import { lerRecepcaoV3 } from "./workspace-model";
import { lerCoberturasGarantiaV3, validarPrazoGarantiaServicoV3 } from "./garantia-servicos-model";
import { parseDateStringSafe } from "@/lib/financeiro/contracts/valores";
import { buildOrcamentoRascunhoFromOS } from "@/lib/operacoes/services/orcamento-builder";
import { lerProvaEntradaV3 } from "./prova-entrada-model";

const texto = z.string().max(4000);
const dinheiro = z.number().finite().min(0).max(100_000_000).refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001, "Use até duas casas decimais.");
export const edicaoCompletaSchemaV3 = z.object({
  cliente: z.object({ id: z.string().min(1), nome: texto.trim().min(1), documento: texto, telefone: texto, email: texto }),
  equipamento: z.object({ tipo: texto.trim().min(1), marca: texto, modelo: texto.trim().min(1), numeroSerie: texto, imei: texto.default(""), cor: texto.default(""), operadora: texto.default("") }),
  recepcao: z.object({ recebidoPor: texto, localFisico: texto }),
  problema: texto.min(1),
  observacaoCliente: texto,
  servicos: z.array(z.object({ id: z.string().min(1), descricao: texto.trim().min(1), valor: dinheiro, custoV3: dinheiro.optional(), desconto: dinheiro.optional(), kindV3: z.enum(["cobrado", "brinde", "interno"]).optional() }).passthrough()).max(100),
  pecas: z.array(z.object({ id: z.string().min(1), nome: texto.trim().min(1), quantidade: z.number().int().positive(), valorUnitario: dinheiro, custoUnitario: dinheiro.optional(), desconto: dinheiro.optional(), kindV3: z.enum(["cobrado", "brinde", "interno"]).optional(), produtoId: z.string().optional() }).passthrough()).max(100),
  desconto: dinheiro,
  pagamento: z.object({ vencimento: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/), formaPreferida: texto }),
  garantias: z.array(z.object({ linhaId: z.string().min(1), descricao: texto, modeloId: texto, prazoDias: z.number().int().min(0).max(36500), termoCustom: texto.optional(), origem: z.enum(["servico", "variante", "legado", "edicao"]), inicioOriginal: texto.optional(), vencimentoOriginal: texto.optional() })).max(100),
});
export type EdicaoCompletaV3 = Omit<z.infer<typeof edicaoCompletaSchemaV3>, "servicos" | "pecas"> & { servicos: ServicoV3[]; pecas: PecaV3[] };
export type RevisaoEdicaoV3 = { versao: string; operacaoId: string; motivo: string };
export const ACAO_EDICAO_OS_V3 = "editar_os_completa";
/** Comparação estrutural: JSONB e validadores podem devolver as chaves em outra ordem. */
export function serializarEdicaoV3(v: unknown): string {
  return JSON.stringify(v, (_k, value) => value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.keys(value).sort().map((k) => [k, value[k]])) : value);
}
function vencimentoEditor(raw: string | undefined): string {
  if (!raw) return "";
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(raw)?.[1];
  if (iso) return iso;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  if (br && parseDateStringSafe(raw)) return `${br[3]}-${br[2]}-${br[1]}`;
  return raw;
}

export function semearEdicaoCompletaV3(os: OrdemServico, titulo?: { vencimento: string; payload: unknown } | null): EdicaoCompletaV3 {
  let sequencia = 0;
  const orc = (os.orcamento ?? buildOrcamentoRascunhoFromOS(os, { uid: (prefix) => `${prefix}-${os.id}-${sequencia++}`, nowIso: () => os.atualizadoEm || os.criadoEm })) as OrcamentoV3;
  const r = lerRecepcaoV3(os);
  const identificacao = lerProvaEntradaV3(os).identificacao;
  const p = (titulo?.payload ?? {}) as Record<string, unknown>;
  const salvas = (os as unknown as { aberturaV3?: { garantiasServicosV3?: ReturnType<typeof lerCoberturasGarantiaV3> } }).aberturaV3?.garantiasServicosV3;
  const coberturas = lerCoberturasGarantiaV3(os);
  return {
    cliente: { id: os.clienteId || os.cliente?.id || "", nome: os.cliente?.nome || "", documento: os.cliente?.documento || "", telefone: os.cliente?.telefone || "", email: os.cliente?.email || "" },
    equipamento: { tipo: os.equipamento?.tipo || "", marca: os.equipamento?.marca || "", modelo: identificacao.modelo || os.equipamento?.modelo || "", numeroSerie: identificacao.serial || os.equipamento?.numeroSerie || "", imei: identificacao.imei || "", cor: identificacao.cor || "", operadora: identificacao.operadora || "" },
    recepcao: { recebidoPor: r.recebidoPor || "", localFisico: r.localFisico || "" },
    problema: os.equipamento?.defeitoRelatado || "", observacaoCliente: os.observacaoCliente || "",
    servicos: structuredClone(orc?.servicos ?? []), pecas: structuredClone(orc?.pecas ?? os.pecas ?? []), desconto: orc?.desconto ?? 0,
    pagamento: { vencimento: vencimentoEditor(titulo?.vencimento), formaPreferida: String(p.formaPagamentoPreferida ?? os.faturamentoFormaPagamento ?? "") },
    garantias: coberturas.length ? coberturas : Array.isArray(salvas) ? salvas : [],
  };
}

export function validarEdicaoCompletaV3(entrada: unknown): EdicaoCompletaV3 {
  const d = edicaoCompletaSchemaV3.parse(entrada);
  if (d.cliente.documento.trim() && !toStrongDocumentKey(d.cliente.documento)) throw new Error("CPF/CNPJ inválido. Corrija o documento antes de salvar.");
  for (const g of d.garantias) {
    // Leitor canônico sinaliza cobertura ainda não definida com este marcador.
    if (g.modeloId === "nao_definida" && g.prazoDias === 0 && !g.termoCustom) continue;
    validarPrazoGarantiaServicoV3(g.modeloId, g.prazoDias);
  }
  for (const lista of [d.servicos, d.pecas, d.garantias.map((g) => ({ id: g.linhaId }))]) {
    if (new Set(lista.map((l) => l.id)).size !== lista.length) throw new Error("Identidade de linha duplicada.");
  }
  const erros = validarGruposOrcamentoV3(d as unknown as OrcamentoV3);
  if (erros.length) throw new Error(erros[0]);
  if (d.pagamento.vencimento && new Date(d.pagamento.vencimento + "T12:00:00Z").toISOString().slice(0, 10) !== d.pagamento.vencimento) throw new Error("Vencimento inválido.");
  return d;
}

export function orcamentoEditadoCompletoV3(os: OrdemServico, d: EdicaoCompletaV3, agora: string): OrcamentoV3 {
  const anterior = os.orcamento as OrcamentoV3 | undefined;
  const orc = recalcOrcamentoV3({ ...anterior, id: anterior?.id || `orc-${os.id}`, status: anterior?.status || "rascunho", servicos: d.servicos, pecas: d.pecas, desconto: d.desconto, criadoEm: anterior?.criadoEm || agora, atualizadoEm: agora } as OrcamentoV3);
  if (orc.status === "aprovado") {
    const erros = validarSelecaoCompletaV3(orc);
    if (erros) throw new Error(erros);
  }
  return orc;
}

export function previaEdicaoCompletaV3(antes: EdicaoCompletaV3, depois: EdicaoCompletaV3): Array<{ campo: string; antes: unknown; depois: unknown }> {
  const nomes: Record<keyof EdicaoCompletaV3, string> = { cliente: "Cliente / CPF", equipamento: "Equipamento", recepcao: "Recepção", problema: "Problema", observacaoCliente: "Observações", servicos: "Serviços / custo / venda", pecas: "Peças / custo / venda", desconto: "Desconto", pagamento: "Pagamento", garantias: "Garantia" };
  return (Object.keys(nomes) as Array<keyof EdicaoCompletaV3>).filter((k) => serializarEdicaoV3(antes[k]) !== serializarEdicaoV3(depois[k])).map((k) => ({ campo: nomes[k], antes: antes[k], depois: depois[k] }));
}

export function totalEdicaoCompletaV3(d: EdicaoCompletaV3): number {
  return computeTotaisV3(d as unknown as OrcamentoV3).total;
}
