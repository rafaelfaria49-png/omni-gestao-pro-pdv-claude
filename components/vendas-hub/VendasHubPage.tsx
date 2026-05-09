"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./lovable/router";
import "./vendas-hub-theme.css";

export default function VendasHubPage() {
  const pathname = usePathname() ?? "";
  const basepath = pathname.startsWith("/dashboard/vendas-hub")
    ? "/dashboard/vendas-hub"
    : "/vendas-hub";
  const router = useMemo(() => getRouter(basepath), [basepath]);

  return (
    <div data-vendas-hub-theme-root className="vendas-hub-isolated min-h-screen antialiased">
      <RouterProvider router={router} />
    </div>
  );
}
