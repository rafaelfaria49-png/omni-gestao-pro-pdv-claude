// ============================================================================
// Operações V3/V4 — CORREÇÃO POSTERIOR DE DATAS · planejamento PURO
// (GOAL OPS-DATAS-ENTRADA-ENTREGA-RETROATIVAS-001)
// ----------------------------------------------------------------------------
// Sem I/O. Recebe o payload MAIS RECENTE (lido sob trava pela action) e devolve
// o próximo payload — só os campos de data autorizados mudam; todo o resto
// (pagamentoV3, aPrazoV3, orçamento, recusas terminais, timeline, entrada…)
// é preservado como está. Nunca refaz entrega, cobrança, estoque, WhatsApp
// nem encerramento de retorno: corrigir data não é executar a operação de novo.
//
// Auditoria: um evento `datas_corrigidas` com campos, antes/depois, motivo,
// operador e o horário REAL do servidor. Nenhum evento antigo é reescrito.
//
// Garantia: a da V3 é derivada da entrega (ajusta sozinha). A garantia V2
// (`payload.garantia` / `garantia_ordem_servico`) só é deslocada quando foi
// ancorada na entrega que está sendo corrigida e está ATIVA; encerradas
// (expirada/cancelada) ficam intactas. Retorno aberto "em garantia" que ficaria
// fora do novo período é IMPEDIMENTO — nada é gravado.
// ============================================================================

import type { EventoTimeline } from "@/types/os";
import {
  compararDatasOperacionaisV3,
  diaNaLojaV3,
  erroFatoFuturoV3,
  erroOrdemV3,
  fimDoDiaLojaIsoV3,
  formatarDataOperacionalV3,
  formatarDiaDeIsoNaLojaV3,
  esperadoCampoDataV3,
  lerDatasOSV3,
  limitarFatoAoAgoraV3,
  slaSemPrevisaoV3,
  prazoSlaDaPrevisaoV3,
  validarDatasPropostaV3,
  validarEntradaDataV3,
  diasEntreCivisV3,
  type DataOperacionalLidaV3,
  type DataOperacionalMetaV3,
} from "./datas-operacionais-model";
import { lerGarantiaV3, lerRetornosV3 } from "./pos-venda-model";
import type { OrdemServico } from "@/types/os";

// Valor "visto" para a trava otimista (regra única no módulo de datas).
export { esperadoCampoDataV3 } from "./datas-operacionais-model";

export type CampoCorrecaoDataV3 = "dataEntrada" | "previsaoEntrega" | "dataEntrega" | "dataProposta" | "validoAte";

export const ORDEM_CAMPOS_CORRECAO_V3: CampoCorrecaoDataV3[] = ["dataEntrada", "previsaoEntrega", "dataEntrega", "dataProposta", "validoAte"];
/** Datas que registram FATOS (nunca no futuro). Previsão e validade são promessas. */
const CAMPOS_FATO_V3 = new Set<CampoCorrecaoDataV3>(["dataEntrada", "dataEntrega", "dataProposta"]);

export interface CampoCorrigivelV3 {
  campo: CampoCorrecaoDataV3;
  rotulo: string;
  ajuda: string;
  /** Valor gravado hoje (null = não registrado). */
  atual: DataOperacionalLidaV3 | null;
  /** O que o operador VIU (trava otimista): ISO gravada, ou "" quando ausente. */
  esperado: string;
  permiteHora: boolean;
  /** Só a previsão pode voltar a "não informada". */
  permiteLimpar: boolean;
}

export interface CorrecaoDisponivelV3 {
  campos: CampoCorrigivelV3[];
  atendimentoRapido: boolean;
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function txt(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Datas que esta OS permite corrigir (e o valor que vale como "visto"). */
export function camposCorrigiveisV3(os: unknown, tz?: string): CorrecaoDisponivelV3 {
  const o = obj(os) ?? {};
  const datas = lerDatasOSV3(o, tz);
  const atendimentoRapido = !!obj(o.atendimentoRapidoV3);
  const comercial = obj(o.comercialV4);
  const orcamento = obj(o.orcamento);
  const recepcao = obj(obj(o.aberturaV3)?.recepcao) ?? {};
  const campos: CampoCorrigivelV3[] = [];

  campos.push({
    campo: "dataEntrada",
    rotulo: atendimentoRapido ? "Entrada do atendimento" : "Data de entrada do aparelho",
    ajuda: atendimentoRapido ? "Quando o atendimento começou." : "Quando o aparelho realmente entrou na loja.",
    atual: datas.entrada,
    esperado: esperadoCampoDataV3(txt(recepcao.dataEntrada), datas.entrada?.precisao),
    permiteHora: true,
    permiteLimpar: false,
  });
  if (!atendimentoRapido) {
    campos.push({
      campo: "previsaoEntrega",
      rotulo: "Previsão de entrega",
      ajuda: "Quando você prevê entregar o aparelho ao cliente. Opcional.",
      atual: datas.previsao,
      esperado: datas.previsao ? esperadoCampoDataV3(txt(recepcao.previsaoEntrega), datas.previsao.precisao) : "",
      permiteHora: true,
      permiteLimpar: true,
    });
  }
  if (datas.entrega) {
    campos.push({
      campo: "dataEntrega",
      rotulo: atendimentoRapido ? "Saída do atendimento" : "Data da entrega",
      ajuda: atendimentoRapido ? "Quando o serviço foi concluído e entregue." : "Quando o aparelho foi realmente entregue ao cliente.",
      atual: datas.entrega,
      esperado: esperadoCampoDataV3(datas.entrega.iso, datas.entrega.precisao),
      permiteHora: true,
      permiteLimpar: false,
    });
  }
  if (comercial?.tipo === "orcamento_pre_os") {
    campos.push({
      campo: "dataProposta",
      rotulo: "Data do orçamento",
      ajuda: "Quando a proposta foi feita ao cliente.",
      atual: datas.proposta,
      esperado: datas.proposta ? esperadoCampoDataV3(txt(comercial.dataProposta), datas.proposta.precisao) : "",
      permiteHora: false,
      permiteLimpar: false,
    });
  }
  // Validade: no pré-OS acompanha a data da proposta (qualquer status — a regra
  // "validade ≥ proposta" sempre tem como ser cumprida); no orçamento da própria
  // OS, enquanto ainda pode ser aprovado. É o caminho AUDITADO para renovar uma
  // proposta vencida (nunca o aceite em si).
  const status = txt(orcamento?.status);
  const validoAte = datas.validoAte;
  const preOs = comercial?.tipo === "orcamento_pre_os";
  const emAberto = status === "rascunho" || status === "enviado";
  if (orcamento && orcamento.sintetizado !== true && (preOs || (emAberto && !!validoAte))) {
    campos.push({
      campo: "validoAte",
      rotulo: "Válido até",
      ajuda: "Último dia de validade da proposta.",
      atual: validoAte ? { iso: validoAte, precisao: "dia", dia: diaNaLojaV3(validoAte, tz), origem: "informada" } : null,
      esperado: validoAte,
      permiteHora: false,
      permiteLimpar: false,
    });
  }
  return { campos, atendimentoRapido };
}

// ----------------------------------------------------------------------------
// Planejamento
// ----------------------------------------------------------------------------

export interface NovaDataCorrecaoV3 {
  iso: string;
  meta: DataOperacionalMetaV3;
}

export interface CorrecaoDatasInputV3 {
  /** Só os campos alterados. `null` = limpar (apenas a previsão). */
  alteracoes: Partial<Record<CampoCorrecaoDataV3, NovaDataCorrecaoV3 | null>>;
  /** ISO que o operador viu em cada campo alterado ("" = ausente). */
  esperados: Partial<Record<CampoCorrecaoDataV3, string>>;
  motivo: string;
  /** Confirmação explícita depois de ver o impacto na garantia. */
  confirmarImpactoGarantia?: boolean;
  /** Assinatura do impacto que o operador viu ao confirmar (`ImpactoGarantiaV3.assinatura`). */
  assinaturaImpactoGarantia?: string;
}

/** Linha da garantia operacional (tabela `garantia_ordem_servico`) já lida pela action. */
export interface GarantiaOperacionalLinhaV3 {
  id: string;
  status: string;
  dataInicio: string;
  dataFim: string;
}

export interface DiffCampoDataV3 {
  campo: CampoCorrecaoDataV3;
  rotulo: string;
  antes: string;
  depois: string;
  antesTexto: string;
  depoisTexto: string;
}

export interface ImpactoGarantiaV3 {
  temImpacto: boolean;
  inicioAntes?: string;
  vencimentoAntes?: string;
  inicioDepois?: string;
  vencimentoDepois?: string;
  /** Garantia V2 do payload deslocada junto (estava ancorada nesta entrega). */
  payloadDeslocado: boolean;
  /** Linhas ATIVAS de `garantia_ordem_servico` a deslocar. */
  linhas: Array<{ id: string; dataInicio: string; dataFim: string; dataInicioAntes: string; dataFimAntes: string }>;
  /** Garantias encerradas ancoradas nesta entrega — ficam como estão. */
  encerradasIntocadas: number;
  /**
   * Assinatura do impacto (datas antes/depois + linhas). A confirmação vale só
   * para o impacto exibido: se ele mudar, o servidor pede a confirmação de novo.
   */
  assinatura: string;
}

/** Assinatura determinística de um impacto na garantia (mesma no navegador e no servidor). */
export function assinaturaImpactoGarantiaV3(g: Omit<ImpactoGarantiaV3, "assinatura">): string {
  const linhas = [...g.linhas]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((l) => [l.id, l.dataInicioAntes, l.dataFimAntes, l.dataInicio, l.dataFim]);
  return JSON.stringify([
    g.inicioAntes ?? "",
    g.vencimentoAntes ?? "",
    g.inicioDepois ?? "",
    g.vencimentoDepois ?? "",
    g.payloadDeslocado,
    g.encerradasIntocadas,
    linhas,
  ]);
}

export type ResultadoCorrecaoDatasV3 =
  | { ok: true; next: Record<string, unknown>; diff: DiffCampoDataV3[]; garantia: ImpactoGarantiaV3; evento: EventoTimeline }
  | { ok: false; tipo: "validacao" | "conflito" | "impedimento" | "confirmacao"; mensagem: string; campo?: CampoCorrecaoDataV3; garantia?: ImpactoGarantiaV3 };

export const MOTIVO_MIN_V3 = 3;
export const MOTIVO_MAX_V3 = 300;

function falha(tipo: "validacao" | "conflito" | "impedimento" | "confirmacao", mensagem: string, campo?: CampoCorrecaoDataV3) {
  return { ok: false as const, tipo, mensagem, ...(campo ? { campo } : {}) };
}

function deslocarIso(iso: string, deltaMs: number): string {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t + deltaMs).toISOString() : iso;
}

function mesmaData(a: DataOperacionalLidaV3 | null, b: NovaDataCorrecaoV3 | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.iso === new Date(b.iso).toISOString() && a.precisao === b.meta.precisao && a.dia === b.meta.dia && a.origem === "informada";
}

/**
 * Planeja a correção sobre o payload ATUAL. Não grava nada: devolve o próximo
 * payload + diff + impacto na garantia + evento de auditoria, ou a recusa.
 */
export function planejarCorrecaoDatasV3(
  payload: unknown,
  input: CorrecaoDatasInputV3,
  ctx: {
    agora: Date;
    operador: string;
    operadorId: string;
    garantias?: GarantiaOperacionalLinhaV3[];
    eventoId?: string;
    tz?: string;
    /** Servidor: a confirmação só vale com a assinatura do impacto calculado aqui. */
    exigirAssinaturaGarantia?: boolean;
  },
): ResultadoCorrecaoDatasV3 {
  const base = obj(payload);
  if (!base) return falha("validacao", "OS sem payload compatível.");
  const tz = ctx.tz;
  const agoraIso = ctx.agora.toISOString();

  const motivo = txt(input?.motivo);
  if (motivo.length < MOTIVO_MIN_V3) return falha("validacao", "Informe o motivo da correção (mínimo de 3 caracteres).");
  if (motivo.length > MOTIVO_MAX_V3) return falha("validacao", `O motivo pode ter no máximo ${MOTIVO_MAX_V3} caracteres.`);

  const disponivel = camposCorrigiveisV3(base, tz);
  const porCampo = new Map(disponivel.campos.map((c) => [c.campo, c]));
  const alteracoes = input?.alteracoes ?? {};
  const esperados = input?.esperados ?? {};
  const chaves = ORDEM_CAMPOS_CORRECAO_V3.filter((c) => Object.prototype.hasOwnProperty.call(alteracoes, c));
  if (chaves.length === 0) return falha("validacao", "Nenhuma data foi alterada.");

  // 1) Campo aplicável + trava otimista (o valor que o operador viu ainda é o gravado).
  const novos = new Map<CampoCorrecaoDataV3, { valor: NovaDataCorrecaoV3 | null; lida: DataOperacionalLidaV3 | null }>();
  for (const campo of chaves) {
    const def = porCampo.get(campo);
    if (!def) return falha("validacao", "Esta data não pode ser corrigida nesta OS.", campo);
    const visto = esperados[campo];
    if (typeof visto !== "string" || txt(visto) !== def.esperado) {
      const agoraTexto = formatarDataOperacionalV3(def.atual, tz) || "não registrada";
      return falha("conflito", `${def.rotulo} mudou desde que você abriu a correção (agora: ${agoraTexto}). Reabra a correção e revise.`, campo);
    }
    const valor = alteracoes[campo] ?? null;
    if (valor === null) {
      if (!def.permiteLimpar) return falha("validacao", `Informe a ${def.rotulo.toLowerCase()}.`, campo);
      novos.set(campo, { valor: null, lida: null });
      continue;
    }
    if (!valor.meta) return falha("validacao", `${def.rotulo}: data inválida.`, campo);
    if (campo === "validoAte") {
      if (valor.meta.precisao !== "dia" || fimDoDiaLojaIsoV3(valor.meta.dia, tz) !== txt(valor.iso)) {
        return falha("validacao", `${def.rotulo}: data inválida.`, campo);
      }
      novos.set(campo, { valor, lida: { iso: txt(valor.iso), precisao: "dia", dia: valor.meta.dia, origem: "informada" } });
      continue;
    }
    if (!def.permiteHora && valor.meta.precisao !== "dia") return falha("validacao", `${def.rotulo}: informe só o dia.`, campo);
    const v = validarEntradaDataV3(valor.iso, valor.meta, def.rotulo, tz);
    if (!v.ok) return falha("validacao", v.mensagem, campo);
    if (CAMPOS_FATO_V3.has(campo)) {
      const futura = erroFatoFuturoV3(campo, def.rotulo, v.data, ctx.agora, tz);
      if (futura) return falha("validacao", futura.mensagem, campo);
      // Fato dentro da folga do relógio é gravado no "agora" do servidor — e é esse
      // valor que o diff e a auditoria mostram.
      const g = limitarFatoAoAgoraV3({ iso: v.data.iso, meta: valor.meta }, ctx.agora, tz);
      novos.set(campo, { valor: { iso: g.iso, meta: g.meta ?? valor.meta }, lida: { ...v.data, iso: g.iso, dia: g.meta?.dia ?? v.data.dia } });
      continue;
    }
    novos.set(campo, { valor, lida: v.data });
  }

  // 2) Diff real (campo igual ao gravado não conta).
  const diff: DiffCampoDataV3[] = [];
  for (const [campo, n] of novos) {
    const def = porCampo.get(campo)!;
    if (campo === "validoAte" ? def.atual?.dia === n.lida?.dia : mesmaData(def.atual, n.valor)) continue;
    diff.push({
      campo,
      rotulo: def.rotulo,
      antes: def.atual?.iso ?? "",
      depois: n.lida?.iso ?? "",
      antesTexto: formatarDataOperacionalV3(def.atual, tz) || "não registrada",
      depoisTexto: formatarDataOperacionalV3(n.lida, tz) || "não informada",
    });
  }
  if (diff.length === 0) return falha("validacao", "Nenhuma data foi alterada.");
  const alterados = new Set(diff.map((d) => d.campo));

  // 3) Regras sobre o estado FINAL (novo valor ou o gravado).
  const validoAteGravado = lerDatasOSV3(base, tz).validoAte;
  const valorFinal = (campo: CampoCorrecaoDataV3): DataOperacionalLidaV3 | null => {
    if (novos.has(campo)) return novos.get(campo)!.lida;
    const atual = porCampo.get(campo)?.atual ?? null;
    if (atual || campo !== "validoAte" || !validoAteGravado) return atual;
    // Validade fora dos campos corrigíveis continua valendo nas regras do estado final.
    return { iso: validoAteGravado, precisao: "dia", dia: diaNaLojaV3(validoAteGravado, tz), origem: "informada" };
  };
  const entrada = valorFinal("dataEntrada");
  const previsao = valorFinal("previsaoEntrega");
  const entrega = valorFinal("dataEntrega");
  const proposta = valorFinal("dataProposta");
  const rot = (c: CampoCorrecaoDataV3) => porCampo.get(c)?.rotulo ?? c;

  for (const campo of ["dataEntrada", "dataEntrega", "dataProposta"] as const) {
    if (!alterados.has(campo)) continue;
    const futura = erroFatoFuturoV3(campo, rot(campo), valorFinal(campo), ctx.agora, tz);
    if (futura) return falha("validacao", futura.mensagem, campo);
  }
  if ((alterados.has("dataEntrega") || alterados.has("dataEntrada")) && entrega && entrada && compararDatasOperacionaisV3(entrega, entrada) < 0) {
    if (alterados.has("dataEntrega")) {
      return falha("validacao", `${rot("dataEntrega")} não pode ser anterior à ${rot("dataEntrada").toLowerCase()} (${formatarDataOperacionalV3(entrada, tz)}).`, "dataEntrega");
    }
    return falha("validacao", `${rot("dataEntrada")} não pode ser posterior à ${rot("dataEntrega").toLowerCase()} (${formatarDataOperacionalV3(entrega, tz)}).`, "dataEntrada");
  }
  if ((alterados.has("previsaoEntrega") || alterados.has("dataEntrada")) && previsao && entrada) {
    const ordem = erroOrdemV3("previsaoEntrega", "A previsão de entrega", previsao, "entrada do aparelho", entrada, tz);
    if (ordem) {
      const campo: CampoCorrecaoDataV3 = alterados.has("previsaoEntrega") ? "previsaoEntrega" : "dataEntrada";
      return falha("validacao", campo === "previsaoEntrega" ? ordem.mensagem : `${rot("dataEntrada")} não pode ser posterior à previsão de entrega (${formatarDataOperacionalV3(previsao, tz)}). Ajuste a previsão junto.`, campo);
    }
  }
  if (alterados.has("dataProposta") || alterados.has("validoAte")) {
    const validoAteDia = valorFinal("validoAte")?.dia ?? "";
    if (validoAteDia || alterados.has("validoAte")) {
      const erros = validarDatasPropostaV3({ proposta, validoAteDia }, ctx.agora, tz).filter((e) => e.campo !== "dataProposta" || alterados.has("dataProposta"));
      if (erros.length > 0) return falha("validacao", erros[0]!.mensagem, erros[0]!.campo as CampoCorrecaoDataV3);
    }
  }

  // 4) Próximo payload — só os campos de data (e seus espelhos).
  const next: Record<string, unknown> = { ...base };
  const abertura = { ...(obj(base.aberturaV3) ?? {}) };
  const recepcao = { ...(obj(abertura.recepcao) ?? {}) };
  let mexeuAbertura = false;
  if (alterados.has("dataEntrada")) {
    const n = novos.get("dataEntrada")!.valor!;
    recepcao.dataEntrada = new Date(n.iso).toISOString();
    recepcao.dataEntradaMeta = { ...n.meta };
    mexeuAbertura = true;
  }
  if (alterados.has("previsaoEntrega")) {
    const n = novos.get("previsaoEntrega")!.valor;
    let sla: Record<string, unknown> = { ...(obj(base.sla) ?? {}) };
    if (n) {
      const iso = new Date(n.iso).toISOString();
      recepcao.previsaoEntrega = iso;
      recepcao.previsaoEntregaMeta = { ...n.meta };
      // Só-dia: o SLA vale até o fim do dia prometido (nunca a âncora 12:00).
      sla.prazo = prazoSlaDaPrevisaoV3({ iso, meta: n.meta });
      sla.origemV3 = "informada";
    } else {
      const removida = { iso: txt(recepcao.previsaoEntrega), meta: recepcao.previsaoEntregaMeta as DataOperacionalMetaV3 | undefined };
      delete recepcao.previsaoEntrega;
      delete recepcao.previsaoEntregaMeta;
      // Regra única da remoção: o espelho volta ao prazo interno padrão; prazo próprio fica.
      sla = slaSemPrevisaoV3(sla, removida, base.criadoEm);
    }
    next.sla = sla;
    mexeuAbertura = true;
  }
  if (mexeuAbertura) {
    abertura.recepcao = recepcao;
    next.aberturaV3 = abertura;
  }

  const garantia: ImpactoGarantiaV3 = { temImpacto: false, payloadDeslocado: false, linhas: [], encerradasIntocadas: 0, assinatura: "" };
  if (alterados.has("dataEntrega")) {
    const n = novos.get("dataEntrega")!.valor!;
    const antes = porCampo.get("dataEntrega")!.atual!;
    const iso = new Date(n.iso).toISOString();
    const deltaMs = Date.parse(iso) - Date.parse(antes.iso);
    const entregaV3 = obj(base.entregaV3);
    // Entrega legada sem o bloco V3: materializa o mínimo para a precisão não se
    // perder na releitura (sem inventar `registradoEm`).
    next.entregaV3 = { ...(entregaV3 ?? {}), entregueEm: iso, entregueEmMeta: { ...n.meta } };
    next.entregueEm = iso;
    const retirada = obj(base.retirada);
    if (retirada && txt(retirada.retiradoEm)) next.retirada = { ...retirada, retiradoEm: iso };
    const atendimento = obj(base.atendimentoRapidoV3);
    if (atendimento) next.atendimentoRapidoV3 = { ...atendimento, concluidoEm: iso, concluidoEmMeta: { ...n.meta } };

    // Garantia V2 ancorada nesta entrega (mesmo instante) — desloca junto, preservando o prazo.
    const g2 = obj(base.garantia);
    if (g2 && g2.ativa === true && Date.parse(txt(g2.inicioEm)) === Date.parse(antes.iso)) {
      next.garantia = { ...g2, inicioEm: deslocarIso(txt(g2.inicioEm), deltaMs), ...(txt(g2.fimEm) ? { fimEm: deslocarIso(txt(g2.fimEm), deltaMs) } : {}) };
      garantia.payloadDeslocado = true;
    }
    for (const linha of ctx.garantias ?? []) {
      if (Date.parse(linha.dataInicio) !== Date.parse(antes.iso)) continue;
      if (linha.status !== "ativa") {
        garantia.encerradasIntocadas += 1;
        continue;
      }
      garantia.linhas.push({
        id: linha.id,
        dataInicioAntes: linha.dataInicio,
        dataFimAntes: linha.dataFim,
        dataInicio: deslocarIso(linha.dataInicio, deltaMs),
        dataFim: deslocarIso(linha.dataFim, deltaMs),
      });
    }

    // Visão V3 (derivada da entrega) antes/depois — é o que o operador confirma.
    const g3Antes = lerGarantiaV3(base as unknown as OrdemServico, ctx.agora);
    const g3Depois = lerGarantiaV3(next as unknown as OrdemServico, ctx.agora);
    if (g3Antes.temGarantia && !g3Antes.semCobertura) {
      garantia.inicioAntes = g3Antes.inicio;
      garantia.vencimentoAntes = g3Antes.vencimento;
      garantia.inicioDepois = g3Depois.inicio;
      garantia.vencimentoDepois = g3Depois.vencimento;
    }
    garantia.temImpacto =
      garantia.payloadDeslocado ||
      garantia.linhas.length > 0 ||
      (!!garantia.inicioAntes && (garantia.inicioAntes !== garantia.inicioDepois || garantia.vencimentoAntes !== garantia.vencimentoDepois));
    garantia.assinatura = assinaturaImpactoGarantiaV3(garantia);

    // Garantia VENCIDA nunca volta a valer por correção de data: estender cobertura
    // é decisão comercial (editor de garantia), não correção de cadastro. Vale para
    // a visão V3, a garantia V2 do payload e cada linha real deslocada.
    const agoraMs = ctx.agora.getTime();
    const coberturas: Array<{ fimAntes: string | undefined; fimDepois: string | undefined }> = [];
    if (g3Antes.temGarantia && !g3Antes.semCobertura) coberturas.push({ fimAntes: g3Antes.vencimento, fimDepois: g3Depois.vencimento });
    if (garantia.payloadDeslocado) coberturas.push({ fimAntes: txt(obj(base.garantia)?.fimEm) || undefined, fimDepois: txt(obj(next.garantia)?.fimEm) || undefined });
    for (const l of garantia.linhas) coberturas.push({ fimAntes: l.dataFimAntes, fimDepois: l.dataFim });
    const reativada = coberturas.find((c) => {
      const a = Date.parse(c.fimAntes ?? "");
      const d = Date.parse(c.fimDepois ?? "");
      return Number.isFinite(a) && Number.isFinite(d) && a < agoraMs && d >= agoraMs;
    });
    if (reativada) {
      return {
        ok: false,
        tipo: "impedimento",
        campo: "dataEntrega",
        garantia,
        mensagem:
          `A garantia desta entrega venceu em ${formatarDiaDeIsoNaLojaV3(reativada.fimAntes, tz)} e voltaria a valer até ` +
          `${formatarDiaDeIsoNaLojaV3(reativada.fimDepois, tz)} com a nova data. Ajuste a garantia pelo editor de garantia, se for o caso. ` +
          `A correção não foi aplicada.`,
      };
    }

    // Retorno registrado "com garantia ativa" que ficaria fora do novo período → impedimento.
    // Vale para TODA cobertura que se move com a entrega: a visão V3 (derivada) e
    // cada linha ativa real de `garantia_ordem_servico` deslocada (com o prazo dela,
    // que pode divergir do payload). Cobertura que já não incluía o retorno não piora.
    const janelas: Array<{ antes: [number, number] | null; depois: [number, number]; inicioIso: string; fimIso: string }> = [];
    if (g3Depois.temGarantia && !g3Depois.semCobertura && g3Depois.inicio && g3Depois.vencimento) {
      janelas.push({
        antes: garantia.inicioAntes && garantia.vencimentoAntes ? [Date.parse(garantia.inicioAntes), Date.parse(garantia.vencimentoAntes)] : null,
        depois: [Date.parse(g3Depois.inicio), Date.parse(g3Depois.vencimento)],
        inicioIso: g3Depois.inicio,
        fimIso: g3Depois.vencimento,
      });
    }
    for (const l of garantia.linhas) {
      janelas.push({
        antes: [Date.parse(l.dataInicioAntes), Date.parse(l.dataFimAntes)],
        depois: [Date.parse(l.dataInicio), Date.parse(l.dataFim)],
        inicioIso: l.dataInicio,
        fimIso: l.dataFim,
      });
    }
    const dentro = (t: number, j: [number, number] | null) => !!j && t >= j[0] && t <= j[1];
    for (const r of lerRetornosV3(base as unknown as OrdemServico)) {
      if (r.garantiaAtivaNaAbertura !== true) continue;
      const t = Date.parse(r.criadoEm);
      if (!Number.isFinite(t)) continue;
      // Sem janela "antes" conhecida (visão V3 sem cobertura prévia), qualquer saída conta.
      const perdida = janelas.find((j) => !dentro(t, j.depois) && (j.antes === null || dentro(t, j.antes)));
      if (!perdida) continue;
      return {
        ok: false,
        tipo: "impedimento",
        campo: "dataEntrega",
        garantia,
        mensagem:
          `O retorno aberto em ${formatarDiaDeIsoNaLojaV3(r.criadoEm, tz)} foi registrado com garantia ativa e ficaria fora do novo período ` +
          `(${formatarDiaDeIsoNaLojaV3(perdida.inicioIso, tz)} a ${formatarDiaDeIsoNaLojaV3(perdida.fimIso, tz)}). A correção não foi aplicada.`,
      };
    }
    if (garantia.temImpacto) {
      const confirmou = input.confirmarImpactoGarantia === true;
      // No servidor a confirmação fica presa ao impacto exibido: linhas ou datas
      // diferentes (outra operação no meio, ou linhas que a prévia não via) → nova prévia.
      const mesmoImpacto = !ctx.exigirAssinaturaGarantia || input.assinaturaImpactoGarantia === garantia.assinatura;
      if (!confirmou || !mesmoImpacto) {
        return {
          ok: false,
          tipo: "confirmacao",
          campo: "dataEntrega",
          garantia,
          mensagem: confirmou
            ? "O impacto na garantia mudou desde a sua confirmação. Confira o impacto atualizado e confirme de novo."
            : "Confira o impacto na garantia e confirme antes de salvar.",
        };
      }
    }
  }

  if (alterados.has("dataProposta") || alterados.has("validoAte")) {
    const comercial = { ...(obj(base.comercialV4) ?? {}) };
    if (alterados.has("dataProposta")) {
      const n = novos.get("dataProposta")!.valor!;
      comercial.dataProposta = new Date(n.iso).toISOString();
      comercial.dataPropostaMeta = { ...n.meta };
    }
    if (alterados.has("validoAte")) {
      const n = novos.get("validoAte")!.valor!;
      next.orcamento = { ...(obj(base.orcamento) ?? {}), validoAte: txt(n.iso) };
    }
    const propostaDia = valorFinal("dataProposta")?.dia;
    const validoDia = valorFinal("validoAte")?.dia;
    if (propostaDia && validoDia) comercial.validadeDias = Math.max(0, diasEntreCivisV3(propostaDia, validoDia));
    // Orçamento da própria OS (sem registro comercial): não cria `comercialV4` vazio.
    if (obj(base.comercialV4) || alterados.has("dataProposta")) next.comercialV4 = comercial;
  }

  const evento: EventoTimeline = {
    id: ctx.eventoId ?? `ev_datas_${Date.parse(agoraIso)}`,
    tipo: "observacao",
    autor: ctx.operador,
    autorTipo: "usuario",
    conteudo: `Datas corrigidas: ${diff.map((d) => `${d.rotulo} ${d.antesTexto} → ${d.depoisTexto}`).join("; ")}. Motivo: ${motivo}`,
    metadata: {
      evento: "datas_corrigidas",
      motivo,
      operadorId: ctx.operadorId,
      campos: diff.map((d) => ({ campo: d.campo, antes: d.antes, depois: d.depois })),
      ...(alterados.has("dataEntrega")
        ? {
            garantia: {
              inicioAntes: garantia.inicioAntes ?? null,
              vencimentoAntes: garantia.vencimentoAntes ?? null,
              inicioDepois: garantia.inicioDepois ?? null,
              vencimentoDepois: garantia.vencimentoDepois ?? null,
              payloadDeslocado: garantia.payloadDeslocado,
              linhasAtualizadas: garantia.linhas.map((l) => l.id),
              encerradasIntocadas: garantia.encerradasIntocadas,
            },
          }
        : {}),
    },
    criadoEm: agoraIso,
  };
  const timeline = Array.isArray(base.timeline) ? (base.timeline as EventoTimeline[]) : [];
  next.timeline = [...timeline, evento];
  next.atualizadoEm = agoraIso;

  return { ok: true, next, diff, garantia, evento };
}
