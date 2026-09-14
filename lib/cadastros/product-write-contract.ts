/**
 * CAD-R2-005 — Contrato do boundary canônico de escrita de Produto.
 *
 * Módulo PURO (sem `server-only`, sem Prisma, sem I/O): só tipos.
 * Pode ser importado por qualquer camada para tipar callers futuros.
 * A implementação vive em `lib/cadastros/product-write-service.ts`.
 *
 * Regras de autoridade (R2):
 * - `ProductWriteContext` representa dados JÁ PROVADOS pelo servidor
 *   (gate REST `requireCadastrosHubApi` ou Server Action
 *   `requireCadastrosActionAccess`). Nunca vem do payload do caller.
 * - Campos de identidade/autoria no payload (`storeId`, `userId`, `email`,
 *   `role`, `userLabel`, `revisadoPor`, `criadoPor`, `actor`, `owner`, …)
 *   são IGNORADOS — nunca autoridade.
 * - IA nunca escreve diretamente: este boundary não chama IA, rede ou browser.
 */
import type { CadastrosAuditPrincipal } from "@/lib/cadastros/cadastros-audit-principal"
import type { ExistingProdutoLite } from "@/lib/produtos/duplicate-product"

/**
 * Contexto confiável de escrita. `storeId` é a loja JÁ AUTORIZADA pelo
 * servidor; `principal` é o ator canônico JÁ DERIVADO da sessão
 * (`cadastrosAuditPrincipalFromSession`). `principal: null` = sem humano
 * identificado (auditoria registra `userLabel: ""`, sem inventar rótulo).
 */
export type ProductWriteContext = {
  storeId: string
  principal: CadastrosAuditPrincipal | null
}

/**
 * Payload de cadastro-base do produto.
 *
 * União dos contratos já praticados pelos writers atuais (Server Action
 * `upsertProduto` em PT + rotas REST `/api/produtos` com aliases EN), sem
 * inventar nomes novos. Precedência documentada na implementação:
 * chave PT-canônica primeiro (`nome` > `name`, `sku` > `codigo`,
 * `barras` > `barcode` > `codigoBarras`, …).
 *
 * Chaves fiscais top-level canônicas (`ncm`, `cest`, … — ver
 * `PRODUTO_FISCAL_BODY_KEYS`) e `metadata.fiscal` / `metadata.acessorios`
 * são aceitas e tratadas pelos helpers canônicos existentes.
 *
 * FORA DO CONTRATO (ignorado quando presente):
 * - estoque operacional/ledger: este boundary NUNCA escreve
 *   `MovimentacaoEstoque`, `ProdutoDeposito` nem inventário (CAD-R2-009).
 * - identidade/autoria do caller: ver regra de autoridade acima.
 */
export type ProductWriteInput = {
  nome?: unknown
  name?: unknown
  sku?: unknown
  codigo?: unknown
  barras?: unknown
  barcode?: unknown
  codigoBarras?: unknown
  categoria?: unknown
  category?: unknown
  marca?: unknown
  brand?: unknown
  fornecedor?: unknown
  supplierName?: unknown
  estoque?: unknown
  stock?: unknown
  custo?: unknown
  precoCusto?: unknown
  cost?: unknown
  preco?: unknown
  price?: unknown
  garantia?: unknown
  warrantyDays?: unknown
  active?: unknown
  status?: unknown
  metadata?: unknown
  accessoryConfig?: unknown
  /** Top-level `catalogoAparelhos` (paridade REST): ausente = preserva, null = limpa. */
  catalogoAparelhos?: unknown
  /** Chaves fiscais top-level e compat legado. Nunca autoridade de identidade. */
  [key: string]: unknown
}

export type ProductWriteOperation = "create" | "update"

export type ProductWriteErrorCode =
  | "UNTRUSTED_CONTEXT"
  | "NOT_FOUND"
  | "CROSS_STORE"
  | "VALIDATION"
  | "DUPLICATE"
  | "PERSISTENCE"

export type ProductWriteField =
  | "nome"
  | "sku"
  | "barcode"
  | "categoria"
  | "marca"
  | "fornecedor"
  | "estoque"
  | "preco"
  | "custo"
  | "garantia"
  | "active"
  | "status"
  | "metadata"
  | "productId"

export type ProductWriteResult =
  | { ok: true; id: string; operacao: ProductWriteOperation }
  | {
      ok: false
      code: ProductWriteErrorCode
      message: string
      field?: ProductWriteField
      produto?: ExistingProdutoLite
    }

/** Falha de validação local (antes de qualquer I/O). */
export function productWriteInvalid(
  message: string,
  field?: ProductWriteField,
): Extract<ProductWriteResult, { ok: false }> {
  return { ok: false, code: "VALIDATION", message, ...(field ? { field } : {}) }
}

/** Contexto sem loja provada pelo servidor — fail-closed, sem I/O. */
export function productWriteUntrusted(): Extract<ProductWriteResult, { ok: false }> {
  return {
    ok: false,
    code: "UNTRUSTED_CONTEXT",
    message: "Contexto de escrita não confiável: loja precisa ser provada pelo servidor.",
  }
}
