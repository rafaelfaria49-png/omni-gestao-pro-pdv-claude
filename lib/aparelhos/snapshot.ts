/** Montagem do snapshot do termo — única fonte para a venda confirmada e para a prévia (RASCUNHO). */
import type { GarantiaSnapshot } from "./documents"
import { acessoriosTexto, type Acessorios } from "./checklist"
import { APARELHO_CONDICAO_LABEL, type AparelhoCondicao } from "./lifecycle"
import { formatImei } from "./imei"
import { maskDocumento } from "./sale-hook-shared"
import { textoCondicoesGarantia, TERMO_GARANTIA_VERSAO, type PoliticaAparelhos } from "./policy"
import { GARANTIA_LEGAL_DIAS, type GarantiaCalculada } from "./warranty"

export type SnapshotParts = {
  numeroGarantia: string
  store: { name: string; cnpj: string; phone: string; address: unknown } | null
  settings: { contactEmail: string; contactWhatsapp: string } | null
  cliente: { name: string; document: string; phone: string | null }
  unit: {
    codigoInterno: string; marca: string; modelo: string; variante: string; armazenamento: string; memoriaRam: string; cor: string
    condicao: string; imei1: string | null; imei2: string | null; serial: string | null; estadoFisico: string; bateriaSaude: number | null
  }
  pedidoId: string
  dataVendaKey: string
  preco: number
  operador: string
  garantia: GarantiaCalculada
  politica: PoliticaAparelhos
  acessoriosEntregues: Acessorios
  observacoes: string
}

export function buildGarantiaSnapshot(p: SnapshotParts): GarantiaSnapshot {
  const u = p.unit
  return {
    versao: TERMO_GARANTIA_VERSAO,
    numeroGarantia: p.numeroGarantia,
    loja: {
      nome: p.store?.name ?? "",
      cnpj: p.store?.cnpj ?? "",
      telefone: p.store?.phone || p.settings?.contactWhatsapp || "",
      email: p.settings?.contactEmail ?? "",
      endereco: p.store?.address ?? null,
    },
    cliente: { nome: p.cliente.name, documentoMascarado: maskDocumento(p.cliente.document), telefone: p.cliente.phone ?? "" },
    aparelho: {
      codigoInterno: u.codigoInterno,
      marca: u.marca,
      modelo: u.modelo,
      variante: u.variante,
      armazenamento: u.armazenamento,
      memoriaRam: u.memoriaRam,
      cor: u.cor,
      condicao: u.condicao,
      condicaoLabel: APARELHO_CONDICAO_LABEL[u.condicao as AparelhoCondicao] ?? u.condicao,
      imei1: u.imei1 ? formatImei(u.imei1) : "",
      imei2: u.imei2 ? formatImei(u.imei2) : "",
      serial: u.serial ?? "",
      estadoFisico: u.estadoFisico,
      bateriaSaude: u.bateriaSaude,
      acessoriosEntregues: acessoriosTexto(p.acessoriosEntregues),
    },
    venda: { pedidoId: p.pedidoId, dataVenda: p.dataVendaKey, preco: p.preco, operador: p.operador },
    garantia: {
      dataEntrega: p.garantia.dataEntrega,
      legalDias: GARANTIA_LEGAL_DIAS,
      contratualDias: p.garantia.contratualDias,
      contratualFim: p.garantia.contratualFim,
      legalFim: p.garantia.legalFim,
      coberturaFim: p.garantia.coberturaFim,
      fabricanteInfo: "",
    },
    condicoes: textoCondicoesGarantia(p.politica.condicoesTermo),
    politicaVersao: p.politica.versao,
    observacoes: p.observacoes,
  }
}
