import {
  buildOsTicketEscPos,
  buildPdvReceiptEscPos,
  escposDrawerKick,
  type OsTicketInput,
  type PdvReceiptInput,
} from "@/lib/escpos"
import {
  BOBINA_CHARS,
  resolveCupomRodape,
  type PdvImpressaoConfig,
} from "@/lib/pdv-impressao-config"
import {
  escapeHtml,
  openThermalHtmlPrint,
  sendEscPosViaProxy,
  type SendEscPosResult,
} from "@/lib/thermal-print"

export type PrintJobResult = {
  ok: boolean
  via?: "proxy" | "html" | "download"
  error?: string
}

export type ExecutePrintOptions = {
  config: PdvImpressaoConfig
  receiptFooter?: string | null
  /** URL pública da logo da unidade (Store.logoUrl). */
  logoUrl?: string | null
  filename?: string
  htmlTitle?: string
  /** Corpo HTML interno (sem wrapper de largura). */
  buildHtmlBody?: () => string
}

function printTarget(config: PdvImpressaoConfig): { host?: string; port?: number } {
  const host = config.impressoraHost.trim()
  if (!host) return {}
  return { host, port: config.impressoraPorta }
}

export async function executeEscPosPrint(
  bytes: Uint8Array,
  config: PdvImpressaoConfig,
  opts?: { openDrawer?: boolean },
): Promise<PrintJobResult> {
  const target = printTarget(config)
  const vias = Math.min(5, Math.max(1, config.viasCupom))
  let lastError = ""

  for (let via = 0; via < vias; via++) {
    const res: SendEscPosResult = await sendEscPosViaProxy(bytes, target)
    if (!res.ok) {
      lastError = res.error
      break
    }
    if (opts?.openDrawer && config.abrirGaveta && via === 0) {
      await sendEscPosViaProxy(escposDrawerKick(), target)
    }
  }

  if (!lastError) return { ok: true, via: "proxy" }
  return { ok: false, error: lastError }
}

export async function printWithFallback(
  bytes: Uint8Array,
  opts: ExecutePrintOptions,
): Promise<PrintJobResult> {
  const proxy = await executeEscPosPrint(bytes, opts.config, { openDrawer: true })
  if (proxy.ok) return proxy

  const hasRealBridge = opts.config.impressoraHost.trim().length > 0
  if (hasRealBridge) {
    // Host configurado mas inacessível — erro honesto, sem abrir nova aba nem baixar .bin
    return { ok: false, via: "proxy", error: proxy.error }
  }

  // Sem bridge térmica: fallback HTML (A4 / impressão do navegador)
  if (opts.buildHtmlBody) {
    const width = opts.config.bobinaTamanho === "58mm" ? "58mm" : "80mm"
    const inner = opts.buildHtmlBody()
    const logo =
      opts.config.logoNoCupom && opts.logoUrl?.trim()
        ? `<div style="text-align:center;margin-bottom:6px"><img src="${escapeHtml(opts.logoUrl.trim())}" alt="" style="max-width:90%;max-height:48px;object-fit:contain" /></div>`
        : ""
    openThermalHtmlPrint(`${logo}${inner}`, opts.htmlTitle ?? "Cupom", { bobina: width })
    return { ok: true, via: "html" }
  }

  return { ok: false, via: "download", error: proxy.error }
}

export async function printPdvSaleReceipt(params: {
  config: PdvImpressaoConfig
  receiptFooter?: string | null
  logoUrl?: string | null
  input: PdvReceiptInput
}): Promise<PrintJobResult> {
  const footer = resolveCupomRodape(params.config, params.receiptFooter)
  const maxChars = BOBINA_CHARS[params.config.bobinaTamanho]
  const bytes = buildPdvReceiptEscPos(
    { ...params.input, receiptFooter: footer },
    { modo: params.config.comprovanteModo, maxChars },
  )

  const br = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
  const itensHtml =
    params.config.comprovanteModo === "simplificado"
      ? `<p style="text-align:center;font-size:11px">${params.input.itens.length} item(ns)</p>`
      : params.input.itens
          .map(
            (i) =>
              `<p>${escapeHtml(String(i.quantity))}x ${escapeHtml(i.name)} — ${br.format(i.lineTotal)}</p>`,
          )
          .join("")

  return printWithFallback(bytes, {
    config: params.config,
    receiptFooter: footer,
    logoUrl: params.logoUrl,
    filename: "recibo-pdv.bin",
    htmlTitle: "Recibo PDV",
    buildHtmlBody: () => `
      <div style="text-align:center;font-weight:700;margin-bottom:6px">${escapeHtml(params.input.nomeFantasia)}</div>
      <div style="text-align:center;font-size:11px;margin-bottom:4px">CNPJ ${escapeHtml(params.input.cnpj)}</div>
      ${params.input.enderecoLinha?.trim() ? `<div style="font-size:10px;margin-bottom:8px">${escapeHtml(params.input.enderecoLinha.trim())}</div>` : ""}
      <div style="border-top:1px dashed #000;margin:6px 0"></div>
      ${itensHtml}
      <div style="border-top:1px dashed #000;margin:6px 0"></div>
      <p>Subtotal: ${br.format(params.input.subtotal)}</p>
      ${params.input.taxes > 0 ? `<p>Imposto estimado: ${br.format(params.input.taxes)}</p>` : ""}
      ${params.input.discount > 0 ? `<p>Desconto: ${br.format(params.input.discount)}</p>` : ""}
      <p style="font-weight:700">Total: ${br.format(params.input.total)}</p>
      ${footer ? `<div style="font-size:10px;margin-top:8px;white-space:pre-wrap">${escapeHtml(footer)}</div>` : ""}
      <p style="font-size:10px;margin-top:8px">${escapeHtml(params.input.dataHora)}</p>
    `,
  })
}

export async function printOsThermalTicket(params: {
  config: PdvImpressaoConfig
  input: OsTicketInput
  logoUrl?: string | null
}): Promise<PrintJobResult> {
  if (!params.config.imprimirOs) {
    return { ok: false, error: "Impressão de OS desativada nas configurações." }
  }

  const maxChars = BOBINA_CHARS[params.config.bobinaTamanho]
  const bytes = buildOsTicketEscPos(params.input, { maxChars })
  const { os } = params.input
  const br = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

  return printWithFallback(bytes, {
    config: params.config,
    filename: `os-${os.numero.replace(/[^\w-]+/g, "_")}.bin`,
    htmlTitle: `OS ${os.numero}`,
    logoUrl: params.logoUrl,
    buildHtmlBody: () => `
      <div style="text-align:center;font-weight:700">ORDEM DE SERVIÇO</div>
      <div style="text-align:center;font-size:11px;margin:4px 0">${escapeHtml(params.input.nomeFantasia)}</div>
      <div style="border-top:1px dashed #000;margin:6px 0"></div>
      <p style="font-weight:700">${escapeHtml(os.numero)}</p>
      <p>${escapeHtml(os.cliente.nome)}</p>
      <p>${escapeHtml(os.aparelho.marca)} ${escapeHtml(os.aparelho.modelo)}</p>
      <p>Total: ${br.format(os.valorServico + os.valorPecas)}</p>
    `,
  })
}

export function crediarioPrintAllowed(config: PdvImpressaoConfig): boolean {
  return config.imprimirCrediario
}
