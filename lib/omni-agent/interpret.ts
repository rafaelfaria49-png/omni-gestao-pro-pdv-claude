import type { OmniAgentInterpretacao, OmniAgentIntentKind } from "./types"

function extractClienteNome(text: string): string {
  const t = text.trim()
  const m1 = t.match(/(?:para|cliente)\s+([^,\n.]+?)(?:\s+(?:com|—|-|,|\.|$))/i)
  if (m1?.[1]) return m1[1].trim()
  const m2 = t.match(/buscar\s+cliente\s+(.+)/i)
  if (m2?.[1]) return m2[1].trim()
  const m3 = t.match(/cliente\s+([^\n,]+)/i)
  if (m3?.[1]) return m3[1].trim()
  return ""
}

function extractProdutoQuery(text: string): string {
  const t = text.trim()
  const m1 = t.match(/buscar\s+produto\s+(.+)/i)
  if (m1?.[1]) return m1[1].trim()
  const m2 = t.match(/procurar\s+produto\s+(.+)/i)
  if (m2?.[1]) return m2[1].trim()
  const m3 = t.match(/produto\s+(.+)/i)
  if (m3?.[1]) return m3[1].trim()
  return ""
}

function extractDefeito(text: string): string {
  const t = text.toLowerCase()
  if (/sem\s+áudio|sem audio/.test(t)) return "sem áudio"
  if (/tela\s+quebrada|display/.test(t)) return "tela quebrada"
  if (/não\s+carrega|nao carrega|carga/.test(t)) return "defeito de carga"
  if (/defeito\s*[:]\s*(.+)/i.test(text)) {
    const x = text.match(/defeito\s*[:]\s*(.+)/i)
    return (x?.[1] ?? "").trim() || "a definir pelo técnico"
  }
  return "a definir pelo técnico"
}

function extractAparelhoHint(text: string): { marca: string; modelo: string } {
  const t = text
  const iphone = t.match(/iphone\s*(\d+\s*(?:pro\s*max|pro|plus|mini)?)/i)
  if (iphone) return { marca: "Apple", modelo: iphone[0].replace(/\s+/g, " ").trim() }
  const samsung = t.match(/samsung\s+[\w\s]+/i)
  if (samsung) return { marca: "Samsung", modelo: samsung[0].replace(/\s+/g, " ").trim() }
  const moto = t.match(/moto\s*g[\w]*/i)
  if (moto) return { marca: "Motorola", modelo: moto[0].trim() }
  return { marca: "", modelo: "" }
}

export function interpretOmniAgentCommand(text: string): OmniAgentInterpretacao {
  const raw = text.trim()
  const t = raw.toLowerCase()

  if (!raw) {
    return {
      intent: "UNKNOWN",
      action: "Vazio",
      confidence: 0,
      fields: {},
      requiresConfirmation: false,
    }
  }

  if (/(consultar\s+caixa|^caixa$|status\s+do\s+caixa|sess[aã]o\s+de\s+caixa)/i.test(t) || (t.includes("caixa") && /consult|status|abert/.test(t))) {
    return {
      intent: "CASHBOX_QUERY",
      action: "Consultar sessão de caixa",
      confidence: 0.93,
      fields: { periodo: "atual" },
      requiresConfirmation: false,
    }
  }

  if (
    /financeiro\s+hoje|resumo\s+financeiro|mostrar\s+financeiro|indicadores\s+financeiros/i.test(t) ||
    (t.includes("financeiro") && /hoje|resumo|mostrar/.test(t)) ||
    /qual\s+(foi\s+)?(o\s+)?(meu\s+)?faturamento|meu\s+faturamento|faturamento\s+de\s+hoje|faturamento\s+hoje/i.test(t) ||
    (/\b(faturamento|faturei)\b/.test(t) && /\bhoje\b/.test(t))
  ) {
    return {
      intent: "FINANCE_SUMMARY",
      action: "Resumo financeiro (hoje)",
      confidence: 0.9,
      fields: { preset: "hoje" },
      requiresConfirmation: false,
    }
  }

  /** Venda/despesa/entrada ainda sem executor dedicado — fila de confirmação + auditoria após confirmar. */
  if (
    /\bvendi\b/.test(t) ||
    /\bregist(rar)?\s+venda\b/i.test(raw) ||
    /\bgastei\b/.test(t) ||
    (/\bentrada\s+de\b/.test(t) &&
      (/\bestoque\b/.test(t) || /\bpel[ií]cul|\bcapa\b|\bpe[çc]as?\b|\bunidades?\b/i.test(raw)))
  ) {
    return {
      intent: "REMINDER_CREATE",
      action: "Triagem operacional (venda, despesa ou estoque)",
      confidence: /\bvendi\b/.test(t) ? 0.84 : /\bgastei\b/.test(t) ? 0.82 : 0.78,
      fields: { titulo: raw.slice(0, 120), detalhe: raw },
      requiresConfirmation: true,
    }
  }

  if (/buscar\s+cliente|procurar\s+cliente|^cliente\s+/i.test(raw) || (t.startsWith("cliente ") && !/trouxe|trouxeu|deixou/.test(t))) {
    const q = extractClienteNome(raw) || raw.replace(/^cliente\s+/i, "").trim()
    return {
      intent: "CLIENT_SEARCH",
      action: "Buscar cliente",
      confidence: 0.88,
      fields: { query: q || raw },
      requiresConfirmation: false,
    }
  }

  if (/buscar\s+produto|procurar\s+produto|^produto\s+/i.test(raw)) {
    const q = extractProdutoQuery(raw) || raw
    return {
      intent: "PRODUCT_SEARCH",
      action: "Buscar produto",
      confidence: 0.87,
      fields: { query: q },
      requiresConfirmation: false,
    }
  }

  if (/(lembre|lembrar|cobran[cç]a|cobrar)/i.test(t)) {
    return {
      intent: "REMINDER_CREATE",
      action: "Registrar lembrete operacional",
      confidence: 0.86,
      fields: {
        titulo: raw.slice(0, 120),
        detalhe: raw,
      },
      requiresConfirmation: true,
    }
  }

  if (/(abrir\s+os|nova\s+os|criar\s+os|pré[\s-]*os)/i.test(t) || (t.includes("os") && /abrir|nova|criar|defeito|trouxe|sem\s+áudio|tela/.test(t))) {
    const nome = extractClienteNome(raw)
    const { marca, modelo } = extractAparelhoHint(raw)
    const defeito = extractDefeito(raw)
    return {
      intent: "OS_OPEN",
      action: "Abrir ordem de serviço",
      confidence: nome ? 0.88 : 0.72,
      fields: {
        clienteNome: nome,
        marca: marca || "—",
        modelo: modelo || "—",
        defeito,
      },
      requiresConfirmation: true,
    }
  }

  return {
    intent: "REMINDER_CREATE",
    action: "Triagem Inbox (texto não mapeado para ação automática)",
    confidence: 0.35,
    fields: { titulo: `Triagem: ${raw.slice(0, 100)}`, detalhe: raw },
    requiresConfirmation: true,
  }
}

export function intentRequiresConfirmation(intent: OmniAgentIntentKind): boolean {
  return intent === "OS_OPEN" || intent === "REMINDER_CREATE"
}
