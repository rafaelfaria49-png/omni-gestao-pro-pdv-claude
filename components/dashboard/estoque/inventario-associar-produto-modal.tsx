"use client"

/**
 * INVENTARIO_ASSISTIDO_V1 — Fase 6. Busca de produto p/ "Associar produto existente".
 *
 * Reusa a MESMA fonte de busca já usada pelo Cadastro de Produtos (`GET /api/produtos?q=`,
 * filtro server-side por nome/sku/barcode/categoria/marca) — sem inventar ranking novo nem
 * carregar o catálogo inteiro no cliente. Selecionar um produto aqui só fecha a pendência
 * (vínculo de fechamento); NÃO cria alias de código de barras no produto.
 */

import { useEffect, useState } from "react"
import { Search, Loader2, PackageSearch } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"

type ProdutoBusca = {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  stock: number
}

export type InventarioAssociarProdutoModalProps = {
  open: boolean
  storeId: string
  vinculando: boolean
  onSelecionar: (produto: { id: string; nome: string }) => void
  onFechar: () => void
}

export function InventarioAssociarProdutoModal({
  open,
  storeId,
  vinculando,
  onSelecionar,
  onFechar,
}: InventarioAssociarProdutoModalProps) {
  const [termo, setTermo] = useState("")
  const [resultados, setResultados] = useState<ProdutoBusca[]>([])
  const [buscando, setBuscando] = useState(false)

  useEffect(() => {
    if (!open) {
      setTermo("")
      setResultados([])
    }
  }, [open])

  useEffect(() => {
    if (!open || !storeId) return
    const q = termo.trim()
    if (!q) {
      setResultados([])
      return
    }
    let cancelado = false
    const t = setTimeout(async () => {
      setBuscando(true)
      try {
        const res = await fetch(`/api/produtos?q=${encodeURIComponent(q)}&activeOnly=1`, {
          credentials: "include",
          headers: { [ASSISTEC_LOJA_HEADER]: storeId },
        })
        if (!res.ok || cancelado) return
        const json = (await res.json()) as { produtos?: ProdutoBusca[] }
        if (!cancelado) setResultados(Array.isArray(json.produtos) ? json.produtos.slice(0, 20) : [])
      } catch {
        if (!cancelado) setResultados([])
      } finally {
        if (!cancelado) setBuscando(false)
      }
    }, 300)
    return () => {
      cancelado = true
      clearTimeout(t)
    }
  }, [termo, open, storeId])

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !vinculando && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageSearch className="h-4 w-4 text-primary" />
            Associar produto existente
          </DialogTitle>
          <DialogDescription>
            Busque o produto correto no catálogo. A pendência será marcada como resolvida e
            vinculada a ele — o código bipado não vira um código de barras adicional do produto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Nome, SKU ou código de barras"
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              disabled={vinculando}
              className="pl-8"
            />
          </div>

          <div className="max-h-80 space-y-1 overflow-y-auto">
            {buscando ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
              </div>
            ) : termo.trim() && resultados.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhum produto encontrado.</p>
            ) : (
              resultados.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={vinculando}
                  onClick={() => onSelecionar({ id: p.id, nome: p.name })}
                  className="flex w-full items-center justify-between gap-3 rounded-md border border-transparent px-3 py-2 text-left text-sm transition-colors hover:border-border hover:bg-accent disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <span className="block truncate font-medium text-foreground">{p.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {p.sku || p.barcode || "Sem código"}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{p.stock} un.</span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onFechar} disabled={vinculando}>
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
