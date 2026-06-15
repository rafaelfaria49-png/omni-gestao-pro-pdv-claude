/**
 * WhatsApp IA — F2 · Classificador de intenção do inbound (ASSISTIDO).
 *
 * NÚCLEO PURO: sem rede, sem Prisma, sem env, sem efeito colateral. Determinístico e
 * testável. Roda no servidor OU no cliente (heurística sobre o texto recebido).
 *
 * Garantias inegociáveis desta fase:
 *  - `requiresHumanApproval` é SEMPRE `true`.
 *  - `safeToAutoSend` é SEMPRE `false` (nunca habilita envio automático nesta fase).
 *  - As respostas sugeridas são genéricas e seguras: NÃO prometem preço, estoque nem prazo.
 *  - FORNECEDOR_COTACAO só é detectado quando há contexto interno explícito
 *    (`context.isSupplierConversation`) — nunca inferido de uma mensagem de cliente.
 *
 * Referência: docs/whatsapp/WHATSAPP_IA_ORCAMENTOS_E_CATALOGO_BLUEPRINT.md (§3).
 */

export type WhatsAppIntentKind =
  | "CONSULTA_PRODUTO_ESTOQUE"
  | "ORCAMENTO_ASSISTENCIA"
  | "STATUS_OS"
  | "GARANTIA"
  | "FINANCEIRO_CLIENTE"
  | "FORNECEDOR_COTACAO"
  | "OUTRO"

export type WhatsAppIntentEntities = {
  termoProduto?: string
  categoria?: string
  modeloAparelho?: string
  marca?: string
  servico?: string
  peca?: string
  aparelhoTexto?: string
  telefone?: string
  nome?: string
  possivelCodigoOS?: string
  contextoGarantia?: string
  tipoSolicitacaoFinanceira?: string
}

export type WhatsAppIntentContext = {
  /** Cliente já vinculado à conversa (CRM). */
  hasCliente?: boolean
  /**
   * Conversa marcada internamente como sendo com FORNECEDOR (não cliente final).
   * Único gatilho permitido para FORNECEDOR_COTACAO nesta fase.
   */
  isSupplierConversation?: boolean
}

export type WhatsAppIntentInput = {
  text: string
  storeId?: string
  phone?: string
  context?: WhatsAppIntentContext
}

export type WhatsAppIntentClassification = {
  intent: WhatsAppIntentKind
  /** 0..1 */
  confidence: number
  entities: WhatsAppIntentEntities
  suggestedAction: string
  suggestedReply: string
  requiresHumanApproval: true
  safeToAutoSend: false
}

export const INTENT_LABEL_PT: Record<WhatsAppIntentKind, string> = {
  CONSULTA_PRODUTO_ESTOQUE: "Produto",
  ORCAMENTO_ASSISTENCIA: "Orçamento",
  STATUS_OS: "Status OS",
  GARANTIA: "Garantia",
  FINANCEIRO_CLIENTE: "Financeiro",
  FORNECEDOR_COTACAO: "Cotação",
  OUTRO: "Outro",
}

/** Respostas sugeridas — seguras, sem preço/estoque/prazo. */
const SUGGESTED_REPLY: Record<WhatsAppIntentKind, string> = {
  CONSULTA_PRODUTO_ESTOQUE:
    "Vou verificar a disponibilidade desse produto para você. Só um momento.",
  ORCAMENTO_ASSISTENCIA:
    "Vou verificar o valor da peça e do serviço para te passar um orçamento certinho.",
  STATUS_OS: "Vou consultar o status da sua ordem de serviço.",
  GARANTIA: "Vou verificar sua garantia pelo histórico da ordem de serviço.",
  FINANCEIRO_CLIENTE: "Vou consultar as informações de pagamento com segurança.",
  FORNECEDOR_COTACAO:
    "Conversa identificada como cotação com fornecedor — tratar internamente.",
  OUTRO: "Recebemos sua mensagem. Um atendente vai te responder em instantes.",
}

/** Ação sugerida ao operador (não é mensagem ao cliente). */
const SUGGESTED_ACTION: Record<WhatsAppIntentKind, string> = {
  CONSULTA_PRODUTO_ESTOQUE:
    "Consultar catálogo/estoque do produto e confirmar disponibilidade antes de responder.",
  ORCAMENTO_ASSISTENCIA:
    "Levantar custo de peça + mão de obra e montar orçamento — sem prometer valor agora.",
  STATUS_OS: "Localizar a OS do cliente e confirmar o status real antes de responder.",
  GARANTIA: "Conferir garantia da OS/peça no histórico antes de responder.",
  FINANCEIRO_CLIENTE: "Consultar títulos/parcelas do cliente com segurança (sem expor terceiros).",
  FORNECEDOR_COTACAO: "Tratar como cotação interna — nunca expor dados do cliente final.",
  OUTRO: "Encaminhar para atendente humano.",
}

// ─── Normalização ──────────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
}

// ─── Extratores de entidade (heurística) ─────────────────────────────────────────

function extractAparelho(norm: string): { marca: string; modelo: string; aparelhoTexto: string } | null {
  const iphone = norm.match(/iphone\s*(\d{1,2})?\s*(pro\s*max|pro|plus|mini|se)?/)
  if (iphone) {
    const modelo = iphone[0].replace(/\s+/g, " ").trim()
    return { marca: "Apple", modelo, aparelhoTexto: modelo }
  }
  const moto = norm.match(/moto(rola)?\s*([a-z])?\s*\d{0,3}\w*/)
  if (moto && /moto/.test(moto[0])) {
    const modelo = moto[0].replace(/\s+/g, " ").trim()
    return { marca: "Motorola", modelo, aparelhoTexto: modelo }
  }
  const xiaomi = norm.match(/(redmi|xiaomi|poco)\s*\w*\s*\d{0,3}\w*/)
  if (xiaomi) {
    const modelo = xiaomi[0].replace(/\s+/g, " ").trim()
    return { marca: "Xiaomi", modelo, aparelhoTexto: modelo }
  }
  const samsung = norm.match(/(samsung\s+)?(galaxy\s+)?([asjm])\s?\d{2,3}\w*/)
  if (samsung && (/samsung|galaxy/.test(samsung[0]) || /\b[asjm]\d{2}/.test(samsung[0].replace(/\s/g, "")))) {
    const modelo = samsung[0].replace(/\s+/g, " ").trim()
    return { marca: "Samsung", modelo, aparelhoTexto: modelo }
  }
  return null
}

const PART_RE =
  /tela|bateria|conector\s+de\s+carga|conector|placa|display|vidro|touch|alto[\s-]?falante|microfone|fonte|botao|camera|cabo\s+flex|flex/

function extractPeca(norm: string): string {
  const m = norm.match(PART_RE)
  if (!m) return ""
  const raw = m[0]
  if (/conector/.test(raw)) return "conector de carga"
  return raw.replace(/\s+/g, " ").trim()
}

const CATEGORIA_HINTS: [RegExp, string][] = [
  [/carregador|fonte\s+de\s+energia|adaptador|cabo(?!\s+flex)/, "carregadores e cabos"],
  [/capinha|capa|case/, "capas"],
  [/pelicula|vidro\s+temperado/, "peliculas"],
  [/fone|headset|earbud|airpod/, "fones"],
  [/suporte|tripe|cabo\s+aux/, "acessorios"],
  [/copo|mamadeira|brinquedo|infantil|mochila/, "infantil/utilidades"],
]

const PRODUCT_NOUN_RE =
  /carregador|cabo|capinha|capa\b|case\b|pelicula|fone|headset|suporte|tripe|copo|mamadeira|brinquedo|mochila|adaptador|fonte|airpod|earbud|powerbank|power\s*bank|memoria|cart[ãa]o\s+de\s+memoria/

function extractTermoProduto(norm: string): string {
  const m = norm.match(
    /(?:voce\s+tem|voces\s+tem|tem\s+ai|tem|vende[m]?|trabalham\s+com|chegou)\s+(.+?)\s*[?.!]*$/
  )
  if (m?.[1]) {
    return m[1].replace(/\s+/g, " ").trim()
  }
  const noun = norm.match(PRODUCT_NOUN_RE)
  return noun ? noun[0] : ""
}

function extractCategoria(norm: string): string {
  for (const [re, cat] of CATEGORIA_HINTS) {
    if (re.test(norm)) return cat
  }
  return ""
}

function extractCodigoOS(norm: string): string {
  const m = norm.match(/os\s*#?\s*(\d{1,8})/) ?? norm.match(/n[º°o.]+\s*(\d{2,8})/)
  return m?.[1] ?? ""
}

function extractNome(original: string): string {
  const m =
    original.match(/meu\s+nome\s+(?:e|é)\s+([^,.\n?!]{2,40})/i) ??
    original.match(/aqui\s+(?:e|é)\s+(?:o|a)?\s*([^,.\n?!]{2,40})/i) ??
    original.match(/sou\s+(?:o|a)\s+([^,.\n?!]{2,40})/i)
  return m?.[1]?.trim() ?? ""
}

// ─── Classificador ───────────────────────────────────────────────────────────────

const FIN_RE =
  /\bpix\b|boleto|\bparcela(s|do)?\b|vencid|fatura|crediario|\bdebito\b|\bdivida\b|quanto\s+(eu\s+)?devo|quanto\s+falta|falta\s+pagar|em\s+aberto|saldo\s+devedor|forma[s]?\s+de\s+pagamento|posso\s+pagar|consigo\s+pagar/

const GARANTIA_RE =
  /\bgarantia\b|garantido|na\s+garantia|cobertura|deu\s+problema\s+de\s+novo|voltou\s+(o\s+)?(mesmo\s+)?(defeito|problema)|de\s+novo\s+com\s+(defeito|problema)|mesmo\s+problema\s+de\s+novo|parou\s+de\s+novo|estragou\s+de\s+novo/

const STATUS_RE =
  /minha\s+os|ordem\s+de\s+servi|os\s*#?\s*\d+|ficou\s+pront|esta\s+pront|ta\s+pront|ja\s+(ficou|terminou|consertou|esta|ta)\b|terminou\s+o\s+conserto|como\s+(esta|anda)\s+(meu|o\s+meu|a\s+minha)|previsao\s+de\s+entrega|quando\s+(fica|vai\s+ficar)\s+pront|andamento|ja\s+posso\s+(buscar|retirar|pegar)|meu\s+(celular|aparelho|telefone)\s+(ficou|esta|ta)|ja\s+esta\s+pronto/

const SERVICE_VERB_RE =
  /troc(a|ar|o)\b|conser(to|tar|ta)|arrum(a|ar|o)|repar(a|ar|o)|or[çc]amento|orcamento|formata(r|cao)|desbloque|instala(r|cao)|limpeza/

const PRICE_PHRASE_RE =
  /quanto\s+(fica|custa|sai|e|vou\s+pagar|fica\s+pra|fica\s+para)|qual\s+(o\s+)?valor|valor\s+(de|da|do)|por\s+quanto/

const AVAILABILITY_RE =
  /\btem\b|voces?\s+tem|tem\s+ai|disponivel|em\s+estoque|vende[m]?|trabalham\s+com|chegou\s+\w/

function result(
  intent: WhatsAppIntentKind,
  confidence: number,
  entities: WhatsAppIntentEntities
): WhatsAppIntentClassification {
  return {
    intent,
    confidence: Math.min(1, Math.max(0, Number(confidence.toFixed(2)))),
    entities,
    suggestedAction: SUGGESTED_ACTION[intent],
    suggestedReply: SUGGESTED_REPLY[intent],
    requiresHumanApproval: true,
    safeToAutoSend: false,
  }
}

/**
 * Classifica a intenção de uma mensagem recebida. Sempre retorna um rascunho
 * para aprovação humana — nunca habilita envio automático.
 */
export function classifyWhatsAppIntent(
  input: WhatsAppIntentInput
): WhatsAppIntentClassification {
  const original = (input.text ?? "").trim()
  const norm = normalize(original)
  const phone = (input.phone ?? "").replace(/\D/g, "")

  if (!norm) {
    return result("OUTRO", 0.2, {})
  }

  // 1) FORNECEDOR_COTACAO — somente com contexto interno explícito.
  if (input.context?.isSupplierConversation) {
    const aparelho = extractAparelho(norm)
    return result("FORNECEDOR_COTACAO", 0.7, {
      peca: extractPeca(norm) || undefined,
      modeloAparelho: aparelho?.modelo,
      marca: aparelho?.marca,
    })
  }

  // 2) FINANCEIRO_CLIENTE — pagamento/dívida (não é preço de reparo).
  if (FIN_RE.test(norm)) {
    let tipo = "geral"
    if (/\bpix\b|boleto|forma[s]?\s+de\s+pagamento|posso\s+pagar|consigo\s+pagar|cart[ãa]o/.test(norm)) {
      tipo = "forma_pagamento"
    } else if (
      /falta\s+pagar|quanto\s+(eu\s+)?devo|quanto\s+falta|saldo\s+devedor|em\s+aberto|parcela|vencid|fatura|divida/.test(
        norm
      )
    ) {
      tipo = "saldo_aberto"
    }
    return result("FINANCEIRO_CLIENTE", 0.85, { tipoSolicitacaoFinanceira: tipo })
  }

  // 3) GARANTIA — antes de status/orçamento (palavra distintiva).
  if (GARANTIA_RE.test(norm)) {
    const aparelho = extractAparelho(norm)
    const reincidencia = /de\s+novo|voltou|novamente|outra\s+vez|mesmo\s+problema/.test(norm)
    return result("GARANTIA", 0.85, {
      peca: extractPeca(norm) || undefined,
      servico: extractPeca(norm) || undefined,
      aparelhoTexto: aparelho?.aparelhoTexto,
      marca: aparelho?.marca,
      contextoGarantia: reincidencia ? "reincidencia" : "consulta",
    })
  }

  // 4) STATUS_OS — status de OS/reparo existente.
  if (STATUS_RE.test(norm)) {
    const entities: WhatsAppIntentEntities = {}
    const codigo = extractCodigoOS(norm)
    if (codigo) entities.possivelCodigoOS = codigo
    if (phone) entities.telefone = phone
    const nome = extractNome(original)
    if (nome) entities.nome = nome
    return result("STATUS_OS", 0.85, entities)
  }

  // 5) ORCAMENTO_ASSISTENCIA — reparo (verbo de serviço + peça/aparelho/preço).
  const hasServiceVerb = SERVICE_VERB_RE.test(norm)
  const hasPrice = PRICE_PHRASE_RE.test(norm)
  const peca = extractPeca(norm)
  const aparelho = extractAparelho(norm)
  if ((hasServiceVerb && (peca || aparelho || hasPrice)) || (hasPrice && (peca || hasServiceVerb))) {
    const servicoBase =
      hasServiceVerb && peca
        ? `serviço em ${peca}`
        : hasServiceVerb
          ? "serviço de assistência"
          : peca
            ? `serviço em ${peca}`
            : "serviço de assistência"
    const confidence = hasServiceVerb && (peca || aparelho) ? 0.88 : 0.78
    return result("ORCAMENTO_ASSISTENCIA", confidence, {
      servico: servicoBase,
      peca: peca || undefined,
      marca: aparelho?.marca,
      modeloAparelho: aparelho?.modelo,
      aparelhoTexto: aparelho?.aparelhoTexto,
    })
  }

  // 6) CONSULTA_PRODUTO_ESTOQUE — disponibilidade de produto.
  const hasAvailability = AVAILABILITY_RE.test(norm)
  const hasProductNoun = PRODUCT_NOUN_RE.test(norm)
  if (hasAvailability || (hasPrice && hasProductNoun)) {
    const termo = extractTermoProduto(norm)
    const aparelhoP = extractAparelho(norm)
    const confidence = hasProductNoun ? 0.8 : termo ? 0.66 : 0.55
    return result("CONSULTA_PRODUTO_ESTOQUE", confidence, {
      termoProduto: termo || undefined,
      categoria: extractCategoria(norm) || undefined,
      modeloAparelho: aparelhoP?.modelo,
      marca: aparelhoP?.marca,
    })
  }

  // 7) OUTRO — fallback seguro (baixa confiança → revisar).
  return result("OUTRO", 0.3, {})
}
