import type { CSSProperties } from "react";
import type { EstilosDataOperacionalCampo } from "@/components/operacoes-v3/components/DataOperacionalCampoV3";
import { C, upLabel } from "../../tokens";

export const atendInput: CSSProperties = {
  width: "100%",
  height: 32,
  padding: "0 11px",
  border: `1px solid ${C.inputBd}`,
  borderRadius: 8,
  fontSize: 12.5,
  color: C.body,
  background: C.surface,
};

export const atendLabel = { ...upLabel, marginBottom: 3 } as const;

/** Campo de data operacional (dia + horário opcional) com o visual da V4. */
export const atendDataCampo: EstilosDataOperacionalCampo = {
  rotulo: atendLabel,
  input: atendInput,
  ajuda: { margin: "4px 0 0", fontSize: 11, color: C.subtle, lineHeight: 1.4 },
  aviso: { margin: "4px 0 0", fontSize: 11.5, color: C.warnFg, lineHeight: 1.4 },
  erro: { margin: "4px 0 0", fontSize: 11.5, fontWeight: 600, color: C.dangerFg, lineHeight: 1.4 },
  botao: {
    height: 28,
    padding: "0 9px",
    border: `1px solid ${C.inputBd}`,
    background: C.surface,
    color: C.body,
    borderRadius: 7,
    fontSize: 11.5,
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
};

/** Bloco "Datas e prazos" das janelas de atendimento (mesmo raio/borda das seções). */
export const atendBlocoDatas: CSSProperties = {
  border: `1px solid ${C.line2}`,
  borderRadius: 12,
  background: C.surface,
  padding: "11px 13px 13px",
  marginBottom: 10,
  minWidth: 0,
};

export const atendBlocoDatasTitulo: CSSProperties = {
  margin: "0 0 9px",
  fontSize: 12.5,
  fontWeight: 700,
  letterSpacing: "-0.01em",
  color: C.ink,
};

export const atendGradeDatas: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))",
  gap: 12,
  minWidth: 0,
};
