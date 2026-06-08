"use client";

// ============================================================================
// Operações V3 — SPRINT_3D.1B · Product Picker (catálogo oficial)
// ----------------------------------------------------------------------------
// Modal portado ao body (escapa de modais/overlays pais). Busca por nome, SKU e
// código de barras (Server Action `listProdutos`, debounced). Ao selecionar,
// devolve o produto para o chamador vincular a peça (produtoId/sku/barcode).
// Mostra o ESTOQUE atual — informação honesta para o operador no balcão.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Package, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProdutoCatalogoV3 } from "@/lib/operacoes-v3/produto-link";
import { useProdutoCatalogoV3 } from "../hooks/use-produto-catalogo-v3";
import { ButtonV3 } from "./UiV3";
import { formatBRL } from "../lib/format";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 pl-9 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

export function ProductPickerV3({
  open,
  storeId,
  onSelect,
  onClose,
  titulo = "Buscar produto no catálogo",
}: {
  open: boolean;
  storeId: string | null;
  onSelect: (produto: ProdutoCatalogoV3) => void;
  onClose: () => void;
  titulo?: string;
}) {
  const { resultados, loading, error, buscar } = useProdutoCatalogoV3(storeId);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Abre → carrega recentes e foca a busca.
  useEffect(() => {
    if (!open) return;
    setQ("");
    void buscar("");
    const t = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, [open, buscar]);

  // Busca debounced (nome/SKU/código de barras).
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => void buscar(q), 300);
    return () => window.clearTimeout(t);
  }, [q, open, buscar]);

  // Esc fecha.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const escolher = (p: ProdutoCatalogoV3) => {
    onSelect(p);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 p-4 pt-[8vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <header className="flex flex-none items-center gap-2 border-b border-border px-4 py-3">
          <Package className="h-4 w-4 text-primary" aria-hidden />
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{titulo}</h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:text-foreground" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-none border-b border-border p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              ref={inputRef}
              className={inputCls}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nome, SKU ou código de barras…"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loading ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
            </p>
          ) : error ? (
            <p className="py-10 text-center text-sm text-destructive">{error}</p>
          ) : resultados.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {q.trim() ? "Nenhum produto encontrado para esta busca." : "Nenhum produto no catálogo desta unidade."}
            </p>
          ) : (
            <ul className="space-y-1">
              {resultados.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => escolher(p)}
                    className="flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-left hover:border-border hover:bg-muted/40"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{p.nome}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {p.sku ? `SKU ${p.sku}` : "sem SKU"}
                        {p.barcode ? ` · ${p.barcode}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold tabular-nums text-foreground">{formatBRL(p.preco)}</span>
                      <span className={cn("block text-[11px] tabular-nums", p.estoque > 0 ? "text-success" : "text-destructive")}>
                        {p.estoque > 0 ? `${p.estoque} em estoque` : "sem estoque"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="flex-none border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          Selecionar vincula a peça ao produto — habilita a baixa real de estoque na entrega.
        </footer>
      </div>
    </div>,
    document.body,
  );
}
