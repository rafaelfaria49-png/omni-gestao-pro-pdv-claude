/**
 * Operações V4 — busca de produto do catálogo (UI V4-native).
 *
 * OPS-V4-ORCAMENTO-REAL-002: dropdown de busca para adicionar uma peça ao
 * orçamento. Reaproveita o hook de DADOS da V3 `useProdutoCatalogoV3` (que usa a
 * action `listProdutos`, somente leitura) — NÃO traz componentes shadcn/V3 para
 * dentro da V4 e NÃO baixa/reserva estoque (o estoque exibido é só referência).
 */
"use client";

import { useEffect, useState } from "react";
import { C, fmt } from "../tokens";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { useProdutoCatalogoV3 } from "@/components/operacoes-v3/hooks/use-produto-catalogo-v3";
import type { ProdutoCatalogoV3 } from "@/lib/operacoes-v3/produto-link";

const input: React.CSSProperties = {
  width: "100%",
  height: 34,
  padding: "0 11px",
  border: `1px solid ${C.inputBd}`,
  borderRadius: 8,
  fontSize: 12.5,
  color: C.body,
  background: C.surface,
};

export function ProdutoLookupV4({
  onSelect,
  onClose,
}: {
  onSelect: (produto: ProdutoCatalogoV3) => void;
  onClose: () => void;
}) {
  const { lojaAtivaId } = useLojaAtiva();
  const { resultados, loading, error, buscar } = useProdutoCatalogoV3(lojaAtivaId);
  const [q, setQ] = useState("");

  // Busca debounced (q vazio = recentes). Reusa a action listProdutos via o hook.
  useEffect(() => {
    const t = setTimeout(() => void buscar(q), 300);
    return () => clearTimeout(t);
  }, [q, buscar]);

  const box: React.CSSProperties = {
    border: `1px solid ${C.primaryBd2}`,
    borderRadius: 10,
    background: C.surface,
    padding: 11,
    marginTop: 8,
  };
  const empty: React.CSSProperties = { fontSize: 11.5, color: C.subtle, padding: "10px 2px", textAlign: "center", lineHeight: 1.5 };

  return (
    <div style={box}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar produto por nome, SKU ou código…" style={input} />
        <button type="button" onClick={onClose} style={{ height: 34, padding: "0 12px", border: `1px solid ${C.inputBd2}`, background: C.surface, color: C.body, borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer", flex: "none" }}>Fechar</button>
      </div>

      {!lojaAtivaId ? (
        <div style={empty}>Selecione uma loja ativa para buscar produtos.</div>
      ) : error ? (
        <div style={{ ...empty, color: C.dangerFg }}>{error}</div>
      ) : loading ? (
        <div style={empty}>Buscando produtos…</div>
      ) : resultados.length === 0 ? (
        <div style={empty}>Nenhum produto encontrado.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
          {resultados.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p)}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: `1px solid ${C.line}`, background: C.surface, borderRadius: 9, padding: "8px 10px", cursor: "pointer" }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nome || "Produto"}</span>
                <span style={{ display: "block", fontSize: 10.5, color: C.subtle }}>
                  {[p.sku && `SKU ${p.sku}`, `Estoque ${p.estoque}`].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: C.body, flex: "none" }}>{fmt(p.preco)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
