"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { SectionId } from "../features/settings/sections";

type ConfiguracoesNavContextValue = {
  navigateToSection: (id: SectionId) => void;
};

const ConfiguracoesNavContext = createContext<ConfiguracoesNavContextValue | null>(null);

export function ConfiguracoesNavProvider({
  children,
  navigateToSection,
}: {
  children: ReactNode;
  navigateToSection: (id: SectionId) => void;
}) {
  return (
    <ConfiguracoesNavContext.Provider value={{ navigateToSection }}>{children}</ConfiguracoesNavContext.Provider>
  );
}

export function useConfiguracoesNav(): ConfiguracoesNavContextValue {
  const ctx = useContext(ConfiguracoesNavContext);
  if (!ctx) {
    return {
      navigateToSection: () => {
        /* fora do shell V3 */
      },
    };
  }
  return ctx;
}
