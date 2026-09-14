"use client";

import { useEffect, useRef, useState } from "react";
import { C } from "../../tokens";
import { useServicosV4, type ServicoCatalogoV4 } from "../../use-servicos-v4";
import { MIN_QUERY_CATALOGO_V4 } from "@/lib/operacoes-v4/servicos-autorizados-form";
import { atendInput, atendLabel } from "./field-styles";

/**
 * Busca do catálogo REAL de serviços (GOAL OPS-V4-MULTI-SERVICOS-UI-003).
 * A lista NUNCA fica permanentemente aberta: só aparece com query significativa
 * (≥ MIN_QUERY_CATALOGO_V4, com debounce) e campo ativo. Enter seleciona o
 * destaque, Esc fecha o dropdown (sem fechar o modal — o shell não trata Esc).
 */
export function ServicoCatalogLookup({
  storeId,
  onSelect,
}: {
  storeId: string | null;
  onSelect: (s: ServicoCatalogoV4) => void;
}) {
  const cat = useServicosV4(storeId);
  const [aberto, setAberto] = useState(false);
  const [destaque, setDestaque] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const querySignificativa = cat.debouncedQuery.trim().length >= MIN_QUERY_CATALOGO_V4;
  const mostrar = aberto && querySignificativa && !cat.semLoja && !cat.error;

  useEffect(() => {
    setDestaque(0);
  }, [cat.filtrados]);

  const escolher = (s: ServicoCatalogoV4) => {
    onSelect(s);
    cat.setQuery("");
    setAberto(false);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setAberto(false);
      return;
    }
    if (!mostrar || cat.filtrados.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setDestaque((d) => (d + 1) % cat.filtrados.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setDestaque((d) => (d - 1 + cat.filtrados.length) % cat.filtrados.length);
    } else if (e.key === "Enter") {
      const alvo = cat.filtrados[destaque] ?? cat.filtrados[0];
      if (alvo) {
        e.preventDefault();
        escolher(alvo);
      }
    }
  };

  return (
    <div style={{ marginBottom: 10, minWidth: 0, position: "relative" }}>
      <div style={atendLabel}>Serviço</div>
      <input
        ref={inputRef}
        value={cat.query}
        onChange={(e) => {
          cat.setQuery(e.target.value);
          setAberto(true);
        }}
        onFocus={() => setAberto(true)}
        onBlur={() => setAberto(false)}
        onKeyDown={onKeyDown}
        placeholder="Buscar serviço cadastrado..."
        role="combobox"
        aria-expanded={mostrar && cat.filtrados.length > 0}
        aria-controls="busca-servico-resultados"
        aria-activedescendant={mostrar && cat.filtrados[destaque] ? `busca-servico-${cat.filtrados[destaque]!.id}` : undefined}
        aria-label="Buscar serviço cadastrado"
        autoComplete="off"
        style={{ ...atendInput, height: 34 }}
      />
      {cat.semLoja ? (
        <div style={{ fontSize: 11.5, color: C.subtle, marginTop: 6 }}>Selecione uma loja para ver o catálogo real.</div>
      ) : cat.error ? (
        <div style={{ fontSize: 11.5, color: C.dangerFg, marginTop: 6 }}>{cat.error}</div>
      ) : mostrar && cat.loading ? (
        <div style={{ fontSize: 11.5, color: C.subtle, marginTop: 6 }}>Carregando serviços…</div>
      ) : mostrar && !cat.loading && cat.filtrados.length === 0 ? (
        <div style={{ fontSize: 11.5, color: C.subtle, marginTop: 6 }}>
          Nenhum serviço encontrado para “{cat.debouncedQuery.trim()}”.
        </div>
      ) : mostrar && cat.filtrados.length > 0 ? (
        <div
          id="busca-servico-resultados"
          role="listbox"
          aria-label="Serviços encontrados"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            marginTop: 6,
            maxHeight: 180,
            overflowY: "auto",
            border: `1px solid ${C.line2}`,
            borderRadius: 10,
            padding: 6,
            background: C.surface,
            boxShadow: "0 12px 28px rgba(17,19,26,.14)",
          }}
        >
          {cat.filtrados.map((s, i) => (
            <button
              key={s.id}
              id={`busca-servico-${s.id}`}
              type="button"
              role="option"
              aria-selected={i === destaque}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => escolher(s)}
              onMouseEnter={() => setDestaque(i)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                width: "100%",
                textAlign: "left",
                border: `1px solid ${i === destaque ? C.primaryBd : C.line}`,
                background: i === destaque ? C.primaryBg : C.surface,
                borderRadius: 8,
                padding: "7px 10px",
                cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.nome}</span>
              <span style={{ fontSize: 11.5, color: C.subtle, flex: "none" }}>
                R$ {s.preco.toFixed(2)}
                {s.garantia > 0 ? ` · ${s.garantia}d` : ""}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
