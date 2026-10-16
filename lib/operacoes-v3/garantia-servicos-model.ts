/** Coberturas aditivas no JSON da OS; identidade é a linha aprovada, nunca o catálogo. */
import type { OrdemServico } from "@/types/os";
import { GARANTIA_CATALOGO_V3, garantiaCatalogoV3, gerarTermoGarantiaV3, type TermoGarantiaV3 } from "./garantia-textos";

type Obj = Record<string, unknown>;
export const objetoGarantiaV3 = (v: unknown): Obj => v && typeof v === "object" && !Array.isArray(v) ? v as Obj : {};
const texto = (v: unknown) => typeof v === "string" ? v.trim() : "";
const lista = (v: unknown): Obj[] => Array.isArray(v) ? v.map(objetoGarantiaV3) : [];
export interface CoberturaServicoV3 {
  linhaId: string;
  descricao: string;
  modeloId: string;
  prazoDias: number;
  termoCustom?: string;
  origem: "servico" | "variante" | "legado" | "edicao";
  /** Marco comprovado de garantia legada, preservado numa reemissão explícita. */
  inicioOriginal?: string;
  vencimentoOriginal?: string;
}
export interface CoberturaServicoViewV3 extends CoberturaServicoV3 {
  termo: TermoGarantiaV3;
  inicio?: string;
  vencimento?: string;
  porDia?: boolean;
  situacao: "nenhuma" | "prevista" | "ativa" | "vencida" | "sem_garantia";
}
export function modeloGarantiaConhecidoV3(id: string): boolean {
  return GARANTIA_CATALOGO_V3.some((m) => m.id === id);
}
export function validarPrazoGarantiaServicoV3(modeloId: string, prazo?: number): number {
  if (!modeloGarantiaConhecidoV3(modeloId)) throw new Error("Modelo de garantia desconhecido. Confirme um modelo válido.");
  const m = garantiaCatalogoV3(modeloId);
  if (m.semCobertura) return 0;
  const n = prazo ?? m.prazoDiasPadrao;
  if (!Number.isSafeInteger(n) || n <= 0 || !Number.isFinite(new Date(Date.now() + n * 86400000).getTime())) {
    throw new Error("Prazo de garantia deve ser um inteiro positivo compatível com as datas do sistema.");
  }
  return n;
}
/** Só linhas aprovadas, visíveis ao cliente; opções não escolhidas não existem aqui. */
export function servicosAprovadosGarantiaV3(os: unknown): Obj[] {
  const p = objetoGarantiaV3(os), orc = objetoGarantiaV3(p.orcamento);
  if (orc.status !== "aprovado") return [];
  return [...lista(orc.servicos), ...lista(orc.pecas).filter((l) => l.selecionadaV3 === true && typeof objetoGarantiaV3(l.varianteV3).garantiaDias === "number")].filter((l) => texto(l.id) && l.kindV3 !== "interno" && (!texto(l.grupoId) || l.selecionadaV3 === true));
}
/** Deriva padrões de snapshots estruturados. Descrição livre nunca escolhe modelo. */
export function padroesGarantiaServicosV3(os: unknown): CoberturaServicoV3[] {
  const p = objetoGarantiaV3(os), abertura = objetoGarantiaV3(p.aberturaV3), gp = objetoGarantiaV3(abertura.garantiaPrevista);
  const linhas = servicosAprovadosGarantiaV3(p);
  return linhas.map((l) => {
    const v = objetoGarantiaV3(l.varianteV3);
    const singular = linhas.length === 1;
    const prazo = typeof v.garantiaDias === "number" ? v.garantiaDias : typeof l.prazoGarantiaDias === "number" ? l.prazoGarantiaDias : singular && typeof gp.prazoDias === "number" ? gp.prazoDias : undefined;
    const modeloId = texto(l.garantiaModeloId) || (singular ? texto(gp.modelo) : "") || (prazo === 0 ? "sem_garantia" : prazo === undefined ? "nao_definida" : "personalizado");
    const conhecido = modeloGarantiaConhecidoV3(modeloId);
    return {
      linhaId: texto(l.id), descricao: texto(l.descricao) || texto(l.nome) || "Serviço não informado", modeloId,
      prazoDias: conhecido ? garantiaCatalogoV3(modeloId).semCobertura ? 0 : prazo ?? garantiaCatalogoV3(modeloId).prazoDiasPadrao : prazo ?? 0,
      ...(texto(l.termoGarantia) || (singular && texto(gp.termo)) ? { termoCustom: texto(l.termoGarantia) || texto(gp.termo) } : {}),
      origem: typeof v.garantiaDias === "number" ? "variante" : "servico",
    };
  });
}
export function lerCoberturasGarantiaV3(os: unknown): CoberturaServicoV3[] {
  const p = objetoGarantiaV3(os), a = objetoGarantiaV3(p.aberturaV3);
  const salvas = lista(a.garantiasServicosV3) as unknown as CoberturaServicoV3[];
  const padroes = padroesGarantiaServicosV3(p);
  if (padroes.length) return padroes.map((d) => salvas.find((c) => c.linhaId === d.linhaId) ?? d);
  // Snapshot emitido ou garantia manual de OS legada sem orçamento estruturado.
  if (salvas.length && !objetoGarantiaV3(p.orcamento).status) return salvas;
  return [];
}
export function condicaoUnicaGarantiaV3(coberturas: CoberturaServicoV3[]): CoberturaServicoV3 | null {
  const primeira = coberturas[0];
  return primeira && coberturas.every((c) => c.modeloId === primeira.modeloId && c.prazoDias === primeira.prazoDias && (c.termoCustom ?? "") === (primeira.termoCustom ?? "") && (c.inicioOriginal ?? "") === (primeira.inicioOriginal ?? "") && (c.vencimentoOriginal ?? "") === (primeira.vencimentoOriginal ?? "")) ? primeira : null;
}
export function gravarCoberturasGarantiaV3<T extends object>(os: T, coberturas: CoberturaServicoV3[]): T {
  const a = { ...objetoGarantiaV3(objetoGarantiaV3(os).aberturaV3), garantiasServicosV3: coberturas } as Obj;
  const unica = condicaoUnicaGarantiaV3(coberturas);
  if (unica) a.garantiaPrevista = { modelo: unica.modeloId, label: garantiaCatalogoV3(unica.modeloId).titulo, prazoDias: unica.prazoDias, ...(unica.termoCustom ? { termo: unica.termoCustom } : {}) };
  else delete a.garantiaPrevista;
  return { ...os, aberturaV3: a };
}
export function assinaturaGarantiasServicosV3(os: unknown): string {
  const p = objetoGarantiaV3(os);
  const coberturas = lerCoberturasGarantiaV3(p).slice().sort((a,b) => a.linhaId.localeCompare(b.linhaId));
  return JSON.stringify([coberturas, lista(p.termosGarantiaV3).length, objetoGarantiaV3(p.entregaV3).entregueEm ?? p.entregueEm ?? null,
    coberturas.length ? null : objetoGarantiaV3(p.aberturaV3).garantiaPrevista ?? p.garantia ?? null]);
}
export function termoCoberturaServicoV3(c: CoberturaServicoV3): TermoGarantiaV3 {
  if (!modeloGarantiaConhecidoV3(c.modeloId)) return { modeloId: c.modeloId, titulo: "Condição legada — modelo não identificado", prazoDias: c.prazoDias || undefined, semCobertura: c.modeloId !== "nao_definida" && c.prazoDias === 0, cobertura: c.termoCustom ? [c.termoCustom] : [], exclusoes: [], observacao: "Condições legadas preservadas; confirme antes de emitir." };
  return gerarTermoGarantiaV3({ modeloId: c.modeloId, prazoDias: c.prazoDias, termoCustom: c.termoCustom });
}
export function comPadroesGarantiaServicosV3(os: OrdemServico): OrdemServico {
  const coberturas = lerCoberturasGarantiaV3(os);
  return coberturas.length ? gravarCoberturasGarantiaV3(os, coberturas) : os;
}
