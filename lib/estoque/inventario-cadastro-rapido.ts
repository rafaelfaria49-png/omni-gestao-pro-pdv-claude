/**
 * INVENTARIO-CADASTRO-RAPIDO-COM-PENDENCIAS-001 — núcleo PURO do "Cadastrar rápido" do
 * Inventário Assistido (produto bipado não encontrado no catálogo).
 *
 * Responsabilidade única: validar o formulário operacional e montar o corpo do
 * `POST /api/produtos` (mesmo contrato já usado pelo Cadastro de Produtos), garantindo:
 *   - EAN/GTIN bipado  → Produto.barcode  (via `buildProdutoFormCodigos`, contrato FIX-002)
 *   - SKU/Código interno (opcional) → Produto.sku
 *   - quantidade contada → estoque inicial (sem criar divergência: contado = estoque)
 *   - NENHUM dado fiscal exigido; o produto nasce marcado como "fiscal/cadastro pendente"
 *     em `metadata` para ser completado depois em Cadastros.
 *
 * NÃO faz I/O, NÃO toca Prisma, NÃO emite NF-e. Determinístico e testável.
 */

import { buildProdutoFormCodigos } from "@/lib/produtos/produto-form-codigos"

export type CadastroRapidoForm = {
  /** EAN/GTIN bipado — prefixado com o código da pendência, editável com cautela. */
  barcode: string
  nome: string
  /** Categoria opcional (slug/rótulo livre — igual ao Cadastro de Produtos). */
  categoria?: string | null
  /** Quantidade contada na pendência — vira estoque inicial. */
  quantidade: number
  precoVenda: number
  precoCusto?: number | null
  /** SKU/código interno opcional. */
  sku?: string | null
  observacao?: string | null
}

export type CadastroRapidoContexto = {
  sessaoId?: string | null
  /** Código bipado original da pendência (rastreabilidade). */
  pendenciaCodigo?: string | null
}

export type CadastroRapidoValidacao =
  | { ok: true }
  | { ok: false; campo: "nome" | "barcode" | "precoVenda"; motivo: string }

/**
 * Regras mínimas do cadastro rápido — propositalmente enxutas (operação primeiro):
 *  - nome obrigatório;
 *  - código de barras obrigatório (o fluxo nasce de um código bipado — sem EAN o cadastro
 *    perde o propósito de saneamento);
 *  - preço de venda > 0 (mesma regra do Cadastro de Produtos; evita item vendável a R$ 0).
 * Fiscal (NCM/CEST/CFOP/origem) NÃO é validado aqui de propósito.
 */
export function validarCadastroRapido(form: CadastroRapidoForm): CadastroRapidoValidacao {
  if (!form.nome?.trim()) return { ok: false, campo: "nome", motivo: "Informe o nome do produto." }
  if (!form.barcode?.trim()) {
    return { ok: false, campo: "barcode", motivo: "Informe o código de barras (EAN/GTIN)." }
  }
  if (!(Number(form.precoVenda) > 0)) {
    return { ok: false, campo: "precoVenda", motivo: "Informe um preço de venda válido." }
  }
  return { ok: true }
}

export type CadastroRapidoMetadata = {
  origemCadastro: "inventario_rapido"
  cadastroFiscalPendente: true
  cadastroCompletoPendente: true
  observacaoCadastroRapido?: string
  inventarioSessaoId?: string
  inventarioPendenciaCodigo?: string
}

export type CadastroRapidoPayload = {
  name: string
  stock: number
  price: number
  precoCusto: number
  category?: string
  sku?: string
  barcode?: string
  metadata: CadastroRapidoMetadata
}

/**
 * Monta o corpo do `POST /api/produtos`. `stock` recebe a quantidade contada para que a
 * conciliação não acuse divergência falsa (contado = estoque do recém-criado). `metadata`
 * marca o item como cadastrado pelo inventário e pendente de fiscal/cadastro completo —
 * sem exigir nem inventar dados tributários.
 */
export function buildCadastroRapidoPayload(
  form: CadastroRapidoForm,
  ctx: CadastroRapidoContexto = {},
): CadastroRapidoPayload {
  const codigos = buildProdutoFormCodigos({ sku: form.sku ?? "", barcode: form.barcode ?? "" })
  const categoria = (form.categoria ?? "").trim()
  const observacao = (form.observacao ?? "").trim()
  const sessaoId = (ctx.sessaoId ?? "").trim()
  const pendenciaCodigo = (ctx.pendenciaCodigo ?? "").trim()

  const metadata: CadastroRapidoMetadata = {
    origemCadastro: "inventario_rapido",
    cadastroFiscalPendente: true,
    cadastroCompletoPendente: true,
    ...(observacao ? { observacaoCadastroRapido: observacao } : {}),
    ...(sessaoId ? { inventarioSessaoId: sessaoId } : {}),
    ...(pendenciaCodigo ? { inventarioPendenciaCodigo: pendenciaCodigo } : {}),
  }

  return {
    name: form.nome.trim(),
    stock: Math.max(0, Math.trunc(Number(form.quantidade)) || 0),
    price: Number(form.precoVenda) || 0,
    precoCusto: Math.max(0, Number(form.precoCusto) || 0),
    ...(categoria ? { category: categoria } : {}),
    ...codigos,
    metadata,
  }
}
