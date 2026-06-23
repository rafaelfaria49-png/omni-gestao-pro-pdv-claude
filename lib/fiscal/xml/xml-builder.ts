/**
 * XML Builder oficial da NFC-e (GOAL_009) — PURO e DETERMINÍSTICO.
 *
 * Constrói o XML da NFC-e a partir EXCLUSIVAMENTE da NotaFiscal congelada (cabeçalho +
 * snapshots emitente/destinatário/pagamento + itens). Garantias:
 *  - DORMENTE: não assina, não transmite, não gera DANFE/QRCode, não acessa SEFAZ.
 *  - Sem dado vivo: nunca lê Produto/Cliente/Venda/Loja — só a entrada congelada.
 *  - DETERMINÍSTICO: mesmo snapshot → mesmo XML. Sem Date.now, sem aleatoriedade, sem
 *    iteração dependente de ordem de inserção (itens ordenados por numeroItem; pagamentos
 *    ordenados por código). Campos ainda não disponíveis ficam VAZIOS (não inventados).
 *
 * NÃO faz parte desta fase: chave de acesso, cDV, assinatura, QR Code, protocolo SEFAZ.
 * Esses campos saem vazios de propósito (preenchidos no preparo de transmissão, fora daqui).
 */
import {
  ambienteToTpAmb,
  escapeXml,
  extrairPagamentos,
  leaf,
  modeloToMod,
  money,
  node,
  num,
  onlyDigits,
  optLeaf,
  qty,
  s,
  ufToCodigo,
  unit,
  xmlHash,
} from "./xml-utils"
import type { NfceXmlInput, NfceXmlItem, NfceXmlResult } from "./xml-types"
import type { SnapshotDestinatario, SnapshotEmitente } from "../venda-fiscal-snapshot"

const NFE_NS = "http://www.portalfiscal.inf.br/nfe"
const INF_NFE_VERSAO = "4.00"

/** Código numérico da nota (`cNF`) — determinístico a partir do número alocado (NÃO é o aleatório real). */
function codigoNumerico(numero: number | null): string {
  if (numero == null || !Number.isFinite(numero)) return ""
  return String(Math.abs(Math.trunc(numero))).padStart(8, "0")
}

/** Data/hora de emissão CONGELADA: header → venda → geradoEm. Nunca usa o relógio. */
function resolveDhEmi(input: NfceXmlInput): string {
  return s(input.nota.dhEmi) || s(input.pagamento?.venda?.data) || s(input.pagamento?.geradoEm) || ""
}

// ── Blocos ──────────────────────────────────────────────────────────────────────────────

function buildIde(input: NfceXmlInput): string {
  const { nota, emitente } = input
  return node(
    "ide",
    leaf("cUF", ufToCodigo(emitente.endereco?.uf)) +
      leaf("cNF", codigoNumerico(nota.numero)) +
      leaf("natOp", s(nota.naturezaOperacao) || "VENDA") +
      leaf("mod", modeloToMod(nota.modelo)) +
      leaf("serie", nota.serie == null ? "" : String(nota.serie)) +
      leaf("nNF", nota.numero == null ? "" : String(nota.numero)) +
      leaf("dhEmi", resolveDhEmi(input)) +
      leaf("tpNF", "1") + // 1 = saída
      leaf("idDest", "1") + // 1 = operação interna
      leaf("cMunFG", onlyDigits(emitente.endereco?.codigoMunicipioIbge)) +
      leaf("tpImp", "4") + // 4 = DANFE NFC-e
      leaf("tpEmis", "1") + // 1 = normal
      leaf("cDV", "") + // preenchido no preparo da transmissão (fora desta fase)
      leaf("tpAmb", ambienteToTpAmb(nota.ambiente)) +
      leaf("finNFe", "1") + // 1 = normal
      leaf("indFinal", "1") + // 1 = consumidor final
      leaf("indPres", "1"), // 1 = presencial
  )
}

function buildEmit(emit: SnapshotEmitente): string {
  const end = emit.endereco ?? ({} as SnapshotEmitente["endereco"])
  const ender = node(
    "enderEmit",
    leaf("xLgr", end.logradouro) +
      leaf("nro", end.numero) +
      optLeaf("xCpl", end.complemento) +
      leaf("xBairro", end.bairro) +
      leaf("cMun", onlyDigits(end.codigoMunicipioIbge)) +
      leaf("xMun", end.municipio) +
      leaf("UF", s(end.uf).toUpperCase()) +
      leaf("CEP", onlyDigits(end.cep)) +
      leaf("cPais", onlyDigits(end.codigoPais) || "1058") +
      leaf("xPais", "BRASIL") +
      optLeaf("fone", onlyDigits(emit.fone)),
  )
  return node(
    "emit",
    leaf("CNPJ", onlyDigits(emit.cnpj)) +
      leaf("xNome", emit.razaoSocial) +
      optLeaf("xFant", emit.nomeFantasia) +
      ender +
      leaf("IE", onlyDigits(emit.inscricaoEstadual)) +
      leaf("CRT", emit.crt ? String(emit.crt) : ""),
  )
}

/** `dest` só existe para destinatário identificado (CPF/CNPJ). Consumidor final → omitido. */
function buildDest(dest: SnapshotDestinatario | null): string {
  if (!dest || dest.tipo === "consumidor_final") return ""
  const doc = onlyDigits(dest.documento)
  if (!doc) return ""
  const docNode = dest.documentoTipo === "CNPJ" ? leaf("CNPJ", doc) : leaf("CPF", doc)
  return node(
    "dest",
    docNode +
      optLeaf("xNome", dest.nome) +
      leaf("indIEDest", "9"), // 9 = não contribuinte
  )
}

function buildDetItem(item: NfceXmlItem): string {
  const ean = s(item.gtin) || "SEM GTIN"
  const origem = onlyDigits(String(item.origemMercadoria ?? "")) || s(item.origemMercadoria)
  const vProd = item.valorBruto != null ? num(item.valorBruto) : num(item.quantidade) * num(item.valorUnitario)

  const prod = node(
    "prod",
    leaf("cProd", item.codigoProduto) +
      leaf("cEAN", ean) +
      leaf("xProd", item.descricao) +
      leaf("NCM", onlyDigits(item.ncm)) +
      optLeaf("CEST", onlyDigits(item.cest)) +
      leaf("CFOP", onlyDigits(item.cfop)) +
      leaf("uCom", s(item.unidadeComercial) || "UN") +
      leaf("qCom", qty(item.quantidade)) +
      leaf("vUnCom", unit(item.valorUnitario)) +
      leaf("vProd", money(vProd)) +
      leaf("cEANTrib", ean) +
      leaf("uTrib", s(item.unidadeComercial) || "UN") +
      leaf("qTrib", qty(item.quantidade)) +
      leaf("vUnTrib", unit(item.valorUnitario)) +
      optLeaf("vDesc", num(item.valorDesconto) > 0 ? money(item.valorDesconto) : "") +
      leaf("indTot", "1"),
  )

  // ICMS: CSOSN (Simples Nacional) quando presente; senão CST; orig sempre. Campos vazios são permitidos.
  const csosn = onlyDigits(item.csosn)
  const cst = onlyDigits(item.cst)
  const icmsInner = csosn
    ? node("ICMSSN102", leaf("orig", origem) + leaf("CSOSN", csosn))
    : node("ICMS00", leaf("orig", origem) + leaf("CST", cst))
  const imposto = node("imposto", node("ICMS", icmsInner))

  return `<det nItem="${escapeXml(item.numeroItem)}">${prod}${imposto}</det>`
}

function buildDet(itens: NfceXmlItem[]): string {
  // Ordem DETERMINÍSTICA por numeroItem (independe da ordem de entrada).
  const ordenados = [...itens].sort((a, b) => num(a.numeroItem) - num(b.numeroItem))
  return ordenados.map(buildDetItem).join("")
}

function buildTotal(input: NfceXmlInput): string {
  const itens = input.itens
  const vProd = itens.reduce(
    (acc, it) => acc + (it.valorBruto != null ? num(it.valorBruto) : num(it.quantidade) * num(it.valorUnitario)),
    0,
  )
  const vDesc = num(input.nota.valorDesconto)
  const vNF = num(input.nota.valorTotal)
  const vFrete = num(input.nota.valorFrete)
  const vTotTrib = num(input.nota.valorTotalTributos)
  return node(
    "total",
    node(
      "ICMSTot",
      leaf("vBC", money(0)) +
        leaf("vICMS", money(0)) +
        leaf("vProd", money(vProd)) +
        leaf("vDesc", money(vDesc)) +
        leaf("vFrete", money(vFrete)) +
        leaf("vNF", money(vNF)) +
        leaf("vTotTrib", money(vTotTrib)),
    ),
  )
}

function buildTransp(): string {
  // 9 = sem ocorrência de transporte (padrão NFC-e).
  return node("transp", leaf("modFrete", "9"))
}

function buildPag(input: NfceXmlInput): string {
  const linhas = extrairPagamentos(input.pagamento, num(input.nota.valorTotal))
  const detPag = linhas.map((l) => node("detPag", leaf("tPag", l.tPag) + leaf("vPag", money(l.vPag)))).join("")
  return node("pag", detPag)
}

function buildInfAdic(): string {
  // Bloco presente mesmo sem conteúdo (campos podem ficar vazios nesta fase).
  return node("infAdic", "")
}

// ── Builder canônico ─────────────────────────────────────────────────────────────────────

/**
 * Constrói o XML determinístico da NFC-e a partir da NotaFiscal congelada.
 * Retorna o XML compacto e seu hash interno (FNV-1a) para verificação/testes.
 */
export function buildNfceXml(input: NfceXmlInput): NfceXmlResult {
  const infNFeInner =
    buildIde(input) +
    buildEmit(input.emitente) +
    buildDest(input.destinatario) +
    buildDet(input.itens) +
    buildTotal(input) +
    buildTransp() +
    buildPag(input) +
    buildInfAdic()

  // Id da infNFe = "NFe"+chave (44 dígitos) — vazio nesta fase (gerado no preparo de transmissão).
  const infNFe = `<infNFe versao="${INF_NFE_VERSAO}" Id="">${infNFeInner}</infNFe>`
  const xml = `<?xml version="1.0" encoding="UTF-8"?><NFe xmlns="${NFE_NS}">${infNFe}</NFe>`

  return { xml, hash: xmlHash(xml) }
}
