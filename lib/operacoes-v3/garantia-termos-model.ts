/** Versões imutáveis do conteúdo emitido. Não copia a OS nem dados internos. */
import type { OrdemServico } from "@/types/os";
import type { EmpresaPrintV3, TermoGarantiaDocV3 } from "./print-model";
import { gravarCoberturasGarantiaV3, lerCoberturasGarantiaV3, objetoGarantiaV3, termoCoberturaServicoV3, type CoberturaServicoV3 } from "./garantia-servicos-model";
import { diaNaLojaV3, fimDoDiaLojaIsoV3, lerDatasOSV3 } from "./datas-operacionais-model";

export type TipoVersaoGarantiaV3 = "original" | "aditivo" | "correcao_data" | "reemissao_legado";
export interface TermoGarantiaVersaoV3 {
  versao: number;
  tipo: TipoVersaoGarantiaV3;
  emitidoEm: string;
  operadorId: string;
  operador: string;
  motivo: string;
  origem: string;
  marcoOriginal: string;
  documento: TermoGarantiaDocV3;
}
const s = (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : "não informado";
export function lerVersoesTermoGarantiaV3(os: unknown): TermoGarantiaVersaoV3[] {
  const value = objetoGarantiaV3(os).termosGarantiaV3;
  return Array.isArray(value) ? value as TermoGarantiaVersaoV3[] : [];
}
export function empresaSnapshotGarantiaV3(loja: unknown, settings?: unknown): EmpresaPrintV3 {
  const l = objetoGarantiaV3(loja), e = objetoGarantiaV3(l.address), c = objetoGarantiaV3(settings);
  return {
    nome: s(l.name), cnpj: s(l.cnpj), endereco: [e.rua ?? e.street, e.numero ?? e.number, e.bairro ?? e.neighborhood].filter(Boolean).join(", ") || "não informado",
    cidadeUf: [e.cidade ?? e.city, e.estado ?? e.state, e.cep ?? e.zipCode].filter(Boolean).join(" / ") || "não informado",
    telefone: s(l.phone || c.contactWhatsapp), email: s(c.contactEmail), logoUrl: "", responsavel: "não informado", temDados: !!l.name,
  };
}
export function datasCoberturaGarantiaV3(os: unknown, c: CoberturaServicoV3): { inicio?: string; vencimento?: string; porDia?: boolean } {
  const p = objetoGarantiaV3(os), e = objetoGarantiaV3(p.entregaV3), r = objetoGarantiaV3(p.retirada);
  const inicio = c.inicioOriginal || (typeof e.entregueEm === "string" ? e.entregueEm : typeof p.entregueEm === "string" ? p.entregueEm : typeof r.retiradoEm === "string" ? r.retiradoEm : undefined);
  if (!inicio || !Number.isFinite(Date.parse(inicio))) return {};
  const d = new Date(Date.parse(inicio) + c.prazoDias * 86400000);
  if (!Number.isFinite(d.getTime())) throw new Error("Prazo incompatível com a data da entrega.");
  const entrega = lerDatasOSV3(os).entrega;
  const porDia = entrega?.precisao === "dia" && Date.parse(entrega.iso) === Date.parse(inicio);
  const vencimento = c.vencimentoOriginal || (c.prazoDias > 0 ? porDia ? fimDoDiaLojaIsoV3(diaNaLojaV3(d.toISOString())) : d.toISOString() : undefined);
  return { inicio, ...(vencimento ? { vencimento } : {}), ...(porDia ? { porDia: true } : {}) };
}
export function adicionarVersaoTermoGarantiaV3<T extends object>(os: T, input: {
  tipo: TipoVersaoGarantiaV3; agora: string; operadorId: string; operador: string; motivo: string; origem: string; empresa?: EmpresaPrintV3;
}): T {
  const anteriores = lerVersoesTermoGarantiaV3(os), anterior = anteriores.at(-1);
  if (input.tipo === "original" && anteriores.length) return os;
  const p = objetoGarantiaV3(os), cliente = objetoGarantiaV3(p.cliente), equipamento = objetoGarantiaV3(p.equipamento);
  let coberturas = lerCoberturasGarantiaV3(os);
  if (!coberturas.length) {
    const gp = objetoGarantiaV3(objetoGarantiaV3(p.aberturaV3).garantiaPrevista);
    if (typeof gp.modelo === "string") coberturas = [{ linhaId: "legado-os", descricao: "Serviço registrado na OS", modeloId: gp.modelo, prazoDias: typeof gp.prazoDias === "number" ? gp.prazoDias : 0, ...(typeof gp.termo === "string" ? { termoCustom: gp.termo } : {}), origem: "legado" }];
    else {
      const g = objetoGarantiaV3(p.garantia), operacionais = Array.isArray(p.garantiasOperacionais) ? p.garantiasOperacionais : [];
      const op = objetoGarantiaV3(operacionais[0]);
      if (g.fimEm || g.inicioEm || g.ativa || op.id) {
        const dias = typeof g.prazoDias === "number" ? g.prazoDias : typeof op.prazoDias === "number" ? op.prazoDias : 0;
        coberturas = [{ linhaId: typeof op.id === "string" ? op.id : "legado-os", descricao: "Serviço registrado na garantia legada", modeloId: dias > 0 ? "personalizado" : "sem_garantia", prazoDias: dias, origem: "legado",
          ...(g.termo || op.cobertura ? { termoCustom: String(g.termo || op.cobertura) } : {}),
          ...(g.inicioEm || op.dataInicio ? { inicioOriginal: String(g.inicioEm || op.dataInicio) } : {}),
          ...(g.fimEm || op.dataFim ? { vencimentoOriginal: String(g.fimEm || op.dataFim) } : {}),
        }];
      }
    }
  }
  // Correção de data usa o conteúdo da versão anterior, inclusive textos e empresa.
  const linhas = input.tipo === "correcao_data" && anterior ? (anterior.documento.coberturas ?? []).map((c) => {
    const atual = coberturas.find((l) => l.linhaId === c.linhaId);
    return atual ? { ...c, ...(atual.inicioOriginal ? { inicioOriginal: atual.inicioOriginal } : {}), ...(atual.vencimentoOriginal ? { vencimentoOriginal: atual.vencimentoOriginal } : {}) } : c;
  }) : coberturas.map((c) => {
    const previa = anterior?.documento.coberturas?.find((p) => p.linhaId === c.linhaId);
    const mesmoTexto = previa?.modeloId === c.modeloId && (previa.termoCustom ?? "") === (c.termoCustom ?? "");
    return { ...c, termo: mesmoTexto ? { ...previa!.termo, ...(c.prazoDias ? { prazoDias: c.prazoDias } : {}) } : termoCoberturaServicoV3(c) };
  });
  const emitidas = linhas.map((c) => ({ ...c, ...datasCoberturaGarantiaV3(os, c) }));
  const documento: TermoGarantiaDocV3 = input.tipo === "correcao_data" && anterior
    ? { ...anterior.documento, impressoEm: input.agora, coberturas: emitidas }
    : {
        empresa: anterior?.documento.empresa ?? input.empresa ?? empresaSnapshotGarantiaV3(null), numero: s(p.codigo), impressoEm: input.agora,
        cliente: anterior?.documento.cliente ?? { nome: s(cliente.nome), telefone: s(cliente.telefone || cliente.whatsapp), documento: s(cliente.documento), email: s(cliente.email) },
        equipamento: anterior?.documento.equipamento ?? { marca: s(equipamento.marca), modelo: s(equipamento.modelo), numeroSerie: s(equipamento.numeroSerie || equipamento.imei) },
        servicoRealizado: emitidas.map((c) => c.descricao),
        termo: emitidas.length === 1 ? emitidas[0].termo : { modeloId: "por_servico", titulo: "Garantia por serviço", semCobertura: false, cobertura: [], exclusoes: [] },
        coberturas: emitidas, instrucoes: "Para atendimento, informe a OS e o serviço executado à assistência.", origemTexto: "garantia-catalogo/v3; textos existentes preservados",
        ...(emitidas.some((c) => c.termoCustom) ? { revisaoJuridica: "Texto personalizado pendente de revisão jurídica." } : {}),
      };
  if (input.tipo === "reemissao_legado" && !emitidas.length) documento.instrucoes = "Reemissão legada: os dados disponíveis não identificam coberturas por serviço. O registro anterior está preservado; nenhuma cobertura é presumida neste documento.";
  const versao: TermoGarantiaVersaoV3 = {
    versao: anteriores.length + 1, tipo: input.tipo, emitidoEm: input.agora, operadorId: input.operadorId, operador: input.operador, motivo: input.motivo, origem: input.origem,
    marcoOriginal: anterior?.marcoOriginal ?? emitidas[0]?.inicio ?? input.agora,
    documento: { ...documento, versao: anteriores.length + 1, tipoVersao: input.tipo },
  };
  // Cópia serializável: consumidores não podem alterar a referência da versão anterior.
  const base = input.tipo === "reemissao_legado" && coberturas.length ? gravarCoberturasGarantiaV3(os, coberturas) : os;
  return { ...base, termosGarantiaV3: [...anteriores, JSON.parse(JSON.stringify(versao))] };
}
export function documentoGarantiaEmitidoV3(os: OrdemServico, versao?: number): TermoGarantiaDocV3 | null {
  const todas = lerVersoesTermoGarantiaV3(os);
  const v = versao === undefined ? todas.at(-1) : todas.find((x) => x.versao === versao);
  return v ? JSON.parse(JSON.stringify(v.documento)) as TermoGarantiaDocV3 : null;
}
