"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./lovable/router";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme/ThemeProvider";
import "./vendas-hub-theme.css";

export default function VendasHubPage() {
  const { theme } = useTheme();
  const pathname = usePathname() ?? "";
  const isDashboard = pathname.startsWith("/dashboard/vendas-hub");
  const basepath = isDashboard
    ? "/dashboard/vendas-hub"
    : "/vendas-hub";
  const router = useMemo(() => getRouter(basepath), [basepath]);

  return (
    <div
      data-vendas-hub-theme-root
      data-theme={theme === "black-edition" ? "black" : theme}
      className={cn(
        "vendas-hub-isolated antialiased",
        isDashboard
          ? "w-full h-full min-h-0 flex flex-col overflow-hidden"
          : "min-h-screen"
      )}
    >
      <RouterProvider router={router} />
    </div>
  );
}
