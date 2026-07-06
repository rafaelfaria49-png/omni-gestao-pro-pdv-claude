/**
 * Operações V4 · Beta operacional — aviso compacto e honesto para ações que
 * persistem de verdade (cria OS, altera status, recebe pagamento, cancela,
 * confirma entrega). Padroniza a comunicação em vez de repetir texto solto
 * em cada modal/etapa (GOAL OPS-V4-REAL-ACTION-DISCLOSURE-002).
 */
import { C } from "../tokens";

const KIND_TEXT = {
  criarOS: "Cria uma OS real e salva na loja ativa.",
  status: "Altera o status real da OS no sistema.",
  pagamento: "Ao confirmar, o valor é registrado no caixa/financeiro da OS.",
  cancelamento: "Cancela a OS de verdade e fica registrado no histórico.",
  entrega: "Marca a OS como entregue de verdade no histórico.",
  atendimentoRapido:
    "Ao finalizar, o sistema cria a OS, registra o recebimento no caixa e marca a OS como entregue.",
} as const;

export type RealActionKind = keyof typeof KIND_TEXT;

export function RealActionNotice({ kind, tone = "info" }: { kind: RealActionKind; tone?: "info" | "warn" }) {
  const bg = tone === "warn" ? C.warnBg : C.infoBg;
  const fg = tone === "warn" ? C.warnFg : C.infoFg;
  const bd = tone === "warn" ? C.warnBd : C.infoBd;
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "flex-start",
        background: bg,
        border: `1px solid ${bd}`,
        borderRadius: 9,
        padding: "9px 11px",
        marginBottom: 14,
      }}
    >
      <span style={{ fontSize: 13, lineHeight: "16px", flex: "none" }}>{tone === "warn" ? "⚠️" : "ℹ️"}</span>
      <span style={{ fontSize: 11.5, color: fg, lineHeight: 1.45 }}>
        <strong>Ação real.</strong> {KIND_TEXT[kind]}
      </span>
    </div>
  );
}
