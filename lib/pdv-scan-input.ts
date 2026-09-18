/**
 * Entrada do campo de bipe/busca do PDV (GOAL PDV-SCAN-SEARCH-AUTOCLEAR-FOCUS-005).
 *
 * O mesmo campo recebe dois tipos de texto confirmados por Enter:
 * - **código / scan** (leitor ou código digitado): é CONSUMIDO — o campo volta vazio para o
 *   próximo bipe, qualquer que seja o resultado;
 * - **pesquisa manual** ("capinha samsung"): nunca é apagada automaticamente só porque não houve
 *   resultado — o operador ainda está refinando o texto.
 *
 * Regra determinística (sem heurística de tempo entre teclas): código = um único token, sem
 * espaço, com ao menos um dígito. EAN, SKU "KD11C" e "A05" são código; "capinha",
 * "capinha samsung" e "película a05" são pesquisa. Aplicar sobre a query já sem o prefixo de
 * quantidade (`parsePdvScanPrefix`).
 */
export function isPdvScanLikeQuery(query: string): boolean {
  const t = query.trim()
  if (!t || /\s/.test(t)) return false
  return /\d/.test(t)
}

/** Tempo do aviso transitório de código não encontrado (ms). */
export const PDV_SCAN_NOT_FOUND_FEEDBACK_MS = 1800

export type PdvScanFeedbackHandle = { dismiss: () => void }

export type PdvScanNotFoundFeedback = {
  /** Mostra o aviso do código e encerra na hora o aviso anterior, se ainda estiver visível. */
  notify: (code: string, opts?: PdvScanNotifyOptions) => void
  /** Encerra o aviso vivo (novo bipe, Esc, Item Avulso). Idempotente. */
  dismiss: () => void
}

/** Mantém um único aviso vivo: o próximo bipe nunca espera o tempo do aviso anterior. */
export function createPdvScanNotFoundFeedback(
  show: (code: string, opts?: PdvScanNotifyOptions) => PdvScanFeedbackHandle,
): PdvScanNotFoundFeedback {
  let current: PdvScanFeedbackHandle | null = null
  return {
    notify(code, opts) {
      current?.dismiss()
      current = show(code, opts)
    },
    dismiss() {
      current?.dismiss()
      current = null
    },
  }
}

/** Estado do aviso INLINE no campo Código/Bipe (GOAL 006; hint de Insert no GOAL 007). */
export type PdvScanInlineFeedbackState = {
  /** Código não cadastrado exibido; null quando nenhum aviso está visível. */
  code: string | null
  /** Incrementa a cada novo aviso — permite re-anúncio/mount mesmo para o mesmo código. */
  seq: number
  /** GOAL 007 (modo "avisar e oferecer"): a copy indica que Insert abre o Item Avulso. */
  suggestsAvulso?: boolean
}

export type PdvScanNotifyOptions = {
  /** Hint de Insert na copy do aviso (decisão da política por loja, GOAL 007). */
  suggestAvulso?: boolean
}

/**
 * Aviso transitório INLINE de código não encontrado: em vez de renderizar fora do campo
 * (toast), a superfície sobrepõe a mensagem ao próprio input Código/Bipe — que permanece
 * `value=""` e focado. Um único timer vivo; `notify` novo substitui o anterior na hora e
 * `dismiss` (Esc, digitação, Item Avulso, desmonte) encerra imediatamente.
 */
export function createPdvScanInlineNotFoundFeedback(
  onViewChange: (state: PdvScanInlineFeedbackState) => void,
  durationMs: number = PDV_SCAN_NOT_FOUND_FEEDBACK_MS,
): PdvScanNotFoundFeedback {
  let seq = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  const clearTimer = () => {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
  }
  return createPdvScanNotFoundFeedback((code, opts) => {
    clearTimer()
    const id = ++seq
    onViewChange({ code, seq: id, suggestsAvulso: opts?.suggestAvulso ?? false })
    timer = setTimeout(() => {
      timer = null
      onViewChange({ code: null, seq: id })
    }, durationMs)
    return {
      dismiss: () => {
        clearTimer()
        onViewChange({ code: null, seq: id })
      },
    }
  })
}

/**
 * Guarda do autofocus operacional (GOAL 006): só devolve o foco ao Código/Bipe quando não há
 * outro campo de texto ativo — o operador pode ter clicado em Cliente/Quantidade/pesquisa —
 * e nenhum modal aberto. Leitura pontual; quem chama decide o momento (montagem, gate pronto).
 * `doc` injetável para teste em ambiente sem DOM.
 */
export function canAutoFocusPdvBipe(
  doc: Pick<Document, "activeElement" | "querySelector"> | null = typeof document === "undefined" ? null : document,
): boolean {
  if (!doc) return false
  const active = doc.activeElement
  if (active) {
    const tag = (active.tagName ?? "").toUpperCase()
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return false
    if ((active as HTMLElement).isContentEditable) return false
  }
  return doc.querySelector('[role="dialog"], [role="alertdialog"]') === null
}
