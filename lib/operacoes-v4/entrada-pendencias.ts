// ============================================================================
// Operações V4 — Pendências de entrada (GOAL OPS-V4-ORC-COMPLETAR-ENTRADA-027;
// classificação honesta em OPS-V4-FLUXO-CURTO-004)
// ----------------------------------------------------------------------------
// Módulo PURO (sem I/O, sem React). Deriva, 100% a partir da OS real, o estado
// de cada bloco de complementação da Entrada: `registrado`, `falta_complementar`
// ou `opcional`. NÃO cria contrato novo, NÃO inventa estado: cada sinal é lido
// de um campo/evento que só existe depois de uma action V3 já existente.
//
// Fonte de cada item (contrato V3 já wired na V4):
//   • dados-basicos ← lerDadosBasicosV3(os).recebidoPor            · salvarDadosBasicosOSV3
//   • identificacao ← lerProvaEntradaV3(os).identificacao + equipamento · salvarIdentificacaoV3
//   • acesso        ← credenciais persistidas (ou senha da abertura)   · salvarProvaEntradaV3 — opcional
//   • acessorios    ← evento acessorio_registrado (inclusive presentes = 0)
//                     ou item presente (abertura/salvo)                 · salvarAcessoriosEntradaV3
//   • estado-fisico ← evento prova_entrada_* cujas `fatias` incluem estado
//                     físico/avarias (evento legado sem `fatias` mantém o
//                     significado anterior) ou valor não padrão persistido · salvarProvaEntradaV3
//   • checklist     ← os.checklist (bruto, não o reader com default)    · salvarChecklistEntradaV3
//   • fotos         ← lerProvaEntradaV3(os).fotos                       · adicionarFotoEntradaV3 — opcional
//   • assinatura    ← lerProvaEntradaV3(os).assinaturaCliente           · salvarAssinaturaClienteV3 — opcional
//
// `provaEntradaCriadaV3` NÃO serve de sinal de estado físico conferido: qualquer
// escrita da prova (acessórios, identificação, fotos, assinatura) materializa o
// estado padrão "ok" (ver `persistirPatchProva`). Por isso o estado físico só
// conta como registrado com evento da prova que levou estado/avarias, ou com
// valor que só um salvamento real produz (componente não íntegro, observação,
// avaria).
//
// `checklist` também não pode usar `lerChecklistEntradaV3` (o reader): ele
// sempre devolve a lista padrão com "não testado" quando `os.checklist` está
// vazio. O sinal honesto é o campo bruto da OS.
// ============================================================================

import type { OrdemServico } from "@/types/os";
import { lerDadosBasicosV3 } from "@/lib/operacoes-v3/dados-basicos-model";
import { lerProvaEntradaV3, provaEntradaCriadaV3 } from "@/lib/operacoes-v3/prova-entrada-model";

/** Classificação honesta: opcional nunca é erro nem obrigação. */
export type EstadoPendenciaEntradaV4 = "registrado" | "falta_complementar" | "opcional";

export type ChavePendenciaEntradaV4 =
  | "dados-basicos"
  | "identificacao"
  | "acesso"
  | "acessorios"
  | "estado-fisico"
  | "checklist"
  | "fotos"
  | "assinatura";

export interface PendenciaEntradaV4 {
  /** Identificador estável do bloco — usado pela UI para localizar o card real. */
  chave: ChavePendenciaEntradaV4;
  rotulo: string;
  /** true = existe dado real persistido no servidor para o bloco. */
  preenchido: boolean;
  /** Todos os blocos têm contrato V3 real de escrita (mantido por compatibilidade). */
  temContrato: boolean;
  /** Complemento que nunca vira pendência obrigatória (fotos, assinatura, acesso). */
  opcional: boolean;
  estado: EstadoPendenciaEntradaV4;
  /** Resumo curto do registro real (ex.: "Nenhum acessório recebido"). */
  detalhe?: string;
}

/** Eventos da prova de entrada que carregam estado físico/avarias/credenciais. */
const EVENTOS_PROVA = new Set(["prova_entrada_criada", "prova_entrada_atualizada"]);

function algumaStringPreenchida(valores: (string | undefined)[]): boolean {
  return valores.some((v) => typeof v === "string" && v.trim() !== "");
}

/** Metadados dos eventos da timeline com `metadata.evento` em `nomes`. */
function metadadosEventos(os: OrdemServico, nomes: Set<string>): Record<string, unknown>[] {
  const timeline = (os as unknown as { timeline?: unknown }).timeline;
  if (!Array.isArray(timeline)) return [];
  const out: Record<string, unknown>[] = [];
  for (const ev of timeline) {
    const metadata = (ev as { metadata?: unknown } | null)?.metadata;
    if (!metadata || typeof metadata !== "object") continue;
    const nome = (metadata as { evento?: unknown }).evento;
    if (typeof nome === "string" && nomes.has(nome)) out.push(metadata as Record<string, unknown>);
  }
  return out;
}

/**
 * Estado físico registrado por salvamento real (H do GOAL 004). Evento da prova
 * com `fatias` (desde o GOAL 004) só conta se levou estado físico ou avarias;
 * evento legado sem `fatias` mantém o significado anterior (sem reclassificar).
 */
export function estadoFisicoRegistradoV4(os: OrdemServico | null | undefined): boolean {
  if (!os) return false;
  const porEvento = metadadosEventos(os, EVENTOS_PROVA).some((m) => {
    if (!Array.isArray(m.fatias)) return true;
    return m.fatias.includes("estadoFisico") || m.fatias.includes("avarias");
  });
  if (porEvento) return true;
  if (!provaEntradaCriadaV3(os)) return false;
  const prova = lerProvaEntradaV3(os);
  return prova.avarias.length > 0 || prova.estadoFisico.some((e) => e.status !== "ok" || Boolean(e.obs));
}

function estadoDe(preenchido: boolean, opcional: boolean): EstadoPendenciaEntradaV4 {
  if (preenchido) return "registrado";
  return opcional ? "opcional" : "falta_complementar";
}

function item(
  chave: ChavePendenciaEntradaV4,
  rotulo: string,
  preenchido: boolean,
  opcional: boolean,
  detalhe?: string,
): PendenciaEntradaV4 {
  return { chave, rotulo, preenchido, temContrato: true, opcional, estado: estadoDe(preenchido, opcional), detalhe };
}

/**
 * Deriva a lista de pendências de entrada da OS real, na ordem dos grupos
 * (Recepção, Segurança, Inspeção, Evidências). Nunca fabrica dado: sem OS real,
 * lista vazia.
 */
export function derivarPendenciasEntradaV4(os: OrdemServico | null | undefined): PendenciaEntradaV4[] {
  if (!os) return [];

  const dadosBasicos = lerDadosBasicosV3(os);
  const prova = lerProvaEntradaV3(os);
  const checklistRaw = (os as unknown as { checklist?: unknown }).checklist;
  const checklistSalvo = Array.isArray(checklistRaw) && checklistRaw.length > 0;
  const eq = os.equipamento;
  const identificacaoPreenchida = algumaStringPreenchida([
    prova.identificacao.imei,
    prova.identificacao.serial,
    prova.identificacao.operadora,
    prova.identificacao.modelo,
    prova.identificacao.cor,
    eq?.modelo,
    eq?.numeroSerie,
  ]);
  const cred = prova.credenciais ?? {};
  const acessoRegistrado =
    algumaStringPreenchida([cred.pin, cred.senha, cred.contaGoogle, cred.contaApple]) ||
    typeof cred.faceId === "boolean" ||
    typeof cred.biometria === "boolean";
  const presentes = (prova.acessorios ?? []).filter((a) => a.presente === true).length;
  const acessorioRegistrado = metadadosEventos(os, new Set(["acessorio_registrado"])).length > 0;
  const fotos = prova.fotos ?? [];
  const assinada = Boolean(prova.assinaturaCliente?.dataUrl);

  const recebidoPor = dadosBasicos.recebidoPor.trim();
  return [
    item("dados-basicos", "Dados básicos da recepção", recebidoPor !== "", false,
      recebidoPor ? `Recebido por ${recebidoPor}` : "Falta informar quem recebeu"),
    item("identificacao", "Identificação do aparelho", identificacaoPreenchida, false),
    item("acesso", "Acesso ao aparelho", acessoRegistrado, true),
    item("acessorios", "Acessórios recebidos", presentes > 0 || acessorioRegistrado, false,
      presentes > 0
        ? `${presentes} ${presentes === 1 ? "item recebido" : "itens recebidos"}`
        : acessorioRegistrado
          ? "Nenhum acessório recebido"
          : undefined),
    item("estado-fisico", "Estado físico e avarias", estadoFisicoRegistradoV4(os), false),
    item("checklist", "Checklist do aparelho", checklistSalvo, false),
    item("fotos", "Fotos da entrada", fotos.length > 0, true,
      fotos.length > 0 ? `${fotos.length} ${fotos.length === 1 ? "foto" : "fotos"}` : undefined),
    item("assinatura", "Assinatura do cliente", assinada, true),
  ];
}

/** Progresso honesto: só conta complementos não opcionais (fotos/assinatura/acesso nunca entram). */
export function progressoPendenciasEntradaV4(pendencias: PendenciaEntradaV4[]): { preenchidos: number; total: number } {
  const acionaveis = pendencias.filter((p) => p.temContrato && !p.opcional);
  return { preenchidos: acionaveis.filter((p) => p.preenchido).length, total: acionaveis.length };
}
