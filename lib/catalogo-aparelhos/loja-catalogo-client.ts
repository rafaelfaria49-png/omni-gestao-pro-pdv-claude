/**
 * CADASTROS-ACESSORIOS-COMPATIBILIDADE-MANUAL-001 — cliente HTTP (browser) do catálogo por loja.
 * Toda escrita envia a loja ativa EXPLÍCITA no header `x-assistec-loja-id` (o servidor recusa
 * escrita sem ela). Nenhum dado é guardado em localStorage: a fonte da verdade é o servidor.
 */

import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import type { LojaModelo } from "./loja-catalogo"

export type CatalogoClientError = {
  ok: false
  status: number
  error: string
  code?: string
  errors?: Record<string, string>
  existing?: { modelKey: string; brand: string; canonicalName: string; source: "global" | "loja"; active: boolean }
}

export type CatalogoClientResult<T> = ({ ok: true } & T) | CatalogoClientError

export function headers(lojaHeader: string | null | undefined, json = false): Record<string, string> {
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(lojaHeader ? { [ASSISTEC_LOJA_HEADER]: lojaHeader } : {}),
  }
}

export async function call<T>(input: string, init: RequestInit): Promise<CatalogoClientResult<T>> {
  try {
    const res = await fetch(input, { credentials: "include", cache: "no-store", ...init })
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (!res.ok || !data || data.ok === false) {
      return {
        ok: false,
        status: res.status,
        error:
          (typeof data?.error === "string" && data.error) ||
          (res.status === 403 ? "Sem permissão para esta ação." : "Falha na comunicação com o servidor."),
        code: typeof data?.code === "string" ? data.code : undefined,
        errors: (data?.errors as Record<string, string> | undefined) ?? undefined,
        existing: (data?.existing as CatalogoClientError["existing"]) ?? undefined,
      }
    }
    return { ok: true, ...(data as T) }
  } catch {
    return { ok: false, status: 0, error: "Sem conexão. Tente novamente." }
  }
}

export function criarModeloLoja(
  lojaHeader: string | null | undefined,
  input: { brand: string; name: string; manufacturer?: string; line?: string; aliases?: string[]; notes?: string },
) {
  return call<{ modelo: LojaModelo }>("/api/catalogo/aparelhos/modelos", {
    method: "POST",
    headers: headers(lojaHeader, true),
    body: JSON.stringify(input),
  })
}

export function atualizarModeloLoja(
  lojaHeader: string | null | undefined,
  id: string,
  patch: {
    version: number
    brand?: string
    manufacturer?: string
    line?: string
    name?: string
    aliases?: string[]
    notes?: string
    active?: boolean
  },
) {
  return call<{ modelo: LojaModelo }>(`/api/catalogo/aparelhos/modelos/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: headers(lojaHeader, true),
    body: JSON.stringify(patch),
  })
}

export function listarModelosLoja(lojaHeader: string | null | undefined, opts: { q?: string; inativos?: boolean } = {}) {
  const qs = new URLSearchParams()
  if (opts.q) qs.set("q", opts.q)
  if (opts.inativos) qs.set("inativos", "1")
  return call<{ modelos: LojaModelo[] }>(`/api/catalogo/aparelhos/modelos?${qs.toString()}`, {
    method: "GET",
    headers: headers(lojaHeader),
  })
}

export type ModeloResolvido = {
  modelKey: string
  canonicalName: string
  brand: string
  source: "global" | "loja"
  active: boolean
}

export function resolverModelos(lojaHeader: string | null | undefined, keys: readonly string[]) {
  const qs = new URLSearchParams({ keys: keys.join(",") })
  return call<{ models: ModeloResolvido[] }>(`/api/catalogo/aparelhos/modelos/resolve?${qs.toString()}`, {
    method: "GET",
    headers: headers(lojaHeader),
  })
}

export function decidirCompatPelicula(
  lojaHeader: string | null | undefined,
  input: {
    modelKey: string
    otherModelKey: string
    decisao: "adicionar" | "suprimir" | "restaurar"
    status?: string
    notes?: string
  },
) {
  return call<{ decisao: string }>("/api/catalogo/peliculas/compat", {
    method: "POST",
    headers: headers(lojaHeader, true),
    body: JSON.stringify(input),
  })
}
