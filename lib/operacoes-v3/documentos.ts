// ============================================================================
// Operações V3 — Fase 1E · Tipos de DOCUMENTO operacional (centralizado)
// ----------------------------------------------------------------------------
// Catálogo dos documentos imprimíveis da OS. Fonte única de rótulos/estado.
// Módulo puro (sem I/O, sem React).
// ============================================================================

export type DocumentoTipoV3 = "os_cliente" | "comprovante_interno" | "termo_garantia" | "termo_entrega" | "etiqueta" | "orcamento_cliente";

export interface DocumentoMetaV3 {
  tipo: DocumentoTipoV3;
  label: string;
  descricao: string;
  /** Visível ao cliente? (interno NUNCA). */
  cliente: boolean;
  /** Implementado nesta fase. */
  disponivel: boolean;
}

export const DOCUMENTO_META_V3: Record<DocumentoTipoV3, DocumentoMetaV3> = {
  os_cliente: {
    tipo: "os_cliente",
    label: "Ordem de Serviço",
    descricao: "Via do cliente — completa, sem custos internos.",
    cliente: true,
    disponivel: true,
  },
  termo_garantia: {
    tipo: "termo_garantia",
    label: "Termo de Garantia",
    descricao: "Documento dedicado de garantia para o cliente.",
    cliente: true,
    disponivel: true,
  },
  termo_entrega: {
    tipo: "termo_entrega",
    label: "Termo de Entrega",
    descricao: "Comprovante de entrega do equipamento ao cliente.",
    cliente: true,
    disponivel: true,
  },
  comprovante_interno: {
    tipo: "comprovante_interno",
    label: "Via Interna",
    descricao: "Uso interno — custo, lucro e observações internas. Não entregar ao cliente.",
    cliente: false,
    disponivel: true,
  },
  etiqueta: {
    tipo: "etiqueta",
    label: "Etiqueta Técnica",
    descricao: "Identificação do aparelho na bancada.",
    cliente: false,
    disponivel: true,
  },
  orcamento_cliente: {
    tipo: "orcamento_cliente",
    label: "Orçamento (via cliente)",
    descricao: "Projeção segura do orçamento para entregar ao cliente — sem custo/lucro internos.",
    cliente: true,
    disponivel: true,
  },
};

export function documentoMetaV3(tipo: DocumentoTipoV3): DocumentoMetaV3 {
  return DOCUMENTO_META_V3[tipo];
}

export function documentosDisponiveisV3(): DocumentoMetaV3[] {
  return Object.values(DOCUMENTO_META_V3);
}
