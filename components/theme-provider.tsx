"use client";

import {
  ThemeProvider as NextThemesProvider,
  type ThemeProviderProps,
} from "next-themes";
import { ThemeProvider as IAMestreThemeProvider } from "@/components/ia-mestre/ThemeProvider";

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider {...props}>
      <IAMestreThemeProvider>{children}</IAMestreThemeProvider>
    </NextThemesProvider>
  );
}
