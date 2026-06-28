/**
 * INVENTARIO-CADASTRO-RAPIDO-COM-PENDENCIAS-001 — submit client-side do "Cadastrar rápido".
 *
 * Reusa o `POST /api/produtos` (mesmo endpoint do Cadastro de Produtos), portanto herda a
 * proteção de duplicidade (CADASTROS-PRODUTOS-DUPLICIDADE-001/002): se o EAN/SKU já existir na
 * loja, o endpoint responde 409 `{ type: "DUPLICATE_PRODUCT", produto }` — aqui isso vira o
 * resultado `"duplicate"`, para o chamador oferecer "associar ao existente".
 *
 * NÃO fecha pendência nem registra contagem — o componente do Inventário faz isso depois
 * (vincularPendenciaInventario / registrarContagemProduto), pois o passo seguinte difere entre
 * a fila de reconciliação e a bipagem ao vivo.
 */

import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import {
  buildCadastroRapidoPayload,
  type CadastroRapidoForm,
  type CadastroRapidoContexto,
} from "@/lib/estoque/inventario-cadastro-rapido"

export type ProdutoExistenteResumo = {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  stock: number | null
}

export type CriarProdutoRapidoResult =
  | { ok: true; produtoId: string; produto: ProdutoExistenteResumo }
  | { ok: "duplicate"; produto: ProdutoExistenteResumo; field?: string; message?: string }
  | { ok: false; erro: string }

export async function criarProdutoRapido(
  storeId: string,
  form: CadastroRapidoForm,
  ctx: CadastroRapidoContexto = {},
): Promise<CriarProdutoRapidoResult> {
  const payload = buildCadastroRapidoPayload(form, ctx)
  try {
    const res = await fetch("/api/produtos", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", [ASSISTEC_LOJA_HEADER]: storeId },
      body: JSON.stringify(payload),
    })
    const data = (await res.json().catch(() => null)) as
      | {
          ok?: boolean
          error?: string
          detail?: string
          type?: string
          message?: string
          field?: string
          produto?: { id?: string; name?: string; sku?: string | null; barcode?: string | null; stock?: number | null }
        }
      | null

    if (res.status === 409 && data?.type === "DUPLICATE_PRODUCT" && data.produto?.id && data.produto.name) {
      return {
        ok: "duplicate",
        field: data.field,
        message: data.message,
        produto: {
          id: data.produto.id,
          name: data.produto.name,
          sku: data.produto.sku ?? null,
          barcode: data.produto.barcode ?? null,
          stock: data.produto.stock ?? null,
        },
      }
    }
    if (!res.ok) {
      return { ok: false, erro: data?.error || data?.detail || `Falha ao cadastrar (HTTP ${res.status})` }
    }
    const criado = data?.produto
    if (!criado?.id) return { ok: false, erro: "Produto criado sem id retornado." }
    return {
      ok: true,
      produtoId: criado.id,
      produto: {
        id: criado.id,
        name: criado.name ?? form.nome,
        sku: criado.sku ?? null,
        barcode: criado.barcode ?? null,
        stock: criado.stock ?? null,
      },
    }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Erro inesperado ao cadastrar." }
  }
}
