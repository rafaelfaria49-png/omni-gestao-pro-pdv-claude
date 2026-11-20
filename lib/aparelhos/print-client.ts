"use client"

import { desktopPrintHtml, loadDesktopStation } from "@/lib/desktop-print-bridge"
import { renderTermoGarantia, type GarantiaSnapshot } from "./documents"
import { calcularGarantia, localDateKey } from "./warranty"

/** Extrai somente o documento comercial; scripts, toolbar e paginação do navegador não vão ao spooler. */
export function fragmentoAparelho80mm(html: string): { html: string; title: string } {
  const doc = new DOMParser().parseFromString(html, "text/html")
  const main = doc.querySelector("main.doc")
  if (!main) throw new Error("Documento de aparelho inválido. Nenhuma impressão foi enviada.")
  main.querySelectorAll("script, iframe, object, embed, link").forEach((el) => el.remove())
  for (const el of [main, ...main.querySelectorAll("*")]) {
    for (const attr of Array.from(el.attributes)) {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name)
    }
  }
  const css = Array.from(doc.querySelectorAll("style:not(#page-size)")).map((el) => el.textContent ?? "").join("\n")
  // A ponte existente já aplica a área útil medida na POS-80. Não somar outra largura de 72 mm.
  return { title: doc.title, html: `<style>${css}\n.doc { width: auto; max-width: 100%; margin: 0; padding: 0; overflow-wrap: anywhere; } th { white-space: normal; }</style>${main.outerHTML}` }
}

export async function exigirEstacao80mm(): Promise<void> {
  const station = await loadDesktopStation()
  if (!station) throw new Error("Configure a impressora do Windows em Configurações → PDV → Impressão antes de imprimir o documento.")
  if (station.bobina !== "80mm") throw new Error("Este documento usa bobina de 80 mm. Selecione uma estação de 80 mm ou use a versão A4.")
}

/** Usa exclusivamente a ponte já homologada. Falha de impressão nunca reenvia uma venda. */
export async function imprimirDocumentoAparelho80mm(html: string): Promise<void> {
  await exigirEstacao80mm()
  const fragment = fragmentoAparelho80mm(html)
  const result = await desktopPrintHtml(fragment.html, { bobina: "80mm", title: fragment.title })
  if (!result.ok) throw new Error(`${result.error} A venda permanece registrada; tente imprimir o documento novamente.`)
}

/** Documento sintético local: não cadastra aparelho, não cria venda e não chama API. */
export async function imprimirTesteDocumentoAparelho(): Promise<void> {
  const hoje = localDateKey(new Date())
  const snapshot: GarantiaSnapshot = {
    versao: "TESTE", numeroGarantia: "SEM VALIDADE", politicaVersao: 0,
    loja: { nome: "TESTE DE DOCUMENTO — OMNIGESTÃO PRO", cnpj: "", telefone: "", email: "", endereco: null },
    cliente: { nome: "DOCUMENTO SINTÉTICO — SEM CLIENTE", documentoMascarado: "", telefone: "" },
    aparelho: { codigoInterno: "TESTE", marca: "Acentuação ÇÃÉÕ", modelo: "Documento de aparelhos", variante: "",
      armazenamento: "", memoriaRam: "", cor: "", condicao: "usado", condicaoLabel: "Teste de legibilidade",
      imei1: "", imei2: "", serial: "", estadoFisico: "Sem aparelho cadastrado", bateriaSaude: null, acessoriosEntregues: "Sem itens comerciais" },
    venda: { pedidoId: "SEM VENDA", dataVenda: hoje, preco: 0, operador: "Teste de impressão" },
    garantia: { ...calcularGarantia(hoje, 0), fabricanteInfo: "" },
    condicoes: ["Documento sintético para conferir largura, acentuação e leitura na POS-80.", "Nenhuma operação comercial, cobrança ou garantia foi registrada."],
    observacoes: "Confirme a saída no papel. Envio ao spooler não comprova impressão física.",
  }
  await imprimirDocumentoAparelho80mm(renderTermoGarantia(snapshot, "80mm", "TESTE DE IMPRESSÃO — SEM VALIDADE COMERCIAL"))
}
