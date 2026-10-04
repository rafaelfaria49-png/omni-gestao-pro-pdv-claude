"use client";

import type { LucideIcon } from "lucide-react";
import { Check, ClipboardCheck, KeyRound, PackageCheck, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ENTRADA_GROUPS,
  ENTRADA_GROUP_IDS,
  ROTULO_ESTADO_ENTRADA_V4,
  type EntradaGroupId,
  type EntradaGroupStatus,
} from "@/lib/operacoes-v4/entrada-workspace";
import styles from "./entrada-workspace.module.css";

const GROUP_ICONS: Record<EntradaGroupId, LucideIcon> = {
  recepcao: Search,
  "seguranca-custodia": KeyRound,
  inspecao: ClipboardCheck,
  evidencias: PackageCheck,
};

type EntradaSectionRailProps = {
  active: EntradaGroupId;
  /** Estado de cada área derivado da OS real (null = sem dado para afirmar). */
  grupos: EntradaGroupStatus | null;
  dirty: Record<EntradaGroupId, boolean>;
  complementada: boolean;
  onSelect: (id: EntradaGroupId) => void;
};

/**
 * Áreas independentes da Entrada (OPS-V4-FLUXO-CURTO-004): sem ordem, sem
 * numeração de passos e sem progresso "x de 4" — cada chip mostra o estado
 * real da área e abre direto.
 */
export function EntradaSectionRail({ active, grupos, dirty, complementada, onSelect }: EntradaSectionRailProps) {
  const faltando = grupos ? ENTRADA_GROUP_IDS.filter((id) => grupos[id] === "falta_complementar").length : 0;
  const resumo = !grupos
    ? "Navegação livre"
    : complementada
      ? "Entrada já complementada"
      : `${faltando} ${faltando === 1 ? "área para complementar" : "áreas para complementar"}`;

  return (
    <nav className={styles.groupSwitch} aria-label="Grupos da entrada">
      <div className={styles.groupSwitchMeta}>
        <span className={styles.groupSwitchEyebrow}>Complementar entrada</span>
        <span className={styles.groupSwitchProgress} role="status">{resumo}</span>
      </div>
      <div className={styles.groupSwitchList}>
        {ENTRADA_GROUPS.map((group) => {
          const selected = active === group.id;
          const Icon = GROUP_ICONS[group.id];
          const estado = grupos?.[group.id] ?? null;
          return (
            <button
              key={group.id}
              type="button"
              onClick={() => onSelect(group.id)}
              aria-current={selected ? "true" : undefined}
              title={dirty[group.id] ? `${group.label} — Alterações não salvas` : group.label}
              className={cn(styles.groupChip, selected && styles.groupChipActive, dirty[group.id] && styles.groupChipDirty)}
            >
              <span className={styles.groupChipIcon}>
                <Icon aria-hidden="true" />
                {estado === "registrado" ? <span className={styles.completeMark}><Check aria-hidden="true" /></span> : null}
              </span>
              <span className={styles.groupChipCopy}>
                <span className={styles.groupChipLabel}>{group.label}</span>
                {estado ? (
                  <span
                    className={cn(
                      styles.groupChipState,
                      estado === "registrado" && styles.groupChipStateDone,
                      estado === "falta_complementar" && styles.groupChipStatePending,
                    )}
                  >
                    {ROTULO_ESTADO_ENTRADA_V4[estado]}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
