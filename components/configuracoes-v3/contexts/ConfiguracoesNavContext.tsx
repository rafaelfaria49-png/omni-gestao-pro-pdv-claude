"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { SectionId } from "../features/settings/sections";

type ConfiguracoesNavContextValue = {
  navigateToSection: (id: SectionId) => void;
  /** Intercepta navegação externa via <Link> quando há alterações pendentes; retorna true se bloqueada pelo diálogo. */
  requestExternalNavigation: (href: string, label?: string) => boolean;
  setSectionDirty: (id: SectionId, dirty: boolean) => void;
  dirtySections: ReadonlySet<SectionId>;
};

const EMPTY_DIRTY: ReadonlySet<SectionId> = new Set();
const NOOP_NAV = () => {
  /* fora do shell V3 */
};
const NOOP_DIRTY = () => {
  /* opcional */
};
const NOOP_EXTERNAL = () => false;

const FALLBACK_CONTEXT: ConfiguracoesNavContextValue = {
  navigateToSection: NOOP_NAV,
  requestExternalNavigation: NOOP_EXTERNAL,
  setSectionDirty: NOOP_DIRTY,
  dirtySections: EMPTY_DIRTY,
};

const ConfiguracoesNavContext = createContext<ConfiguracoesNavContextValue | null>(null);

export function ConfiguracoesNavProvider({
  children,
  navigateToSection,
  requestExternalNavigation = NOOP_EXTERNAL,
  setSectionDirty = NOOP_DIRTY,
  dirtySections = EMPTY_DIRTY,
}: {
  children: ReactNode;
  navigateToSection: (id: SectionId) => void;
  requestExternalNavigation?: (href: string, label?: string) => boolean;
  setSectionDirty?: (id: SectionId, dirty: boolean) => void;
  dirtySections?: ReadonlySet<SectionId>;
}) {
  const value = useMemo<ConfiguracoesNavContextValue>(
    () => ({
      navigateToSection,
      requestExternalNavigation,
      setSectionDirty,
      dirtySections,
    }),
    [dirtySections, navigateToSection, requestExternalNavigation, setSectionDirty],
  );

  return <ConfiguracoesNavContext.Provider value={value}>{children}</ConfiguracoesNavContext.Provider>;
}

export function useConfiguracoesNav(): ConfiguracoesNavContextValue {
  return useContext(ConfiguracoesNavContext) ?? FALLBACK_CONTEXT;
}
