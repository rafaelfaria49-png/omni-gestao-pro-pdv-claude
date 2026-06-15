/**
 * WhatsApp IA — F4 · Resolver de serviço de assistência a partir de texto livre.
 *
 * NÚCLEO PURO: sem rede, sem Prisma. Mapeia a mensagem do cliente para um tipo de serviço
 * canônico (troca de tela, bateria, conector, software, desbloqueio, limpeza, diagnóstico).
 *
 * A ordem de avaliação é por especificidade — sintomas específicos ("não carrega" →
 * conector) vencem o genérico ("não liga" → diagnóstico).
 *
 * Referência: docs/whatsapp/WHATSAPP_IA_ORCAMENTOS_E_CATALOGO_BLUEPRINT.md (§3-B).
 */

export type WhatsAppServiceKey =
  | "TROCA_TELA"
  | "TROCA_BATERIA"
  | "TROCA_CONECTOR"
  | "ATUALIZACAO_SOFTWARE"
  | "DESBLOQUEIO"
  | "LIMPEZA"
  | "DIAGNOSTICO"

export type WhatsAppServiceResolution = {
  /** null quando nenhum serviço é reconhecido. */
  servico: WhatsAppServiceKey | null
  label: string
  /** Tokens para casar com o catálogo `Servico` (nome). */
  catalogTokens: string[]
  /** Tokens da peça correspondente, para buscar `Produto` compatível. Vazio = sem peça. */
  partTokens: string[]
  confidence: number
}

type ServiceDef = {
  key: WhatsAppServiceKey
  label: string
  re: RegExp
  catalogTokens: string[]
  partTokens: string[]
  confidence: number
}

/** Ordem importa: sintoma específico antes do genérico. */
const SERVICE_DEFS: ServiceDef[] = [
  {
    key: "TROCA_CONECTOR",
    label: "Troca de conector de carga",
    re: /conector|nao\s+carrega|nao\s+esta\s+carregando|entrada\s+de\s+carga|porta\s+de\s+carga|flex\s+de\s+carga|nao\s+pega\s+carga/,
    catalogTokens: ["conector", "carga"],
    partTokens: ["conector", "carga"],
    confidence: 0.85,
  },
  {
    key: "TROCA_TELA",
    label: "Troca de tela",
    re: /troc\w*\s+(a\s+)?tela|tela\s+(quebr|trinc|rachad)|display|\btela\b|\bvidro\b|touch/,
    catalogTokens: ["tela", "display"],
    partTokens: ["tela", "display"],
    confidence: 0.85,
  },
  {
    key: "TROCA_BATERIA",
    label: "Troca de bateria",
    re: /bateria|\bpilha\b|nao\s+segura\s+carga|descarrega\s+rapido|vicia(da)?|incha(da|do|ou)?/,
    catalogTokens: ["bateria"],
    partTokens: ["bateria"],
    confidence: 0.85,
  },
  {
    key: "DESBLOQUEIO",
    label: "Desbloqueio",
    re: /desbloque\w*|conta\s+google|\bfrp\b|icloud|esqueci\s+a\s+senha|padrao\s+de\s+desbloqueio|bloqueado\s+por\s+senha/,
    catalogTokens: ["desbloqueio", "conta", "senha"],
    partTokens: [],
    confidence: 0.8,
  },
  {
    key: "LIMPEZA",
    label: "Limpeza / oxidação",
    re: /limpeza|higieniz\w*|caiu\s+n[a']?\s*agua|caiu\s+na\s+agua|molh(ou|ado|ada)|oxida\w*|umidade|tomou\s+chuva|caiu\s+no\s+(mar|vaso|piscina)/,
    catalogTokens: ["limpeza", "oxidacao", "higienizacao"],
    partTokens: [],
    confidence: 0.7,
  },
  {
    key: "ATUALIZACAO_SOFTWARE",
    label: "Atualização de software",
    re: /atualiza\w*|software|sistema\s+operacional|formata\w*|reinstala\w*|firmware|restaura\w*\s+sistema|instalar\s+android|instalar\s+ios/,
    catalogTokens: ["software", "atualizacao", "formatacao", "sistema"],
    partTokens: [],
    confidence: 0.7,
  },
  {
    key: "DIAGNOSTICO",
    label: "Diagnóstico",
    re: /diagnostic\w*|nao\s+liga|nao\s+funciona|nao\s+da\s+sinal|defeito|verificar|analis\w*|reinicia\s+sozinho|esquentando|travando/,
    catalogTokens: ["diagnostico", "analise"],
    partTokens: [],
    confidence: 0.6,
  },
]

const NONE: WhatsAppServiceResolution = {
  servico: null,
  label: "",
  catalogTokens: [],
  partTokens: [],
  confidence: 0,
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
}

/** Resolve o serviço de assistência citado no texto (ou null). */
export function resolveWhatsAppService(text: string): WhatsAppServiceResolution {
  const norm = normalize(text)
  if (!norm) return { ...NONE }

  for (const def of SERVICE_DEFS) {
    if (def.re.test(norm)) {
      return {
        servico: def.key,
        label: def.label,
        catalogTokens: [...def.catalogTokens],
        partTokens: [...def.partTokens],
        confidence: def.confidence,
      }
    }
  }
  return { ...NONE }
}
