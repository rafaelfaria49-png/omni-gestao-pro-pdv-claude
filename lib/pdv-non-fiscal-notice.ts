/** Identificação obrigatória do comprovante comercial de venda, independente de preferências. */
export const PDV_NON_FISCAL_NOTICE = "NÃO É DOCUMENTO FISCAL"
export const PDV_NON_FISCAL_EXPLANATION = "NÃO SUBSTITUI NFC-e OU NF-e"

/** Somente textos fixos e seguros para HTML; nenhum conteúdo configurável entra neste bloco. */
export function buildPdvNonFiscalNoticeHtml(): string {
  return `<div style="text-align:center;margin:6px 0;break-inside:avoid">
    <div style="font-size:11px;font-weight:700">${PDV_NON_FISCAL_NOTICE}</div>
    <div style="font-size:9px">${PDV_NON_FISCAL_EXPLANATION}</div>
  </div>`
}
