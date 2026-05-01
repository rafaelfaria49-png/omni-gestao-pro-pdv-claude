"use client";

import { StudioThemeProvider } from "@/components/theme/ThemeProvider";

/**
 * Wrapper compatível com o RootLayout.
 *
 * Importante: removemos `next-themes` para eliminar a injeção de `<script>` durante
 * a hidratação (React 19+ acusa "Encountered a script tag").
 *
 * Mantemos a assinatura "larga" porque o RootLayout passa props como
 * `themes`, `defaultTheme`, `storageKey`, etc.
 */
export function ThemeProvider({ children }: any) {
  return <StudioThemeProvider>{children}</StudioThemeProvider>;
}
