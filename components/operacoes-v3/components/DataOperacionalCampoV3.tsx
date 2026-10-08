"use client";

// ============================================================================
// Operações V3/V4 — campo de DATA OPERACIONAL (dia + horário opcional)
// (GOAL OPS-DATAS-ENTRADA-ENTREGA-RETROATIVAS-001)
// ----------------------------------------------------------------------------
// Um único comportamento para entrada, previsão, entrega, atendimento e
// proposta, nas duas versões: inputs nativos (teclado e calendário do sistema,
// sem corte por overflow do modal), horário opcional ("sem horário" = vale só
// o dia) e o horário automático da abertura descartado ao trocar o dia.
// O visual é da superfície que usa: a V3 recebe as classes semânticas padrão;
// a V4 passa os próprios estilos (`estilos`). Nenhum token novo.
// ============================================================================

import { forwardRef, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import {
  alterarDiaCampoV3,
  alterarHoraCampoV3,
  type CampoDataOperacionalV3,
} from "@/lib/operacoes-v3/datas-operacionais-model";

const inputClsV3 =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 aria-[invalid=true]:border-destructive";

export interface EstilosDataOperacionalCampo {
  rotulo?: CSSProperties;
  input?: CSSProperties;
  ajuda?: CSSProperties;
  erro?: CSSProperties;
  aviso?: CSSProperties;
  botao?: CSSProperties;
}

export interface DataOperacionalCampoProps {
  /** Prefixo dos ids (`<id>-dia`, `<id>-hora`, `<id>-ajuda`, `<id>-erro`). */
  id: string;
  rotulo: string;
  ajuda?: string;
  valor: CampoDataOperacionalV3;
  onChange: (valor: CampoDataOperacionalV3) => void;
  erro?: string | null;
  /** Aviso não bloqueante (registro retroativo, previsão vencida…). */
  aviso?: string | null;
  obrigatorio?: boolean;
  /** `false` = só o dia (ex.: data do orçamento, validade). */
  permitirHora?: boolean;
  /** Limites do calendário nativo (a regra real é validada no servidor). */
  minDia?: string;
  maxDia?: string;
  disabled?: boolean;
  estilos?: EstilosDataOperacionalCampo;
  /** Classes da superfície (CSS modules), no lugar das classes padrão da V3. */
  classes?: Partial<Record<keyof EstilosDataOperacionalCampo, string>>;
  className?: string;
}

export const DataOperacionalCampoV3 = forwardRef<HTMLInputElement, DataOperacionalCampoProps>(function DataOperacionalCampoV3(
  { id, rotulo, ajuda, valor, onChange, erro, aviso, obrigatorio, permitirHora = true, minDia, maxDia, disabled, estilos, classes, className },
  ref,
) {
  const v4 = !!estilos;
  const semHora = permitirHora && !valor.hora;
  const idAjuda = `${id}-ajuda`;
  const idErro = `${id}-erro`;
  const idAviso = `${id}-aviso`;
  const ajudaTexto = [ajuda, semHora && valor.dia ? "Sem horário: fica registrado só o dia." : null].filter(Boolean).join(" ");
  const describedBy = [ajudaTexto ? idAjuda : null, aviso ? idAviso : null, erro ? idErro : null].filter(Boolean).join(" ") || undefined;
  /** Classe da superfície: CSS module > (V4 usa estilo inline) > padrão da V3. */
  const cl = (chave: keyof EstilosDataOperacionalCampo, padraoV3: string): string | undefined => classes?.[chave] ?? (v4 ? undefined : padraoV3);

  return (
    <div className={cn("min-w-0", className)} style={{ minWidth: 0 }}>
      <label
        htmlFor={`${id}-dia`}
        className={cl("rotulo", "mb-1 block text-xs font-medium text-muted-foreground")}
        style={v4 ? { display: "block", ...estilos?.rotulo } : undefined}
      >
        {rotulo}
        {obrigatorio ? " *" : ""}
      </label>
      <div className="flex flex-wrap items-center gap-1.5" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, minWidth: 0 }}>
        <input
          ref={ref}
          id={`${id}-dia`}
          type="date"
          value={valor.dia}
          min={minDia}
          max={maxDia}
          required={obrigatorio}
          disabled={disabled}
          aria-invalid={erro ? true : undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          onChange={(e) => onChange(alterarDiaCampoV3(valor, e.target.value))}
          className={cl("input", inputClsV3)}
          style={{ ...(v4 ? estilos?.input : null), flex: "1 1 9.5rem", minWidth: 0, width: "auto" }}
        />
        {permitirHora ? (
          <input
            id={`${id}-hora`}
            type="time"
            value={valor.hora}
            disabled={disabled}
            aria-label={`Horário (opcional) — ${rotulo}`}
            aria-invalid={erro ? true : undefined}
            aria-describedby={describedBy}
            autoComplete="off"
            onChange={(e) => onChange(alterarHoraCampoV3(valor, e.target.value))}
            className={cl("input", inputClsV3)}
            style={{ ...(v4 ? estilos?.input : null), flex: "0 1 7rem", minWidth: 0, width: "auto" }}
          />
        ) : null}
        {permitirHora && valor.hora && !disabled ? (
          <button
            type="button"
            onClick={() => onChange({ ...valor, hora: "", horaAutomatica: false })}
            aria-label={`Registrar só o dia — ${rotulo}`}
            className={cl("botao", "rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40")}
            style={v4 ? estilos?.botao : undefined}
          >
            Sem horário
          </button>
        ) : null}
      </div>
      {ajudaTexto ? (
        <p id={idAjuda} className={cl("ajuda", "mt-1 text-[11px] leading-snug text-muted-foreground")} style={v4 ? estilos?.ajuda : undefined}>
          {ajudaTexto}
        </p>
      ) : null}
      {aviso ? (
        <p id={idAviso} role="status" className={cl("aviso", "mt-1 text-[11px] leading-snug text-warning")} style={v4 ? estilos?.aviso : undefined}>
          {aviso}
        </p>
      ) : null}
      {erro ? (
        <p id={idErro} role="alert" className={cl("erro", "mt-1 text-[11px] font-medium leading-snug text-destructive")} style={v4 ? estilos?.erro : undefined}>
          {erro}
        </p>
      ) : null}
    </div>
  );
});
