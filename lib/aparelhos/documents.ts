/**
 * Documentos comerciais de aparelhos (OMNI-APARELHOS-ENDTOEND-001).
 * Renderizados SOMENTE a partir do snapshot gravado na venda/aquisição — reimprimir
 * reproduz exatamente a versão emitida. Não são documentos fiscais.
 *
 * 80 mm: `@page { size: 80mm <altura>mm }` com altura medida do conteúdo — `size: 80mm auto`
 * é CSS inválido (Chromium descarta e pagina em Letter).
 */
import { formatDateKeyBr, rotuloPrazo } from "./warranty"
import { SITUACAO_PAGAMENTO_LABEL, type SituacaoPagamentoAquisicao } from "./financeiro"

export type DocTipo = "termo_garantia" | "comprovante_venda" | "termo_entrega" | "protocolo_aquisicao"
export type DocFormato = "a4" | "80mm"

export type GarantiaSnapshot = {
  versao: string
  numeroGarantia: string
  loja: { nome: string; cnpj: string; telefone: string; email: string; endereco: unknown }
  cliente: { nome: string; documentoMascarado: string; telefone: string }
  aparelho: {
    codigoInterno: string; marca: string; modelo: string; variante: string; armazenamento: string; memoriaRam: string; cor: string
    condicao: string; condicaoLabel: string; imei1: string; imei2: string; serial: string; estadoFisico: string
    bateriaSaude: number | null; acessoriosEntregues: string
  }
  venda: { pedidoId: string; dataVenda: string; preco: number; operador: string }
  garantia: { dataEntrega: string; legalDias: number; contratualDias: number; contratualFim: string | null; legalFim: string; coberturaFim: string; fabricanteInfo: string }
  condicoes: string[]
  politicaVersao: number
  observacoes: string
}

export type PagamentoResumo = { label: string; valor: number }[]

export type AquisicaoDoc = {
  protocolo: string
  tipo: string
  status: string
  dataKey: string
  loja: { nome: string; cnpj: string; telefone: string }
  vendedor: { nome: string; documentoMascarado: string }
  documentoOrigem: string
  valorTotal: number
  formaPagamento: string
  pagamentoStatus: string
  aparelhos: Array<{ codigoInterno: string; descricao: string; imei1: string; imei2: string; serial: string; condicao: string; checklist: string }>
  observacoes: string
}

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

function enderecoTexto(e: unknown): string {
  if (!e || typeof e !== "object") return ""
  const r = e as Record<string, unknown>
  const parts = [r.logradouro ?? r.rua, r.numero, r.bairro, [r.cidade, r.uf].filter(Boolean).join("/"), r.cep].filter((p) => typeof p === "string" && p.trim())
  return parts.join(", ")
}

function descricaoAparelho(a: GarantiaSnapshot["aparelho"]): string {
  return [a.marca, a.modelo, a.variante, a.armazenamento, a.memoriaRam ? `${a.memoriaRam} RAM` : "", a.cor].filter(Boolean).join(" · ")
}

function rascunhoBanner(rascunho: boolean | string): string {
  if (typeof rascunho === "string") return rascunho ? `<div class="rascunho" role="note">${esc(rascunho)}</div>` : ""
  return rascunho ? `<div class="rascunho" role="note">RASCUNHO — prévia sem validade. A venda ainda não foi confirmada.</div>` : ""
}

function shell(title: string, body: string, formato: DocFormato, rascunho: boolean | string): string {
  const a4 = formato === "a4"
  const css = a4
    ? `@page { size: A4; margin: 14mm 14mm 16mm; }
       body { font: 11pt/1.45 "Segoe UI", Roboto, Arial, sans-serif; color: #000; background: #fff; margin: 0; }
       .doc { max-width: 182mm; margin: 0 auto; padding: 8mm 0; }
       h1 { font-size: 15pt; margin: 0 0 2mm; } h2 { font-size: 11.5pt; margin: 6mm 0 2mm; border-bottom: 0.3mm solid #000; padding-bottom: 1mm; }
       table { width: 100%; border-collapse: collapse; } td, th { text-align: left; vertical-align: top; padding: 1.2mm 2mm 1.2mm 0; }
       th { width: 38mm; font-weight: 600; } .muted { color: #333; font-size: 9.5pt; }
       .cover { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; margin-top: 2mm; }
       .cover div { border: 0.3mm solid #000; padding: 2.5mm; } .cover b { display: block; font-size: 12pt; }
       ol { padding-left: 5mm; margin: 0; } li { margin-bottom: 1.5mm; }
       .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 14mm; margin-top: 18mm; }
       .sign div { border-top: 0.3mm solid #000; padding-top: 1.5mm; font-size: 9.5pt; text-align: center; }`
    : `body { font: 9pt/1.35 ui-monospace, "Cascadia Mono", Consolas, monospace; color: #000; background: #fff; margin: 0; }
       .doc { width: 72mm; margin: 0 auto; padding: 2mm 0 4mm; }
       h1 { font-size: 10.5pt; margin: 0 0 1mm; text-align: center; } h2 { font-size: 9pt; margin: 2.5mm 0 1mm; border-top: 0.3mm dashed #000; padding-top: 1.5mm; }
       table { width: 100%; border-collapse: collapse; } td, th { text-align: left; vertical-align: top; padding: 0.4mm 0; }
       th { font-weight: 700; padding-right: 1.5mm; white-space: nowrap; } .muted { font-size: 8pt; }
       .cover div { margin: 0.6mm 0; } .cover b { font-weight: 700; }
       ol { padding-left: 4mm; margin: 0; } li { margin-bottom: 0.8mm; }
       .sign div { border-top: 0.3mm solid #000; margin-top: 10mm; padding-top: 1mm; text-align: center; font-size: 8pt; }`
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>
${css}
.rascunho { border: 0.6mm solid #000; padding: 2mm; text-align: center; font-weight: 700; margin-bottom: 3mm; letter-spacing: 0.02em; }
.toolbar { position: sticky; top: 0; display: flex; gap: 8px; justify-content: center; padding: 10px; background: #f4f4f5; border-bottom: 1px solid #d4d4d8; font-family: system-ui, sans-serif; }
.toolbar button { font: inherit; padding: 6px 14px; border-radius: 6px; border: 1px solid #a1a1aa; background: #fff; cursor: pointer; }
.toolbar button:focus-visible { outline: 2px solid #dc2626; outline-offset: 2px; }
@media print { .toolbar { display: none !important; } }
</style>
<style id="page-size">${a4 ? "" : "@page { size: 80mm 200mm; margin: 0; }"}</style>
</head><body>
<div class="toolbar"><button type="button" onclick="window.print()">Imprimir</button><button type="button" onclick="window.close()">Fechar</button></div>
<main class="doc">${rascunhoBanner(rascunho)}${body}</main>
${a4 ? "" : `<script>
(function () {
  function ajustar() {
    var doc = document.querySelector(".doc");
    var px = doc.getBoundingClientRect().height + 24;
    var mm = Math.ceil(px * 25.4 / 96) + 6;
    document.getElementById("page-size").textContent = "@page { size: 80mm " + Math.max(60, mm) + "mm; margin: 0; }";
  }
  window.addEventListener("load", ajustar);
  window.addEventListener("beforeprint", ajustar);
})();
</script>`}
</body></html>`
}

function cabecalhoLoja(loja: { nome: string; cnpj: string; telefone: string; endereco?: unknown }): string {
  const end = enderecoTexto(loja.endereco)
  return `<p class="muted">${esc(loja.nome || "Loja")}${loja.cnpj ? ` — CNPJ ${esc(loja.cnpj)}` : ""}${loja.telefone ? ` — ${esc(loja.telefone)}` : ""}${end ? `<br />${esc(end)}` : ""}</p>`
}

function tabelaAparelho(s: GarantiaSnapshot): string {
  const a = s.aparelho
  return `<table>
<tr><th>Aparelho</th><td>${esc(descricaoAparelho(a))}</td></tr>
<tr><th>Condição</th><td>${esc(a.condicaoLabel)}</td></tr>
${a.imei1 ? `<tr><th>IMEI 1</th><td>${esc(a.imei1)}</td></tr>` : ""}
${a.imei2 ? `<tr><th>IMEI 2</th><td>${esc(a.imei2)}</td></tr>` : ""}
${a.serial ? `<tr><th>Série</th><td>${esc(a.serial)}</td></tr>` : ""}
<tr><th>Código interno</th><td>${esc(a.codigoInterno)}</td></tr>
${a.estadoFisico ? `<tr><th>Estado</th><td>${esc(a.estadoFisico)}</td></tr>` : ""}
${a.bateriaSaude !== null && a.bateriaSaude !== undefined ? `<tr><th>Bateria</th><td>${esc(a.bateriaSaude)}% de saúde (informada na conferência)</td></tr>` : ""}
<tr><th>Acessórios</th><td>${esc(a.acessoriosEntregues)}</td></tr>
</table>`
}

function blocoCobertura(s: GarantiaSnapshot): string {
  const g = s.garantia
  return `<div class="cover">
<div>Garantia legal<b>${g.legalDias} dias</b><span class="muted">CDC art. 26, II — sempre garantida</span></div>
<div>Garantia contratual adicional<b>${g.contratualDias > 0 ? `${esc(rotuloPrazo(g.contratualDias))} (${g.contratualDias} dias)` : "Sem adicional"}</b><span class="muted">${g.contratualFim ? `de ${formatDateKeyBr(g.dataEntrega)} a ${formatDateKeyBr(g.contratualFim)}` : "—"}</span></div>
<div>Cobertura total até<b>${formatDateKeyBr(g.coberturaFim)}</b><span class="muted">contratual + legal, a partir da entrega em ${formatDateKeyBr(g.dataEntrega)}</span></div>
</div>`
}

export function renderTermoGarantia(s: GarantiaSnapshot, formato: DocFormato, rascunho: boolean | string = false): string {
  const body = `<h1>Termo de garantia ${esc(s.numeroGarantia)}</h1>
${cabecalhoLoja(s.loja)}
<h2>Cliente</h2>
<table><tr><th>Nome</th><td>${esc(s.cliente.nome)}</td></tr>${s.cliente.documentoMascarado ? `<tr><th>CPF/CNPJ</th><td>${esc(s.cliente.documentoMascarado)}</td></tr>` : ""}</table>
<h2>Produto</h2>
${tabelaAparelho(s)}
<h2>Venda e entrega</h2>
<table><tr><th>Venda</th><td>${esc(s.venda.pedidoId)} — ${formatDateKeyBr(s.venda.dataVenda)}</td></tr>
<tr><th>Valor</th><td>${brl(s.venda.preco)}</td></tr>
<tr><th>Entrega</th><td>${formatDateKeyBr(s.garantia.dataEntrega)}</td></tr></table>
<h2>Cobertura</h2>
${blocoCobertura(s)}
<h2>Condições</h2>
<ol>${s.condicoes.map((c) => `<li>${esc(c)}</li>`).join("")}</ol>
${s.observacoes ? `<p class="muted">Observações: ${esc(s.observacoes)}</p>` : ""}
<p class="muted">Documento comercial, sem valor fiscal. Termo ${esc(s.versao)} · política ${s.politicaVersao ? `versão ${s.politicaVersao}` : "padrão"}. Guarde este termo junto com o comprovante da venda.</p>
<div class="sign"><div>${esc(s.cliente.nome)}<br />Cliente</div><div>${esc(s.venda.operador || s.loja.nome)}<br />Responsável pela loja</div></div>`
  return shell(`Garantia ${s.numeroGarantia}`, body, formato, rascunho)
}

export function renderComprovanteVenda(s: GarantiaSnapshot, pagamentos: PagamentoResumo, formato: DocFormato, rascunho: boolean | string = false): string {
  const body = `<h1>Comprovante de venda</h1>
${cabecalhoLoja(s.loja)}
<p><b>${esc(s.venda.pedidoId)}</b> — ${formatDateKeyBr(s.venda.dataVenda)}</p>
<p>Documento comercial sem valor fiscal. Não substitui NFC-e/NF-e.</p>
<h2>Cliente</h2><p>${esc(s.cliente.nome)}${s.cliente.documentoMascarado ? ` — ${esc(s.cliente.documentoMascarado)}` : ""}</p>
<h2>Aparelho</h2>
${tabelaAparelho(s)}
<h2>Valores</h2>
<table><tr><th>Aparelho</th><td>${brl(s.venda.preco)}</td></tr>
${pagamentos.map((p) => `<tr><th>${esc(p.label)}</th><td>${brl(p.valor)}</td></tr>`).join("")}</table>
<h2>Garantia</h2>
<p>Termo ${esc(s.numeroGarantia)}: legal de ${s.garantia.legalDias} dias${s.garantia.contratualDias > 0 ? ` + contratual de ${s.garantia.contratualDias} dias` : ""}. Cobertura até ${formatDateKeyBr(s.garantia.coberturaFim)}.</p>
${formato === "80mm" ? `<p class="muted">Termo completo em A4: ${esc(s.numeroGarantia)}.</p>` : ""}
<div class="sign"><div>${esc(s.cliente.nome)}</div></div>`
  return shell(`Comprovante ${s.venda.pedidoId}`, body, formato, rascunho)
}

export function renderTermoEntrega(s: GarantiaSnapshot, formato: DocFormato, rascunho: boolean | string = false): string {
  const body = `<h1>Termo de entrega e recebimento</h1>
${cabecalhoLoja(s.loja)}
<p>Eu, <b>${esc(s.cliente.nome)}</b>${s.cliente.documentoMascarado ? `, ${esc(s.cliente.documentoMascarado)}` : ""}, declaro que recebi em ${formatDateKeyBr(s.garantia.dataEntrega)} o aparelho abaixo, referente à venda ${esc(s.venda.pedidoId)}, e que conferi o estado e os acessórios descritos.</p>
${tabelaAparelho(s)}
<p>Recebi também o termo de garantia ${esc(s.numeroGarantia)}, com garantia legal de ${s.garantia.legalDias} dias${s.garantia.contratualDias > 0 ? ` e garantia contratual adicional de ${s.garantia.contratualDias} dias` : ""}. Este termo não reduz nenhum direito previsto no Código de Defesa do Consumidor.</p>
<div class="sign"><div>${esc(s.cliente.nome)}<br />Cliente</div><div>${esc(s.venda.operador || s.loja.nome)}<br />Responsável pela entrega</div></div>`
  return shell(`Entrega ${s.venda.pedidoId}`, body, formato, rascunho)
}

const TIPO_AQ: Record<string, string> = { compra_cliente: "Compra de cliente", fornecedor: "Compra de fornecedor", lote: "Entrada por lote", negociacao: "Recebido em negociação" }
const FORMA: Record<string, string> = { dinheiro: "Dinheiro", pix: "Pix", transferencia: "Transferência", credito_loja: "Crédito na loja", abatimento_venda: "Abatimento em venda", outro: "Outro" }

export function renderProtocoloAquisicao(a: AquisicaoDoc, formato: DocFormato): string {
  const pendente = a.status !== "confirmada"
  const body = `<h1>Protocolo de aquisição ${esc(a.protocolo)}</h1>
${cabecalhoLoja(a.loja)}
${pendente ? `<div class="rascunho">${a.status === "recusada" ? "AQUISIÇÃO RECUSADA — sem efeito" : "AGUARDANDO APROVAÇÃO — ainda sem efeito"}</div>` : ""}
<table><tr><th>Operação</th><td>${esc(TIPO_AQ[a.tipo] ?? a.tipo)} — ${formatDateKeyBr(a.dataKey)}</td></tr>
<tr><th>Vendedor</th><td>${esc(a.vendedor.nome)}${a.vendedor.documentoMascarado ? ` — ${esc(a.vendedor.documentoMascarado)}` : ""}</td></tr>
<tr><th>Origem</th><td>${esc(a.documentoOrigem)}</td></tr>
<tr><th>Valor</th><td>${brl(a.valorTotal)} — ${esc(FORMA[a.formaPagamento] ?? a.formaPagamento)} (${esc(SITUACAO_PAGAMENTO_LABEL[a.pagamentoStatus as SituacaoPagamentoAquisicao] ?? "pagamento pendente")})</td></tr></table>
<h2>Aparelhos</h2>
${a.aparelhos.map((x) => `<table><tr><th>${esc(x.codigoInterno)}</th><td>${esc(x.descricao)} — ${esc(x.condicao)}</td></tr>
${x.imei1 ? `<tr><th>IMEI 1</th><td>${esc(x.imei1)}</td></tr>` : ""}${x.imei2 ? `<tr><th>IMEI 2</th><td>${esc(x.imei2)}</td></tr>` : ""}${x.serial ? `<tr><th>Série</th><td>${esc(x.serial)}</td></tr>` : ""}
<tr><th>Checklist</th><td>${esc(x.checklist)}</td></tr></table>`).join("")}
<h2>Declaração do vendedor</h2>
<p>Declaro ser o legítimo proprietário do(s) aparelho(s) acima, que não possui(em) restrição de roubo, furto ou bloqueio de que eu tenha conhecimento, e que os vendo à loja pelo valor informado.</p>
${a.observacoes ? `<p class="muted">Observações: ${esc(a.observacoes)}</p>` : ""}
<p class="muted">Documento comercial. Não substitui nota fiscal de entrada quando exigida pela legislação.</p>
<div class="sign"><div>${esc(a.vendedor.nome)}<br />Vendedor</div><div>${esc(a.loja.nome)}<br />Responsável pela loja</div></div>`
  return shell(`Aquisição ${a.protocolo}`, body, formato, false)
}

const PAG_LABEL: Record<string, string> = { dinheiro: "Dinheiro", pix: "Pix", cartaoDebito: "Cartão de débito", cartaoCredito: "Cartão de crédito", carne: "Carnê", aPrazo: "A prazo", creditoVale: "Crédito/vale" }

/** Página de erro para o popup de impressão (a resposta é navegada, não lida por fetch). */
export function errorPage(message: string): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" /><title>Documento indisponível</title></head><body style="font-family:system-ui,sans-serif;padding:24px"><p>${esc(message)}</p><button type="button" onclick="window.close()">Fechar</button></body></html>`
}

export function pagamentosDoPayload(payload: unknown): PagamentoResumo {
  const pb = payload && typeof payload === "object" ? (payload as Record<string, unknown>).paymentBreakdown : null
  if (!pb || typeof pb !== "object") return []
  return Object.entries(PAG_LABEL)
    .map(([k, label]) => ({ label, valor: Number((pb as Record<string, unknown>)[k] ?? 0) }))
    .filter((p) => Number.isFinite(p.valor) && p.valor > 0)
}
