import {
  CONSENTIMENTO_WHATSAPP_VERSAO,
  type CodigoPareamentoGerado,
  type EstadoVinculoWhatsApp,
  type ResultadoAcaoVinculo,
  type SituacaoVinculoWhatsAppDados,
  type WhatsAppPairingActions,
} from "./contracts"

const E164_RE = /^\+[1-9][0-9]{7,14}$/

/**
 * Normaliza entrada de telefone digitada pelo usuário mantendo o padrão E.164
 * exigido por `lib/gestor-money-assistente/whatsapp/vinculo.ts` (`+5511999990000`).
 */
export function normalizarTelefoneE164(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ""
  const hasPlus = trimmed.startsWith("+")
  const digits = trimmed.replace(/\D/g, "")
  if (!digits) return hasPlus ? "+" : ""
  // Não inventar código de país: exige `+` explícito para evitar transformar `11999990000` em `+11999990000`.
  return hasPlus ? `+${digits}` : digits
}

export function validarTelefoneE164(telefone: string): boolean {
  return E164_RE.test(telefone.trim())
}

export function mascararTelefonePreview(e164: string): string {
  return "+" + "*".repeat(Math.max(4, Math.min(11, e164.length - 5))) + e164.slice(-4)
}

/**
 * Calcula a contagem regressiva mm:ss até `expiraEmIso` sem alterar o relógio do servidor.
 * A autoridade definitiva de expiração permanece no banco via `situacaoVinculoWhatsApp`.
 */
export function calcularContagemRegressiva(
  expiraEmIso: string | null | undefined,
  agoraMs = Date.now()
): { restanteSegundos: number; formatado: string; expirado: boolean } {
  if (!expiraEmIso) {
    return { restanteSegundos: 0, formatado: "00:00", expirado: true }
  }
  const alvo = Date.parse(expiraEmIso)
  if (!Number.isFinite(alvo)) {
    return { restanteSegundos: 0, formatado: "00:00", expirado: true }
  }
  const diffMs = alvo - agoraMs
  if (diffMs <= 0) {
    return { restanteSegundos: 0, formatado: "00:00", expirado: true }
  }
  const totalSeg = Math.ceil(diffMs / 1000)
  const min = Math.floor(totalSeg / 60)
  const seg = totalSeg % 60
  return {
    restanteSegundos: totalSeg,
    formatado: `${String(min).padStart(2, "0")}:${String(seg).padStart(2, "0")}`,
    expirado: false,
  }
}

/** Fallback fail-closed quando as Server Actions reais não foram injetadas ou o canal está desligado. */
export function createUnavailableWhatsAppPairingActions(
  mensagem = "Indisponível."
): WhatsAppPairingActions {
  return {
    async gerarCodigo() {
      return { ok: false, erro: mensagem }
    },
    async consultarSituacao() {
      return { ok: false, erro: mensagem }
    },
    async cancelarPareamento() {
      return { ok: false, erro: mensagem }
    },
    async revogarVinculo() {
      return { ok: false, erro: mensagem }
    },
  }
}

export interface SyntheticWhatsAppPairingController extends WhatsAppPairingActions {
  /** Simula confirmação do código no WhatsApp (exclusivo para preview sintético / testes UI). */
  simularConfirmacaoWhatsApp(codigoDigitado: string): { ok: boolean; mensagem: string }
  /** Simula expiração do desafio pendente. */
  simularExpiracao(): void
}

/**
 * Adaptador sintético isolado exclusivamente para `/gestor-money/preview` e testes de UI.
 * Espelha integralmente o contrato de `CONTRATOS_PAREAMENTO_PR418.md` sem tocar banco ou Meta.
 */
export function createSyntheticWhatsAppPairingActions(opcoes?: {
  estadoInicial?: EstadoVinculoWhatsApp
  numeroAssistente?: string | null
  telefoneVinculadoInicial?: string
  telefonesDeOutrasContas?: string[]
}): SyntheticWhatsAppPairingController {
  const numeroAssistente =
    opcoes?.numeroAssistente !== undefined ? opcoes.numeroAssistente : "+5511999990001"
  const telefonesOutrasContas = new Set(opcoes?.telefonesDeOutrasContas ?? [])

  let vinculado: { telefoneE164: string; telefoneMascarado: string; desde: string } | null =
    opcoes?.estadoInicial === "VINCULADO"
      ? {
          telefoneE164: opcoes.telefoneVinculadoInicial ?? "+5511988887777",
          telefoneMascarado: mascararTelefonePreview(opcoes.telefoneVinculadoInicial ?? "+5511988887777"),
          desde: new Date().toISOString(),
        }
      : null

  let pendente: {
    telefoneE164: string
    telefoneMascarado: string
    codigo: string
    expiraEm: string
    tentativasRestantes: number
  } | null = null

  let ultimoEstadoTerminal: "EXPIRADO" | "BLOQUEADO" | null =
    opcoes?.estadoInicial === "EXPIRADO" || opcoes?.estadoInicial === "BLOQUEADO"
      ? opcoes.estadoInicial
      : null

  let desafiosNaUltimaHora = 0

  function snapshotSituacao(): SituacaoVinculoWhatsAppDados {
    if (pendente && Date.parse(pendente.expiraEm) <= Date.now()) {
      pendente = null
      ultimoEstadoTerminal = "EXPIRADO"
    }
    const estado: EstadoVinculoWhatsApp = vinculado
      ? "VINCULADO"
      : pendente
        ? "PENDENTE"
        : ultimoEstadoTerminal ?? "SEM_VINCULO"

    return {
      estado,
      vinculado: vinculado
        ? { telefoneMascarado: vinculado.telefoneMascarado, desde: vinculado.desde }
        : null,
      pendente: pendente
        ? {
            telefoneMascarado: pendente.telefoneMascarado,
            expiraEm: pendente.expiraEm,
            tentativasRestantes: pendente.tentativasRestantes,
          }
        : null,
      consentimentoVersao: CONSENTIMENTO_WHATSAPP_VERSAO,
      numeroAssistente,
    }
  }

  return {
    async gerarCodigo(input): Promise<ResultadoAcaoVinculo<CodigoPareamentoGerado>> {
      const tel = String(input?.telefoneE164 ?? "").trim()
      if (!E164_RE.test(tel)) {
        return {
          ok: false,
          erro: "Informe o telefone no formato internacional, por exemplo +5511999990000.",
        }
      }
      if (input?.aceitouConsentimento !== true) {
        return {
          ok: false,
          erro: "É preciso aceitar os termos de uso do assistente pelo WhatsApp.",
        }
      }
      if (desafiosNaUltimaHora >= 5) {
        return {
          ok: false,
          erro: "Muitos códigos gerados na última hora. Tente novamente mais tarde.",
        }
      }
      desafiosNaUltimaHora += 1
      const codigo = String(100000 + ((desafiosNaUltimaHora * 137931) % 900000)).padStart(6, "0")
      const expiraEm = new Date(Date.now() + 10 * 60_000).toISOString()
      const telefoneMascarado = mascararTelefonePreview(tel)
      ultimoEstadoTerminal = null
      pendente = {
        telefoneE164: tel,
        telefoneMascarado,
        codigo,
        expiraEm,
        tentativasRestantes: 5,
      }
      return { ok: true, dados: { codigo, expiraEm, telefoneMascarado } }
    },

    async consultarSituacao() {
      return { ok: true, dados: snapshotSituacao() }
    },

    async cancelarPareamento() {
      const tinha = pendente !== null
      pendente = null
      return { ok: true, dados: { cancelado: tinha } }
    },

    async revogarVinculo() {
      if (!vinculado) {
        return { ok: false, erro: "Não há WhatsApp vinculado à sua conta." }
      }
      vinculado = null
      pendente = null
      ultimoEstadoTerminal = null
      return { ok: true, dados: { revogado: true } }
    },

    simularConfirmacaoWhatsApp(codigoDigitado: string) {
      if (!pendente) {
        return { ok: false, mensagem: "Não há pareamento pendente." }
      }
      if (Date.parse(pendente.expiraEm) <= Date.now()) {
        pendente = null
        ultimoEstadoTerminal = "EXPIRADO"
        return { ok: false, mensagem: "Esse código expirou." }
      }
      if (codigoDigitado.replace(/\D/g, "") !== pendente.codigo) {
        pendente.tentativasRestantes -= 1
        if (pendente.tentativasRestantes <= 0) {
          pendente = null
          ultimoEstadoTerminal = "BLOQUEADO"
          return { ok: false, mensagem: "Muitas tentativas com código errado. Bloqueado." }
        }
        return {
          ok: false,
          mensagem: `Código incorreto. Restam ${pendente.tentativasRestantes} tentativa(s).`,
        }
      }
      if (telefonesOutrasContas.has(pendente.telefoneE164)) {
        // Telefone já vinculado a outra conta: assistente recusa pelo WhatsApp
        return {
          ok: false,
          mensagem:
            "Este número já está vinculado a outra conta. O titular precisa revogar o vínculo antes de um novo pareamento.",
        }
      }
      vinculado = {
        telefoneE164: pendente.telefoneE164,
        telefoneMascarado: pendente.telefoneMascarado,
        desde: new Date().toISOString(),
      }
      pendente = null
      ultimoEstadoTerminal = null
      return { ok: true, mensagem: "WhatsApp vinculado à sua conta." }
    },

    simularExpiracao() {
      if (pendente) {
        pendente.expiraEm = new Date(Date.now() - 1000).toISOString()
      }
    },
  }
}
