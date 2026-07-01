/**
 * Operações V4 Preview — Padrão de acesso do aparelho (desenho 3×3), V4-nativo.
 *
 * Mesmo contrato/comportamento do `PatternPadV3` (V3, `components/operacoes-v3/
 * components/PatternPadV3.tsx`): sequência serializada como "1-3-4" (1-indexado,
 * ordem de toque); tocar um ponto já selecionado é no-op (correção só via
 * "Limpar"). Reimplementado com os tokens visuais da V4 (`C`) em vez de importar
 * o componente V3 (que usa Tailwind/`cn`/`ButtonV3`, fora do sistema de estilo
 * isolado da V4 Preview — ver `tokens.ts`).
 *
 * Slice OPS-V4-SEGURANCA-ACESSO-PARITY-004A. Isto é a senha/padrão REAL do
 * aparelho do cliente (persistida via `salvarProvaEntradaV3`) — não confundir
 * com a autorização de gerente (100% preview, `SegurancaStage.tsx`).
 */
import { C, MONO } from "../tokens";
import { togglePadraoPonto } from "@/lib/operacoes-v4/entrada-form";

const PONTOS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

export function PatternPadV4({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const seq = value ? value.split("-").filter(Boolean) : [];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
          border: `1px solid ${C.line2}`,
          background: C.surface2,
          borderRadius: 10,
          padding: 10,
          flex: "none",
        }}
      >
        {PONTOS.map((p) => {
          const idx = seq.indexOf(String(p + 1));
          const on = idx >= 0;
          return (
            <button
              key={p}
              type="button"
              onClick={() => onChange(togglePadraoPonto(value, p))}
              aria-label={`Ponto ${p + 1}`}
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                border: `1.5px solid ${on ? C.primary : C.inputBd}`,
                background: on ? C.primaryBg : C.surface,
                color: on ? C.primary : C.subtle,
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {on ? idx + 1 : ""}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <div style={{ fontSize: 10.5, color: C.subtle, lineHeight: 1.4 }}>Toque os pontos na ordem do desenho.</div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: C.body, fontFamily: MONO }}>
          {seq.length ? seq.join(" → ") : "—"}
        </div>
        <button
          type="button"
          onClick={() => onChange("")}
          style={{
            alignSelf: "flex-start",
            border: "none",
            background: "transparent",
            color: C.subtle,
            fontSize: 11,
            fontWeight: 500,
            cursor: "pointer",
            padding: "2px 0",
            textDecoration: "underline",
          }}
        >
          Limpar
        </button>
      </div>
    </div>
  );
}
