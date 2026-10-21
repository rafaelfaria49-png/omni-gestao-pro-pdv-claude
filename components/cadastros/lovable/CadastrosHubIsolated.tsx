"use client";

import { CadastrosHub } from "./components/cadastros/CadastrosHub";
import { ThemeProvider } from "./components/theme-provider";
import { Toaster } from "./components/ui/sonner";

/**
 * Wrapper isolado do Cadastros HUB Lovable.
 *
 * - Sem react-router (navegação é por tabs internas em useState)
 * - ThemeProvider local sincroniza com o tema global via localStorage
 * - min-w-0 previne overflow horizontal em containers flex/grid
 */
export function CadastrosHubIsolated() {
  return (
    <div className="w-full min-w-0 max-w-full">
      <ThemeProvider>
        <CadastrosHub />
        {/* O HUB confirma gravações e falhas via `sonner`; sem este Toaster nenhuma mensagem aparece. */}
        <Toaster position="top-center" />
      </ThemeProvider>
    </div>
  );
}
