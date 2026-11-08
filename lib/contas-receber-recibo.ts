/** Nome exibido no recibo térmico (80 mm). */
export const RECIBO_LOJA_NOME_PADRAO = "Minha Loja"

/**
 * Último recurso do cabeçalho do cupom quando NENHUMA fonte real de identidade da
 * unidade respondeu. Deliberadamente neutro: "Minha Loja" parecia nome comercial e
 * saía impresso em caixa alta como se fosse a razão social do cliente (achado G da
 * `AUDITORIA_PDV_RECEBIMENTO_MULTITITULO_DESIGN_001.md`).
 */
export const RECIBO_LOJA_NOME_FALLBACK = "Loja"

/**
 * Nome da loja para o cupom, na ordem de confiança das fontes que o PDV já tem
 * (prop explícita do call site → cadastro da unidade ativa → …).
 *
 * Só descarta candidato vazio; **não inventa** nome fantasia nem razão social. Se
 * nada real chegou, devolve o rótulo neutro — melhor um cupom sem marca do que um
 * cupom com marca errada.
 */
export function resolveReciboLojaNome(...candidatos: Array<string | null | undefined>): string {
  for (const c of candidatos) {
    const t = String(c ?? "").trim()
    if (t) return t
  }
  return RECIBO_LOJA_NOME_FALLBACK
}

export const FORMAS_PAGAMENTO_RECIBO = [
  "Dinheiro",
  "PIX",
  "Cartão de Crédito",
  "Cartão de Débito",
] as const

export type FormaPagamentoRecibo = (typeof FORMAS_PAGAMENTO_RECIBO)[number]

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function normClienteKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

function statusAbertoReceber(status: string): boolean {
  const t = String(status || "")
    .trim()
    .toLowerCase()
  return t === "pendente" || t === "atrasado"
}

/**
 * Soma valores de outros títulos em aberto (**pendentes** + **atrasados**) do mesmo cliente (exclui o título atual).
 * Usado no rodapé do recibo como saldo devedor remanescente.
 */
export function calcSaldoDevedorOutrosPendentesMesmoCliente(
  todas: { id: string | number; cliente: string; status: string; valor: number }[],
  tituloAtual: { id: string | number; cliente: string }
): number {
  const key = normClienteKey(tituloAtual.cliente || "")
  if (!key) return 0
  return todas
    .filter(
      (c) =>
        statusAbertoReceber(c.status) &&
        normClienteKey(c.cliente || "") === key &&
        String(c.id) !== String(tituloAtual.id)
    )
    .reduce((s, c) => s + (Number.isFinite(c.valor) ? c.valor : 0), 0)
}

/**
 * Saldo total ainda devido pelo cliente após o pagamento registrado no recibo:
 * saldo remanescente **deste título** (abatimento parcial / parcelas) + demais títulos em aberto do mesmo cliente.
 * @deprecated Prefira `calcSaldoDevedorClienteTodaLoja` para o rodapé do recibo.
 */
export function calcSaldoDevedorTotalAposPagamentoRecibo(
  todas: { id: string | number; cliente: string; status: string; valor: number }[],
  tituloAposPagamento: { id: string | number; cliente: string; status: string; valor: number }
): number {
  const saldoRemanescenteEsteTitulo =
    statusAbertoReceber(tituloAposPagamento.status) && Number.isFinite(Number(tituloAposPagamento.valor))
      ? Math.max(0, Math.round(Number(tituloAposPagamento.valor) * 100) / 100)
      : 0
  const saldoOutrosTitulos = calcSaldoDevedorOutrosPendentesMesmoCliente(todas, tituloAposPagamento)
  return Math.round((saldoRemanescenteEsteTitulo + saldoOutrosTitulos) * 100) / 100
}

export type ContaLinhaSaldoRecibo = {
  cliente: string
  status: string
  valor: number
  parcelas?: Array<{ valor?: number }>
}

/** Saldo em aberto de um título para o rodapé do recibo: prioriza soma das parcelas quando existir plano. */
function saldoAbertoTituloRecibo(c: ContaLinhaSaldoRecibo): number {
  if (!statusAbertoReceber(c.status)) return 0
  if (Array.isArray(c.parcelas) && c.parcelas.length > 0) {
    const sp = c.parcelas.reduce(
      (s, p) => s + (Number.isFinite(Number(p.valor)) ? Number(p.valor) : 0),
      0
    )
    if (sp > 0.009) return Math.round(sp * 100) / 100
  }
  const v = Number(c.valor)
  return Number.isFinite(v) ? Math.max(0, Math.round(v * 100) / 100) : 0
}

/**
 * O que o cliente ainda deve na loja após o recebimento: soma do saldo em aberto de **todos** os títulos
 * pendentes/atrasados do mesmo cliente (lista já atualizada). Com parcelas, usa a soma dos saldos das parcelas
 * quando o plano existir — alinhado a “total do contrato − já pago” no modelo de dados.
 */
export function calcSaldoDevedorClienteTodaLoja(todas: ContaLinhaSaldoRecibo[], clienteNome: string): number {
  const key = normClienteKey(clienteNome || "")
  if (!key) return 0
  const soma = todas
    .filter((c) => normClienteKey(c.cliente || "") === key)
    .reduce((acc, c) => acc + saldoAbertoTituloRecibo(c), 0)
  return Math.round(soma * 100) / 100
}

/**
 * Saldo devedor do cliente para o rodapé do recibo a partir de saldos em aberto **autoritativos**
 * (já calculados pelo servidor como `valor − pagamentos`), sem reinferir nada por status/`valor`/parcelas.
 *
 * - `saldoRemanescenteEsteTitulo`: o que ainda resta DESTE título após o pagamento do recibo
 *   (= saldo em aberto antes − valor pago agora). Em quitação total é 0; em parcial é o restante.
 * - `saldosOutrosTitulos`: saldo em aberto dos demais títulos do mesmo cliente.
 *
 * Nunca retorna negativo e **nunca assume zero enquanto houver saldo remanescente** — só dá 0
 * quando, de fato, não sobra nada a receber.
 */
export function calcSaldoDevedorClienteDeSaldos(
  saldoRemanescenteEsteTitulo: number,
  saldosOutrosTitulos: number[],
): number {
  const este = Number.isFinite(saldoRemanescenteEsteTitulo) ? Math.max(0, saldoRemanescenteEsteTitulo) : 0
  const outros = (saldosOutrosTitulos || []).reduce(
    (acc, v) => acc + (Number.isFinite(v) ? Math.max(0, v) : 0),
    0,
  )
  return Math.round((este + outros) * 100) / 100
}

export type ReciboPagamentoPayload = {
  lojaNome: string
  cliente: string
  descricaoTitulo: string
  valorPago: number
  dataPagamento: Date
  formaPagamento: string
  /**
   * O que o cliente ainda deve na unidade. `null` = não há como afirmar com segurança
   * (ex.: 2ª via de pagamento antigo) — a linha some em vez de imprimir um número inventado.
   */
  saldoDevedorAtual: number | null
  /** Saldo que ficou NESTE título depois da baixa (0 = quitado). */
  saldoRestanteTitulo?: number
  /** Identidade da operação gravada no servidor (chave de idempotência / lote). */
  operacaoId?: string
  /** Reimpressão a partir do registro original — nenhuma baixa nova. */
  segundaVia?: boolean
}

/** Marca obrigatória: o cupom de recebimento NÃO é documento fiscal. */
export const RECIBO_NAO_FISCAL_LABEL = "COMPROVANTE NÃO FISCAL"

function brlRecibo(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function cabecalhoOperacao(operacaoId: string | undefined, segundaVia: boolean | undefined): string {
  const partes: string[] = [`<p class="sub nf">${RECIBO_NAO_FISCAL_LABEL}</p>`]
  if (segundaVia) partes.push(`<p class="sub nf">2ª VIA — REIMPRESSÃO</p>`)
  const op = String(operacaoId ?? "").trim()
  if (op) partes.push(`<div class="row"><span class="label">Operação</span>${escapeHtml(op)}</div>`)
  return partes.join("\n    ")
}

/** Data/hora real do pagamento; data ausente/inválida imprime "—" (nunca "Invalid Date"). */
function dataHoraRecibo(d: Date | null | undefined): string {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
}

function linhaSaldoDevedor(saldo: number | null | undefined): string {
  if (saldo == null || !Number.isFinite(saldo)) return ""
  return `<div class="saldo">SALDO DEVEDOR ATUAL: ${escapeHtml(brlRecibo(Math.max(0, saldo)))}</div>`
}

/** Estilos embutidos no cupom (impressão via área isolada no DOM). */
const RECIBO_THERMAL_CSS = `
.recibo-thermal * { box-sizing: border-box; }
.recibo-thermal {
  font-family: ui-monospace, "Cascadia Mono", "Consolas", "Courier New", monospace;
  font-size: 11px;
  line-height: 1.45;
  color: #0a0a0a;
  background: #fff;
  width: 100%;
  max-width: 100%;
  padding: 0;
  margin: 0;
  word-wrap: break-word;
  overflow-wrap: anywhere;
  hyphens: auto;
}
.recibo-thermal h1 {
  font-size: 15px;
  text-align: center;
  margin: 0 0 6px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.recibo-thermal .sub { text-align: center; font-size: 10px; margin: 0 0 10px; }
.recibo-thermal .sub.nf { font-weight: 800; letter-spacing: 0.04em; margin: 0 0 6px; }
.recibo-thermal .dash { border: none; border-top: 1px dashed #222; margin: 10px 0; }
.recibo-thermal .row { margin: 6px 0; }
.recibo-thermal .label { font-weight: 700; display: block; margin-bottom: 2px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.02em; }
.recibo-thermal .valor {
  font-size: 15px;
  font-weight: 800;
  text-align: center;
  margin: 12px 0;
  padding: 8px 6px;
  border: 2px solid #000;
}
.recibo-thermal .forma { margin: 8px 0; font-size: 11px; }
.recibo-thermal .saldo {
  margin-top: 12px;
  padding: 8px 4px;
  border: 1px solid #333;
  font-weight: 800;
  font-size: 11px;
  text-align: center;
  line-height: 1.35;
}
.recibo-thermal .sign-wrap {
  margin-top: 32px;
  padding-top: 8px;
  border-top: 2px solid #000;
  min-height: 56px;
}
.recibo-thermal .sign-label { font-size: 10px; font-weight: 700; margin-bottom: 8px; }
.recibo-thermal .sign-space { min-height: 44px; border-bottom: 1px dotted #666; margin-top: 4px; }
.recibo-thermal .muted { font-size: 9px; color: #333; margin-top: 14px; text-align: center; }
`

export function buildReciboPagamentoInnerHtml(p: ReciboPagamentoPayload): string {
  const valorFmt = p.valorPago.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  const dataFmt = dataHoraRecibo(p.dataPagamento)
  const loja = escapeHtml(p.lojaNome)
  const cliente = escapeHtml(p.cliente || "—")
  const desc = escapeHtml(p.descricaoTitulo || "—")
  const forma = escapeHtml(p.formaPagamento || "—")

  return `
  <div class="recibo-thermal">
    <h1>${loja}</h1>
    <p class="sub">Recibo de pagamento</p>
    ${cabecalhoOperacao(p.operacaoId, p.segundaVia)}
    <hr class="dash" />
    <div class="row"><span class="label">Cliente</span>${cliente}</div>
    <div class="row"><span class="label">Descrição do título</span>${desc}</div>
    <div class="forma"><span class="label">Forma de pagamento</span>${forma}</div>
    <div class="valor">${escapeHtml(valorFmt)}</div>
    <div class="row"><span class="label">Data do pagamento</span>${escapeHtml(dataFmt)}</div>${
      p.saldoRestanteTitulo != null && Number.isFinite(p.saldoRestanteTitulo)
        ? `
    <div class="row"><span class="label">Situação do título</span>${
          p.saldoRestanteTitulo > 0.009
            ? `abatido — resta ${escapeHtml(brlRecibo(p.saldoRestanteTitulo))}`
            : "quitado"
        }</div>`
        : ""
    }
    <hr class="dash" />
    ${linhaSaldoDevedor(p.saldoDevedorAtual)}
    <div class="sign-wrap">
      <div class="sign-label">Assinatura do recebedor</div>
      <div class="sign-space"></div>
    </div>
    <p class="muted">Documento gerado eletronicamente — ${loja}</p>
  </div>`
}

// ─── recibo consolidado (lote multitítulo) ───────────────────────────────────

export type ReciboLoteItem = {
  descricao: string
  valorRecebido: number
  /** Saldo que ficou NESTE título depois da baixa (0 em quitação total). */
  saldoRestante: number
}

export type ReciboLotePayload = {
  lojaNome: string
  cliente: string
  dataPagamento: Date
  formaPagamento: string
  itens: ReciboLoteItem[]
  /** Total confirmado pelo SERVIDOR (`totalRecebido` da resposta do lote). */
  totalRecebido: number
  /** O que o cliente ainda deve na unidade depois deste recebimento (`null` = não afirmar). */
  saldoDevedorAtual: number | null
  /** Identidade da operação gravada no servidor (chave de idempotência / lote). */
  operacaoId?: string
  /** Reimpressão a partir do registro original — nenhuma baixa nova. */
  segundaVia?: boolean
}

/** Estilos exclusivos do cupom consolidado — somados ao CSS térmico compartilhado. */
const RECIBO_LOTE_CSS = `
.recibo-thermal .itens { margin: 10px 0 2px; }
.recibo-thermal .item { margin: 0 0 7px; }
.recibo-thermal .item-d { font-size: 10px; font-weight: 700; }
.recibo-thermal .item-l { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; }
.recibo-thermal .item-r { font-size: 9px; color: #333; }
.recibo-thermal .tot { display: flex; justify-content: space-between; gap: 8px; font-weight: 800; font-size: 12px; margin-top: 8px; }
`

/**
 * Cupom de UM recebimento que baixou VÁRIOS títulos. Um documento por operação — o
 * cliente pagou uma vez, então assina uma vez. Imprimir N cupons individuais para um
 * lote reintroduziria a leitura de "N pagamentos".
 */
export function buildReciboLoteInnerHtml(p: ReciboLotePayload): string {
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  const dataFmt = dataHoraRecibo(p.dataPagamento)
  const loja = escapeHtml(p.lojaNome)
  const cliente = escapeHtml(p.cliente || "—")
  const forma = escapeHtml(p.formaPagamento || "—")
  const qtd = p.itens.length

  const itens = p.itens
    .map((it) => {
      const resta = Number.isFinite(it.saldoRestante) ? Math.max(0, it.saldoRestante) : 0
      const situacao = resta > 0.009 ? `abatido — resta ${brl(resta)}` : "quitado"
      return `
      <div class="item">
        <div class="item-d">${escapeHtml(it.descricao || "Título")}</div>
        <div class="item-l"><span>${escapeHtml(situacao)}</span><span>${escapeHtml(brl(it.valorRecebido))}</span></div>
      </div>`
    })
    .join("")

  return `
  <div class="recibo-thermal">
    <h1>${loja}</h1>
    <p class="sub">Recibo de recebimento</p>
    ${cabecalhoOperacao(p.operacaoId, p.segundaVia)}
    <hr class="dash" />
    <div class="row"><span class="label">Cliente</span>${cliente}</div>
    <div class="forma"><span class="label">Forma de pagamento</span>${forma}</div>
    <div class="row"><span class="label">Data do pagamento</span>${escapeHtml(dataFmt)}</div>
    <hr class="dash" />
    <div class="itens">
      <span class="label">${qtd} ${qtd === 1 ? "título recebido" : "títulos recebidos"}</span>
      ${itens}
    </div>
    <div class="tot"><span>Total recebido</span><span>${escapeHtml(brl(p.totalRecebido))}</span></div>
    <div class="valor">${escapeHtml(brl(p.totalRecebido))}</div>
    <hr class="dash" />
    ${linhaSaldoDevedor(p.saldoDevedorAtual)}
    <div class="sign-wrap">
      <div class="sign-label">Assinatura do recebedor</div>
      <div class="sign-space"></div>
    </div>
    <p class="muted">Documento gerado eletronicamente — ${loja}</p>
  </div>`
}

function ensurePrintMount(): HTMLDivElement {
  let el = document.getElementById("recibo-print-mount") as HTMLDivElement | null
  if (!el) {
    el = document.createElement("div")
    el.id = "recibo-print-mount"
    el.setAttribute("aria-hidden", "true")
    document.body.appendChild(el)
  }
  return el
}

/**
 * Imprime apenas o recibo: usa `data-printing-recibo` + CSS global @media print
 * para ocultar layout do app (sidebar, header, etc.).
 */
export type ImprimirReciboOpts = {
  bobina?: "58mm" | "80mm"
}

export function imprimirReciboPagamento(
  payload: ReciboPagamentoPayload,
  opts?: ImprimirReciboOpts,
): Promise<boolean> {
  return printReciboInnerHtml(buildReciboPagamentoInnerHtml(payload), opts)
}

/**
 * Imprime o recibo CONSOLIDADO do lote — um único cupom para os N títulos baixados
 * na mesma operação. Compartilha a mesma montagem e o mesmo CSS do cupom singular.
 */
export function imprimirReciboLote(payload: ReciboLotePayload, opts?: ImprimirReciboOpts): Promise<boolean> {
  return printReciboInnerHtml(buildReciboLoteInnerHtml(payload), opts, RECIBO_LOTE_CSS)
}

/** Largura da página (bobina) e largura útil do cupom, em mm. */
const BOBINA_MM = { "58mm": { pagina: 58, conteudo: 48 }, "80mm": { pagina: 80, conteudo: 72 } } as const
/** Comprimento usado quando o cupom não pôde ser medido (ex.: aba sem layout). */
const ALTURA_RECIBO_FALLBACK_MM = 297
/** Respiro abaixo do conteúdo medido: arredondamento de fonte e avanço até o corte. */
const FOLGA_ALTURA_MM = 6
const PX_POR_MM = 96 / 25.4

/**
 * CSS de página da impressão do comprovante, por bobina.
 *
 * `@page { size: 80mm auto }` é inválido (o `size` não mistura comprimento com
 * `auto`): o navegador descarta a regra e pagina no papel padrão do driver — no
 * Chromium, Letter (215,9 mm). Por isso a altura é sempre um comprimento: a do cupom
 * medido, ou um fallback fixo. O resto da app sai do fluxo (`display: none`) durante a
 * impressão: só `visibility: hidden` manteria a altura da tela e, com a página na altura
 * do cupom, viraria folhas em branco (papel térmico avançado e cortado à toa). A largura útil também acompanha a bobina (o CSS global
 * fixa 72 mm, que corta o cupom numa bobina de 58 mm).
 */
export function cssImpressaoRecibo(bobina: "58mm" | "80mm", alturaConteudoMm: number | null | undefined): string {
  const b = BOBINA_MM[bobina === "58mm" ? "58mm" : "80mm"]
  const altura =
    alturaConteudoMm != null && Number.isFinite(alturaConteudoMm) && alturaConteudoMm > 0
      ? Math.ceil(alturaConteudoMm)
      : ALTURA_RECIBO_FALLBACK_MM
  return `
@media print {
  @page { size: ${b.pagina}mm ${altura}mm; margin: 0; }
  html[data-printing-recibo="true"] body > *:not(#recibo-print-mount) { display: none !important; }
  html[data-printing-recibo="true"] body .recibo-print-root { width: ${b.conteudo}mm !important; max-width: ${b.conteudo}mm !important; }
}
`
}

/**
 * Altura do cupom já montado, em mm, medida na largura útil da bobina com o mesmo
 * padding da impressão (`app/globals.css`). `null` quando não há layout (jsdom, aba
 * oculta) — aí a página usa o comprimento de fallback.
 */
function medirAlturaReciboMm(root: HTMLElement, larguraMm: number): number | null {
  const anterior = root.getAttribute("style")
  try {
    root.style.cssText = `position:absolute;left:-10000px;top:0;visibility:hidden;width:${larguraMm}mm;padding:2mm 3mm 4mm;box-sizing:border-box`
    const px = root.getBoundingClientRect().height
    if (!Number.isFinite(px) || px <= 0) return null
    return px / PX_POR_MM + FOLGA_ALTURA_MM
  } catch {
    return null
  } finally {
    if (anterior == null) root.removeAttribute("style")
    else root.setAttribute("style", anterior)
  }
}

/**
 * Montagem, `@page` e ciclo de impressão — compartilhados pelos dois cupons.
 *
 * Resolve `true` quando o diálogo de impressão do navegador foi aberto e `false`
 * quando não deu (sem DOM, `window.print` indisponível/bloqueado). O navegador não
 * informa se a impressora física imprimiu; por isso a UI SEMPRE mantém o botão de
 * reimpressão. Falha aqui nunca toca no recebimento já gravado.
 */
function printReciboInnerHtml(inner: string, opts?: ImprimirReciboOpts, extraCss = ""): Promise<boolean> {
  if (typeof document === "undefined" || typeof window === "undefined") return Promise.resolve(false)
  if (typeof window.print !== "function") return Promise.resolve(false)
  const bobina = opts?.bobina === "58mm" ? "58mm" : "80mm"
  return new Promise<boolean>((resolveRaw) => {
    let settled = false
    const resolve = (v: boolean) => {
      if (settled) return
      settled = true
      resolveRaw(v)
    }
    // Aba oculta/segundo plano pode nunca disparar o frame: sem impressão, desfecho = false.
    // Depois que a UI já mostrou "não abriu", um frame atrasado NÃO pode abrir o diálogo:
    // o operador reimprimiria e sairiam dois cupons.
    let desistiu = false
    window.setTimeout(() => {
      desistiu = true
      resolve(false)
    }, 5_000)
    /** Montagem e `print()` fora do mesmo tick da baixa — evita travar a UI antes do loading sumir. */
    window.setTimeout(() => {
      let mount: HTMLDivElement
      try {
        mount = ensurePrintMount()
        mount.innerHTML = `<div class="recibo-print-root"><style>${RECIBO_THERMAL_CSS}${extraCss}</style>${inner}</div>`
        const root = mount.firstElementChild as HTMLElement
        const pagina = document.createElement("style")
        pagina.textContent = cssImpressaoRecibo(bobina, medirAlturaReciboMm(root, BOBINA_MM[bobina].conteudo))
        root.prepend(pagina)
      } catch {
        resolve(false)
        return
      }

      document.documentElement.setAttribute("data-printing-recibo", "true")

      const cleanup = () => {
        document.documentElement.removeAttribute("data-printing-recibo")
        mount.innerHTML = ""
      }

      requestAnimationFrame(() => {
        if (desistiu || settled) {
          cleanup()
          return
        }
        try {
          window.print()
          resolve(true)
        } catch {
          cleanup()
          resolve(false)
          return
        }
        // `print()` bloqueia até o diálogo fechar; a limpeza só corre depois dele — nunca
        // esvazia o cupom antes da impressão (frame atrasado).
        window.setTimeout(cleanup, 1_200)
      })

      window.addEventListener("afterprint", cleanup, { once: true })
    }, 0)
  })
}
